import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {
  neuralDeepRuntimeConfig,
  runCodexWithNeuralDeep,
  buildCodexExecArgs,
} from "../neuraldeep-codex.mjs";
if (!process.argv.includes("--synthetic")) throw Error("synthetic_required");
const base = mkdtempSync(path.join(os.tmpdir(), "pritha-search-stock-")),
  home = path.join(base, "home"),
  workspace = path.join(base, "workspace");
for (const p of [home, workspace]) mkdirSync(p, { mode: 0o700 });
Object.assign(process.env, {
  PRITHA_STATE_ROOT: base,
  PRITHA_NEURALDEEP_CODEX_HOME: home,
  PRITHA_NEURALDEEP_UPSTREAM_ORIGIN: "https://neuraldeep.invalid",
  PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: "fixture-unused",
  ND_SYNTHETIC_PROVIDER_TOKEN: "synthetic-fixture-only",
  PRITHA_SEARCH_INTENT: JSON.stringify({ explicit: true }),
  PRITHA_INSTANCE_ID: "search-test",
});
writeFileSync(
  path.join(home, "config.toml"),
  'model="fixture-model"\nmodel_provider="neuraldeep"\napproval_policy="never"\ncheck_for_update_on_startup=false\n[model_providers.neuraldeep]\nname="Fixture"\nbase_url="http://127.0.0.1:1/v1"\nwire_api="responses"\nenv_key="ND_SYNTHETIC_PROVIDER_TOKEN"\n',
  { mode: 0o600 },
);
let tools,
  calls = 0;
globalThis.fetch = async (url, init) => {
  if (new URL(url).hostname !== "neuraldeep.invalid")
    throw Error("fixture_outbound_blocked");
  if (new URL(url).pathname !== "/v1/responses") return Response.json({});
  const payload = JSON.parse(Buffer.from(init.body || "{}").toString());
  tools = payload.tools;
  calls++;
  if (calls % 2 === 0) assert.match(JSON.stringify(payload.input), /disabled/);
  console.error(
    "TOOL_SCHEMA",
    JSON.stringify(
      tools.map((t) => ({
        type: t.type,
        name: t.name,
        tools: t.tools?.map((x) => x.name),
      })),
    ),
  );
  const response = {
    id: "fixture-response",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: payload.model,
    output: [
      {
        id: "fixture-message",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: "Fixture done.", annotations: [] },
        ],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
  };
  let middle = "";
  if (calls % 2 === 1) {
    const item = {
      id: `fixture-tool-${calls}`,
      type: "function_call",
      call_id: `fixture-call-${calls}`,
      name: "mcp__pritha_search__web_search",
      arguments: JSON.stringify({ query: "synthetic fixture" }),
      status: "completed",
    };
    response.output = [item];
    middle = [
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, status: "in_progress", arguments: "" },
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: item.id,
        output_index: 0,
        delta: item.arguments,
      },
      { type: "response.output_item.done", output_index: 0, item },
    ]
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join("");
  }
  return new Response(
    `data: ${JSON.stringify({ type: "response.created", response: { ...response, status: "in_progress", output: [] } })}\n\n${middle}data: ${JSON.stringify({ type: "response.completed", response })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
};
try {
  const runtime = neuralDeepRuntimeConfig(),
    options = {
      model: "fixture-model",
      cwd: workspace,
      sandbox: "workspace-write",
      network: false,
      input: "List tools.",
      usageSource: "codex-chat",
      workloadId: "synthetic_search",
    };
  const out = await runCodexWithNeuralDeep(
    runtime,
    buildCodexExecArgs(options),
    options,
  );
  assert.equal(out.code, 0);
  assert.equal(calls, 2);
  const resumeOptions = {
    ...options,
    resume: out.sessionId,
    workloadId: "synthetic_search_resume",
    input: "Use search again.",
  };
  const resumed = await runCodexWithNeuralDeep(
    runtime,
    buildCodexExecArgs(resumeOptions),
    resumeOptions,
  );
  assert.equal(resumed.code, 0);
  assert.equal(resumed.sessionId, out.sessionId);
  assert.equal(calls, 4);
  assert.match(JSON.stringify(tools), /pritha_search/);
  console.error("STOCK_SEARCH_PASS");
} finally {
  rmSync(base, { recursive: true, force: true });
}
