import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaStateRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { contractFingerprint } from "./contract.mjs";
import { agentInstanceKey, authoredAgentId } from "./identity.mjs";

const digest = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const textValue = value => typeof value === "string" ? value.trim() : "";
const bodyValue = (text, field) => text.match(new RegExp(`^- ${field}:\\s*(.+)$`, "mi"))?.[1]?.trim() || "";
const refFor = fm => textValue(fm.contract_path) || (Array.isArray(fm.related?.agent_contracts) && fm.related.agent_contracts.length === 1 ? textValue(fm.related.agent_contracts[0]) : "");
const reportFingerprint = (fm, text) => textValue(fm.contract_fingerprint) || bodyValue(text, "Contract fingerprint");

function context(options = {}) {
  const root = path.resolve(options.root || resolveTechscopeRoot());
  const stateRoot = resolvePrithaStateRoot({ ...options, root });
  const memoryRoot = path.resolve(options.memoryRoot || resolvePrithaAgentMemoryRoot({ ...options, root, canonical: true }));
  const memoryRelative = path.relative(stateRoot, memoryRoot);
  if (!memoryRelative || memoryRelative === ".." || memoryRelative.startsWith(`..${path.sep}`) || path.isAbsolute(memoryRelative)) throw new Error("identity_migration_memory_outside_instance");
  const instanceKey = agentInstanceKey(stateRoot);
  return { root, stateRoot, memoryRoot, instanceKey, legacyRoots: [...new Set([root, ...(options.legacyRoots || [])].map(value => path.resolve(value)))], file: path.join(memoryRoot, "identity-migrations.json") };
}

function read(file, boundary) {
  const relative = path.relative(boundary, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("identity_migration_path_outside_instance");
  let cursor = boundary;
  if (lstatSync(cursor).isSymbolicLink()) throw new Error("identity_migration_symlink");
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("identity_migration_symlink");
  }
  const text = readBoundedRegularFile(file, { allowedRoots: [boundary], maxBytes: 1024 * 1024 }).text;
  return { text, fm: parseFrontmatterData(text) || {}, hash: digest(text) };
}

function documents(ctx) {
  const output = [];
  for (const folder of ["contracts", "outcome-specs", "profiles", "reports"]) {
    const directory = path.join(ctx.memoryRoot, folder);
    if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) continue;
    const files = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith(".md"));
    if (files.length > 4000) throw new Error("identity_migration_artifact_limit");
    for (const file of files) {
      const fullPath = path.join(directory, file.name);
      try { output.push({ path: fullPath, relative: path.relative(ctx.memoryRoot, fullPath), ...read(fullPath, ctx.memoryRoot) }); } catch { /* Unsafe artifacts never contribute migration evidence. */ }
    }
  }
  return output.sort((a, b) => a.relative.localeCompare(b.relative));
}

function scoped(fm, ctx) { return !fm.instance_key || fm.instance_key === ctx.instanceKey; }
function referenceCandidates(reference, ctx) {
  const expanded = reference.replaceAll("<TECHSCOPE_ROOT>", ctx.root).replaceAll("<PRITHA_STATE_ROOT>", ctx.stateRoot).replaceAll("<PRITHA_AGENT_MEMORY_ROOT>", ctx.memoryRoot);
  if (/[<>]/.test(expanded)) return [];
  const results = ctx.legacyRoots.map(root => path.resolve(root, expanded));
  // This is a recognized layout relocation, but is never enough without IDs and fingerprints.
  if (/^11_agents\/contracts\/[^/]+\.md$/.test(reference)) results.push(path.join(ctx.memoryRoot, reference.slice("11_agents/".length)));
  return [...new Set(results)];
}

export function readAgentIdentityMigrations(options = {}) {
  const ctx = context(options);
  if (!existsSync(ctx.file)) return { schema: "pritha-agent-identity-migrations-v1", instanceKey: ctx.instanceKey, entries: [] };
  try {
    const stored = JSON.parse(read(ctx.file, ctx.memoryRoot).text);
    const required = ["instanceKey", "artifactPath", "artifactId", "artifactHash", "agentId", "legacyContractRef", "contractPath", "contractId", "contractFingerprint"];
    if (stored.schema !== "pritha-agent-identity-migrations-v1" || stored.instanceKey !== ctx.instanceKey || !Array.isArray(stored.entries) || stored.entries.length > 4000
      || stored.entries.some(entry => !entry || required.some(key => typeof entry[key] !== "string" || !entry[key]))) return { entries: [], issue: "identity-migration-map-invalid" };
    return stored;
  } catch { return { entries: [], issue: "identity-migration-map-unreadable" }; }
}

export function validateIdentityMigrationEntry(entry, options = {}) {
  const ctx = context(options);
  try {
    if (entry.instanceKey !== ctx.instanceKey) return false;
    const artifact = read(path.resolve(ctx.memoryRoot, entry.artifactPath), ctx.memoryRoot);
    const contract = read(path.resolve(ctx.memoryRoot, entry.contractPath), ctx.memoryRoot);
    const sourceId = authoredAgentId(artifact.fm), targetId = authoredAgentId(contract.fm);
    return scoped(artifact.fm, ctx) && scoped(contract.fm, ctx)
      && !sourceId.issue && !targetId.issue && sourceId.id === entry.agentId && targetId.id === entry.agentId
      && contract.fm.type === "agent-contract" && artifact.fm.type !== "agent-contract"
      && artifact.fm.id === entry.artifactId && contract.fm.id === entry.contractId
      && artifact.hash === entry.artifactHash && refFor(artifact.fm) === entry.legacyContractRef
      && reportFingerprint(artifact.fm, artifact.text) === entry.contractFingerprint
      && contractFingerprint(contract.text) === entry.contractFingerprint;
  } catch { return false; }
}

