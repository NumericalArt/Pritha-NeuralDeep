import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as stream from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import * as storage from "../scripts/neuraldeep/attachment-store.mjs";
import * as history from "../scripts/neuraldeep/chat-history-store.mjs";
const root = "interfaces/control-center/src/";
function compile(file, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(root + file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", "module", code)(id => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
    return dependencies[id];
  }, module.exports, module);
  return module.exports;
}
class GatewayError extends Error { constructor(code, message, status) { super(message); Object.assign(this, { code, status, retryable: false }); } }
const http = compile("lib/codex-chat/http.ts", { "node:crypto": crypto, "./gateway": { CodexChatGatewayError: GatewayError }, "../../../../../scripts/neuraldeep/chat-history-store.mjs": history, "../../../../../scripts/neuraldeep/attachment-store.mjs": storage });
const guard = compile("lib/security/api-guard.ts", {});

test("real attachment PUT/GET round-trips streaming bytes and safe download headers", async t => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nd-original-routes-"));
  const store = new storage.NeuralDeepAttachmentStore({ stateRoot: tmp, privateRoot: path.join(tmp, "chat") });
  t.after(async () => { await store.close(); rmSync(tmp, { recursive: true, force: true }); });
  const route = compile("app/api/codex-chat/v1/attachments/[attachmentId]/route.ts", { "node:stream": stream, "@/lib/codex-chat/http": http, "@/lib/codex-chat/attachment-store": { ...storage, getChatAttachmentStore: () => store } });
  const id = crypto.randomUUID(); const context = { params: Promise.resolve({ attachmentId: id }) };
  const bytes = Buffer.from('<script>alert("must stay original")</script>\n\0\u001b');
  const url = `http://localhost/api/codex-chat/v1/attachments/${id}`;
  const response = await route.PUT(new Request(url, { method: "PUT", body: bytes, headers: { "x-attachment-name": encodeURIComponent("тест.html"), "content-type": "text/html" } }), context);
  assert.equal(response.status, 200);
  const view = (await response.json()).data; assert.equal(view.mediaType, "application/octet-stream");
  const downloaded = await route.GET(new Request(url), context);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
  assert.match(downloaded.headers.get("content-disposition"), /^attachment;.*filename\*=UTF-8''%D1/);
  assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
  assert.equal(downloaded.headers.get("cache-control"), "no-store");
  assert.match(downloaded.headers.get("content-security-policy"), /sandbox/);
  const invalid = await route.PUT(new Request(url, { method: "PUT", body: "data", headers: { "x-attachment-name": "%FF" } }), context);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "invalid_attachment_name");
});

test("new upload methods remain behind existing same-origin and trusted-device guards", () => {
  const url = "http://localhost/api/codex-chat/v1/attachments/fixture";
  for (const method of ["PUT", "POST"]) {
    assert.equal(guard.evaluateApiRequestGuard({ url, method, headers: new Headers({ host: "localhost", origin: "https://evil.invalid", "sec-fetch-site": "cross-site" }), env: {} }).action, "deny");
    assert.equal(guard.evaluateApiRequestGuard({ url, method, headers: new Headers({ host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" }), env: {} }).action, "allow");
  }
  assert.equal(guard.evaluateApiRequestGuard({ url, method: "GET", headers: new Headers({ host: "fixture.ts.net" }), env: {} }).action, "deny");
});

test("JSON request limits are enforced during streaming and invalid UTF-8 cannot be silently replaced", async () => {
  let pulls = 0; let cancelled = false;
  const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(Buffer.alloc(65536)); }, cancel() { cancelled = true; } });
  await assert.rejects(http.readJsonBody(new Request("http://localhost", { method: "POST", duplex: "half", body })), error => error.code === "payload_too_large");
  assert.equal(cancelled, true); assert.ok(pulls <= 6);
  await assert.rejects(http.readJsonBody(new Request("http://localhost", { method: "POST", body: Buffer.from([34,255,34]) })), error => error.code === "invalid_request");
  assert.deepEqual(await http.readJsonBody(new Request("http://localhost", { method: "POST", body: '{"ok":true}' })), { ok: true });
});
