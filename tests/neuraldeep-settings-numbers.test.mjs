import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const root = "interfaces/control-center/src/";
function compile(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(root + file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(id => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
}
const numbers = compile("lib/settings/runtime-numbers.ts");
const saved = { codexTimeoutMs: 10001, codexPromptTokenBudget: 24000, codexMaxPlanSteps: 7 };

test("numeric settings reject coercion and incomplete success envelopes", () => {
  for (const [key, rule] of Object.entries(numbers.RUNTIME_NUMBER_RULES)) {
    for (const value of [null, true, false, "10000", [], {}, NaN, Infinity, 1.5, rule.min - 1, rule.max + 1]) {
      assert.ok(numbers.validateRuntimeNumbers({ [key]: value }), `${key}: ${String(value)}`);
    }
    for (const value of [rule.min, rule.max]) assert.equal(numbers.validateRuntimeNumbers({ [key]: value }), null);
  }
  assert.equal(numbers.hasRuntimeNumbers(saved), true);
  for (const value of [null, [], {}, { codexTimeoutMs: 10001 }, { ...saved, codexMaxPlanSteps: "7" }]) {
    assert.equal(numbers.hasRuntimeNumbers(value), false);
  }
});

test("editable drafts preserve blanks and exact milliseconds through unit changes", () => {
  for (const millis of [10000, 10001, 15001, 999999, 3600000]) {
    const value = { ...saved, codexTimeoutMs: millis };
    for (const unit of ["seconds", "milliseconds"]) {
      const drafts = numbers.runtimeNumberDrafts(value, unit);
      assert.deepEqual(numbers.parseRuntimeNumberDrafts(drafts, unit).values, value);
      const other = unit === "seconds" ? "milliseconds" : "seconds";
      const converted = numbers.convertTimeoutDraft(drafts.codexTimeoutMs, unit, other);
      assert.equal(numbers.convertTimeoutDraft(converted, other, unit), drafts.codexTimeoutMs);
    }
  }
  assert.equal(numbers.convertTimeoutDraft("", "seconds", "milliseconds"), "");
  assert.equal(numbers.convertTimeoutDraft("1e3", "seconds", "milliseconds"), null);
  for (const key of Object.keys(saved)) {
    for (const text of ["", " ", "-1", "0", "1e5", "Infinity", "9999999999999999999999"]) {
      const draft = { ...numbers.runtimeNumberDrafts(saved, "seconds"), [key]: text };
      assert.ok(numbers.parseRuntimeNumberDrafts(draft, "seconds").error);
      assert.equal(draft[key], text);
    }
  }
});

test("real settings route rejects bad payloads before catalog or persistence and commits valid numbers exactly", async () => {
  const writes = [];
  let reads = 0;
  let catalogCalls = 0;
  const defaults = { ...saved, codexSandbox: "workspace-write", codexNetworkAccess: false, codexExecutionMode: "inline_only", codexReasoningEffort: "medium" };
  const runtime = {
    getPrithaRuntimeSettings: () => { reads++; return defaults; },
    updatePrithaRuntimeSettings: async patch => { writes.push(patch); return { ...defaults, ...patch }; },
    getPrithaRealtimeStatus: () => ({ codex: { transports: {} } }),
  };
  const route = compile("app/api/realtime/runtime-settings/route.ts", {
    "@/lib/settings/runtime-numbers": numbers,
    "@/lib/voice/settings": compile("lib/voice/settings.ts"),
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/realtime/pritha-runtime": runtime,
    "@/lib/realtime/voice-settings": {},
    "@/lib/settings/codex-model-catalog-server": { getCodexModelCatalog: () => { catalogCalls++; throw new Error("Unexpected catalog call"); } },
    "@/lib/settings/codex-model-catalog": {},
  });
  const post = body => route.POST(new Request("http://localhost/api/realtime/runtime-settings", { method: "POST", body }));
  for (const raw of ["{", "null", "[]", "true", '"text"', ...Object.keys(saved).flatMap(key => [null, true, "10000", 0, 1.5, [], {}].map(value => JSON.stringify({ [key]: value })))]) {
    const response = await post(raw);
    assert.equal(response.status, 400, raw);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(reads, 0); assert.equal(writes.length, 0); assert.equal(catalogCalls, 0);
  const response = await post(JSON.stringify(saved));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).settings.codexTimeoutMs, 10001);
  assert.deepEqual(writes, [{ deepTaskPrimaryTransport: "codex-cli", ...saved }]);
  for (const payload of [{ deepTaskPrimaryTransport: "codex-app" }, { codexAppThreadMaxTurns: 10 }]) {
    assert.equal((await post(JSON.stringify(payload))).status, 400);
  }
  assert.equal(writes.length, 1);
});
