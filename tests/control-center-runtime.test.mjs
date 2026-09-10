import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const sourceRoot = path.resolve(import.meta.dirname, "..");
const runtimeScript = path.join(sourceRoot, "scripts", "control-center-runtime.mjs");
const trackedTemplate = path.join(sourceRoot, "launchd", "com.numericalart.pritha.control-center.instance.plist.template");

function executable(filePath, source) {
  writeFileSync(filePath, source, "utf8");
  chmodSync(filePath, 0o755);
}

function fixture(instanceId = "main", port = 3420) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pritha-control-runtime-"));
  const checkout = path.join(directory, "checkout");
  const stateRoot = path.join(directory, "state", instanceId);
  const testHome = path.join(directory, "home");
  const fakeBin = path.join(directory, "bin");
  const runtimeEnv = path.join(stateRoot, "config", "runtime.env");
  const launchctlLog = path.join(directory, "launchctl.log");
  const nextBinary = path.join(checkout, "interfaces", "control-center", "node_modules", "next", "dist", "bin", "next");
  mkdirSync(path.dirname(nextBinary), { recursive: true });
  mkdirSync(path.join(checkout, "interfaces", "control-center", ".next"), { recursive: true });
  mkdirSync(path.join(checkout, "scripts"), { recursive: true });
  mkdirSync(path.join(checkout, "11_agents"), { recursive: true });
  mkdirSync(path.join(checkout, "launchd"), { recursive: true });
  mkdirSync(path.dirname(runtimeEnv), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(testHome, { recursive: true });
  writeFileSync(path.join(checkout, "scripts", "pritha.mjs"), "export {};\n");
  writeFileSync(path.join(checkout, "interfaces", "control-center", ".next", "BUILD_ID"), "fixture-build\n");
  writeFileSync(nextBinary, "process.exit(1);\n");
  copyFileSync(trackedTemplate, path.join(checkout, "launchd", path.basename(trackedTemplate)));
  writeFileSync(runtimeEnv, [
    `TECHSCOPE_ROOT=${checkout}`,
    `PRITHA_STATE_ROOT=${stateRoot}`,
    `PRITHA_INSTANCE_ID=${instanceId}`,
    "PRITHA_INSTANCE_ROLE=primary",
    `PRITHA_CONTROL_CENTER_PORT=${port}`,
    "",
  ].join("\n"));
  executable(path.join(fakeBin, "launchctl"), `#!/bin/sh
if [ "$1" = "print" ]; then exit 1; fi
printf '%s\n' "$*" >> "$PRITHA_TEST_LAUNCHCTL_LOG"
exit 0
`);
  executable(path.join(fakeBin, "lsof"), "#!/bin/sh\nexit 1\n");
  executable(path.join(fakeBin, "plutil"), "#!/bin/sh\nexit 0\n");
  const env = {
    ...process.env,
    HOME: testHome,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
    TECHSCOPE_ROOT: checkout,
    PRITHA_STATE_ROOT: stateRoot,
    PRITHA_INSTANCE_ID: instanceId,
    PRITHA_INSTANCE_ROLE: "primary",
    PRITHA_CONTROL_CENTER_PORT: String(port),
    PRITHA_CONTROL_CENTER_ENV_FILE: runtimeEnv,
    PRITHA_LAUNCHCTL_BINARY: path.join(fakeBin, "launchctl"),
    PRITHA_LSOF_BINARY: path.join(fakeBin, "lsof"),
    PRITHA_TEST_LAUNCHCTL_LOG: launchctlLog,
    PRITHA_RUNTIME_ALLOW_NON_DARWIN_TEST: "1",
  };
  return { directory, checkout, stateRoot, testHome, fakeBin, runtimeEnv, launchctlLog, nextBinary, instanceId, port, env };
}

