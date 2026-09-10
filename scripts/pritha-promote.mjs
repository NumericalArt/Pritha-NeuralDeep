#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseFrontmatterData } from "./lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const PROMOTABLE_TYPES = new Map([
  ["assessment", "03_reviews/"],
  ["review", "03_reviews/"],
  ["standard", "04_standards/"],
  ["decision", "05_decisions/"],
  ["workflow", "07_workflows/"],
]);
const CHILD_AGENT_TYPES = new Set([
  "agent-contract",
  "agent-outcome-spec",
  "scaffold-report",
  "agent-delivery-report",
  "agent-test-report",
  "agent-handoff-report",
  "agent-operations-report",
  "agent-deployment-report",
  "agent-post-creation-review",
  "agent-registry",
  "child-agent-profile",
]);

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const command = process.argv[2] || "plan";
const root = resolveTechscopeRoot();
const localAgentsRoot = resolvePrithaAgentMemoryRoot({ root });
const sourceArg = option("--source");
const targetArg = option("--target");
const source = sourceArg ? path.resolve(localAgentsRoot, sourceArg) : "";
const target = targetArg ? path.resolve(root, targetArg) : "";

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sanitize(text) {
  return text
    .replace(/\/Users\/[A-Za-z0-9._-]+/g, "<USER_HOME>")
    .replace(/\/home\/[A-Za-z0-9._-]+/g, "<USER_HOME>")
    .replace(/https?:\/\/[A-Za-z0-9.-]+\.ts\.net[^\s)>]*/g, "<PRIVATE_URL>");
}

try {
  if (!source || !target) throw new Error("Usage: node scripts/pritha-promote.mjs plan|apply --source <agents-relative-file> --target <shared-relative-file> [--yes]");
  if (!inside(localAgentsRoot, source) || !existsSync(source)) throw new Error("Source must be an existing file inside the local instance agents directory");
  if (!inside(root, target)) throw new Error("Target must be inside the Pritha checkout");
  const raw = readFileSync(source, "utf8");
  const metadata = parseFrontmatterData(raw) || {};
  const artifactType = String(metadata.type || "").trim();
  const subjectKind = String(metadata.subject?.kind || "").trim();
  if (subjectKind === "child-agent" || CHILD_AGENT_TYPES.has(artifactType)) {
    throw new Error("Refusing promotion: child-agent lifecycle artifacts are instance-local and cannot enter tracked knowledge");
  }
  const allowedTargetPrefix = PROMOTABLE_TYPES.get(artifactType);
  const targetRelative = path.relative(root, target).replaceAll(path.sep, "/");
  if (!allowedTargetPrefix || !targetRelative.startsWith(allowedTargetPrefix)) {
    throw new Error("Refusing promotion: publish a separately authored assessment, review, standard, decision, or workflow in its canonical domain");
  }
  if (targetRelative.startsWith("11_agents/")) {
    throw new Error("Refusing promotion: tracked 11_agents is a historical platform reference layer");
  }
  if (/privacy:\s*local-private/i.test(raw)) throw new Error("Refusing promotion: change privacy classification through explicit review first");
  if (/(?:sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*\S+|token\s*[:=]\s*\S+)/i.test(raw)) throw new Error("Refusing promotion: secret-shaped content detected");
  const content = sanitize(raw);
  const payload = {
    schema: "pritha-local-artifact-promotion-v1",
    ok: true,
    mode: command,
    source,
    target,
    sanitized: content !== raw,
    review_required: true,
  };
  if (command === "apply") {
    if (!process.argv.includes("--yes")) throw new Error("promotion apply requires --yes");
    if (existsSync(target)) throw new Error("Refusing to overwrite an existing shared artifact");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
    payload.written = true;
  } else if (command !== "plan") {
    throw new Error("First argument must be plan or apply");
  }
  console.log(JSON.stringify(payload, null, 2));
} catch (error) {
  console.error(JSON.stringify({ schema: "pritha-local-artifact-promotion-error-v1", ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
