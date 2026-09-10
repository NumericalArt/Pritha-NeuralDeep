#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { parseFrontmatterData } from "./lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root: ROOT });
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const INCLUDE_DIRS = [
  "00_inbox",
  "01_sources/notes",
  "01_sources/signals",
  "02_briefs",
  "03_reviews",
  "04_standards",
  "05_decisions",
  "06_subagents",
  "07_workflows",
  "08_templates",
  "10_wiki",
  "11_agents",
  "12_marketing",
];

const REQUIRED_BY_TYPE = {
  intake: ["id", "type", "status", "created", "updated", "topics", "tools", "source_type", "sources", "related"],
  brief: ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  review: ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  decision: ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  standard: ["id", "type", "status", "created", "updated", "last_reviewed", "owner", "topics", "tools", "sources", "related"],
  workflow: ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  assessment: ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related", "recommendation"],
  "source-note": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-contract": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-outcome-spec": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related", "contract_path", "contract_fingerprint", "agent_slug", "interaction_mode", "outcome_semantic_lock", "outcome_document_lock"],
  "scaffold-report": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-test-report": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-handoff-report": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-operations-report": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-deployment-report": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-delivery-report": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-post-creation-review": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "agent-registry": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "child-agent-profile": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "marketing-section": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "marketing-copy": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  signal: [
    "id",
    "type",
    "status",
    "created",
    "updated",
    "topics",
    "tools",
    "sources",
    "related",
    "generated_from",
    "signal_quality",
    "extraction_mode",
    "refinement_status",
    "harness",
  ],
  template: ["id", "type", "status", "created", "updated", "template_for", "topics", "tools", "sources", "related"],
  "wiki-page": [
    "id",
    "type",
    "status",
    "created",
    "updated",
    "topics",
    "tools",
    "sources",
    "related",
    "generated_from",
    "review_status",
    "confidence",
    "last_linted",
  ],
  "wiki-index": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
  "wiki-log": ["id", "type", "status", "created", "updated", "topics", "tools", "sources", "related"],
};

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      out.push(...listMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      out.push(fullPath);
    }
  }
  return out;
}

function documentIdForFile(filePath) {
  const data = parseFrontmatterData(readFileSync(filePath, "utf8"));
  return data?.id || path.relative(ROOT, filePath).replace(/\.md$/, "").replaceAll(path.sep, "/");
}

function canonicalMarkdownFiles() {
  const byDocumentId = new Map();
  const duplicateIssues = [];
  const duplicateWarnings = [];
  const trackedAgentRoot = path.join(ROOT, "11_agents");
  const isInside = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const chooseCandidate = (candidate, existing) => candidate.modifiedAt > existing.modifiedAt
    || (candidate.modifiedAt === existing.modifiedAt && candidate.file.localeCompare(existing.file) > 0);
  const addFiles = (sourceFiles, sourceName, precedence) => {
    for (const file of sourceFiles) {
      const id = documentIdForFile(file);
      const existing = byDocumentId.get(id);
      if (existing?.precedence === precedence) {
        const message = `${path.relative(ROOT, file)}: duplicate id "${id}" also used by ${path.relative(ROOT, existing.file)}`;
        if (sourceName === "tracked") duplicateIssues.push(message);
        else duplicateWarnings.push(`${message}; newest instance-local file is canonical for the generated index`);
      }
      const candidate = { file, sourceName, precedence, modifiedAt: statSync(file).mtimeMs };
      if (sourceName === "instance-agent-state" && existing?.sourceName === "tracked" && !isInside(trackedAgentRoot, existing.file)) {
        duplicateIssues.push(`${path.relative(ROOT, file)}: id "${id}" collides with tracked platform document ${path.relative(ROOT, existing.file)}`);
        continue;
      }
      if (!existing
        || candidate.precedence > existing.precedence
        || (candidate.precedence === existing.precedence && chooseCandidate(candidate, existing))) {
        byDocumentId.set(id, candidate);
      }
    }
  };

  addFiles(
    INCLUDE_DIRS.flatMap((dir) => listMarkdownFiles(path.join(ROOT, dir))).sort(),
    "tracked",
    1,
  );
  if (path.resolve(AGENT_MEMORY_ROOT) !== path.resolve(trackedAgentRoot)) {
    addFiles(listMarkdownFiles(AGENT_MEMORY_ROOT).sort(), "instance-agent-state", 2);
  }

  return {
    files: [...byDocumentId.values()].map((entry) => entry.file).sort(),
    duplicateIssues,
    duplicateWarnings,
  };
}

