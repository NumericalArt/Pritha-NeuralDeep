import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { runSyncProbe } from "../lib/sync-probe.mjs";

export const SYNTAX_CHECK_ID = "host-syntax-check";
export const STARTUP_CHECK_ID = "host-startup-check";
const NOT_READY = /exited before becoming healthy|\/health did not become ready/;
const SCRIPT = /\.(?:mjs|cjs|js)$/;

// The location, source line, caret and error message; never the stack.
function parseError(stderr) {
  const lines = String(stderr || "").split("\n");
  const end = lines.findIndex(line => /^\w*Error\b/.test(line.trim()));
  return lines.slice(0, end < 0 ? 6 : end + 1).join("\n").trim().slice(0, 800);
}

/**
 * A server that does not parse fails a Trial only as "exited before becoming healthy". Gemma 4
 * kept writing template literals with escaped backticks and never saw the parse error
 * (2026-09-28). The next build turn gets `node --check` output for project scripts that do not
 * parse; the protected Trial verifier and dependencies are not checked.
 */
export function syntaxDiagnostics(worktree, { maxFiles = 200 } = {}) {
  const listed = runSyncProbe("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: worktree, encoding: "utf8", timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
  if (listed.status !== 0) return [];
  const files = listed.stdout.split("\0")
    .filter(file => SCRIPT.test(file) && !/^(?:node_modules|tests\/trials)\//.test(file) && existsSync(path.join(worktree, file)))
    .slice(0, maxFiles);
  const errors = [];
  for (const file of files) {
    const run = runSyncProbe(process.execPath, ["--check", file], { cwd: worktree, encoding: "utf8", timeout: 10_000 });
    if (run.status !== 0 && !run.error) errors.push(parseError(run.stderr));
  }
  if (!errors.length) return [];
  return [{
    id: SYNTAX_CHECK_ID,
    kind: "automated",
    status: "failed",
    statement: "These project scripts do not parse (`node --check`); a server that does not parse exits before it becomes healthy.",
    execution: { exit_code: 1, stderr: errors.join("\n\n").slice(0, 4_000) },
  }];
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

/**
 * The Trial verifier reports only that the product server "exited before becoming healthy" or
 * that "/health did not become ready". A Gemma 4 server listened on its scaffold port variable
 * instead of PORT and the verifier never reached it (2026-09-28). When a Trial failed that way,
 * the host starts scripts/server.mjs as the verifier does (PORT, PRITHA_DATA_DIR, a private HOME)
 * and reports what the server printed and whether it answered GET /health.
 */
export async function startupDiagnostics(worktree, failures, { waitMs = 8_000 } = {}) {
  if (!(failures || []).some(failure => NOT_READY.test(String(failure?.execution?.stderr || ""))) || !existsSync(path.join(worktree, "scripts/server.mjs"))) return [];
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-startup-"));
  const port = await freePort();
  let output = "";
  const child = spawn(process.execPath, ["scripts/server.mjs"], { cwd: worktree, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, PORT: String(port), PRITHA_DATA_DIR: temp } });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { if (output.length < 16_000) output += chunk; });
  let healthy = false, exitCode = null;
  try {
    for (const started = Date.now(); Date.now() - started < waitMs && child.exitCode === null; ) {
      try { healthy = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) })).ok; } catch { /* not listening yet */ }
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    exitCode = child.exitCode;
  } finally {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ }
    await new Promise(resolve => setTimeout(resolve, 100));
    rmSync(temp, { recursive: true, force: true });
  }
  if (healthy) return [];
  const state = exitCode === null ? "was still running" : `exited with code ${exitCode}`;
  return [{
    id: STARTUP_CHECK_ID,
    kind: "automated",
    status: "failed",
    statement: `Started the way the Trial verifier starts it (node scripts/server.mjs with PORT=${port} and PRITHA_DATA_DIR set), the server did not answer GET http://127.0.0.1:${port}/health within ${Math.round(waitMs / 1000)} s and ${state}. It must listen on process.env.PORT.`,
    execution: { exit_code: exitCode, stderr: output.split(temp).join("<DATA_DIR>").trim().slice(-2_000) || "(no output)" },
  }];
}
