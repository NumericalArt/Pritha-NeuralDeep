import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";
import {
  pickUtf8Locale,
  resolveTemporaryParent,
  sanitizedCodexEnvironment,
} from "../scripts/neuraldeep-codex.mjs";

process.env.TMPDIR = "/tmp";
process.env.TMP = "/tmp";
process.env.TEMP = "/tmp";

test("pickUtf8Locale defaults to en_US.UTF-8 and keeps explicit UTF-8 locales", () => {
  assert.equal(pickUtf8Locale({}), "en_US.UTF-8");
  assert.equal(pickUtf8Locale({ LANG: "ru_RU.UTF-8" }), "ru_RU.UTF-8");
  assert.equal(pickUtf8Locale({ LANG: "C" }), "en_US.UTF-8");
});

test("sanitizedCodexEnvironment forces a UTF-8 locale for the codex child", () => {
  const runtime = { codexHome: "/x/h", projectRoot: "/x/p", stateRoot: "/x/s", instanceId: "i" };
  const environment = sanitizedCodexEnvironment(runtime, { PATH: "/bin" });
  assert.equal(environment.LANG, "en_US.UTF-8");
  assert.equal(environment.LC_ALL, "en_US.UTF-8");
  assert.equal(environment.CODEX_HOME, "/x/h");
});

test("resolveTemporaryParent defaults to an ASCII parent under os.tmpdir()", () => {
  const resolved = resolveTemporaryParent({ instanceId: "nd-test" }, {});
  assert.match(resolved, /^[\x20-\x7e]+$/);
  assert.ok(resolved.endsWith("neuraldeep-runs"));
  assert.ok(resolved.startsWith(os.tmpdir()));
});

test("resolveTemporaryParent honors an ASCII PRITHA_NEURALDEEP_TMP_ROOT", () => {
  const resolved = resolveTemporaryParent({ instanceId: "nd-test" }, { PRITHA_NEURALDEEP_TMP_ROOT: "/tmp/pritha-x" });
  assert.equal(resolved, "/tmp/pritha-x/neuraldeep-runs");
});

test("resolveTemporaryParent falls back for a non-ASCII PRITHA_NEURALDEEP_TMP_ROOT", () => {
  const resolved = resolveTemporaryParent({ instanceId: "nd-test" }, { PRITHA_NEURALDEEP_TMP_ROOT: "/tmp/прита" });
  assert.ok(!resolved.includes("прита"));
  assert.ok(resolved.startsWith(os.tmpdir()));
  assert.ok(resolved.endsWith("neuraldeep-runs"));
});
