// These are child-owned engineering tests, never host-owned Outcome Trials.
export function withChildTests(files, capability) {
  const required = files.map(file => file.path).sort();
  const testFiles = ["tests/structure.test.mjs", ...(capability.adapter === "api-process-v1" ? ["tests/service-lifecycle.test.mjs"] : [])];
  required.push(...testFiles);
  files.find(file => file.path === "scripts/smoke-test.mjs").content += `\nimport { lstatSync as childTestFileStat } from "node:fs";\nfor (const file of ${JSON.stringify(testFiles)}) {\n  const info = childTestFileStat(new URL("../" + file, import.meta.url));\n  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid child test file");\n}\n`;
  files.find(file => file.path === "README.md").content += "\n## Engineering tests\n\nRun `npm test` for structural and child-owned engineering checks. API lifecycle tests initially fail with implementation-required until the approved service is built. Run lifecycle tests in a disposable copy. These checks do not replace independent Outcome Trials or user acceptance.\n";
  const packageFile = files.find(file => file.path === "package.json");
  const pkg = JSON.parse(packageFile.content);
  pkg.scripts.test = "node scripts/smoke-test.mjs && node --test tests/*.test.mjs";
  packageFile.content = `${JSON.stringify(pkg, null, 2)}\n`;
  const structure = `import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import test from "node:test";
const required = ${JSON.stringify(required)};
test("selected scaffold files remain regular project files", () => {
  for (const file of required) {
    const info = lstatSync(new URL("../" + file, import.meta.url));
    assert.ok(info.isFile() && !info.isSymbolicLink(), file);
  }
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(typeof pkg.scripts.test, "string");
  for (const file of required.filter(name => name.endsWith("/manifest.json"))) {
    const manifest = JSON.parse(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    assert.ok(manifest && typeof manifest === "object" && !Array.isArray(manifest), file);
  }
});
`;
  const result = [...files, { path: "tests/structure.test.mjs", content: structure }];
  if (capability.adapter === "api-process-v1") {
    const manifest = JSON.parse(files.find(file => file.path === "operations/manifest.json").content);
    result.push({ path: "tests/service-lifecycle.test.mjs", content: serviceLifecycleTest(manifest) });
  }
  return result;
}

export function serviceLifecycleTest(manifest) {
  const variable = manifest.start_command.env_allowlist.find(name => name.endsWith("_PORT"));
  const healthPath = new URL(manifest.health_url).pathname;
  return `import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import test from "node:test";
const portVariable = ${JSON.stringify(variable)};
const pidFile = new URL("../.state/service.pid.json", import.meta.url);
test("managed process starts, serves health and stops without touching foreign PIDs", { timeout: 25000 }, async () => {
  // Lifecycle tests run only in a disposable project without a live PID record.
  assert.equal(existsSync(pidFile), false, "Run lifecycle tests in a disposable copy, not a live service project");
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, [portVariable]: String(port) };
  // The disposable copy owns its local PID record, even when invoked by Pritha.
  delete env.PRITHA_STATE_ROOT;
  delete env.NODE_TEST_CONTEXT;
  const command = action => spawnSync(process.execPath, ["scripts/service-control.mjs", action], { env, encoding: "utf8", timeout: 5000, killSignal: "SIGKILL" });
  let ownedRecord;
  try {
    const started = command("start");
    assert.equal(started.status, 0, "implementation-required until the approved service lifecycle is built: " + started.stderr);
    ownedRecord = readFileSync(pidFile, "utf8");
    const response = await fetch("http://127.0.0.1:" + port + ${JSON.stringify(healthPath)}, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.equal(command("start").status, 0, "repeated start must be idempotent");
    const foreign = { ...JSON.parse(ownedRecord), pid: process.pid };
    writeFileSync(pidFile, JSON.stringify(foreign));
    assert.notEqual(command("stop").status, 0, "a foreign PID must be rejected");
    assert.doesNotThrow(() => process.kill(process.pid, 0));
  } finally {
    if (ownedRecord) writeFileSync(pidFile, ownedRecord);
    const stopped = command("stop");
    if (ownedRecord) assert.equal(stopped.status, 0, stopped.stderr);
  }
  assert.equal(command("stop").status, 0, "repeated stop must be safe");
  await assert.rejects(fetch("http://127.0.0.1:" + port + ${JSON.stringify(healthPath)}, { signal: AbortSignal.timeout(1000) }));
  if (ownedRecord) {
    writeFileSync(pidFile, ownedRecord);
    command("stop"); // A stale record cannot authorize killing a different process.
    assert.doesNotThrow(() => process.kill(process.pid, 0));
    // Remove only the stale record restored by this test, leaving a reusable copy.
    if (existsSync(pidFile) && readFileSync(pidFile, "utf8") === ownedRecord) rmSync(pidFile);
  }
});
`;
}