/** Attribution only. Even a valid mapping cannot approve or verify an Outcome. */
export function resolveMigratedContract(artifactPath, options = {}) {
  const ctx = context(options);
  const stored = options.migrations || readAgentIdentityMigrations(ctx);
  const matches = stored.entries.filter(entry => path.resolve(ctx.memoryRoot, entry.artifactPath) === path.resolve(artifactPath));
  if (matches.length !== 1 || !validateIdentityMigrationEntry(matches[0], ctx)) return null;
  return path.resolve(ctx.memoryRoot, matches[0].contractPath);
}

export function planAgentIdentityMigration(options = {}) {
  const ctx = context(options), all = documents(ctx), contracts = all.filter(item => item.fm.type === "agent-contract");
  const entries = [], unresolved = [];
  const existing = readAgentIdentityMigrations(ctx);
  for (const item of all.filter(item => item.fm.type !== "agent-contract" && refFor(item.fm))) {
    const ref = refFor(item.fm);
    if (contracts.some(contract => contract.path === path.resolve(ctx.root, ref))) continue;
    const identity = authoredAgentId(item.fm), fp = reportFingerprint(item.fm, item.text);
    const reject = reason => unresolved.push({ artifactPath: item.relative, artifactId: item.fm.id || null, reason });
    if (!scoped(item.fm, ctx) || identity.issue) { reject("foreign-or-conflicting-identity"); continue; }
    if (!identity.id || !textValue(item.fm.id) || !/^sha256:[a-f0-9]{64}$/.test(fp)) { reject("missing-stable-identity-or-fingerprint"); continue; }
    const candidates = contracts.filter(contract => textValue(contract.fm.id) && scoped(contract.fm, ctx) && !authoredAgentId(contract.fm).issue && authoredAgentId(contract.fm).id === identity.id && contractFingerprint(contract.text) === fp);
    if (candidates.length !== 1) { reject(candidates.length ? "ambiguous-contract-identity" : "contract-fingerprint-not-found"); continue; }
    const target = candidates[0];
    if (!referenceCandidates(ref, ctx).includes(target.path)) { reject("legacy-reference-outside-verified-roots"); continue; }
    entries.push({ instanceKey: ctx.instanceKey, artifactPath: item.relative, artifactId: item.fm.id, artifactHash: item.hash,
      agentId: identity.id, legacyContractRef: ref, contractPath: target.relative, contractId: target.fm.id, contractFingerprint: fp });
  }
  const plan = { schema: "pritha-agent-identity-migration-plan-v1", instanceKey: ctx.instanceKey, root: ctx.root, stateRoot: ctx.stateRoot,
    memoryRoot: ctx.memoryRoot, legacyRoots: ctx.legacyRoots, entries, unresolved,
    previousMapHash: existsSync(ctx.file) ? read(ctx.file, ctx.memoryRoot).hash : null,
    existingEntries: existing.entries.length };
  return { ...plan, planLock: digest(JSON.stringify(plan)) };
}

export function applyAgentIdentityMigration(plan, options = {}) {
  if (process.env.PRITHA_AGENT_AUTHORING_ROOT) throw new Error("identity_migration_requires_host");
  if (!["user", "codex-operator"].includes(options.approvedBy) || (options.approvedBy === "codex-operator" && !textValue(options.authorizationBasis))) throw new Error("identity_migration_approval_required");
  const ctx = context(options);
  const { planLock, ...reviewed } = plan;
  if (digest(JSON.stringify(reviewed)) !== planLock) throw new Error("identity_migration_plan_tampered");
  if (plan.instanceKey !== ctx.instanceKey || plan.root !== ctx.root || plan.memoryRoot !== ctx.memoryRoot || options.planLock !== plan.planLock) throw new Error("identity_migration_plan_mismatch");
  return withFileLock(ctx.file, () => {
    const current = readAgentIdentityMigrations(ctx);
    if (current.issue) throw new Error("identity_migration_existing_map_needs_review");
    if (current.appliedPlanLock === plan.planLock && plan.entries.every(entry => validateIdentityMigrationEntry(entry, ctx))) return { applied: false, replayed: true, entries: current.entries.length };
    const fresh = planAgentIdentityMigration({ ...ctx, legacyRoots: plan.legacyRoots });
    if (fresh.planLock !== plan.planLock) throw new Error("identity_migration_plan_stale");
    const merged = new Map(current.entries.map(entry => [entry.artifactPath, entry]));
    for (const entry of plan.entries) merged.set(entry.artifactPath, entry);
    const next = { schema: "pritha-agent-identity-migrations-v1", instanceKey: ctx.instanceKey, entries: [...merged.values()], appliedPlanLock: plan.planLock,
      appliedAt: new Date().toISOString(), approvedBy: options.approvedBy, authorizationBasis: options.authorizationBasis || "explicit migration plan approval" };
    atomicWriteFile(ctx.file, `${JSON.stringify(next, null, 2)}\n`);
    return { applied: true, replayed: false, entries: next.entries.length };
  });
}
