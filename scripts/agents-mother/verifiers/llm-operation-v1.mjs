// Host template. Its exact SHA-256 is locked in the approved Outcome Spec.
// Verifies any local LLM web app through the product API that its approved
// Outcome Spec declares (argv[3], base64url JSON). Run only in a disposable
// product worktree with local mock upstreams.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const [preset, encoded] = process.argv.slice(2);
assert.equal(preset, "llm-operation-v1", "Unsupported host verifier preset");
const api = JSON.parse(Buffer.from(String(encoded || ""), "base64url").toString("utf8"));
const route = value => typeof value === "string" && /^\/[A-Za-z0-9._~/:-]{0,200}$/.test(value);
const field = value => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value);
assert.ok(["POST", "PUT"].includes(api.operation?.method) && route(api.operation?.path) && !api.operation.path.includes(":")
  && field(api.operation?.inputField), "Declared operation must be POST|PUT <path> with an input field");
assert.ok(route(api.list?.path) && !api.list.path.includes(":") && field(api.list?.itemsField), "Declared list must be GET <path> returning an items field");
for (const key of ["item", "export"]) if (api[key] !== undefined) assert.ok(route(api[key]?.path) && api[key].path.includes(":id"), `Declared ${key} path must contain :id`);
assert.ok(typeof api.sampleInput === "string" && api.sampleInput.trim() && api.sampleInput.length <= 4000, "A realistic sample input is required");
assert.ok(typeof api.providerResponse === "string" && api.providerResponse.includes("{{nonce}}") && api.providerResponse.length <= 8000, "The provider fixture must contain {{nonce}}");
const extraBody = api.operation.extraBody && typeof api.operation.extraBody === "object" && !Array.isArray(api.operation.extraBody) ? api.operation.extraBody : {};

const project = process.cwd();
const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-outcome-trial-"));
const nonce = randomUUID();
const providerToken = randomUUID();
const input = `${api.sampleInput}\n\n(${nonce})`;
const providerContent = api.providerResponse.replaceAll("{{nonce}}", nonce);
let providerMode = "ok", providerRequests = 0, service;
const owned = new Set();

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
}
const mock = http.createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url !== "/v1/chat/completions" || request.method !== "POST") { response.writeHead(404); return response.end("{}"); }
  providerRequests += 1;
  let raw = "";
  for await (const chunk of request) { raw += chunk; if (raw.length > 200_000) { response.writeHead(413); return response.end("{}"); } }
  let body;
  try { body = JSON.parse(raw); } catch { response.writeHead(400); return response.end("{}"); }
  if (request.headers.authorization !== `Bearer ${providerToken}` || body.model !== "host-fixture" || body.stream !== false
    || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 8192 || body.tools
    || !Array.isArray(body.messages) || body.messages.some(message => !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    response.writeHead(403); return response.end('{"error":{"code":"provider_binding_request_invalid"}}');
  }
  if (!JSON.stringify(body.messages).includes(nonce)) { response.writeHead(422); return response.end('{"error":"user input missing from the model request"}'); }
  if (providerMode === "rate-limit") { response.writeHead(429); return response.end('{"error":{"message":"Try again later"}}'); }
  if (providerMode === "error") { response.writeHead(503); return response.end('{"error":{"message":"Provider unavailable"}}'); }
  if (providerMode === "disabled") { response.writeHead(503); return response.end('{"error":{"code":"provider_binding_disabled"}}'); }
  if (providerMode === "malformed") return response.end('{"choices":[]}');
  return response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: providerContent } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
});

