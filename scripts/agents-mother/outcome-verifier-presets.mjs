import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { resolvePrithaStatePathFrom } from "../lib/paths.mjs";

export const OUTCOME_VERIFIER_PRESETS = new Set(["public-json-feed-v1", "llm-http-app-v1", "llm-operation-v1"]);
// Presets whose automated Trial is configured by the product API declared in the Outcome Spec.
export const API_DECLARED_PRESETS = new Set(["llm-operation-v1"]);
const verifierPath = "tests/trials/pritha-outcome-verifier.mjs";
const route = value => typeof value === "string" && /^\/[A-Za-z0-9._~/:-]{0,200}$/.test(value);
const field = value => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value);

/** Structural checks shared by Outcome authoring and the protected Trial. */
export function productApiIssues(api) {
  const issues = [];
  if (!api || typeof api !== "object" || Array.isArray(api)) return ["productApi must be an object"];
  if (!["POST", "PUT"].includes(api.operation?.method) || !route(api.operation?.path) || api.operation.path.includes(":") || !field(api.operation?.inputField))
    issues.push("productApi.operation needs method POST|PUT, a /path without parameters and an inputField identifier");
  if (api.operation?.extraBody !== undefined && (typeof api.operation.extraBody !== "object" || Array.isArray(api.operation.extraBody) || JSON.stringify(api.operation.extraBody).length > 1000))
    issues.push("productApi.operation.extraBody must be a small object");
  if (!route(api.list?.path) || api.list.path.includes(":") || !field(api.list?.itemsField)) issues.push("productApi.list needs a /path and an itemsField identifier");
  for (const key of ["item", "export"]) if (api[key] !== undefined && (!route(api[key]?.path) || !api[key].path.includes(":id"))) issues.push(`productApi.${key}.path must contain :id`);
  if (typeof api.sampleInput !== "string" || !api.sampleInput.trim() || api.sampleInput.length > 4000) issues.push("productApi.sampleInput must be a realistic input up to 4000 characters");
  if (typeof api.providerResponse !== "string" || !api.providerResponse.includes("{{nonce}}") || api.providerResponse.length > 8000)
    issues.push("productApi.providerResponse must be a model reply the product accepts, containing {{nonce}}");
  return issues;
}
export function normalizedProductApi(api) {
  const pick = value => value && { path: value.path };
  return { operation: { method: api.operation.method, path: api.operation.path, inputField: api.operation.inputField, ...(api.operation.extraBody ? { extraBody: api.operation.extraBody } : {}) },
    list: { path: api.list.path, itemsField: api.list.itemsField }, ...(api.item ? { item: pick(api.item) } : {}), ...(api.export ? { export: pick(api.export) } : {}),
    sampleInput: api.sampleInput, providerResponse: api.providerResponse };
}
export const encodeProductApi = api => Buffer.from(JSON.stringify(normalizedProductApi(api)), "utf8").toString("base64url");
export function decodeProductApi(value) {
  try { const api = JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8")); return productApiIssues(api).length ? null : api; }
  catch { return null; }
}
export function outcomeVerifierPresetFiles(preset) {
  if (!preset || preset === "none" || preset === "generic") return [];
  if (!OUTCOME_VERIFIER_PRESETS.has(preset)) throw new Error(`Unsupported Outcome verifier preset: ${preset}`);
  const source = API_DECLARED_PRESETS.has(preset) ? "./verifiers/llm-operation-v1.mjs" : "./verifiers/http-outcome-v1.mjs";
  const content = readFileSync(new URL(source, import.meta.url), "utf8");
  return [{ path: verifierPath, content, hash: `sha256:${createHash("sha256").update(content).digest("hex")}` }];
}
export function installOutcomeVerifierPreset(projectPath, preset) {
  const project = path.resolve(projectPath);
  if (!lstatSync(project).isDirectory() || lstatSync(project).isSymbolicLink()) throw new Error("Host verifier target must be a regular directory");
  return outcomeVerifierPresetFiles(preset).map(file => {
    const target = path.join(project, file.path);
    let current = project;
    for (const part of file.path.split("/")) {
      current = path.join(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Host verifier installation may not cross symlinks");
    }
    mkdirSync(path.dirname(target), { recursive: true });
    if (existsSync(target)) {
      if (readFileSync(target, "utf8") !== file.content) throw new Error("Existing verifier differs from the host template; explicit Outcome revision required");
    } else writeFileSync(target, file.content, { flag: "wx", mode: 0o600 });
    return { path: target, hash: file.hash };
  });
}
function preparationReceiptPath(projectPath, options) {
  const identity = createHash("sha256").update(realpathSync(projectPath)).digest("hex");
  return resolvePrithaStatePathFrom(options, "audit", "outcome-verifier-presets", `${identity}.json`);
}
function onlyPreparedFiles(projectPath, files) {
  const allowedFiles = new Set(files.map(file => file.path));
  const allowedDirectories = new Set(files.flatMap(file => {
    const parts = file.path.split("/"); return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
  }));
  function walk(directory, prefix = "") {
    for (const name of readdirSync(directory)) {
      const relative = prefix ? `${prefix}/${name}` : name, full = path.join(directory, name), info = lstatSync(full);
      if (info.isSymbolicLink()) throw new Error("Prepared target may not contain symlinks");
      if (info.isDirectory() && allowedDirectories.has(relative)) walk(full, relative);
      else if (!info.isFile() || !allowedFiles.has(relative)) throw new Error("Target contains files outside the host verifier reservation");
    }
  }
  walk(projectPath);
}
// Host-only preparation before reviewing an Outcome for a reserved empty
// target. The receipt lives outside the product and is not an approval.
export function prepareOutcomeVerifierPreset(projectPath, preset, options = {}) {
  const files = outcomeVerifierPresetFiles(preset);
  if (!files.length) return { prepared: false, files: [] };
  const project = path.resolve(projectPath);
  if (!existsSync(project)) mkdirSync(project, { recursive: true });
  if (!lstatSync(project).isDirectory() || lstatSync(project).isSymbolicLink()) throw new Error("Host verifier target must be a regular directory");
  onlyPreparedFiles(project, files);
  installOutcomeVerifierPreset(project, preset);
  const receipt = { schema: "pritha-outcome-verifier-preparation-v1", projectPath: realpathSync(project), preset,
    files: files.map(({ path, hash }) => ({ path, hash })), preparedAt: new Date().toISOString(),
    ...(options.jobId ? { creationJobId: options.jobId } : {}) };
  const receiptPath = preparationReceiptPath(project, options);
  atomicWriteFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { prepared: true, ...receipt, receiptPath };
}
export function verifyPreparedOutcomeVerifierPreset(projectPath, preset, options = {}) {
  const files = outcomeVerifierPresetFiles(preset);
  if (!files.length) throw new Error("Nonempty target has no selected host verifier preset");
  const project = realpathSync(projectPath), receiptPath = preparationReceiptPath(project, options);
  if (!existsSync(receiptPath) || lstatSync(receiptPath).isSymbolicLink() || lstatSync(receiptPath).size > 32_768) throw new Error("Host verifier preparation receipt is missing or invalid");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (receipt.schema !== "pritha-outcome-verifier-preparation-v1" || receipt.projectPath !== project || receipt.preset !== preset
    || JSON.stringify(receipt.files) !== JSON.stringify(files.map(({ path, hash }) => ({ path, hash })))) throw new Error("Host verifier preparation identity or hashes changed");
  onlyPreparedFiles(project, files);
  for (const file of files) if (readFileSync(path.join(project, file.path), "utf8") !== file.content) throw new Error("Prepared host verifier changed before scaffold");
  return receipt;
}
function declaredApiProtocol(api) {
  const operation = `${api.operation.method} ${api.operation.path} accepts JSON {${api.operation.inputField}: <user text>${api.operation.extraBody ? `, ${Object.keys(api.operation.extraBody).join(", ")}` : ""}} and returns 2xx JSON {id, ...result}`;
  return [`scripts/server.mjs binds 127.0.0.1 at PORT and stores durable product data under PRITHA_DATA_DIR. GET /health returns {status:ok}; GET / serves HTML.`,
    `Declared product API: ${operation}; the result contains content derived from the model reply. GET ${api.list.path} returns {${api.list.itemsField}:[{id, ...}]} including every saved result.`,
    api.item ? `GET ${api.item.path} returns the saved result.` : "",
    api.export ? `GET ${api.export.path} returns the saved result as a downloadable document.` : "",
    `On service start the host injects PRITHA_LLM_BASE_URL (local Pritha broker ending /llm/v1), PRITHA_LLM_MODEL and scoped server-only PRITHA_LLM_TOKEN; when the binding is none they are absent. POST \${PRITHA_LLM_BASE_URL}/chat/completions uses Authorization: Bearer token with {model,messages:[{role:system|user|assistant,content:string}],stream:false,max_tokens:1..8192}; no tools or streaming. Include the user's text in the messages and read choices[0].message.content.`,
    `The protected fixture replies with this model output (with {{nonce}} replaced), which the product must accept: ${JSON.stringify(api.providerResponse)}. Sample input: ${JSON.stringify(api.sampleInput.slice(0, 600))}.`,
    `A missing binding or a failed, rate-limited or malformed provider response returns non-2xx {error:string}, saves nothing and permits an explicit retry without restart. Saved results survive a process restart. Never copy the scoped token into sources, documents, .env or browser code.`]
    .filter(Boolean).join(" ");
}

export function renderOutcomeVerifierPreset(preset, covers, options = {}) {
  const [file] = outcomeVerifierPresetFiles(preset);
  if (!file) return "";
  if (API_DECLARED_PRESETS.has(preset)) {
    if (options.productApi && productApiIssues(options.productApi).length) throw new Error(`Preset ${preset} requires a valid declared productApi`);
    if (!options.productApi) {
      // A draft (e.g. CLI outcome init) must be completed by its author; validation rejects this placeholder.
      return `### Trial: preset-behavior\n\n- Statement: Declare the product API (operation, list, optional item/export, sample input and provider reply) so the protected ${preset} verifier can check it.\n- Kind: automated\n${(Array.isArray(covers) ? covers : [covers]).map(cover => `- Covers: ${cover}`).join("\n")}\n- Isolation: none\n- When argv: ${JSON.stringify(["node", file.path, preset, "DECLARE_PRODUCT_API"])}\n- When cwd: .\n- Product target: scripts/server.mjs\n- Verifier input: ${file.path} :: ${file.hash} :: host-template:${preset}\n- Then exit code: 0\n- Timeout ms: 180000`;
    }
    const argv = JSON.stringify(["node", file.path, preset, encodeProductApi(options.productApi)]);
    return `### Trial: preset-behavior\n\n- Statement: Independently verify the declared product API with a local model fixture: model call through the Pritha binding, saved results, provider failures, a missing binding, recovery and restart persistence.\n- Kind: automated\n${(Array.isArray(covers) ? covers : [covers]).map(cover => `- Covers: ${cover}`).join("\n")}\n- Isolation: none\n- When argv: ${argv}\n- When cwd: .\n- Product target: scripts/server.mjs\n- Verifier input: ${file.path} :: ${file.hash} :: host-template:${preset}\n- Then exit code: 0\n- Timeout ms: 180000\n- Given: Host-owned verifier must exist with the locked hash before delivery; absence is a blocker.\n- Given: ${declaredApiProtocol(normalizedProductApi(options.productApi))}`;
  }
  const feed = preset === "public-json-feed-v1";
  const protocol = feed
    ? "scripts/refresh.mjs reads PRITHA_SOURCE_URL and PRITHA_DATA_DIR, fetches {items:[{id,title,url}]}, and atomically stores latest.json with the same items schema. Failed or malformed responses produce a nonzero exit without replacing the last successful data. Repeated refresh is idempotent."
    : "scripts/server.mjs binds 127.0.0.1 at PORT and stores durable product data under PRITHA_DATA_DIR. GET /health returns {status:ok}; GET / serves HTML. POST /api/sources accepts {name,url} and returns {id}; POST /api/refresh returns errors per source. GET /api/items returns {items:[{id,title,url,read,favorite}]}; PATCH /api/items/:id accepts {read,favorite}. POST /api/digests accepts {itemIds} and returns {id,markdown}; GET /api/digests returns {digests}; GET /api/digests/:id/export returns saved Markdown. Pritha UI selects the instance NeuralDeep binding or none. On service start the host injects PRITHA_LLM_BASE_URL (local Pritha broker ending /llm/v1), PRITHA_LLM_MODEL and scoped server-only PRITHA_LLM_TOKEN. POST ${PRITHA_LLM_BASE_URL}/chat/completions uses Authorization: Bearer token with {model,messages:[{role:system|user|assistant,content:string}],stream:false,max_tokens:4096}; no tools, streaming or automatic retries. Read choices[0].message.content. The actual provider credential remains in Pritha; never copy the scoped token into sources, documents, .env or browser code. The controlled host verifier replaces only these process env values with its local fixture. A disabled binding, failed, rate-limited or malformed provider response returns non-2xx {error:string}, saves no digest and permits user retry. RSS sources, deduplication, read/favorite flags and saved digests survive process restart. Actual UI journey, SQLite storage and managed service ownership are separately reviewed operator outcomes.";
  return `### Trial: preset-behavior\n\n- Statement: Independently verify the selected ${preset} behavior against unpredictable local source/provider fixtures.\n- Kind: automated\n${(Array.isArray(covers) ? covers : [covers]).map(cover => `- Covers: ${cover}`).join("\n")}\n- Isolation: none\n- When argv: ["node", "${file.path}", "${preset}"]\n- When cwd: .\n- Product target: scripts/${feed ? "refresh" : "server"}.mjs\n- Verifier input: ${file.path} :: ${file.hash} :: host-template:${preset}\n- Then exit code: 0\n- Timeout ms: 120000\n- Given: Host-owned verifier must exist with the locked hash before delivery; absence is a blocker.\n- Given: ${protocol}\n`;
}
