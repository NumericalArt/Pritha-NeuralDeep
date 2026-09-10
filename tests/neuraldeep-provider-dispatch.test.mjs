import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { NeuralDeepCoordinationStore } from "../scripts/neuraldeep/coordination-store.mjs";
import { listenNeuralDeepAdapter, closeNeuralDeepAdapter } from "../scripts/neuraldeep/responses-adapter.mjs";
import { validateResponsesInputs } from "../scripts/neuraldeep/responses-input-policy.mjs";
import { buildCodexExecArgs, renderCodexConfig } from "../scripts/neuraldeep-codex.mjs";

test("paid dispatch receipt precedes fetch and repeated requests cannot cross the provider boundary", async t => {
  const store = new NeuralDeepCoordinationStore(); t.after(() => store.close());
  store.beginRuntimeRun({ runId: "fixture", requestHash: "a".repeat(64), receipt: { model: "fixture-model" } });
  let upstreamCalls = 0; let recorded = false;
  const server = await listenNeuralDeepAdapter({ port: 0,
    beforeResponsesDispatch: event => { store.claimProviderRequest("fixture", event.requestHash, { bytes: event.bytes }); recorded = true; },
    fetchImpl: async () => { assert.equal(recorded, true); upstreamCalls++; throw new Error("synthetic lost response after acceptance"); },
  });
  t.after(() => closeNeuralDeepAdapter(server));
  const url = `http://127.0.0.1:${server.address().port}/v1/responses`;
  const send = body => fetch(url, { method: "POST", body: JSON.stringify(body) });
  let response = await send({ model: "fixture-model", input: "same" }); assert.equal(response.status, 502); await response.text();
  response = await send({ model: "fixture-model", input: "same" }); assert.equal(response.status, 409); await response.text();
  assert.equal(upstreamCalls, 1);
  response = await send({ model: "fixture-model", input: "new tool step" }); await response.text(); assert.equal(upstreamCalls, 2);
  assert.equal(store.runtimeRun("fixture").usage_status, "unknown");
});

test("image originals reach the encoded adapter boundary exactly or fail before dispatch", async t => {
  const bytes = Buffer.from([137,80,78,71,13,10,26,10,255,0,15]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  let accepted = 0; let dispatched = 0;
  const options = { model: "fixture-model", imagesAllowed: true, imageFormats: ["image/png"], requireCurrentImages: true, expectedImages: [{ sha256: hash, size: bytes.length, mediaType: "image/png" }] };
  const server = await listenNeuralDeepAdapter({ port: 0, validateResponsesRequest: payload => validateResponsesInputs(payload, options), beforeResponsesDispatch: () => dispatched++,
    fetchImpl: async (_url, init) => { accepted++; const decoded = JSON.parse(init.body).input[0].content[0].image_url.split(",")[1]; assert.deepEqual(Buffer.from(decoded, "base64"), bytes); return Response.json({ ok: true }); },
  });
  t.after(() => closeNeuralDeepAdapter(server));
  const request = (data, model = "fixture-model") => fetch(`http://127.0.0.1:${server.address().port}/v1/responses`, { method: "POST", body: JSON.stringify({ model, input: [{ role: "user", content: [{ type: "input_image", image_url: data }] }] }) });
  const uri = `data:image/png;base64,${bytes.toString("base64")}`;
  let response = await request(uri); assert.equal(response.status, 200); await response.text();
  for (const [data, model] of [[`data:image/png;base64,${Buffer.from("resized").toString("base64")}`, undefined], [uri, "other-model"], ["https://external.invalid/image.png", undefined]]) {
    response = await request(data, model); assert.equal(response.status, 409); await response.text();
  }
  assert.equal(dispatched, 1); assert.equal(accepted, 1);
  await assert.rejects(validateResponsesInputs({ model: "fixture-model", input: "silently dropped image" }, options), error => error.code === "attachment_image_missing");
  const historical = await validateResponsesInputs({ model: "fixture-model", input: [{ content: [{ type: "input_image", image_url: uri }] }] }, { ...options, expectedImages: [], hasHistoricalImage: (candidate, type, size) => candidate === hash && type === "image/png" && size === bytes.length });
  assert.deepEqual(historical, [hash]);
});

test("initial and exact-ID resume carry explicit image flags and disable implicit provider retries", () => {
  for (const resume of [null, "session-exact"]) {
    const args = buildCodexExecArgs({ model: "fixture-model", images: ["fixture.png"], resume });
    assert.ok(args.includes("--image")); assert.equal(args.at(-1), "-"); assert.equal(args.includes("--last"), false);
    if (resume) assert.equal(args.at(-2), resume);
  }
  assert.throws(() => buildCodexExecArgs({ images: ["bad\0path"] }), /invalid_codex_images/);
  const config = renderCodexConfig(); assert.match(config, /request_max_retries = 0/); assert.match(config, /stream_max_retries = 0/);
});
