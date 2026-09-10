import test from "node:test";
import assert from "node:assert/strict";

test("quality-gate unit tests do not inherit live instance configuration", () => {
  if (process.env.PRITHA_QUALITY_GATE_CHILD !== "1") return;
  for (const key of [
    "PRITHA_STATE_ROOT",
    "PRITHA_AGENT_PARENT",
    "PRITHA_INSTANCE_ID",
    "PRITHA_INSTANCE_ROLE",
    "PRITHA_CONTROL_CENTER_PORT",
    "PRITHA_CONTROL_CENTER_ENV_FILE",
    "PRITHA_SEARXNG_URL",
  ]) {
    assert.equal(process.env[key], undefined, `${key} leaked into the quality-gate test sandbox`);
  }
});
