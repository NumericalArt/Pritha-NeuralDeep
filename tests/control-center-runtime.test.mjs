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
    item.runtimeScript || runtimeScript,
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
    // A restricted or locale-escaped process listing cannot establish that a
    // live owner is stale. The original defect stole this lock and hung here.
    executable(path.join(item.fakeBin, "ps"), "#!/bin/sh\nexit 1\n");
    item.env.LC_ALL = "C";
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
    const originalLock = readFileSync(lockPath, "utf8");
    const rejected = invoke(contender, "run");
    assert.equal(rejected.error, undefined, "lock contention must finish without the subprocess timeout");
    assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
    assert.equal(JSON.parse(rejected.stdout).code, "runtime_already_running");
    assert.equal(readFileSync(lockPath, "utf8"), originalLock, "the live owner's lock must remain intact");
  } finally {
    if (running && running.exitCode == null) {
      running.kill("SIGTERM");
      await new Promise((resolve) => running.once("close", resolve));
    }
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("an incomplete runtime lock is preserved until ownership can be reconciled", () => {
  const item = fixture();
  try {
    const lockPath = path.join(item.stateRoot, "setup", "control-center-runtime", "runtime.lock.json");
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, '{"schema":');
    const rejected = invoke(item, "run");
    assert.equal(rejected.error, undefined);
    assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
    assert.equal(JSON.parse(rejected.stdout).code, "runtime_lock_unconfirmed");
    assert.equal(readFileSync(lockPath, "utf8"), '{"schema":');
    assert.equal(existsSync(path.join(path.dirname(lockPath), "state.json")), false);
  } finally { rmSync(item.directory, { recursive: true, force: true }); }
});

