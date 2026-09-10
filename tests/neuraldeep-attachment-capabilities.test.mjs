import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import os from "node:os";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import { runSyncProbe } from "../scripts/lib/sync-probe.mjs";
import { attachmentSupport, assertAttachmentSupport, attachmentModelEvidenceHash, ATTACHMENT_TRANSPORT_VERSION } from "../scripts/neuraldeep/attachment-policy.mjs";

const source = readFileSync("interfaces/control-center/src/lib/settings/codex-model-catalog.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace('"../../../../../scripts/neuraldeep/model-input-capabilities.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/model-input-capabilities.mjs")).href));
const { normalizeNeuralDeepModelList, mergeNeuralDeepModelCatalog } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
function context() {
  const model = normalizeNeuralDeepModelList({ data: [{ id: "fixture-vision", type: "chat", capabilities: { vision: true, tools: true }, modalities: { input: ["text", "image"] } }] })[0];
  const catalog = { source: "neuraldeep", refreshedAt: new Date().toISOString() };
  const entry = { model: model.id, path: "initial", modelEvidenceHash: attachmentModelEvidenceHash(model), image: "passed", files: "passed", imageFormats: ["image/png"], verifiedAt: catalog.refreshedAt, source: "synthetic-provider-smoke" };
  const transport = { version: 1, protocolVersion: ATTACHMENT_TRANSPORT_VERSION, cliVersion: "0.153.0", currentCliVersion: "0.153.0", adapterHash: "a".repeat(64), currentAdapterHash: "a".repeat(64), entries: [entry] };
  return { model, catalog, transport };
}
const image = { view: { kind: "image", mediaType: "image/png", size: 100 }, sha256: "fixture" };

test("catalog preserves missing, conflicting and price-only capabilities as unknown", () => {
  const rows = normalizeNeuralDeepModelList({ data: [
    { id: "no-metadata", type: "chat" },
    { id: "contradictory", type: "chat", capabilities: { vision: false }, modalities: { input: ["text", "image"] } },
    { id: "text-only", type: "chat", capabilities: { vision: false, tools: true }, modalities: { input: ["text"] } },
  ] });
  const c = context();
  assert.equal(rows[0].inputModalities, null); assert.equal(rows[0].visionAdvertised, null);
  assert.equal(attachmentSupport({ ...c, model: rows[0] }).image, "unknown");
  assert.equal(attachmentSupport({ ...c, model: rows[1] }).image, "unknown");
  assert.equal(attachmentSupport({ ...c, model: rows[2] }).image, "unsupported");
  const [priced] = mergeNeuralDeepModelCatalog([], [{ model: "priced-only", billing: "token", outputRubPerMillion: 1 }], { mode: "wallet" });
  assert.equal(attachmentSupport({ ...c, model: priced }).image, "unknown");
  assert.equal(attachmentSupport({ ...c, model: priced }).files, "unknown");
});

test("model advertisement does not replace exact initial/resume CLI and provider evidence", () => {
  const c = context();
  assert.equal(assertAttachmentSupport({ ...c, attachments: [image] }).image, "supported");
  assert.throws(() => assertAttachmentSupport({ ...c, path: "resume", attachments: [image] }), error => error.code === "model_image_unverified");
  c.transport.entries.push({ ...c.transport.entries[0], path: "resume" });
  assert.equal(assertAttachmentSupport({ ...c, path: "resume", historicalImages: true }).image, "supported");
  for (const patch of [{ currentCliVersion: "0.154.0" }, { currentAdapterHash: "b".repeat(64) }, { protocolVersion: "unknown" }, { entries: {} }]) {
    assert.equal(attachmentSupport({ ...c, transport: { ...c.transport, ...patch } }).image, "unknown");
  }
  for (const source of ["fixture", "advertised", "fake-upstream"]) {
    const transport = { ...c.transport, entries: [{ ...c.transport.entries[0], source }] };
    assert.equal(attachmentSupport({ ...c, transport }).image, "unknown");
  }
  for (const catalog of [{ ...c.catalog, source: "fallback" }, { ...c.catalog, refreshedAt: "2020-01-01" }]) {
    assert.throws(() => assertAttachmentSupport({ ...c, catalog, historicalImages: true }), error => error.code === "model_image_unverified");
  }
});

test("oversized encoded images and unverified formats never silently become text-only", () => {
  const c = context();
  assert.throws(() => assertAttachmentSupport({ ...c, attachments: [{ ...image, view: { ...image.view, size: 13 * 1024 ** 2 } }] }), error => error.code === "attachment_provider_payload_too_large");
  assert.throws(() => assertAttachmentSupport({ ...c, attachments: [{ ...image, view: { ...image.view, mediaType: "image/jpeg" } }] }), error => error.code === "image_format_unverified");
  const unsupported = { ...c.model, inputModalities: ["text"], visionAdvertised: false };
  assert.throws(() => assertAttachmentSupport({ ...c, model: unsupported, historicalImages: true }), error => error.code === "model_image_unsupported");
});

test("read-only launcher commands preserve existing config and do not initialize a missing home", t => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "nd-read-only-cli-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const home = path.join(tmp, "home"); const state = path.join(tmp, "state");
  const environment = { ...process.env, PRITHA_STATE_ROOT: state, PRITHA_NEURALDEEP_CODEX_HOME: home, PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: "pritha-test-unused", PRITHA_NEURALDEEP_UPSTREAM_ORIGIN: "https://127.0.0.1:1" };
  const run = command => runSyncProbe(process.execPath, ["scripts/neuraldeep-codex.mjs", command, "--json"], { encoding: "utf8", env: environment, timeout: 15000 });
  run("status"); assert.equal(existsSync(home), false);
  mkdirSync(home); const config = path.join(home, "config.toml"); writeFileSync(config, "# retained instance config\n");
  run("status"); assert.equal(readFileSync(config, "utf8"), "# retained instance config\n");
});
