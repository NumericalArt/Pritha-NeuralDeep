import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaAgentParent, resolvePrithaStateRoot, resolveTechscopeRoot, isPrithaCodeCheckout } from "../lib/paths.mjs";
import { CHILD_AGENT_TYPES } from "../lib/child-agent-artifacts.mjs";
import { readAgentKind, operationsApplicability } from "./agent-kind.mjs";

// Identity is attribution, never proof of approval, verification or ownership of
// a running process. Those decisions still require their host-owned receipts.
const caches = new Map();
const MAX_FILES = 4000;
const CACHE_MS = 2000;
const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 24);
const value = (input) => typeof input === "string" ? input.trim() : "";
export const agentAlias = (input) => value(input).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const bodyValue = (text, field) => text.match(new RegExp(`^-\\s*${field}:\\s*(.+)$`, "mi"))?.[1]?.trim().replace(/^`([^`]+)`[.;]?$/, "$1") || "";
const profilePurpose = (text) => text.match(/^## Purpose\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim().slice(0, 2000) || "";
const missionText = (text, fm) => bodyValue(text, "Primary mission") || value(fm.mission) || (fm.type === "child-agent-profile" ? profilePurpose(text) : "");
const logicalProjectRef = (ref) => !ref || /^`?(?:unknown|pending|TBD|sibling of (?:Pritha|Techscope)|sibling under `?PRITHA_AGENT_PARENT`?|\[|<)/i.test(ref);
const concreteProjectRef = (ref) => !logicalProjectRef(ref) && (/^(?:existing project\s+)?`[^`]+`[.;]?$/i.test(ref) || /^(?:\/|\.{1,2}\/)[^`]*$/.test(ref) || /^[^\s`]+$/.test(ref));
const canonical = (input) => { try { return realpathSync(input); } catch { return path.resolve(input); } };
const fingerprint = (file) => {
  try { const s = lstatSync(file, { bigint: true }); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.mode}`; }
  catch { return "missing"; }
};

export function agentInstanceKey(stateRoot) {
  return `pritha-${hash(canonical(stateRoot))}`;
}

export function authoredAgentId(frontmatter) {
  if (Object.hasOwn(frontmatter || {}, "agent_id") && (typeof frontmatter.agent_id !== "string" || !frontmatter.agent_id.trim())) return { id: null, issue: "invalid-agent-id" };
  const explicit = value(frontmatter?.agent_id);
  const subject = frontmatter?.subject;
  const childSubject = ["agent", "child-agent"].includes(value(subject?.kind));
  const subjectId = childSubject ? value(subject?.id) : "";
  if (explicit && value(subject?.kind) && !childSubject) return { id: null, issue: "non-child-subject" };
  if (explicit && subjectId && explicit !== subjectId) return { id: null, issue: "conflicting-agent-ids" };
  const id = explicit || subjectId;
  if (id && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(id)) return { id: null, issue: "invalid-agent-id" };
  return { id: id || null, issue: null };
}

function safeText(file, boundary, maxBytes = 1024 * 1024) {
  try {
    if (!safePath(file, boundary)) return "";
    return readBoundedRegularFile(file, { maxBytes, allowedRoots: [boundary] }).text;
  } catch { return ""; }
}

function safePath(file, boundary) {
  const relative = path.relative(path.resolve(boundary), path.resolve(file));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return false;
  let cursor = path.resolve(boundary);
  try {
    if (lstatSync(cursor).isSymbolicLink()) return false;
    for (const segment of relative.split(path.sep)) {
      cursor = path.join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) return false;
    }
    return true;
  } catch { return false; }
}

