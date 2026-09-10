import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "../lib/paths.mjs";
import {
  containsHighRiskInstruction,
  quarantineUntrustedInstructionText,
  redactSensitiveText,
} from "../lib/redaction.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";

const ROOT = resolveTechscopeRoot();
const DEFAULT_CATALOG_ROOT = path.join(ROOT, "11_agents", "skills");

export const SKILL_NEEDS = new Set(["auto", "none", "selected"]);
export const SKILL_SOURCES = new Set(["local-only", "trusted-only", "external-with-approval"]);
export const SKILL_INSTALL_MODES = new Set(["recommend", "vendor", "link", "runtime-install"]);
export const SKILL_MUTATION_POLICIES = new Set(["read-only", "patch-with-approval", "agent-managed"]);

const REQUIRED_FIELDS = [
  "name",
  "description",
  "version",
  "source",
  "review_status",
  "trust_level",
  "requires_toolsets",
  "risk_level",
];

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/i,
  /\bcurl\b[\s\S]{0,80}\|\s*(?:sh|bash|zsh)\b/i,
  /\bwget\b[\s\S]{0,80}\|\s*(?:sh|bash|zsh)\b/i,
  /\blaunchctl\b/i,
  /\bcron(?:tab)?\b/i,
  /\bdelete\s+all\b/i,
  /\bexfiltrat/i,
];

