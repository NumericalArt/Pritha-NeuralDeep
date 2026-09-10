import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = realpathSync(path.resolve(import.meta.dirname, ".."));
const script = path.join(root, "scripts", "neuraldeep-codex.mjs");

test("NeuralDeep usage CLI emits its contract through a symlinked checkout path", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "pritha-cli-entrypoint-"));
  try {
    const alias = path.join(fixture, "checkout-alias");
    symlinkSync(root, alias, "dir");
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(PRITHA_|TECHSCOPE_|OPENAI_|AZURE_OPENAI_|CHATGPT_|NEURALDEEP_)/.test(key)) delete env[key];
    Object.assign(env, {
      PRITHA_STATE_ROOT: path.join(fixture, "state"),
      PRITHA_NEURALDEEP_CODEX_HOME: path.join(fixture, "codex-home"),
      PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: "pritha-fixture-no-credential",
      PRITHA_NEURALDEEP_UPSTREAM_ORIGIN: "https://127.0.0.1:1",
    });
    const result = spawnSync(process.execPath, [path.join(alias, "scripts", "neuraldeep-codex.mjs"), "usage-summary", "--range", "24h"], { env, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(result.stdout.trim(), "", "CLI must execute even when argv uses a filesystem alias");
    assert.equal(JSON.parse(result.stdout).schema, "pritha-neuraldeep-usage-summary-v1");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("importing the NeuralDeep CLI does not execute its entrypoint", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(script).href)});`], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