function artifact(file, text, context) {
  const fm = parseFrontmatterData(text.replaceAll("\r\n", "\n")) || {};
  if (!CHILD_AGENT_TYPES.has(fm.type) || fm.type === "agent-registry") return null;
  if (value(fm.subject?.kind) && !["agent", "child-agent"].includes(fm.subject.kind)) return null;
  const identity = authoredAgentId(fm);
  const instance = value(fm.instance_key);
  const issue = identity.issue || (instance && instance !== context.instanceKey ? "foreign-instance" : null);
  const title = text.match(/^#\s+(?:Agent\s+(?:Project Contract|Outcome Spec|Scaffold Report|Test Report|Handoff Report|Operations Report|Deployment Report|Delivery Report|Profile)|Child Agent Profile):\s*(.+)$/mi)?.[1] || "";
  const name = bodyValue(text, "Agent name") || value(fm.display_name) || title || "";
  const related = fm.related?.agent_contracts;
  const contractRef = value(fm.contract_path) || (Array.isArray(related) && related.length === 1 ? value(related[0]) : "");
  let contractPath = contractRef ? path.resolve(context.root, contractRef) : null;
  const oldContractRoot = path.join(context.root, "11_agents", "contracts");
  const legacyContractPath = Boolean(contractPath && path.dirname(contractPath) === oldContractRoot && context.memoryRoot !== path.join(context.root, "11_agents"));
  if (legacyContractPath) contractPath = path.join(context.memoryRoot, "contracts", path.basename(contractPath));
  const projectRef = value(fm.project_path) || bodyValue(text, "Project path") || bodyValue(text, "Target folder");
  if (!identity.id && !name && !projectRef && !contractRef) return null;
  return {
    path: file, type: fm.type, fm, name, agentId: identity.id, issue,
    contractPath, projectRef, legacyContractPath,
    standalone: Boolean(identity.id || concreteProjectRef(projectRef) || bodyValue(text, "Agent name") || ["agent-contract", "child-agent-profile"].includes(fm.type)),
    aliases: [...new Set([name, bodyValue(text, "Technical slug"), value(fm.agent_slug), identity.id].map(agentAlias).filter(Boolean))],
    mission: missionText(text, fm),
    agentKind: fm.type === "agent-contract" ? readAgentKind(text) : null,
    runtime: bodyValue(text, "Runtime family"), interface: bodyValue(text, "Primary interface"),
    deployment: bodyValue(text, "Deployment target") || bodyValue(text, "Expected hosting"),
    proactivity: bodyValue(text, "Proactive mode"),
    updated: value(fm.updated) || value(fm.created),
  };
}

function registryRows(text) {
  if (parseFrontmatterData(text)?.identity_schema_version === "1") return [];
  const section = text.split(/^## Agents\s*$/m)[1]?.split(/^## /m)[0] || "";
  return section.split(/\r?\n/).filter((line) => line.trim().startsWith("|")).slice(2).map((line) => {
    const [name, mission, runtime, iface, deployment, proactivity, evidence] = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    return { name, mission, runtime, interface: iface, deployment, proactivity, evidence };
  }).filter((row) => row.name && row.evidence);
}

function projectFolder(ref, context, folders) {
  let reference = ref;
  const quoted = reference.match(/^(?:existing project\s+)?`([^`]+)`[.;]?$/i);
  if (quoted) reference = quoted[1];
  else if (/^existing project\s+/i.test(reference)) return null;
  const sibling = reference.match(/^<SIBLING_AGENT_ROOT>\/([^/`]+)`?[.;]?$/);
  if (sibling) reference = path.join(context.agentParent, sibling[1]);
  if (logicalProjectRef(reference)) return null;
  const resolved = path.resolve(context.root, reference);
  if (!safePath(resolved, context.agentParent)) return null;
  try {
    if (!lstatSync(resolved).isDirectory()) return null;
    let cursor = resolved;
    while (cursor !== path.resolve(context.agentParent)) {
      if (canonical(cursor) === canonical(context.root) || isPrithaCodeCheckout(cursor)) return null;
      if (["Pritha", "Techscope"].some((name) => isPrithaCodeCheckout(path.join(cursor, name)) && canonical(path.join(cursor, name)) !== canonical(context.root))) return null;
      cursor = path.dirname(cursor);
    }
    return resolved;
  } catch { return null; }
}

function assemble(artifacts, folders, rows, context, diagnostics) {
  const groups = new Map();
  const contractGroups = new Map();
  const newGroup = (key, agentId, name) => {
    if (!groups.has(key)) groups.set(key, { key, agentId, name, aliases: [], artifacts: [], diagnostics: [], projectPath: null, source: agentId ? "authored-id" : "legacy-attribution" });
    return groups.get(key);
  };
  const add = (group, item, attribution) => {
    group.artifacts.push({ ...item, attribution });
    group.aliases = [...new Set([...group.aliases, ...item.aliases])];
    if (attribution === "legacy") group.diagnostics.push("legacy-attribution-not-approval");
    if (item.legacyContractPath) group.diagnostics.push("legacy-memory-path-not-approval");
  };
  const reject = (item, code) => diagnostics.push({ path: item.path, code });
  const declaredProject = (items) => {
    const paths = [...new Set(items.map((item) => projectFolder(item.projectRef, context, folders)).filter(Boolean))];
    if (paths.length === 1) return paths[0];
    if (paths.length > 1 || items.some((item) => value(item.fm.project_path) || concreteProjectRef(item.projectRef))) return null;
    const aliases = items.flatMap((item) => item.aliases);
    const candidates = folders.filter((folder) => aliases.includes(agentAlias(folder.name)));
    return candidates.length === 1 ? candidates[0].path : null;
  };
  for (const item of artifacts.filter((item) => item.type === "agent-contract")) {
    if (item.issue) { reject(item, item.issue); continue; }
    const project = declaredProject([item]);
    const key = item.agentId ? `id:${item.agentId}` : project ? `legacy-project:${project}` : `contract:${item.path}`;
    const group = newGroup(key, item.agentId, item.name);
    add(group, item, item.agentId ? "authored-id" : "legacy");
    contractGroups.set(item.path, group);
  }
  for (const item of artifacts.filter((item) => item.type !== "agent-contract")) {
    if (item.issue) { reject(item, item.issue); continue; }
    const bound = item.contractPath ? contractGroups.get(item.contractPath) : null;
    if (item.contractPath && !bound) { reject(item, "contract-binding-not-found"); continue; }
    if (bound && item.agentId && bound.agentId && item.agentId !== bound.agentId) { reject(item, "contract-id-conflict"); continue; }
    let group = bound || (item.agentId ? groups.get(`id:${item.agentId}`) : null);
    let attribution = bound ? (item.legacyContractPath ? "legacy" : "contract-path") : item.agentId ? "authored-id" : "legacy";
    if (!group) {
      const project = projectFolder(item.projectRef, context, folders);
      const candidates = project ? [...groups.values()].filter((candidate) => (!item.agentId || !candidate.agentId) && declaredProject(candidate.artifacts) === project) : [];
      if (candidates.length > 1) { reject(item, "ambiguous-project-attribution"); continue; }
      if (candidates.length === 1) { group = candidates[0]; attribution = "legacy"; }
    }
    if (!group) {
      // Compatibility is exact and unique. An explicit ID never falls back to
      // another explicit ID just because its label happens to match.
      const candidates = [...groups.values()].filter((candidate) => (!item.agentId || !candidate.agentId)
        && item.aliases.some((alias) => candidate.aliases.includes(alias)));
      if (candidates.length > 1) { reject(item, "ambiguous-legacy-attribution"); continue; }
      if (candidates.length === 1) { group = candidates[0]; attribution = "legacy"; }
    }
    if (!group && !item.standalone) { reject(item, "unbound-legacy-report"); continue; }
    if (!group) group = newGroup(item.agentId ? `id:${item.agentId}` : `artifact:${item.path}`, item.agentId, item.name);
    add(group, item, attribution);
  }
  const sorted = (items) => [...items].sort((a, b) => `${b.updated}:${b.path}`.localeCompare(`${a.updated}:${a.path}`));
  for (const group of groups.values()) {
    group.artifacts = sorted(group.artifacts);
    const profile = group.artifacts.find((item) => item.type === "child-agent-profile");
    const contract = group.artifacts.find((item) => item.type === "agent-contract");
    group.name = profile?.name || contract?.name || group.name || group.agentId || "Unclassified agent";
    // Report titles and registry rows cannot replace authored product purpose.
    group.mission = profile?.mission || contract?.mission || "";
    group.missionSource = profile?.mission ? profile.path : contract?.mission ? contract.path : null;
    group.agentKind = contract?.agentKind || readAgentKind();
    group.contractSource = contract?.path || null;
    for (const field of ["runtime", "interface", "deployment", "proactivity"]) group[field] = profile?.[field] || contract?.[field] || "unknown";
    const possibleDeclarations = group.artifacts.filter((item) => item.projectRef).map((item) => ({ item, resolved: projectFolder(item.projectRef, context, folders) }));
    const declarations = possibleDeclarations.filter(({ item, resolved }) => resolved || value(item.fm.project_path) || concreteProjectRef(item.projectRef));
    if (declarations.length < possibleDeclarations.length) group.diagnostics.push("legacy-project-description-not-binding");
    const authored = declarations.filter(({ item, resolved }) => ["child-agent-profile", "agent-contract"].includes(item.type) && (resolved || !logicalProjectRef(item.projectRef)));
    const selected = authored.length ? authored : declarations;
    const paths = [...new Set(selected.map(({ resolved }) => resolved).filter(Boolean))];
    if (paths.length && selected.some(({ item, resolved }) => !resolved && !logicalProjectRef(item.projectRef))) group.diagnostics.push("conflicting-project-paths");
    if (paths.length > 1) group.diagnostics.push("conflicting-project-paths");
    else if (paths.length === 1) group.projectPath = paths[0];
    else if (selected.some(({ item }) => !logicalProjectRef(item.projectRef))) {
      group.diagnostics.push("project-path-outside-or-missing");
    } else {
      const matching = folders.filter((folder) => group.aliases.includes(agentAlias(folder.name)));
      if (matching.length === 1) { group.projectPath = matching[0].path; group.diagnostics.push("legacy-folder-attribution"); }
      else if (matching.length > 1) group.diagnostics.push("ambiguous-folder-attribution");
    }
    if (group.projectPath) {
      group.artifacts = group.artifacts.filter((item) => {
        const declared = projectFolder(item.projectRef, context, folders);
        if (!declared || declared === group.projectPath) return true;
        reject(item, "artifact-project-conflict");
        return false;
      });
    }
  }
  for (const row of rows) {
    const candidates = [...groups.values()].filter((group) => group.aliases.includes(agentAlias(row.name)));
    if (candidates.length === 0) {
      const group = newGroup(`legacy:${row.name}`, null, row.name);
      Object.assign(group, row, { aliases: [agentAlias(row.name)], missionSource: null });
      group.diagnostics.push("legacy-registry-attribution");
      const matching = folders.filter((folder) => agentAlias(folder.name) === agentAlias(row.name));
      if (matching.length === 1) group.projectPath = matching[0].path;
      else if (matching.length > 1) group.diagnostics.push("ambiguous-folder-attribution");
    }
  }
  for (const folder of folders.filter((folder) => folder.discoverable)) {
    if ([...groups.values()].some((group) => group.projectPath === folder.path)) continue;
    const group = newGroup(`folder:${folder.path}`, null, folder.name);
    Object.assign(group, { projectPath: folder.path, mission: "Local sibling child agent", missionSource: null, runtime: "local project", interface: "project-defined", deployment: "local", proactivity: "manual", aliases: [agentAlias(folder.name)] });
    group.diagnostics.push("legacy-folder-attribution");
  }
  const agents = [...groups.values()].map((group) => {
    const conflicts = group.projectPath ? [...groups.values()].filter((candidate) => candidate.projectPath === group.projectPath) : [];
    if (conflicts.length > 1) group.diagnostics.push("multiple-identities-for-project");
    const conflict = group.diagnostics.some((code) => /conflict|ambiguous|outside|multiple-identities/.test(code));
    return {
      ...group,
      id: `agent-${hash(`${context.instanceKey}\n${group.key}`)}`,
      instanceKey: context.instanceKey,
      projectPath: conflict ? null : group.projectPath,
      mission: group.mission || "Mission is not documented",
      runtime: group.runtime || "unknown", interface: group.interface || "unknown",
      deployment: group.deployment || "unknown", proactivity: group.proactivity || "unknown",
      agentKind: group.agentKind || readAgentKind(), contractSource: group.contractSource || null,
      evidence: `contracts:${group.artifacts.filter((item) => item.type === "agent-contract").length} reports:${group.artifacts.filter((item) => item.type.endsWith("report")).length}`,
      identityStatus: conflict ? "conflict" : group.agentId ? "identified" : "legacy",
      diagnostics: [...new Set(group.diagnostics)],
    };
  });
  return agents.sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`));
}

