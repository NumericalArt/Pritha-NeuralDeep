import { existsSync } from "node:fs";
import path from "node:path";
import { runSyncProbe } from "../lib/sync-probe.mjs";

export const SYNTAX_CHECK_ID = "host-syntax-check";
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
