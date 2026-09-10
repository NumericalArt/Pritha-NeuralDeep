import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("Control Center host policy allows default loopback startup", () => {
  const result = run("node", ["interfaces/control-center/scripts/host-policy.mjs"], { PRITHA_CONTROL_CENTER_HOST: "" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("Control Center host policy blocks LAN binding", () => {
  const result = run("node", ["interfaces/control-center/scripts/host-policy.mjs"], { PRITHA_CONTROL_CENTER_HOST: "0.0.0.0" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /localhost \+ Tailscale only/);
});

test("bootstrap refuses to start Control Center with non-loopback host", () => {
  const result = run("node", ["scripts/bootstrap.mjs", "start", "--profile", "local", "--dry-run"], {
    PRITHA_CONTROL_CENTER_HOST: "0.0.0.0",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /localhost \+ Tailscale only/);
});