export function readAgentCatalog(options = {}) {
  const root = path.resolve(options.root || resolveTechscopeRoot());
  const stateRoot = resolvePrithaStateRoot({ ...options, root });
  const memoryRoot = options.memoryRoot || resolvePrithaAgentMemoryRoot({ ...options, root });
  const agentParent = resolvePrithaAgentParent({ ...options, root });
  const context = { root, stateRoot, memoryRoot, agentParent, instanceKey: agentInstanceKey(stateRoot) };
  const registryPath = path.join(memoryRoot, "registry.md");
  const directories = ["contracts", "outcome-specs", "profiles", "reports"].map((name) => path.join(memoryRoot, name));
  const stamp = [...directories, registryPath, agentParent].map(fingerprint).join("|");
  const cacheKey = JSON.stringify([root, stateRoot, memoryRoot, agentParent]);
  const previous = caches.get(cacheKey);
  // GET projections share bounded caches. Host decisions call with fresh:true
  // and independently verify locks/receipts; no cached catalog authorizes them.
  if (!options.fresh && previous?.stamp === stamp && Date.now() - previous.at < CACHE_MS) return previous.result;
  const artifacts = [];
  const diagnostics = [];
  const files = new Map();
  for (const directory of directories) {
    if (!safePath(directory, memoryRoot)) continue;
    const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length > MAX_FILES) { diagnostics.push({ code: "artifact-limit-exceeded", path: directory }); continue; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      const signature = fingerprint(file);
      const cached = previous?.files.get(file);
      const item = cached?.signature === signature ? cached.item : artifact(file, safeText(file, memoryRoot), context);
      files.set(file, { signature, item });
      if (item) artifacts.push(item);
    }
  }
  let folders = [];
  try {
    folders = readdirSync(agentParent, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).slice(0, MAX_FILES).map((entry) => ({ name: entry.name, path: path.join(agentParent, entry.name) }))
      .filter((folder) => canonical(folder.path) !== canonical(root) && !isPrithaCodeCheckout(folder.path))
      .map((folder) => ({ ...folder, discoverable: existsSync(path.join(folder.path, "AGENTS.md")) }));
  } catch { diagnostics.push({ code: "agent-parent-unavailable" }); }
  const agents = assemble(artifacts, folders, registryRows(safeText(registryPath, memoryRoot)), context, diagnostics);
  const result = { schemaVersion: 1, instanceKey: context.instanceKey, registryPath, agents, artifacts, diagnostics };
  if (caches.size >= 16) caches.delete(caches.keys().next().value);
  caches.set(cacheKey, { stamp, at: Date.now(), files, result });
  return result;
}

