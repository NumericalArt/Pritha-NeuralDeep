import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CodexCliSandboxBackend,
  ExecutionBackendError,
  LocalExecBackend,
  createExecutionBackend,
} from "../scripts/agents-mother/execution-backends.mjs";

function sandbox(type = "none", required = false, cwd = process.cwd()) {
  return { type, required, writableRoots: type === "workspaceWrite" ? [cwd] : [], networkAccess: false };
}

test("local backend executes structured argv and records no isolation", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pritha-local-backend-"));
  const result = await new LocalExecBackend().execute({
    argv: [process.execPath, "-e", "process.stdout.write('ready')"],
    cwd,
    timeoutMs: 5_000,
    sandbox: sandbox("none", false, cwd),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ready");
  assert.equal(result.isolation, "none");
  assert.equal(result.schema, "pritha-trial-execution-result-v2");
  assert.equal(result.effectivePolicy.networkAccess, "host");
});

test("local backend fails closed when sandbox isolation is required", async () => {
  await assert.rejects(
    new LocalExecBackend().execute({
      argv: [process.execPath, "-e", "process.exit(0)"],
      cwd: process.cwd(),
      sandbox: sandbox("readOnly", true),
    }),
    (error) => error instanceof ExecutionBackendError && error.code === "isolation_unavailable",
  );
});

test("local backend enforces a per-stream output cap", async () => {
  const result = await new LocalExecBackend().execute({
    argv: [process.execPath, "-e", "process.stdout.write('x'.repeat(10000))"],
    cwd: process.cwd(),
    outputBytesCap: 128,
    sandbox: sandbox(),
  });
  assert.equal(Buffer.byteLength(result.stdout), 128);
  assert.equal(result.stdoutTruncated, true);
});

test("all backends reject shell executables before execution", async () => {
  await assert.rejects(
    new LocalExecBackend().execute({ argv: ["sh", "-c", "exit 0"], cwd: process.cwd(), sandbox: sandbox() }),
    (error) => error instanceof ExecutionBackendError && error.code === "shell_forbidden",
  );
});

test("Codex CLI sandbox environment is isolated from OpenAI credentials", () => {
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-home-"));
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "must-not-leak";
  try {
    const environment = new CodexCliSandboxBackend({ codexHome }).environment();
    assert.equal(environment.CODEX_HOME, codexHome);
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.CHATGPT_API_KEY, undefined);
    assert.equal(environment.AZURE_OPENAI_API_KEY, undefined);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("historical App Server backend names are read-only aliases to Codex CLI sandbox", () => {
  assert.ok(createExecutionBackend("app-server") instanceof CodexCliSandboxBackend);
  assert.ok(createExecutionBackend("codex-app-server-command") instanceof CodexCliSandboxBackend);
  assert.throws(() => createExecutionBackend("unknown"), (error) => error.code === "backend_unknown");
});
