#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "scripts", "neuraldeep-codex.mjs");
const MODEL = String(process.env.PRITHA_NEURALDEEP_ACCEPTANCE_MODEL || "qwen3.6-35b-a3b");
const MAX_OUTPUT = 8 * 1024 * 1024;

function environment() {
  const value = { ...process.env, TECHSCOPE_ROOT: ROOT };
  for (const key of Object.keys(value)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete value[key];
  }
  return value;
}

function safeError(value, workspace) {
  return String(value || "")
    .replaceAll(ROOT, "<project>")
    .replaceAll(workspace, "<workspace>")
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "<redacted>")
    .slice(-2_000);
}

function execute({ cwd, prompt, resume = null }) {
  return new Promise((resolve, reject) => {
    const args = [
      RUNNER,
      "exec-json",
      "--model", MODEL,
      "--sandbox", resume ? "read-only" : "workspace-write",
      "--cwd", cwd,
      "--network", "disabled",
      ...(resume ? ["--resume", resume] : []),
    ];
    const child = spawn(process.execPath, args, { cwd, env: environment(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      let sessionId = resume;
      let finalText = "";
      let commandCompleted = false;
      let usage = null;
      for (const line of stdout.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event?.type === "thread.started") sessionId = String(event.thread_id || "") || sessionId;
          if (event?.type === "item.completed" && event?.item?.type === "agent_message") finalText = String(event.item.text || "");
          if (event?.type === "item.completed" && event?.item?.type === "command_execution" && Number(event.item.exit_code) === 0) commandCompleted = true;
          if (event?.type === "turn.completed") usage = event.usage || null;
        } catch {
          // The checks below fail closed when JSONL cannot be parsed.
        }
      }
      resolve({ code, signal, sessionId, finalText, commandCompleted, usage, stderr });
    });
    child.stdin.end(prompt);
  });
}

if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(MODEL)) throw new Error("invalid_session_acceptance_model");
const workspace = mkdtempSync(path.join(os.tmpdir(), "pritha-neuraldeep-session-"));
try {
  const first = await execute({
    cwd: workspace,
    prompt: "Use a local shell command to create acceptance.txt containing exactly PRITHA_NATIVE_SESSION_MEMORY. Read it back with a second local command, then answer exactly PRITHA_FIRST_TURN_OK.",
  });
  const fileVerified = (() => {
    try { return readFileSync(path.join(workspace, "acceptance.txt"), "utf8").trim() === "PRITHA_NATIVE_SESSION_MEMORY"; } catch { return false; }
  })();
  const firstOk = first.code === 0 && first.sessionId && first.commandCompleted && fileVerified && first.finalText.includes("PRITHA_FIRST_TURN_OK");
  const second = firstOk ? await execute({
    cwd: workspace,
    resume: first.sessionId,
    prompt: "Continue this native session. Use a local read-only shell command to read acceptance.txt, then answer exactly PRITHA_RESUME_TURN_OK.",
  }) : null;
  const resumeOk = Boolean(second && second.code === 0 && second.sessionId === first.sessionId && second.commandCompleted && second.finalText.includes("PRITHA_RESUME_TURN_OK"));
  const ok = Boolean(firstOk && resumeOk);
  console.log(JSON.stringify({
    ok,
    provider: "neuraldeep",
    model: MODEL,
    nativeSessionId: first.sessionId || null,
    firstTurn: { ok: Boolean(firstOk), code: first.code, commandCompleted: first.commandCompleted, fileVerified, usage: first.usage, ...(!firstOk ? { error: safeError(first.stderr, workspace) } : {}) },
    resumedTurn: second ? { ok: resumeOk, code: second.code, commandCompleted: second.commandCompleted, sameSession: second.sessionId === first.sessionId, usage: second.usage, ...(!resumeOk ? { error: safeError(second.stderr, workspace) } : {}) } : null,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