function isTrackedPublicFile(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative !== ""
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
    && !relative.startsWith(`.private${path.sep}`);
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

const canonicalFiles = canonicalMarkdownFiles();
const files = canonicalFiles.files;
const ids = new Map();
const issues = [...canonicalFiles.duplicateIssues];

for (const file of files) {
  const relPath = path.relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  const data = parseFrontmatterData(text);

  if (!data) {
    if (!relPath.endsWith("README.md") && !relPath.startsWith("06_subagents/")) {
      issues.push(`${relPath}: missing YAML frontmatter`);
    }
    continue;
  }

  const type = data.type || "note";
  const required = REQUIRED_BY_TYPE[type] || ["id", "type", "status"];

  if (type === "wiki-page" && data.status === "active") {
    issues.push(`${relPath}: wiki-page status must not be "active"; generated wiki pages are derivative artifacts`);
  }

  const memoryDomains = [
    ...(data.memory_domain ? [data.memory_domain] : []),
    ...(Array.isArray(data.memory_domains) ? data.memory_domains : []),
  ].map(String);

  if (data.privacy === "local-private" && isTrackedPublicFile(file)) {
    issues.push(`${relPath}: privacy local-private must not be stored in tracked public memory; use .private/user-memory/`);
  }

  if (data.memory_domain === "user-model" && isTrackedPublicFile(file)) {
    issues.push(`${relPath}: memory_domain user-model must not be stored in tracked public memory; use .private/user-memory/`);
  }

  if (data.memory_domains !== undefined && !Array.isArray(data.memory_domains)) {
    issues.push(`${relPath}: "memory_domains" must be a list`);
  }

  if (data.subject !== undefined) {
    const validSubject = data.subject && typeof data.subject === "object" && !Array.isArray(data.subject) && data.subject.kind && data.subject.id;
    if (!validSubject) issues.push(`${relPath}: "subject" must contain nested kind and id`);
  }

  if (type === "signal") {
    const allowedStatuses = new Set(["extracted", "refined", "reviewed", "superseded"]);
    const allowedExtractionModes = new Set(["heuristic-draft", "codex-assisted"]);
    const allowedRefinementStatuses = new Set(["needs-codex-refinement", "codex-refined", "human-reviewed", "superseded"]);
    if (data.status && !allowedStatuses.has(data.status)) {
      issues.push(`${relPath}: signal status must be one of ${[...allowedStatuses].join(", ")}`);
    }
    if (data.extraction_mode && !allowedExtractionModes.has(data.extraction_mode)) {
      issues.push(`${relPath}: signal extraction_mode must be one of ${[...allowedExtractionModes].join(", ")}`);
    }
    if (data.refinement_status && !allowedRefinementStatuses.has(data.refinement_status)) {
      issues.push(`${relPath}: signal refinement_status must be one of ${[...allowedRefinementStatuses].join(", ")}`);
    }
    if (data.status === "refined" && data.refinement_status !== "codex-refined" && data.refinement_status !== "human-reviewed") {
      issues.push(`${relPath}: refined signal must have refinement_status codex-refined or human-reviewed`);
    }
  }

  for (const field of required) {
    if (type === "wiki-page" && field === "last_linted") {
      if (data[field] === undefined || data[field] === null) {
        issues.push(`${relPath}: missing required field "${field}" for type "${type}"`);
      }
      continue;
    }
    if (isMissing(data[field])) {
      issues.push(`${relPath}: missing required field "${field}" for type "${type}"`);
    }
  }

  if (data.id) {
    if (ids.has(data.id)) {
      issues.push(`${relPath}: duplicate id "${data.id}" also used by ${ids.get(data.id)}`);
    } else {
      ids.set(data.id, relPath);
    }
  }

  for (const field of ["topics", "tools", "sources"]) {
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      issues.push(`${relPath}: "${field}" must be a list`);
    }
  }

  if (type === "wiki-page" && Array.isArray(data.sources) && data.sources.length === 0) {
    issues.push(`${relPath}: wiki-page must cite at least one source`);
  }
}

if (issues.length > 0) {
  console.error(`Memory validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

if (canonicalFiles.duplicateWarnings.length > 0) {
  console.warn(`Memory validation passed with ${canonicalFiles.duplicateWarnings.length} instance-state warning(s):`);
  for (const warning of canonicalFiles.duplicateWarnings) console.warn(`- ${warning}`);
}

console.log(`Memory validation passed for ${files.length} Markdown files.`);
