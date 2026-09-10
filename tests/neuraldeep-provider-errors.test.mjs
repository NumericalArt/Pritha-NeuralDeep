import assert from "node:assert/strict";
import test from "node:test";
import { classifyNeuralDeepProviderError } from "../scripts/neuraldeep/provider-error.mjs";

test("provider status classification separates credentials, billing, rate limits, outages and missing models", () => {
  assert.equal(classifyNeuralDeepProviderError({ status: 401, payload: {} }).class, "credentials");
  assert.equal(classifyNeuralDeepProviderError({ status: 403, payload: { error: { code: "insufficient_balance" } } }).class, "billing");
  assert.equal(classifyNeuralDeepProviderError({ status: 403, payload: { error: { code: "policy_denied" } } }).class, "access_denied");
  assert.equal(classifyNeuralDeepProviderError({ status: 404, payload: {} }).class, "model_unavailable");
  assert.equal(classifyNeuralDeepProviderError({ status: 429, payload: {}, retryAfter: "12" }).retryAfter, "12");
  assert.equal(classifyNeuralDeepProviderError({ status: 503, payload: {} }).class, "outage");
  const network = classifyNeuralDeepProviderError({ transportCode: "ECONNRESET" });
  assert.equal(network.class, "outage");
  assert.equal(network.status, null);
});

test("raw provider messages are never returned by the classification contract", () => {
  const classified = classifyNeuralDeepProviderError({ status: 403, payload: { error: { message: "wallet secret account details" } } });
  assert.equal(classified.class, "billing");
  assert.doesNotMatch(JSON.stringify(classified), /secret account details/);
});

test("a valid key without model access is distinct from invalid credentials even on HTTP 401", () => {
  const denial = classifyNeuralDeepProviderError({ status: 401, payload: {
    error: { code: "401", type: "key_model_access_denied", param: "model", message: "private account details" },
  } });
  assert.deepEqual(denial, { class: "access_denied", code: "key_model_access_denied", status: 401, retryAfter: null });
  assert.equal(classifyNeuralDeepProviderError({ status: 401, payload: {
    error: { code: "401", type: "invalid_api_key", message: "key not allowed" },
  } }).class, "credentials");
});

test("local image validation remains an input error without an outage retry or raw content", () => {
  assert.deepEqual(classifyNeuralDeepProviderError({ status: 409, transportCode: "attachment_original_not_preserved", payload: { error: { message: "private original content" } }, retryAfter: "5" }), {
    class: "input", code: "attachment_original_not_preserved", status: 409, retryAfter: null,
  });
});