function invoke(item, command, extra = []) {
  return spawnSync(process.execPath, [
    runtimeScript,
    command,
    "--root", item.checkout,
    "--state-root", item.stateRoot,
    "--instance-id", item.instanceId,
    "--role", "primary",
    "--port", String(item.port),
    "--env", item.runtimeEnv,
    "--json",
    ...extra,
  ], {
    cwd: item.checkout,
    env: item.env,
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("runtime plans are read-only and launchd labels stay unique per instance", () => {
  const fixtures = [
    fixture("main", 3420),
    fixture("dasha", 4420),
    fixture("sasha", 5420),
    fixture("marina", 6420),
  ];
  try {
    const plans = fixtures.map((item) => {
      const result = invoke(item, "plan");
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    });
    assert.deepEqual(plans.map((plan) => plan.instance.port), [3420, 4420, 5420, 6420]);
    assert.equal(new Set(plans.map((plan) => plan.service.label)).size, 4);
    assert.ok(plans.every((plan) => plan.readOnly && plan.mutationsApplied === false));
    assert.ok(fixtures.every((item) => !existsSync(item.launchctlLog)));
  } finally {
    for (const item of fixtures) rmSync(item.directory, { recursive: true, force: true });
  }
});

test("runtime install renders only private absolute paths and never calls real launchctl", () => {
  const item = fixture();
  try {
    const tracked = readFileSync(trackedTemplate, "utf8");
    assert.match(tracked, /__SERVICE_LABEL__/);
    assert.match(tracked, /__CHECKOUT_ROOT__/);
    assert.doesNotMatch(tracked, /\/Users\/|PRITHA_STATE_ROOT=|OPENAI_API_KEY/);

    const result = invoke(item, "install", ["--yes"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    const generated = path.join(item.stateRoot, "setup", "control-center-runtime", "com.numericalart.pritha.control-center.main.plist");
    const installed = path.join(item.testHome, "Library", "LaunchAgents", "com.numericalart.pritha.control-center.main.plist");
    assert.equal(existsSync(generated), true);
    assert.equal(existsSync(installed), true);
    assert.match(readFileSync(generated, "utf8"), new RegExp(item.checkout.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(readFileSync(generated, "utf8"), /OPENAI_API_KEY|PRITHA_STATE_ROOT=/);
    assert.match(readFileSync(item.launchctlLog, "utf8"), /bootstrap gui\//);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("runtime refuses to stop a listener that lacks the exact instance ownership record", () => {
  const item = fixture();
  try {
    const foreignLsof = path.join(item.fakeBin, "foreign-lsof");
    executable(foreignLsof, "#!/bin/sh\nprintf '99999\\n'\n");
    item.env.PRITHA_LSOF_BINARY = foreignLsof;
    const result = invoke(item, "stop", ["--yes"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, "owner_mismatch");
    assert.equal(existsSync(item.launchctlLog), false);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("runtime refuses to install over an unowned listener", () => {
  const item = fixture();
  try {
    const foreignLsof = path.join(item.fakeBin, "foreign-lsof");
    executable(foreignLsof, "#!/bin/sh\nprintf '99999\\n'\n");
    item.env.PRITHA_LSOF_BINARY = foreignLsof;
    const result = invoke(item, "install", ["--yes"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, "owner_mismatch");
    assert.equal(existsSync(item.launchctlLog), false);
    assert.equal(existsSync(path.join(item.testHome, "Library", "LaunchAgents", "com.numericalart.pritha.control-center.main.plist")), false);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("runtime gives launchd children a stable executable path for the Codex CLI fallback", () => {
  const item = fixture();
  try {
    const capture = path.join(item.directory, "child-path.txt");
    writeFileSync(item.nextBinary, `require("node:fs").writeFileSync(process.env.PRITHA_TEST_PATH_CAPTURE, process.env.PATH || "");\n`);
    item.env.PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
    item.env.PRITHA_TEST_PATH_CAPTURE = capture;

    const result = invoke(item, "run");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).childExitCode, 0);
    const entries = readFileSync(capture, "utf8").split(path.delimiter);
    assert.equal(entries[0], path.dirname(process.execPath));
    assert.ok(entries.includes(path.join(item.testHome, ".local", "bin")));
    assert.ok(entries.includes("/usr/bin"));
    assert.equal(entries.some((entry) => !path.isAbsolute(entry)), false);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("five rapid process exits open the circuit until an explicit start clears it", () => {
  const item = fixture();
  try {
    const install = invoke(item, "install", ["--yes"]);
    assert.equal(install.status, 0, install.stderr || install.stdout);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = invoke(item, "run");
      assert.equal(result.status, attempt < 5 ? 1 : 0, result.stderr || result.stdout);
    }
    const circuitPath = path.join(item.stateRoot, "setup", "control-center-runtime", "circuit.json");
    assert.equal(JSON.parse(readFileSync(circuitPath, "utf8")).open, true);
    const blocked = invoke(item, "run");
    assert.equal(blocked.status, 0, blocked.stderr || blocked.stdout);
    assert.equal(JSON.parse(blocked.stdout).circuitOpen, true);

    const start = invoke(item, "start", ["--yes"]);
    assert.equal(start.status, 0, start.stderr || start.stdout);
    assert.equal(JSON.parse(readFileSync(circuitPath, "utf8")).open, false);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("one state-root lock cannot be shared by two runtime wrappers", async () => {
  const item = fixture();
  let running = null;
  try {
    writeFileSync(item.nextBinary, "setInterval(() => undefined, 1000);\n");
    running = spawn(process.execPath, [
      runtimeScript,
      "run",
      "--root", item.checkout,
      "--state-root", item.stateRoot,
      "--instance-id", item.instanceId,
      "--role", "primary",
      "--port", String(item.port),
      "--env", item.runtimeEnv,
      "--json",
    ], { cwd: item.checkout, env: item.env, stdio: ["ignore", "pipe", "pipe"] });
    const lockPath = path.join(item.stateRoot, "setup", "control-center-runtime", "runtime.lock.json");
    const deadline = Date.now() + 3_000;
    while (!existsSync(lockPath) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(existsSync(lockPath), true, "first wrapper should acquire the state-root lock");

    const contender = { ...item, port: item.port + 1, env: { ...item.env, PRITHA_CONTROL_CENTER_PORT: String(item.port + 1) } };
    const rejected = invoke(contender, "run");
    assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
    assert.equal(JSON.parse(rejected.stdout).code, "runtime_already_running");
  } finally {
    if (running && running.exitCode == null) {
      running.kill("SIGTERM");
      await new Promise((resolve) => running.once("close", resolve));
    }
    rmSync(item.directory, { recursive: true, force: true });
  }
});
