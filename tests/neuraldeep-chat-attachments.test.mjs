import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { NeuralDeepAttachmentStore, ATTACHMENT_LIMITS } from "../scripts/neuraldeep/attachment-store.mjs";

const moduleUrl = pathToFileURL(path.resolve("scripts/neuraldeep/attachment-store.mjs")).href;
function fixture(t, extra = {}) {
  const stateRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "nd-originals-")));
  const options = { stateRoot, privateRoot: path.join(stateRoot, "codex-chat"), ...extra };
  const store = new NeuralDeepAttachmentStore(options);
  t.after(async () => { await store.close(); rmSync(stateRoot, { recursive: true, force: true }); });
  return { store, stateRoot, options };
}
const request = (bytes, headers = {}) => new Request("http://localhost/upload", { method: "PUT", body: bytes, headers });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
async function originalBytes(store, id) {
  const original = await store.openOriginal(id);
  try { const pieces = []; for await (const chunk of original.handle.createReadStream({ start: 0, autoClose: false })) pieces.push(chunk); return Buffer.concat(pieces); }
  finally { await original.handle.close(); }
}

test("private originals preserve arbitrary bytes, inferred media, names and repeat identity", async t => {
  const { store } = fixture(t);
  for (const [name, bytes, kind] of [
    ["sample.png", Buffer.from([137,80,78,71,13,10,26,10,0,255,1]), "image"],
    ["unsafe.svg", Buffer.from('<svg onload="throw 1"/>'), "file"],
    ["script.mjs", Buffer.from("process.exit(99)"), "file"],
    ["звук.wav", Buffer.from([0,255,0,10]), "file"],
    ["archive.zip", Buffer.from("PK fixture"), "file"],
    ["empty.bin", Buffer.alloc(0), "file"],
  ]) {
    const id = randomUUID(); const view = await store.upload(id, name, request(bytes, { "content-type": "image/png" }));
    assert.equal(view.kind, kind); assert.equal(view.name, name); assert.equal(view.size, bytes.length);
    assert.equal("filePath" in view, false); assert.equal("sha256" in view, false);
    assert.deepEqual(await originalBytes(store, id), bytes);
    assert.deepEqual(await store.upload(id, name, request(bytes)), view);
    const [{ sha256 }] = await store.prepare([id]); assert.equal(sha256, digest(bytes));
    await assert.rejects(store.upload(id, name, request(Buffer.concat([bytes, Buffer.from("x")]))), error => error.code === "attachment_conflict");
  }
  for (const name of ["../file", "x\ny", "a\\b", "", "x".repeat(241)]) await assert.rejects(store.upload(randomUUID(), name, request("data")), error => error.code === "invalid_attachment_name");
});

test("stream bounds, declared lengths, stalled uploads, counts and message totals retain recoverable drafts", async t => {
  const { store } = fixture(t, { limits: { fileBytes: 100, messageBytes: 150, count: 2 }, uploadIdleMs: 40 });
  const first = randomUUID(); const second = randomUUID();
  await store.upload(first, "a.bin", request(Buffer.alloc(100), { "content-length": "100" }));
  await store.upload(second, "b.bin", request(Buffer.alloc(60)));
  for (const [body, headers, code] of [[Buffer.alloc(101), {}, "attachment_too_large"], ["abc", { "content-length": "2" }, "attachment_upload_interrupted"], ["x", { "content-length": "1.1" }, "invalid_request"]]) {
    await assert.rejects(store.upload(randomUUID(), "bad.bin", request(body, headers)), error => error.code === code);
  }
  for (const ids of [[first, second], [first, first], [first, second, randomUUID()]]) await assert.rejects(store.prepare(ids), error => error.code === "attachment_limit");
  const stalled = randomUUID();
  await assert.rejects(store.upload(stalled, "retry.bin", new Request("http://localhost", { method: "PUT", duplex: "half", body: new ReadableStream({ pull() {} }) })), error => error.code === "attachment_upload_interrupted");
  await store.upload(stalled, "retry.bin", request("recovered"));
  assert.equal((await originalBytes(store, stalled)).toString(), "recovered");
});

test("independent Node processes cannot overcommit attachment quota", async t => {
  const { options, store } = fixture(t, { limits: { storageBytes: 22000 } });
  const children = [];
  t.after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  const run = () => new Promise((resolve, reject) => {
    const script = `import {NeuralDeepAttachmentStore} from ${JSON.stringify(moduleUrl)}; const s=new NeuralDeepAttachmentStore(${JSON.stringify(options)}); try { await s.upload(${JSON.stringify(randomUUID())},'test.bin',new Request('http://localhost',{method:'PUT',body:Buffer.alloc(10000)})); console.log('ok'); } catch(e) { console.log(e.code); } finally { await s.close(); }`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] }); children.push(child);
    let output = ""; child.stdout.on("data", chunk => output += chunk); child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(`child exit ${code}`)));
  });
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.sort(), ["attachment_storage_full", "ok"]);
  await store.initialize(); assert.ok(await store.storageUsage() < options.limits.storageBytes);
});

