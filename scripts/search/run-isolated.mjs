#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  readdirSync,
  writeFileSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2),
  live = args[0] === "--live";
if (live) args.shift();
const state = path.resolve(args.shift() || ""),
  command = args.shift();
if (!command || state === root || state.startsWith(root + path.sep))
  throw Error(
    "Usage: run-isolated.mjs [--live] EMPTY_EXTERNAL_STATE_ROOT command ...args",
  );
for (let p = state; p !== path.dirname(p); p = path.dirname(p)) {
  if (
    existsSync(p) &&
    lstatSync(p).isSymbolicLink() &&
    !(["/tmp", "/var"].includes(p) && realpathSync(p) === `/private${p}`)
  )
    throw Error("test_state_symlink_denied");
}
const marker = path.join(state, ".pritha-search-test");
if (existsSync(state) && readdirSync(state).length && !existsSync(marker))
  throw Error("refusing_non_test_state");
mkdirSync(state, { recursive: true, mode: 0o700 });
writeFileSync(marker, "isolated-search-test\n", { mode: 0o600 });
for (const name of ["agents", "artifacts"])
  mkdirSync(path.join(state, name), { recursive: true, mode: 0o700 });
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(PRITHA_|TECHSCOPE_|NEURALDEEP_|SEARXNG_|OPENAI_|CHATGPT_|AZURE_OPENAI_|CODEX_HOME$)/.test(
      key,
    )
  )
    delete env[key];
Object.assign(env, {
  TECHSCOPE_ROOT: root,
  PRITHA_STATE_ROOT: state,
  PRITHA_AGENT_PARENT: path.join(state, "agents"),
  PRITHA_INSTANCE_ID: "search-test",
  PRITHA_INSTANCE_ROLE: "independent",
  PRITHA_CONTROL_CENTER_PORT: "17420",
  PRITHA_CONTROL_CENTER_HOST: "127.0.0.1",
  PRITHA_CONTROL_CENTER_DIST_DIR: ".next-search-test",
  PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: live
    ? "pritha-neuraldeep"
    : "pritha-search-fixture-missing",
  CODEX_HOME: path.join(state, "codex-home"),
});
const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
child.once("error", () => {
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
