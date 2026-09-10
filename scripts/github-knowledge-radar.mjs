#!/usr/bin/env node

import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { now, today } from "./lib/date.mjs";
import {
  normalizeGitHubApiRepository,
  normalizeGitHubRepositoryUrl,
  isAllowedGitHubRepositoryTopic,
  plannedGitHubRepositoryQueries,
  readGitHubRepositoryRegistry,
  searchGitHubRepositoryCandidates,
} from "./lib/github-repository-radar.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { atomicWriteFile, withFileLock } from "./lib/atomic-file.mjs";
import { parseBoundedJson } from "./lib/bounded-json.mjs";
import { redactSensitiveText } from "./lib/redaction.mjs";
import { readBoundedRegularFile } from "./lib/safe-file-read.mjs";

const ROOT = resolveTechscopeRoot();
const REGISTRY_PATH = path.join(ROOT, "01_sources", "registries", "github-agent-building-repos.md");
const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith("-")) || "status";
const jsonMode = argv.includes("--json");
const onlineMode = argv.includes("--online");

function argValue(name, fallback = "") {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) return fallback;
  return argv[index + 1];
}

function hasFlag(name) {
  return argv.includes(name);
}

function registryRelativePath() {
  return path.relative(ROOT, REGISTRY_PATH);
}

function registryTemplate() {
  const date = today();
  return `---
id: github-agent-building-repos
type: review
status: active
created: ${date}
updated: ${date}
topics:
  - agent-building-knowledge
  - github-research
tools:
  - github
sources: []
related:
  workflows: []
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: pritha
  id: github-knowledge-radar
privacy: project
retention: durable
review_status: active
confidence: medium
---

# GitHub Agent-Building Repository Registry

This registry stores candidate open-source repositories that may improve Pritha's knowledge about building, evaluating, operating, or securing agents.

Safety rule: entries are candidates for review only. Do not clone, install, execute, or trust repository code until a separate review artifact accepts that action.

| Repo | Topics | Status | Added | Last checked | Stars | License | Why | Notes |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- |
`;
}