function list(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedSelectedSkillNames(value) {
  return list(value)
    .filter((name) => !/^(?:none|not-applicable)$/i.test(name))
    .map((name) => lower(name));
}

function safeCuratedSourcePath(value) {
  const candidate = String(value || "").trim().replaceAll("\\", "/");
  if (!candidate || candidate.length > 500 || path.posix.isAbsolute(candidate)) return "";
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return "";
  if (segments.some((segment) => /^(?:\.env(?:\..*)?|\.private|\.memory(?:-private)?|\.queue|\.logs|\.snapshots|\.state)$/i.test(segment))) return "";
  if (candidate.startsWith("10_wiki/")) return "";
  return candidate;
}

function skillSecurityTuple(value = {}) {
  return {
    name: String(value.name || ""),
    version: String(value.version || ""),
    source: String(value.source || ""),
    trust_level: String(value.trust_level || ""),
    review_status: String(value.review_status || ""),
    risk_level: String(value.risk_level || ""),
    requires_toolsets: list(value.requires_toolsets),
    source_paths: list(value.source_paths),
  };
}

function metadataTextIsSafe(text) {
  return redactSensitiveText(text) === text && !containsHighRiskInstruction(text);
}

function safeUntrustedText(value, max = 500) {
  const sanitized = quarantineUntrustedInstructionText(String(value || "").replace(/\s+/g, " ").trim());
  return sanitized.length <= max ? sanitized : `${sanitized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function safeUntrustedList(value, maxItems = 100, maxChars = 500) {
  return list(value)
    .slice(0, maxItems)
    .map((item) => safeUntrustedText(item, maxChars));
}

function safeSkillDisplayName(value) {
  const name = String(value || "");
  return /^[a-z0-9][a-z0-9-]*$/.test(name) ? name : "invalid-skill-name";
}

export function sha256(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export function skillPolicyFor(data = {}) {
  const policy = {
    skillNeeds: lower(data.skillNeeds) || "auto",
    allowedSkillSources: lower(data.allowedSkillSources) || "local-only",
    skillInstallMode: lower(data.skillInstallMode) || "recommend",
    skillMutationPolicy: lower(data.skillMutationPolicy) || "read-only",
  };
  if (!SKILL_NEEDS.has(policy.skillNeeds)) policy.skillNeeds = "auto";
  if (!SKILL_SOURCES.has(policy.allowedSkillSources)) policy.allowedSkillSources = "local-only";
  if (!SKILL_INSTALL_MODES.has(policy.skillInstallMode)) policy.skillInstallMode = "recommend";
  if (!SKILL_MUTATION_POLICIES.has(policy.skillMutationPolicy)) policy.skillMutationPolicy = "read-only";
  return policy;
}

export function parseSkillFile(filePath, options = {}) {
  const root = options.root ? path.resolve(options.root) : ROOT;
  const fullPath = path.resolve(filePath);
  const catalogRoot = path.resolve(options.catalogRoot || root);
  const text = readBoundedRegularFile(fullPath, {
    maxBytes: 256_000,
    allowedRoots: [catalogRoot],
  }).text;
  const fm = parseFrontmatterData(text) || {};
  const relPath = path.relative(root, fullPath).split(path.sep).join("/");
  return {
    root,
    path: fullPath,
    relPath,
    directory: path.dirname(fullPath),
    text,
    hash: sha256(text),
    name: String(fm.name || path.basename(path.dirname(fullPath))).trim(),
    description: String(fm.description || "").trim(),
    version: String(fm.version || "").trim(),
    source: String(fm.source || "").trim(),
    reviewStatus: String(fm.review_status || "").trim(),
    trustLevel: String(fm.trust_level || "").trim(),
    requiresToolsets: list(fm.requires_toolsets),
    riskLevel: String(fm.risk_level || "").trim(),
    sourcePaths: list(fm.source_paths),
    tags: list(fm.tags),
    frontmatter: fm,
  };
}

export function validateSkill(skill) {
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    const key = field.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    const value = skill.frontmatter?.[field] ?? skill[key];
    if (Array.isArray(value) ? value.length === 0 : !String(value || "").trim()) {
      issues.push(`missing required field: ${field}`);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.name)) {
    issues.push("name must use lowercase kebab-case");
  }
  if (!["reviewed", "accepted"].includes(lower(skill.reviewStatus))) {
    issues.push(`review_status must be reviewed or accepted for local installation, got: ${skill.reviewStatus || "missing"}`);
  }
  if (!["local", "local-reviewed", "trusted"].includes(lower(skill.trustLevel))) {
    issues.push(`trust_level must be local, local-reviewed or trusted for MVP, got: ${skill.trustLevel || "missing"}`);
  }
  if (!["low", "medium", "high"].includes(lower(skill.riskLevel))) {
    issues.push(`risk_level must be low, medium or high, got: ${skill.riskLevel || "missing"}`);
  }
  if (skill.name !== path.basename(skill.directory)) {
    issues.push("skill name must exactly match its catalog directory");
  }
  for (const sourcePath of skill.sourcePaths) {
    const normalized = safeCuratedSourcePath(sourcePath);
    if (normalized !== sourcePath) {
      issues.push("source_paths must contain curated project-relative paths only");
      continue;
    }
    try {
      readBoundedRegularFile(path.join(skill.root, normalized), {
        maxBytes: 5_000_000,
        allowedRoots: [skill.root],
      });
    } catch {
      issues.push(`source_path is missing, unsafe or not a regular file: ${normalized}`);
    }
  }
  return issues;
}

export function auditSkill(skill, data = {}) {
  const issues = validateSkill(skill);
  const blockers = [];
  const text = `${skill.text}\n${JSON.stringify(skill.frontmatter)}`;
  const policy = skillPolicyFor(data);

  if (redactSensitiveText(skill.text) !== skill.text) {
    blockers.push("skill contains secret-like material, credentials or private endpoint data");
  }
  if (containsHighRiskInstruction(text)) {
    blockers.push("skill contains a quarantined high-risk instruction pattern");
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) blockers.push(`dangerous operation pattern: ${pattern.source}`);
  }
  const localCuratedSource = /^(?:pritha-memory|local|local-reviewed|techscope-memory)$/i.test(skill.source);
  if (!localCuratedSource) {
    blockers.push("external or self-asserted skill provenance remains candidate-only until a pinned bundle approval workflow is implemented");
  }
  const allowedNetwork = lower(data.allowedNetworkAccess);
  const networkForbidden = /none|deny|deny-by-default|not-applicable/.test(allowedNetwork);
  if (networkForbidden && skill.requiresToolsets.some((item) => /network|web|browser|api|mcp|http/i.test(item))) {
    blockers.push("skill requires network-like toolsets but contract network policy is restrictive");
  }
  const secrets = lower(data.secretsRequired);
  if (!secrets || /none|unknown|tbd/.test(secrets)) {
    const declaresSecretNeed = skill.requiresToolsets.some((item) => /secret|token|credential|api key|oauth/i.test(item))
      || /requires?[\s\S]{0,40}(secret|token|credential|api key|oauth)/i.test(text);
    if (declaresSecretNeed) blockers.push("skill mentions required secrets but contract does not define required secrets");
  }
  if (/10_wiki\//.test(skill.sourcePaths.join(" "))) {
    blockers.push("generated wiki pages cannot be direct skill provenance");
  }
  return { issues, blockers, ok: issues.length === 0 && blockers.length === 0 };
}

function walkSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  const rootStat = lstatSync(dir);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("skill_catalog_root_must_be_regular_directory");
  const rootRealPath = realpathSync(dir);
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error("skill_catalog_symlink_not_allowed");
    if (!entry.isDirectory()) continue;
    const realDirectory = realpathSync(fullPath);
    if (realDirectory !== rootRealPath && !realDirectory.startsWith(`${rootRealPath}${path.sep}`)) {
      throw new Error("skill_catalog_path_outside_root");
    }
    const skillPath = path.join(realDirectory, "SKILL.md");
    const bundleEntries = readdirSync(realDirectory);
    if (bundleEntries.length !== 1 || bundleEntries[0] !== "SKILL.md") {
      throw new Error("skill_bundle_extra_files_require_dedicated_review");
    }
    if (!existsSync(skillPath)) continue;
    const skillStat = lstatSync(skillPath);
    if (!skillStat.isFile() || skillStat.isSymbolicLink()) throw new Error("skill_file_must_be_regular_and_not_symlink");
    out.push(skillPath);
  }
  return out.sort();
}

export function discoverLocalSkills(options = {}) {
  const catalogRoot = options.catalogRoot ? path.resolve(options.catalogRoot) : DEFAULT_CATALOG_ROOT;
  const skillFiles = walkSkillFiles(catalogRoot);
  if (skillFiles.length > 100) throw new Error("skill_catalog_limit_exceeded");
  const skills = skillFiles.map((filePath) => parseSkillFile(filePath, {
    root: options.root || ROOT,
    catalogRoot,
  }));
  if (skills.reduce((total, skill) => total + Buffer.byteLength(skill.text), 0) > 5_000_000) {
    throw new Error("skill_catalog_aggregate_size_exceeded");
  }
  const names = skills.map((skill) => skill.name);
  if (new Set(names).size !== names.length) throw new Error("skill_catalog_duplicate_name");
  return skills;
}

function fitScore(text, terms) {
  const haystack = lower(text);
  return Math.min(5, terms.filter((term) => haystack.includes(term)).length);
}

export function scoreSkillForContract(skill, data = {}) {
  const contractText = [
    data.agentName,
    data.primaryMission,
    data.primaryInterface,
    data.telegramMode,
    data.memoryModel,
    data.toolSystem,
    data.inputDataTypes,
    ...(data.coreFunctions || []),
    ...(data.criticalWorkflows || []),
  ].filter(Boolean).join(" ");
  const skillText = [skill.name, skill.description, skill.tags.join(" "), skill.requiresToolsets.join(" ")].join(" ");
  const skillTerms = [
    ...lower(skill.name).split("-"),
    ...skill.tags.map(lower),
  ].filter((term) => term.length > 2);
  const taskFit = fitScore(contractText, skillTerms);
  const interfaceFit = Math.min(
    fitScore(contractText, ["telegram", "cli", "codex", "web", "api"]),
    fitScore(skillText, ["telegram", "cli", "codex", "web", "api"]),
  );
  const memoryFit = Math.min(
    fitScore(contractText, ["markdown", "memory", "source", "evidence", "brief", "intake"]),
    fitScore(skillText, ["markdown", "memory", "source", "evidence", "brief", "intake"]),
  );
  const toolFit = skill.requiresToolsets.some((tool) => /filesystem|markdown|cli/i.test(tool)) ? 4 : 2;
  const securityFit = lower(skill.riskLevel) === "low" ? 5 : lower(skill.riskLevel) === "medium" ? 3 : 1;
  const evidenceQuality = ["reviewed", "accepted"].includes(lower(skill.reviewStatus)) ? 5 : 1;
  const maintenanceRisk = lower(skill.source).includes("pritha") || lower(skill.source).includes("local") ? 1 : 4;
  const total = taskFit + interfaceFit + memoryFit + toolFit + securityFit + evidenceQuality - maintenanceRisk;
  return { taskFit, interfaceFit, memoryFit, toolFit, securityFit, evidenceQuality, maintenanceRisk, total };
}

export function selectSkillsForContract(data = {}, options = {}) {
  const policy = skillPolicyFor(data);
  const skills = discoverLocalSkills(options);
  if (policy.skillNeeds === "none") {
    return { policy, installed: [], candidates: [], blocked: [], all: skills };
  }
  const rows = skills.map((skill) => {
    const audit = auditSkill(skill, data);
    const score = scoreSkillForContract(skill, data);
    let recommendation = "candidate";
    if (!audit.ok) recommendation = "blocked";
    else if (score.total >= 17) recommendation = "recommended";
    else if (score.total >= 11) recommendation = "optional";
    return { skill, audit, score, recommendation };
  });
  const requestedNames = normalizedSelectedSkillNames(data.installedSkills);
  if (new Set(requestedNames).size !== requestedNames.length) throw new Error("Installed skills must not contain duplicates.");
  let installableRows = rows.filter((row) => row.recommendation === "recommended");
  if (policy.skillNeeds === "selected") {
    if (requestedNames.length === 0) throw new Error("Skill needs selected requires explicit Installed skills names.");
    const availableNames = new Set(rows.map((row) => row.skill.name));
    const unknownNames = requestedNames.filter((name) => !availableNames.has(name));
    if (unknownNames.length) throw new Error("Installed skills contains unknown catalog names.");
    const selectedRows = rows.filter((row) => requestedNames.includes(row.skill.name));
    if (selectedRows.some((row) => !row.audit.ok)) throw new Error("An explicitly selected skill failed the local audit.");
    installableRows = selectedRows;
  }
  const installed = policy.skillInstallMode === "vendor" ? installableRows : [];
  const candidates = rows.filter((row) => !installed.includes(row) && row.recommendation !== "blocked");
  const blocked = rows.filter((row) => row.recommendation === "blocked");
  return { policy, installed, candidates, blocked, all: skills };
}

export function skillRowForManifest(row, decision = "not-installed") {
  const { skill, score, recommendation, audit } = row;
  return {
    name: safeSkillDisplayName(skill.name),
    source: safeUntrustedText(skill.source, 300),
    source_paths: skill.sourcePaths.map(safeCuratedSourcePath).filter(Boolean),
    version: safeUntrustedText(skill.version, 120),
    trust_level: safeUntrustedText(skill.trustLevel, 120),
    review_status: safeUntrustedText(skill.reviewStatus, 120),
    risk_level: safeUntrustedText(skill.riskLevel, 120),
    requires_toolsets: safeUntrustedList(skill.requiresToolsets, 100, 200),
    hash: /^sha256:[a-f0-9]{64}$/i.test(String(skill.hash || "")) ? skill.hash : "pending",
    fit_score: score?.total ?? 0,
    recommendation: safeUntrustedText(recommendation, 120),
    decision: safeUntrustedText(decision, 120),
    issues: safeUntrustedList(audit?.issues || [], 100, 500),
    blockers: safeUntrustedList(audit?.blockers || [], 100, 500),
  };
}

export function printSkillsStatus(options = {}) {
  const skills = discoverLocalSkills(options);
  const rows = skills.map((skill) => {
    const audit = auditSkill(skill);
    return {
      name: safeSkillDisplayName(skill.name),
      version: safeUntrustedText(skill.version, 120),
      source: safeUntrustedText(skill.source, 300),
      trust: safeUntrustedText(skill.trustLevel, 120),
      risk: safeUntrustedText(skill.riskLevel, 120),
      status: audit.ok ? "ok" : "needs-review",
      path: safeUntrustedText(skill.relPath, 500),
    };
  });
  if (options.json) {
    console.log(JSON.stringify({ count: rows.length, skills: rows }, null, 2));
    return;
  }
  console.log(`Local skill catalog: ${rows.length} skill(s)`);
  for (const row of rows) {
    console.log(`- ${row.name} ${row.version} [${row.status}] ${row.path}`);
  }
}

export function printSkillSelection(contractData, options = {}) {
  const selection = selectSkillsForContract(contractData, options);
  const payload = {
    policy: selection.policy,
    installed: selection.installed.map((row) => skillRowForManifest(row, "installable-if-vendor")),
    candidates: selection.candidates.map((row) => skillRowForManifest(row)),
    blocked: selection.blocked.map((row) => skillRowForManifest(row, "blocked")),
  };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Skill policy: needs=${selection.policy.skillNeeds}; sources=${selection.policy.allowedSkillSources}; install=${selection.policy.skillInstallMode}; mutation=${selection.policy.skillMutationPolicy}`);
  for (const [label, rows] of [["Recommended/installable", payload.installed], ["Candidates", payload.candidates], ["Blocked", payload.blocked]]) {
    console.log(`\n${label}: ${rows.length}`);
    for (const row of rows) {
      console.log(`- ${row.name}: ${row.recommendation}; score=${row.fit_score}; risk=${row.risk_level}; decision=${row.decision}`);
    }
  }
}

