import assert from "node:assert/strict";
import test from "node:test";
import { runSyncProbe } from "../scripts/lib/sync-probe.mjs";

test("sync probes reject absent and invalid deadlines before spawning", () => {
  for (const timeout of [undefined, 0, -1, NaN, Infinity, 1.5, "100"]) assert.throws(() => runSyncProbe("missing-command", [], { timeout }), /positive integer/);
});
test("sync probes kill a child ignoring SIGTERM within the deadline", () => {
  const started = Date.now();
  const result = runSyncProbe(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { timeout: 250, killSignal: "SIGTERM" });
  assert.equal(result.error?.code, "ETIMEDOUT"); assert.equal(result.signal, "SIGKILL");
  assert.ok(Date.now() - started < 3000);
});
test("sync probes preserve stdin, environment, cwd and bounded output without a shell", () => {
  const result = runSyncProbe(process.execPath, ["-e", "console.log(process.cwd());console.log(process.env.PROBE_MARKER);process.stdin.pipe(process.stdout)"], { timeout: 3000, cwd: process.cwd(), env: { PROBE_MARKER: "literal $(value)" }, input: "input", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 4096, shell: true });
  assert.equal(result.status, 0); assert.match(result.stdout, /literal \$\(value\)/); assert.match(result.stdout, /input/);
  const capped = runSyncProbe(process.execPath, ["-e", "process.stdout.write('x'.repeat(100000))"], { timeout: 3000, maxBuffer: 1024 });
  assert.equal(capped.error?.code, "ENOBUFS");
});