function pathInside(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function assertSafeRegistryAncestors() {
  const rootRealPath = realpathSync(ROOT);
  let current = ROOT;
  for (const segment of path.relative(ROOT, path.dirname(REGISTRY_PATH)).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe_registry_boundary");
      if (!pathInside(realpathSync(current), rootRealPath)) throw new Error("unsafe_registry_boundary");
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
}

function registrySnapshot(options = {}) {
  try {
    assertSafeRegistryAncestors();
  } catch {
    return { exists: true, ok: false, rows: [], text: "" };
  }
  let exists = true;
  try {
    lstatSync(REGISTRY_PATH);
  } catch (error) {
    if (error?.code === "ENOENT") exists = false;
    else return { exists: true, ok: false, rows: [], text: "" };
  }
  if (!exists) return { exists: false, ok: true, rows: [], text: "" };
  const registry = readGitHubRepositoryRegistry(ROOT);
  if (!registry.ok) return { exists: true, ok: false, rows: [], text: "" };
  try {
    const text = options.includeText
      ? readBoundedRegularFile(REGISTRY_PATH, { maxBytes: 1_000_000, allowedRoots: [ROOT] }).text
      : "";
    return { exists: true, ok: true, rows: registry.rows, text };
  } catch {
    return { exists: true, ok: false, rows: [], text: "" };
  }
}

function ensureRegistry(write = false) {
  const existing = registrySnapshot();
  if (existing.exists) {
    if (!existing.ok) throw new Error("unsafe_registry_boundary");
    return existing;
  }
  if (!write) return existing;
  assertSafeRegistryAncestors();
  return withFileLock(REGISTRY_PATH, () => {
    const current = registrySnapshot();
    if (current.exists && !current.ok) throw new Error("unsafe_registry_boundary");
    if (!current.exists) atomicWriteFile(REGISTRY_PATH, registryTemplate());
    const created = registrySnapshot();
    if (!created.ok || !created.exists) throw new Error("unsafe_registry_boundary");
    return created;
  });
}

function compactText(value, max = 800) {
  return redactSensitiveText(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function escapeCell(value) {
  return compactText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replace(/\|/g, "\\|");
}

const normalizeRepoUrl = normalizeGitHubRepositoryUrl;

function parseTopics(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(item))
    .slice(0, 12);
}

const REGISTRY_STATUSES = new Set(["candidate", "accepted-for-review", "rejected", "archived"]);

function normalizedLicense(value) {
  const license = redactSensitiveText(String(value || "unknown")).trim().slice(0, 120);
  if (/^(?:unknown|unlicensed)$/i.test(license)) return license.toLowerCase();
  return /^[A-Za-z0-9][A-Za-z0-9.+() -]{1,119}$/.test(license) ? license : "";
}

function sanitizeRadarCandidate(candidate) {
  if (!candidate?.repo?.url) return null;
  return {
    ...candidate,
    description: compactText(candidate.description, 400),
    language: compactText(candidate.language, 80),
    license: normalizedLicense(candidate.license) || "unknown",
    topics: parseTopics((candidate.topics || []).join(",")),
    latestReleaseTag: compactText(candidate.latestReleaseTag, 120),
  };
}

function statusPayload() {
  const registry = registrySnapshot();
  const rows = registry.ok ? registry.rows : [];
  const byStatus = rows.reduce((acc, row) => {
    acc[row.status || "unknown"] = (acc[row.status || "unknown"] || 0) + 1;
    return acc;
  }, {});
  return {
    schema: "pritha-github-knowledge-radar-status-v1",
    generatedAt: now(),
    root: ROOT,
    registryPath: registryRelativePath(),
    ok: registry.ok,
    exists: registry.exists,
    status: !registry.exists ? "not_initialized" : registry.ok ? "ready" : "unsafe_registry",
    candidates: rows.length,
    byStatus,
    safety: "Registry stores candidate links only; no clone/install/run is performed.",
  };
}

function initRegistry() {
  try {
    ensureRegistry(true);
    const status = statusPayload();
    return {
      ...status,
      status: status.ok ? "ready" : "unsafe_registry",
      initialized: status.ok,
    };
  } catch {
    return {
      ...statusPayload(),
      ok: false,
      status: "unsafe_registry",
      initialized: false,
      detail: "Registry must be a bounded regular file inside TECHSCOPE_ROOT.",
    };
  }
}

function registerRepo() {
  const repoInput = argValue("--repo") || argValue("--url");
  const repo = normalizeRepoUrl(repoInput);
  if (!repo) {
    return {
      schema: "pritha-github-knowledge-radar-register-v1",
      generatedAt: now(),
      ok: false,
      status: "invalid_repo",
      detail: "Use --repo https://github.com/OWNER/REPO",
    };
  }

  const topics = parseTopics(argValue("--topics") || argValue("--topic") || "agent-building-knowledge");
  const why = compactText(argValue("--why", "Candidate for agent-building knowledge review."), 400);
  const notes = compactText(argValue("--notes", "Needs source review before adoption."), 600);
  const status = String(argValue("--status", "candidate")).trim().toLowerCase();
  const starsInput = Number.parseInt(argValue("--stars", "0"), 10);
  const stars = Number.isSafeInteger(starsInput) ? Math.max(0, Math.min(starsInput, 1_000_000_000)) : 0;
  const license = normalizedLicense(argValue("--license", "unknown"));
  if (!topics.length || !REGISTRY_STATUSES.has(status) || !license) {
    return {
      schema: "pritha-github-knowledge-radar-register-v1",
      generatedAt: now(),
      ok: false,
      status: "invalid_registry_metadata",
      detail: "Topics, status or license are invalid. Use safe topic slugs, an allowed review status and a simple SPDX/license label.",
    };
  }
  const row = `| ${repo.url} | ${escapeCell(topics.join(", "))} | ${escapeCell(status)} | ${today()} | ${today()} | ${stars} | ${escapeCell(license)} | ${escapeCell(why)} | ${escapeCell(notes)} |\n`;
  try {
    ensureRegistry(true);
    return withFileLock(REGISTRY_PATH, () => {
      const registry = registrySnapshot({ includeText: true });
      if (!registry.exists || !registry.ok) throw new Error("unsafe_registry_boundary");
      const existing = registry.rows
        .find((entry) => normalizeRepoUrl(entry.repo)?.url.toLowerCase() === repo.url.toLowerCase());
      if (existing) {
        return {
          schema: "pritha-github-knowledge-radar-register-v1",
          generatedAt: now(),
          ok: true,
          status: "already_registered",
          repo,
          registryPath: registryRelativePath(),
          existing,
        };
      }
      const previous = registry.text;
      atomicWriteFile(REGISTRY_PATH, previous.endsWith("\n") ? `${previous}${row}` : `${previous}\n${row}`);
      return {
        schema: "pritha-github-knowledge-radar-register-v1",
        generatedAt: now(),
        ok: true,
        status: "registered",
        repo,
        registryPath: registryRelativePath(),
      };
    });
  } catch {
    return {
      schema: "pritha-github-knowledge-radar-register-v1",
      generatedAt: now(),
      ok: false,
      status: "unsafe_registry",
      registryPath: registryRelativePath(),
      detail: "Registry must be a bounded regular file inside TECHSCOPE_ROOT.",
    };
  }
}

function plannedQueries(topic) {
  return plannedGitHubRepositoryQueries(topic);
}

async function searchCandidates() {
  const topic = argValue("--topic") || argValue("--topics") || "agent-harness";
  const parsedLimit = Number.parseInt(argValue("--limit", "5"), 10);
  const limit = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 5, 25));
  if (!isAllowedGitHubRepositoryTopic(topic)) {
    return {
      schema: "pritha-github-knowledge-radar-search-v1",
      generatedAt: now(),
      ok: false,
      status: "invalid_topic",
      topic: "rejected",
      source: "planned",
      online: false,
      plannedQueries: [],
      candidates: [],
      error: "Topic is not in the public GitHub research allowlist.",
      safety: "Arbitrary contract or user text is never sent to GitHub Search.",
    };
  }
  const queries = plannedQueries(topic);
  const fixturePath = process.env.PRITHA_GITHUB_RADAR_FIXTURE;
  let source = "planned";
  let candidates = [];
  let error = "";

  try {
    if (fixturePath) {
      source = "fixture";
      const fixtureText = readBoundedRegularFile(fixturePath, { maxBytes: 2_000_000 }).text;
      const fixture = parseBoundedJson(fixtureText, {
        maxBytes: 2_000_000,
        maxDepth: 16,
        maxNodes: 30_000,
        maxArrayLength: 5_000,
      });
      const items = Array.isArray(fixture) ? fixture : fixture.items || [];
      candidates = items.map(normalizeGitHubApiRepository).filter(Boolean).map(sanitizeRadarCandidate).filter(Boolean).slice(0, limit);
    } else if (onlineMode) {
      source = "github-api";
      const result = await searchGitHubRepositoryCandidates({ topic, queries, limit });
      candidates = result.candidates.map(sanitizeRadarCandidate).filter(Boolean);
    }
  } catch (caught) {
    const rawError = caught instanceof Error ? caught.message : String(caught);
    if (source === "fixture" && rawError === "file_size_limit_exceeded") {
      error = "GitHub fixture must be a file no larger than 2 MB";
    } else if (source === "fixture" && /file_must_be_regular|file_outside_allowed_roots/.test(rawError)) {
      error = "GitHub fixture must be a bounded regular file and not a symlink";
    } else {
      error = compactText(rawError, 400);
    }
  }

  return {
    schema: "pritha-github-knowledge-radar-search-v1",
    generatedAt: now(),
    ok: !error,
    status: error ? "failed" : candidates.length ? "candidates_found" : "planned",
    topic,
    source,
    online: onlineMode,
    plannedQueries: queries,
    candidates,
    error,
    safety: "Search results are candidates only. Register links before review; do not clone or run repository code from this command.",
  };
}

function printPayload(payload, exitCode = 0) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${payload.schema}\n`);
    process.stdout.write(`status: ${payload.status}\n`);
    if (payload.registryPath) process.stdout.write(`registry: ${payload.registryPath}\n`);
    if (payload.candidates != null) process.stdout.write(`candidates: ${payload.candidates.length ?? payload.candidates}\n`);
  }
  process.exitCode = exitCode;
}

let payload;
let exitCode = 0;

switch (command) {
  case "status":
    payload = statusPayload();
    exitCode = payload.ok === false ? 1 : 0;
    break;
  case "init":
    payload = initRegistry();
    exitCode = payload.ok === false ? 1 : 0;
    break;
  case "register":
    payload = registerRepo();
    exitCode = payload.ok ? 0 : 1;
    break;
  case "search":
    payload = await searchCandidates();
    exitCode = payload.ok ? 0 : 1;
    break;
  default:
    payload = {
      schema: "pritha-github-knowledge-radar-error-v1",
      generatedAt: now(),
      ok: false,
      status: "unknown_command",
      command,
      availableCommands: ["status", "init", "register", "search"],
    };
    exitCode = 1;
}

printPayload(payload, exitCode);
