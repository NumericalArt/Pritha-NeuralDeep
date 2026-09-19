// Host template. Its exact SHA-256 is locked in the approved Outcome Spec.
// Run only in a disposable product worktree with local mock upstreams.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const preset = process.argv[2];
assert.ok(["public-json-feed-v1", "llm-http-app-v1"].includes(preset), "Unsupported host verifier preset");
const project = process.cwd();
const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-outcome-trial-"));
const nonce = randomUUID();
const providerToken = randomUUID();
let sourceMode = "ok", providerMode = "ok", sourceRequests = 0, providerRequests = 0;
const input = [1, 2].map(index => ({ id: `${nonce}-${index}`, title: `Источник ${nonce} ${index}`, url: `https://example.invalid/${nonce}/${index}` }));
const expectedDigest = `Сводка ${nonce}: ${input[0].title}. ${input[0].url}`;
let service;
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
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}
function childProcess(script, env) {
  // Deliberately do not forward host credentials/provider configuration.
  const child = spawn(process.execPath, [path.join(project, script)], {
    cwd: project, env: { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  owned.add(child);
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}
const mock = http.createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/feed") {
    sourceRequests += 1;
    if (sourceMode === "error") { response.writeHead(503); return response.end('{"error":"source temporarily unavailable"}'); }
    if (sourceMode === "malformed") return response.end('{"items":');
    return response.end(JSON.stringify({ items: input }));
  }
  if (request.url === "/rss") {
    sourceRequests += 1;
    if (sourceMode === "error") { response.writeHead(503); return response.end("Source unavailable"); }
    if (sourceMode === "malformed") return response.end("<not-an-rss-document>");
    response.setHeader("Content-Type", "application/rss+xml");
    return response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Trial source</title><link>https://example.invalid</link><description>Host fixture</description>${input.map(item => `<item><guid>${item.id}</guid><title>${item.title}</title><link>${item.url}</link><description>Evidence ${item.id}</description><pubDate>Sat, 19 Sep 2026 10:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`);
  }
  if (request.url === "/v1/chat/completions") {
    providerRequests += 1;
    let raw = "";
    for await (const chunk of request) { raw += chunk; if (raw.length > 100_000) { response.writeHead(413); return response.end("{}"); } }
    let body;
    try { body = JSON.parse(raw); } catch { response.writeHead(400); return response.end("{}"); }
    if (request.headers.authorization !== `Bearer ${providerToken}` || body.model !== 'host-fixture' || body.stream !== false
      || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 4096 || body.tools
      || !Array.isArray(body.messages) || body.messages.some(message => !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
      response.writeHead(403); return response.end('{"error":{"code":"provider_binding_request_invalid"}}');
    }
    if (!JSON.stringify(body.messages).includes(input[0].title)) { response.writeHead(422); return response.end('{"error":"selected material missing"}'); }
    if (providerMode === "rate-limit") { response.writeHead(429); return response.end('{"error":{"message":"Try again later"}}'); }
    if (providerMode === "error") { response.writeHead(503); return response.end('{"error":{"message":"Provider unavailable"}}'); }
    if (providerMode === "disabled") { response.writeHead(503); return response.end('{"error":{"code":"provider_binding_disabled"}}'); }
    if (providerMode === "malformed") return response.end('{"choices":[]}');
    return response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: expectedDigest } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  }
  response.writeHead(404); response.end("{}");
});