async function run(base) {
  const reservation = http.createServer();
  const app = await listen(reservation), port = new URL(app).port;
  await new Promise(resolve => reservation.close(resolve));
  const bound = { PRITHA_LLM_BASE_URL: `${base}/v1`, PRITHA_LLM_MODEL: "host-fixture", PRITHA_LLM_TOKEN: providerToken };
  async function request(target, method = "GET", body) {
    const response = await fetch(`${app}${target}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, ok: response.ok, data, text };
  }
  async function start(withBinding = true) {
    // Deliberately do not forward host credentials or provider configuration.
    service = spawn(process.execPath, [path.join(project, "scripts/server.mjs")], {
      cwd: project, env: { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, PORT: port, PRITHA_DATA_DIR: temp, ...(withBinding ? bound : {}) },
      stdio: ["ignore", "pipe", "pipe"] });
    owned.add(service); service.stdout.on("data", () => {}); service.stderr.on("data", () => {});
    for (let attempt = 0; attempt < 80; attempt += 1) {
      assert.equal(service.exitCode, null, "The product server exited before becoming healthy");
      try { const health = await request("/health"); if (health.ok && health.data?.status === "ok") return; } catch {}
      await delay(100);
    }
    throw new Error("Product /health did not become ready");
  }
  const operate = () => request(api.operation.path, api.operation.method, { ...extraBody, [api.operation.inputField]: input });
  const items = async () => {
    const listed = await request(api.list.path);
    assert.ok(listed.ok, "The declared list endpoint must succeed");
    const values = listed.data?.[api.list.itemsField];
    assert.ok(Array.isArray(values), `The list response must contain an array in ${api.list.itemsField}`);
    return values;
  };
  const withId = (template, id) => template.replace(":id", encodeURIComponent(String(id)));

  await start();
  const page = await request("/");
  assert.ok(page.ok && /<html|<!doctype/i.test(page.text), "A real HTML entry point is required");
  const before = (await items()).length;
  let result = await operate();
  assert.ok(result.ok, `The declared operation must succeed with a working provider (status ${result.status})`);
  const id = result.data?.id;
  assert.ok((typeof id === "string" && id) || Number.isSafeInteger(id), "A successful operation must return a stored id");
  assert.ok(result.text.includes(nonce), "The operation result must contain the provider response");
  assert.ok(providerRequests >= 1, "The product must call the Pritha-managed provider binding");
  let listed = await items();
  assert.equal(listed.length, before + 1, "One successful operation stores exactly one result");
  const saved = listed.find(item => String(item?.id) === String(id));
  assert.ok(saved, "The stored result must appear in the declared list");
  if (!api.item && !api.export) assert.ok(JSON.stringify(saved).includes(nonce), "The listed result must contain the provider response");
  if (api.item) assert.ok((await request(withId(api.item.path, id))).text.includes(nonce), "The declared item endpoint must return the saved result");
  if (api.export) {
    const exported = await request(withId(api.export.path, id));
    assert.ok(exported.ok && exported.text.includes(nonce), "The declared export must contain the saved result");
  }
  for (const mode of ["error", "rate-limit", "malformed", "disabled"]) {
    providerMode = mode;
    result = await operate();
    assert.ok(!result.ok && typeof result.data?.error === "string" && result.data.error.trim(), `Provider ${mode} must return an actionable {error} response`);
    assert.equal((await items()).length, before + 1, `Provider ${mode} must not save a fabricated result`);
  }
  providerMode = "ok";
  assert.ok((await operate()).ok, "Provider recovery must work without restarting the app");
  const count = (await items()).length;
  await stop(service);
  await start(false);
  result = await operate();
  assert.ok(!result.ok && typeof result.data?.error === "string" && result.data.error.trim(), "Without a provider binding the operation must return an actionable {error}");
  assert.equal((await items()).length, count, "A missing binding must not save a result");
  await stop(service);
  await start();
  listed = await items();
  assert.ok(listed.some(item => String(item?.id) === String(id)), "Stored results must survive a restart");
  if (api.export) assert.ok((await request(withId(api.export.path, id))).text.includes(nonce), "The export must survive a restart");
}

try {
  const base = await listen(mock);
  await run(base);
  console.log(JSON.stringify({ verified: preset, checks: "html,operation,provider-binding,list,export,failure,no-binding,recovery,persistence", providerRequests }));
} finally {
  await Promise.all([...owned].map(stop));
  mock.closeAllConnections();
  await new Promise(resolve => mock.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