test("Darwin runtime process inspection preserves non-ASCII paths independently of the caller locale", async () => {
  if (process.platform !== "darwin") return;
  const item = fixture();
  const capture = path.join(item.directory, "process-inspection.json");
  try {
    // Stop's fallback verifies the live wrapper before signalling it. A failing
    // ps probe is safe here, and lets this test inspect the exact query config.
    executable(path.join(item.fakeBin, "ps"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.PRITHA_TEST_PS_CAPTURE, JSON.stringify({ args: process.argv.slice(2), locale: process.env.LC_ALL }));process.exit(1);\n`);
    item.env.LC_ALL = "C"; item.env.PRITHA_TEST_PS_CAPTURE = capture;
    const statePath = path.join(item.stateRoot, "setup", "control-center-runtime", "state.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ schema: "pritha-control-center-runtime-state-v1", instanceId: item.instanceId, codeRoot: item.checkout,
      stateRoot: item.stateRoot, port: item.port, label: `com.numericalart.pritha.control-center.${item.instanceId}`, wrapperPid: process.pid }));
    const result = invoke(item, "stop", ["--yes"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).code, "owner_mismatch");
    const inspected = JSON.parse(readFileSync(capture, "utf8"));
    assert.equal(inspected.locale, "en_US.UTF-8");
    assert.ok(inspected.args.includes("-ww"));
  } finally { rmSync(item.directory, { recursive: true, force: true }); }
});

for (const invocation of ["absolute", "relative"]) {
  test(`stop terminates its verified ${invocation}-path wrapper and child without launchd`, async () => {
    const item = fixture();
    let running;
    try {
      writeFileSync(item.nextBinary, "setInterval(() => undefined, 1000);\n");
      item.runtimeScript = path.join(item.checkout, "scripts", "control-center-runtime.mjs");
      copyFileSync(runtimeScript, item.runtimeScript);
      mkdirSync(path.join(item.checkout, "scripts", "lib"));
      for (const name of ["env", "paths", "release-artifact", "sync-probe"]) {
        copyFileSync(path.join(sourceRoot, "scripts", "lib", `${name}.mjs`), path.join(item.checkout, "scripts", "lib", `${name}.mjs`));
      }
      executable(path.join(item.fakeBin, "lsof"), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('-d')) console.log('n' + process.env.TECHSCOPE_ROOT);
else process.exit(1);
`);
      const script = invocation === "relative" ? "scripts/control-center-runtime.mjs" : item.runtimeScript;
      running = spawn(process.execPath, [script, "run", "--root", item.checkout, "--env", item.runtimeEnv, "--json"],
        { cwd: item.checkout, env: item.env, stdio: ["ignore", "pipe", "pipe"] });
      const statePath = path.join(item.stateRoot, "setup", "control-center-runtime", "state.json");
      const deadline = Date.now() + 5_000;
      while (!existsSync(statePath) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(existsSync(statePath), true, "the real test wrapper must start its own child");
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(state.wrapperPid, running.pid);
      const stopped = invoke(item, "stop", ["--yes"]);
      assert.equal(stopped.status, 0, stopped.stderr || stopped.stdout);
      const lockPath = path.join(path.dirname(statePath), "runtime.lock.json");
      const stopDeadline = Date.now() + 1_000;
      while (existsSync(lockPath) && Date.now() < stopDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(existsSync(lockPath), false, "stop must release the live wrapper's lock");
      assert.equal(JSON.parse(readFileSync(statePath, "utf8")).running, false);
      assert.throws(() => process.kill(state.childPid, 0), { code: "ESRCH" });
    } finally {
      if (running && running.exitCode == null) {
        running.kill("SIGTERM");
        await new Promise((resolve) => running.once("close", resolve));
      }
      rmSync(item.directory, { recursive: true, force: true });
    }
  });
}

test("stop preserves a live process when wrapper identity is unconfirmed", async (t) => {
  for (const scenario of ["foreign-cwd", "missing-cwd", "script-as-argument", "script-suffix", "wrong-command", "failed-listener-probe"]) {
    await t.test(scenario, async () => {
      const item = fixture();
      const foreign = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { stdio: "ignore" });
      try {
        const statePath = path.join(item.stateRoot, "setup", "control-center-runtime", "state.json");
        mkdirSync(path.dirname(statePath), { recursive: true });
        writeFileSync(statePath, JSON.stringify({ schema: "pritha-control-center-runtime-state-v1", instanceId: item.instanceId, codeRoot: item.checkout,
          stateRoot: item.stateRoot, port: item.port, label: `com.numericalart.pritha.control-center.${item.instanceId}`, wrapperPid: foreign.pid }));
        const command = scenario === "script-as-argument" ? `${process.execPath} other.mjs ${runtimeScript} run`
          : scenario === "script-suffix" ? `${process.execPath} ${runtimeScript}.other run`
            : `${process.execPath} ${runtimeScript} ${scenario === "wrong-command" ? "runner" : "run"}`;
        executable(path.join(item.fakeBin, "ps"), `#!${process.execPath}\nconsole.log(${JSON.stringify(`${foreign.pid} 1 ${foreign.pid} ${command}`)});\n`);
        const cwd = scenario === "foreign-cwd" ? item.directory : item.checkout;
        executable(path.join(item.fakeBin, "lsof"), `#!${process.execPath}
if (process.argv.includes('-d')) { ${scenario === "missing-cwd" ? "process.exit(1);" : `console.log(${JSON.stringify(`n${cwd}`)});`} }
else process.exit(${scenario === "failed-listener-probe" ? "2" : "1"});
`);
        const rejected = invoke(item, "stop", ["--yes"]);
        assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
        assert.equal(JSON.parse(rejected.stdout).code, scenario === "failed-listener-probe" ? "listener_check_failed" : "owner_mismatch");
        assert.doesNotThrow(() => process.kill(foreign.pid, 0), "unconfirmed process must not receive a stop signal");
      } finally {
        foreign.kill("SIGTERM");
        await new Promise((resolve) => foreign.once("close", resolve));
        rmSync(item.directory, { recursive: true, force: true });
      }
    });
  }
});