function checkItems(items) {
  assert.ok(Array.isArray(items), "items must be an array");
  for (const expected of input) {
    const matches = items.filter(item => item.url === expected.url);
    assert.equal(matches.length, 1, "Each upstream item must be persisted exactly once");
    assert.equal(matches[0].title, expected.title, "Persisted title must come from the upstream response");
    assert.ok(typeof matches[0].id === "string" && matches[0].id, "Every item must have a stable identity");
  }
  return items;
}
async function runRefresh(sourceUrl) {
  const child = childProcess("scripts/refresh.mjs", { PRITHA_SOURCE_URL: sourceUrl, PRITHA_DATA_DIR: temp });
  const code = await Promise.race([once(child, "exit").then(([value]) => value), delay(5000).then(() => "timeout")]);
  await stop(child);
  return code;
}
async function jsonFeed(base) {
  assert.equal(await runRefresh(`${base}/feed`), 0, "Refresh must succeed against the local source");
  const read = () => JSON.parse(readFileSync(path.join(temp, "latest.json"), "utf8"));
  checkItems(read().items);
  const before = readFileSync(path.join(temp, "latest.json"), "utf8");
  assert.equal(await runRefresh(`${base}/feed`), 0);
  checkItems(read().items);
  for (const mode of ["error", "malformed"]) {
    sourceMode = mode;
    assert.notEqual(await runRefresh(`${base}/feed`), 0, "Source errors must be visible as a failed refresh");
    assert.equal(readFileSync(path.join(temp, "latest.json"), "utf8"), before, "Source failure must preserve the last successful data");
  }
  sourceMode = "ok";
  assert.equal(await runRefresh(`${base}/feed`), 0);
  checkItems(read().items);
  assert.ok(sourceRequests >= 5, "Product must actually call the configured source");
}
async function httpApp(base) {
  const reservation = http.createServer();
  const app = await listen(reservation), port = new URL(app).port;
  await new Promise(resolve => reservation.close(resolve));
  const environment = { PORT: port, PRITHA_DATA_DIR: temp, PRITHA_LLM_BASE_URL: `${base}/v1`, PRITHA_LLM_MODEL: "host-fixture", PRITHA_LLM_TOKEN: providerToken };
  async function request(route, method = "GET", body) {
    const response = await fetch(`${app}${route}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, ok: response.ok, data, text };
  }
  async function start() {
    service = childProcess("scripts/server.mjs", environment);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      assert.equal(service.exitCode, null, "The product server exited before becoming healthy");
      try {
        const result = await request("/health");
        if (result.ok && result.data?.status === "ok") return;
      } catch {}
      await delay(100);
    }
    throw new Error("Product /health did not become ready");
  }
  await start();
  const page = await request("/");
  assert.ok(page.ok && /<html|<!doctype/i.test(page.text), "A real HTML entry point is required");
  const source = await request("/api/sources", "POST", { name: "Host trial RSS", url: `${base}/rss` });
  assert.ok(source.ok && source.data?.id, "Source settings must be writable through the product API");
  let result = await request("/api/refresh", "POST", {});
  assert.ok(result.ok, "Refresh should succeed");
  const items = checkItems((await request("/api/items")).data?.items);
  assert.ok((await request("/api/refresh", "POST", {})).ok);
  checkItems((await request("/api/items")).data?.items);
  const selected = items.find(item => item.url === input[0].url);
  assert.ok((await request(`/api/items/${encodeURIComponent(selected.id)}`, "PATCH", { read: true, favorite: true })).ok);
  result = await request("/api/digests", "POST", { itemIds: [selected.id] });
  assert.ok(result.ok && result.data?.id, "Successful digest must have a stored identity");
  assert.ok(result.data.markdown?.includes(expectedDigest), "Digest must contain the provider's response");
  const digestId = result.data.id;
  const exported = await request(`/api/digests/${encodeURIComponent(digestId)}/export`);
  assert.ok(exported.ok && exported.text.includes(expectedDigest), "Export must include the saved Markdown");
  const successfulDigests = (await request("/api/digests")).data?.digests;
  assert.ok(Array.isArray(successfulDigests) && successfulDigests.some(item => item.id === digestId));
  for (const mode of ["error", "rate-limit", "malformed", "disabled"]) {
    providerMode = mode;
    result = await request("/api/digests", "POST", { itemIds: [selected.id] });
    assert.ok(!result.ok && typeof result.data?.error === "string" && result.data.error.length > 0, "Provider failure must return an actionable error");
    assert.equal((await request("/api/digests")).data?.digests?.length, successfulDigests.length, "Failed generation must not save a fabricated digest");
  }
  providerMode = "ok";
  assert.ok((await request("/api/digests", "POST", { itemIds: [selected.id] })).ok, "Provider recovery must work without restarting the app");
  for (const mode of ["error", "malformed"]) {
    sourceMode = mode;
    result = await request("/api/refresh", "POST", {});
    assert.ok(!result.ok || (Array.isArray(result.data?.errors) && result.data.errors.length > 0), "Source failures must be visible");
    checkItems((await request("/api/items")).data?.items);
  }
  sourceMode = "ok";
  assert.ok((await request("/api/refresh", "POST", {})).ok);
  await stop(service);
  await start();
  const restored = checkItems((await request("/api/items")).data?.items).find(item => item.id === selected.id);
  assert.ok(restored?.read && restored?.favorite, "Read/favorite state must survive restart");
  assert.ok((await request(`/api/digests/${encodeURIComponent(digestId)}/export`)).text.includes(expectedDigest), "Saved digest must survive restart");
  assert.ok(sourceRequests >= 5 && providerRequests >= 5, "Product must use configured upstreams");
}

try {
  const base = await listen(mock);
  if (preset === "public-json-feed-v1") await jsonFeed(base); else await httpApp(base);
  console.log(JSON.stringify({ verified: preset, checks: "upstream,shape,dedup,failure,recovery,persistence", sourceRequests, providerRequests }));
} finally {
  await Promise.all([...owned].map(stop));
  mock.closeAllConnections();
  await new Promise(resolve => mock.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