export function findCatalogAgent(catalog, target) {
  if (typeof target === "string" && path.isAbsolute(target)) {
    const projects = catalog.agents.filter((agent) => agent.projectPath === path.resolve(target));
    return projects.length === 1 ? projects[0] : null;
  }
  const exact = catalog.agents.filter((agent) => agent.id === target || agent.agentId === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const alias = agentAlias(target);
  if (!alias) return null;
  const candidates = catalog.agents.filter((agent) => agent.aliases.includes(alias));
  return candidates.length === 1 ? candidates[0] : null;
}

export function currentAgentMission(agent, options = {}) {
  if (!agent.missionSource) return { text: agent.mission, source: null };
  const root = options.root || resolveTechscopeRoot();
  const memoryRoot = options.memoryRoot || resolvePrithaAgentMemoryRoot({ ...options, root });
  // The selected authored source is checked on every projection, so an in-place
  // mission edit is visible immediately without rereading all Markdown files.
  const text = safeText(agent.missionSource, memoryRoot);
  const fm = parseFrontmatterData(text.replaceAll("\r\n", "\n")) || {};
  const identity = authoredAgentId(fm);
  if (!["agent-contract", "child-agent-profile"].includes(fm.type) || identity.issue || (agent.agentId && identity.id !== agent.agentId) || (fm.instance_key && fm.instance_key !== agent.instanceKey)) return { text: "Mission source needs identity review", source: null };
  return { text: missionText(text, fm) || "Mission is not documented", source: agent.missionSource };
}

export function readCatalogArtifact(agent, file, options = {}) {
  const selected = agent.artifacts.find((item) => item.path === file);
  if (!selected) return "";
  const root = options.root || resolveTechscopeRoot();
  const memoryRoot = options.memoryRoot || resolvePrithaAgentMemoryRoot({ ...options, root });
  const text = safeText(file, memoryRoot);
  const fm = parseFrontmatterData(text.replaceAll("\r\n", "\n")) || {};
  const identity = authoredAgentId(fm);
  if (fm.type !== selected.type || identity.issue || identity.id !== selected.agentId || (fm.instance_key && fm.instance_key !== agent.instanceKey)) return "";
  const current = artifact(file, text, { root, memoryRoot, instanceKey: agent.instanceKey });
  if (!current || current.contractPath !== selected.contractPath || current.projectRef !== selected.projectRef) return "";
  return text;
}

export function readIdentityEvidence(file, stateRoot, maxBytes = 1024 * 1024) {
  return safeText(file, stateRoot, maxBytes);
}

export function agentOperationsApplicability(agent, manifest = null, options = {}) {
  const text = agent?.contractSource ? readCatalogArtifact(agent, agent.contractSource, options) : "";
  return operationsApplicability(text, manifest);
}

export function readAgentOperationsManifest(agent) {
  if (!agent?.projectPath || agent.identityStatus === "conflict") return { manifest: null, present: false, issue: null };
  const file = path.join(agent.projectPath, "operations", "manifest.json");
  try { lstatSync(file); }
  catch (error) { return { manifest: null, present: false, issue: error.code === "ENOENT" ? null : "operations-manifest-unavailable" }; }
  try {
    const manifest = JSON.parse(safeText(file, agent.projectPath));
    if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") throw new Error("invalid");
    return { manifest, present: true, issue: null };
  } catch { return { manifest: null, present: true, issue: "operations-manifest-invalid-or-unsafe" }; }
}
