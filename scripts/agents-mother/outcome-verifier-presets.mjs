import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { resolvePrithaStatePathFrom } from "../lib/paths.mjs";

export const OUTCOME_VERIFIER_PRESETS = new Set(["public-json-feed-v1", "llm-http-app-v1"]);
const verifierPath = "tests/trials/pritha-outcome-verifier.mjs";
export function outcomeVerifierPresetFiles(preset) {
  if (!preset || preset === "none" || preset === "generic") return [];
  if (!OUTCOME_VERIFIER_PRESETS.has(preset)) throw new Error(`Unsupported Outcome verifier preset: ${preset}`);
  const content = readFileSync(new URL("./verifiers/http-outcome-v1.mjs", import.meta.url), "utf8");
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
export function renderOutcomeVerifierPreset(preset, covers) {
  const [file] = outcomeVerifierPresetFiles(preset);
  if (!file) return "";
  const feed = preset === "public-json-feed-v1";
  const protocol = feed
    ? "scripts/refresh.mjs reads PRITHA_SOURCE_URL and PRITHA_DATA_DIR, fetches {items:[{id,title,url}]}, and atomically stores latest.json with the same items schema. Failed or malformed responses produce a nonzero exit without replacing the last successful data. Repeated refresh is idempotent."
    : "scripts/server.mjs binds 127.0.0.1 at PORT and stores durable product data under PRITHA_DATA_DIR. GET /health returns {status:ok}; GET / serves HTML. POST /api/sources accepts {name,url} and returns {id}; POST /api/refresh returns errors per source. GET /api/items returns {items:[{id,title,url,read,favorite}]}; PATCH /api/items/:id accepts {read,favorite}. POST /api/digests accepts {itemIds} and returns {id,markdown}; GET /api/digests returns {digests}; GET /api/digests/:id/export returns saved Markdown. Pritha UI selects the instance NeuralDeep binding or none. On service start the host injects PRITHA_LLM_BASE_URL (local Pritha broker ending /llm/v1), PRITHA_LLM_MODEL and scoped server-only PRITHA_LLM_TOKEN. POST ${PRITHA_LLM_BASE_URL}/chat/completions uses Authorization: Bearer token with {model,messages:[{role:system|user|assistant,content:string}],stream:false,max_tokens:4096}; no tools, streaming or automatic retries. Read choices[0].message.content. The actual provider credential remains in Pritha; never copy the scoped token into sources, documents, .env or browser code. The controlled host verifier replaces only these process env values with its local fixture. A disabled binding, failed, rate-limited or malformed provider response returns non-2xx {error:string}, saves no digest and permits user retry. RSS sources, deduplication, read/favorite flags and saved digests survive process restart. Actual UI journey, SQLite storage and managed service ownership are separately reviewed operator outcomes.";
  return `### Trial: preset-behavior\n\n- Statement: Independently verify the selected ${preset} behavior against unpredictable local source/provider fixtures.\n- Kind: automated\n${(Array.isArray(covers) ? covers : [covers]).map(cover => `- Covers: ${cover}`).join("\n")}\n- Isolation: none\n- When argv: ["node", "${file.path}", "${preset}"]\n- When cwd: .\n- Product target: scripts/${feed ? "refresh" : "server"}.mjs\n- Verifier input: ${file.path} :: ${file.hash} :: host-template:${preset}\n- Then exit code: 0\n- Timeout ms: 120000\n- Given: Host-owned verifier must exist with the locked hash before delivery; absence is a blocker.\n- Given: ${protocol}\n`;
}