export function auditProjectSkills(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const skillsRoot = path.join(root, "skills");
  const manifestPath = path.join(skillsRoot, "manifest.json");
  const issues = [];
  let manifest = null;
  let skillsRealRoot = "";
  try {
    const skillsStat = lstatSync(skillsRoot);
    if (!skillsStat.isDirectory() || skillsStat.isSymbolicLink()) throw new Error("unsafe_skills_root");
    skillsRealRoot = realpathSync(skillsRoot);
    const projectRealRoot = realpathSync(root);
    if (skillsRealRoot !== projectRealRoot && !skillsRealRoot.startsWith(`${projectRealRoot}${path.sep}`)) throw new Error("skills_root_outside_project");
  } catch {
    issues.push("missing or unsafe skills directory");
    return { ok: false, issues, installed: 0, candidates: 0 };
  }
  if (!existsSync(manifestPath)) {
    issues.push("missing skills/manifest.json");
    return { ok: false, issues };
  }
  try {
    const manifestText = readBoundedRegularFile(manifestPath, {
      maxBytes: 1_000_000,
      allowedRoots: [skillsRealRoot],
    }).text;
    if (!metadataTextIsSafe(manifestText)) issues.push("skills/manifest.json contains secret-like, private-endpoint or high-risk instruction material");
    manifest = parseBoundedJson(manifestText, { maxBytes: 1_000_000, maxDepth: 16, maxNodes: 20_000, maxArrayLength: 1_000 });
  } catch {
    issues.push("unsafe, oversized or invalid skills/manifest.json");
    return { ok: false, issues, installed: 0, candidates: 0 };
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.version !== 1) {
    issues.push("skills manifest must use supported object schema version 1");
  }
  const installedEntries = Array.isArray(manifest?.installed) ? manifest.installed : [];
  const candidateEntries = Array.isArray(manifest?.candidates) ? manifest.candidates : [];
  if (!Array.isArray(manifest?.installed)) issues.push("skills manifest installed must be an array");
  if (!Array.isArray(manifest?.candidates)) issues.push("skills manifest candidates must be an array");
  const installedNames = installedEntries.map((entry) => String(entry?.name || ""));
  if (new Set(installedNames).size !== installedNames.length) issues.push("skills manifest contains duplicate installed names");

  for (const entry of installedEntries) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(entry.name || ""))) {
      issues.push("installed skill name is invalid or unsafe");
      continue;
    }
    const hashValid = /^sha256:[a-f0-9]{64}$/i.test(String(entry.hash || ""));
    if (!hashValid) {
      issues.push(`installed skill hash is missing or malformed for ${entry.name}`);
    }
    if (!Array.isArray(entry.source_paths)
      || entry.source_paths.length > 100
      || entry.source_paths.some((sourcePath) => typeof sourcePath !== "string" || safeCuratedSourcePath(sourcePath) !== sourcePath)) {
      issues.push(`installed skill source_paths are invalid or unsafe for ${entry.name}`);
    }
    const skillPath = path.join(root, "skills", entry.name, "SKILL.md");
    if (!existsSync(skillPath)) {
      issues.push(`missing installed skill file: skills/${entry.name}/SKILL.md`);
      continue;
    }
    let skillText = "";
    try {
      skillText = readBoundedRegularFile(skillPath, {
        maxBytes: 256_000,
        allowedRoots: [path.join(root, "skills")],
      }).text;
    } catch {
      issues.push(`unsafe or unreadable installed skill file: skills/${entry.name}/SKILL.md`);
      continue;
    }
    if (redactSensitiveText(skillText) !== skillText) {
      issues.push(`installed skill contains secret-like material or private endpoint data: ${entry.name}`);
    }
    if (containsHighRiskInstruction(skillText)) {
      issues.push(`installed skill contains a quarantined high-risk instruction pattern: ${entry.name}`);
    }
    const skillFrontmatter = parseFrontmatterData(skillText) || {};
    if (String(skillFrontmatter.name || "") !== entry.name
      || !String(skillFrontmatter.version || "").trim()
      || !["reviewed", "accepted"].includes(lower(skillFrontmatter.review_status))
      || !["local", "local-reviewed", "trusted"].includes(lower(skillFrontmatter.trust_level))
      || !["low", "medium", "high"].includes(lower(skillFrontmatter.risk_level))) {
      issues.push(`installed skill frontmatter is invalid or inconsistent: ${entry.name}`);
    }
    const frontmatterTuple = skillSecurityTuple({
      name: skillFrontmatter.name,
      version: skillFrontmatter.version,
      source: skillFrontmatter.source,
      trust_level: skillFrontmatter.trust_level,
      review_status: skillFrontmatter.review_status,
      risk_level: skillFrontmatter.risk_level,
      requires_toolsets: skillFrontmatter.requires_toolsets,
      source_paths: skillFrontmatter.source_paths,
    });
    if (JSON.stringify(frontmatterTuple) !== JSON.stringify(skillSecurityTuple(entry))) {
      issues.push(`installed skill security metadata mismatch: ${entry.name}`);
    }
    const actual = sha256(skillText);
    if (hashValid && actual !== entry.hash) issues.push(`hash drift for ${entry.name}`);
  }
  const candidatesPath = path.join(skillsRoot, "candidates.json");
  if (!existsSync(candidatesPath)) {
    issues.push("missing skills/candidates.json");
  } else {
    try {
      const candidatesText = readBoundedRegularFile(candidatesPath, {
        maxBytes: 1_000_000,
        allowedRoots: [skillsRealRoot],
      }).text;
      if (!metadataTextIsSafe(candidatesText)) issues.push("skills/candidates.json contains secret-like, private-endpoint or high-risk instruction material");
      const candidatesPayload = parseBoundedJson(candidatesText, { maxBytes: 1_000_000, maxDepth: 16, maxNodes: 20_000, maxArrayLength: 1_000 });
      if (!candidatesPayload || typeof candidatesPayload !== "object" || Array.isArray(candidatesPayload) || !Array.isArray(candidatesPayload.candidates)) {
        issues.push("skills/candidates.json must use the supported object schema");
      }
    } catch {
      issues.push("unsafe, oversized or invalid skills/candidates.json");
    }
  }
  const lockPath = path.join(skillsRoot, "lock.json");
  if (!existsSync(lockPath)) {
    issues.push("missing skills/lock.json");
  } else {
    try {
      const lockText = readBoundedRegularFile(lockPath, {
        maxBytes: 1_000_000,
        allowedRoots: [skillsRealRoot],
      }).text;
      if (!metadataTextIsSafe(lockText)) issues.push("skills/lock.json contains secret-like, private-endpoint or high-risk instruction material");
      const lockPayload = parseBoundedJson(lockText, { maxBytes: 1_000_000, maxDepth: 16, maxNodes: 20_000, maxArrayLength: 1_000 });
      if (!lockPayload || typeof lockPayload !== "object" || Array.isArray(lockPayload) || lockPayload.version !== 1 || !Array.isArray(lockPayload.installed)) {
        issues.push("skills/lock.json must use supported object schema version 1");
      } else {
        const lockedNames = lockPayload.installed.map((entry) => String(entry?.name || ""));
        if (new Set(lockedNames).size !== lockedNames.length) issues.push("skills lock contains duplicate installed names");
        const locked = new Map();
        for (const entry of lockPayload.installed) {
          const validName = /^[a-z0-9][a-z0-9-]*$/.test(String(entry?.name || ""));
          const validHash = /^sha256:[a-f0-9]{64}$/i.test(String(entry?.hash || ""));
          const validSourcePaths = Array.isArray(entry?.source_paths)
            && entry.source_paths.length <= 100
            && entry.source_paths.every((sourcePath) => typeof sourcePath === "string" && safeCuratedSourcePath(sourcePath) === sourcePath);
          const tuple = skillSecurityTuple(entry);
          const validSecurityMetadata = tuple.version.length > 0
            && tuple.source.length > 0
            && ["local", "local-reviewed", "trusted"].includes(lower(tuple.trust_level))
            && ["reviewed", "accepted"].includes(lower(tuple.review_status))
            && ["low", "medium", "high"].includes(lower(tuple.risk_level))
            && tuple.requires_toolsets.length > 0;
          if (!validName || !validHash || !validSourcePaths || !validSecurityMetadata) {
            issues.push("skills lock contains an invalid or unsafe entry");
            continue;
          }
          locked.set(entry.name, entry);
        }
        for (const entry of installedEntries) {
          const lockedEntry = locked.get(entry?.name);
          if (lockedEntry?.hash !== entry?.hash) issues.push(`skills lock mismatch for ${String(entry?.name || "invalid")}`);
          if (JSON.stringify(lockedEntry?.source_paths) !== JSON.stringify(entry?.source_paths)) {
            issues.push(`skills source_paths lock mismatch for ${String(entry?.name || "invalid")}`);
          }
          if (JSON.stringify(skillSecurityTuple(lockedEntry)) !== JSON.stringify(skillSecurityTuple(entry))) {
            issues.push(`skills security metadata lock mismatch for ${String(entry?.name || "invalid")}`);
          }
        }
        if (locked.size !== installedEntries.length) issues.push("skills lock and manifest installed sets differ");
      }
    } catch {
      issues.push("unsafe, oversized or invalid skills/lock.json");
    }
  }
  const result = { ok: issues.length === 0, issues, installed: installedEntries.length, candidates: candidateEntries.length };
  if (options.silent) return result;
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`Skill audit passed: installed=${result.installed}; candidates=${result.candidates}`);
  else {
    console.error("Skill audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
  }
  return result;
}