test("retention outlives archive/history windows; only unreferenced old drafts expire on upload", async t => {
  const { store } = fixture(t);
  const retained = randomUUID(); const expired = randomUUID();
  await store.upload(retained, "keep.txt", request("keep")); await store.upload(expired, "old.txt", request("old"));
  await store.prepare([retained], { retain: true });
  for (const id of [retained, expired]) {
    const file = path.join(store.root, id, "metadata.json"); const row = JSON.parse(readFileSync(file));
    writeFileSync(file, JSON.stringify({ ...row, createdAt: "2020-01-01T00:00:00.000Z" }));
  }
  await store.upload(randomUUID(), "trigger.txt", request("new"));
  assert.equal((await originalBytes(store, retained)).toString(), "keep");
  await assert.rejects(store.openOriginal(expired), error => error.code === "attachment_not_found");
});

test("interrupted publish reconciles immutable receipt and original without overwriting bytes", async t => {
  const { store } = fixture(t); const id = randomUUID();
  const publish = store.publishMetadata.bind(store);
  store.publishMetadata = async () => { throw new Error("synthetic disk failure"); };
  await assert.rejects(store.upload(id, "source.bin", request("original")), error => error.code === "attachment_upload_interrupted");
  store.publishMetadata = publish;
  await assert.rejects(store.upload(id, "source.bin", request("different")), error => error.code === "attachment_conflict");
  await store.upload(id, "source.bin", request("original"));
  assert.equal((await originalBytes(store, id)).toString(), "original");
});

test("hash, symlink, cross-instance and descriptor identity checks preserve originals", async t => {
  const { store, stateRoot } = fixture(t); const other = fixture(t); const id = randomUUID();
  await store.upload(id, "source.txt", request("original"));
  await assert.rejects(other.store.openOriginal(id), error => error.code === "attachment_not_found");
  const file = path.join(store.root, id, "original.txt");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const opened = await store.openOriginal(id);
  renameSync(file, file + ".preserved"); const external = path.join(stateRoot, "outside.txt"); writeFileSync(external, "external"); symlinkSync(external, file);
  const pieces = []; for await (const chunk of opened.handle.createReadStream({ start: 0, autoClose: false })) pieces.push(chunk); await opened.handle.close();
  assert.equal(Buffer.concat(pieces).toString(), "original", "already verified FD remains on its original inode");
  await assert.rejects(store.openOriginal(id));
  rmSync(file); renameSync(file + ".preserved", file); writeFileSync(file, "modified");
  await assert.rejects(store.prepare([id]), error => error.code === "attachment_storage_unavailable");
  assert.equal(readFileSync(external, "utf8"), "external");
});

test("snapshots verify exact bytes for CLI access and retain original independently", async t => {
  const { store, stateRoot } = fixture(t); const id = randomUUID(); const bytes = Buffer.from([1,0,255,2]);
  await store.upload(id, "data.bin", request(bytes));
  const [snapshot] = await store.snapshotForDispatch([id], path.join(stateRoot, "attempt-inputs", "synthetic"));
  assert.equal(digest(readFileSync(snapshot.filePath)), digest(bytes));
  writeFileSync(snapshot.filePath, "tool change");
  assert.deepEqual(await originalBytes(store, id), bytes);
  assert.equal(JSON.parse(readFileSync(path.join(store.root, id, "metadata.json"))).referenced, true);
});

test("dead upload owner is reconciled atomically without a stale timeout stealing a live mutex", async t => {
  const { store, options } = fixture(t, { lockTimeoutMs: 80 });
  const child = spawn(process.execPath, ["--input-type=module", "-e", `import {NeuralDeepAttachmentStore} from ${JSON.stringify(moduleUrl)};const s=new NeuralDeepAttachmentStore(${JSON.stringify(options)});await s.withLock(async()=>{console.log('held');await new Promise(()=>{setInterval(()=>{},10000)});});`], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  await once(child.stdout, "data");
  await assert.rejects(store.upload(randomUUID(), "wait.txt", request("data")), error => error.code === "attachment_storage_busy");
  const closed = once(child, "close"); child.kill("SIGKILL"); await closed;
  const id = randomUUID(); await store.upload(id, "after.txt", request("after"));
  assert.equal((await originalBytes(store, id)).toString(), "after");
});

test("declared defaults match the documented storage contract", () => {
  assert.deepEqual(ATTACHMENT_LIMITS, { count: 10, fileBytes: 104857600, messageBytes: 262144000, storageBytes: 10737418240, unreferencedHours: 24 });
});
