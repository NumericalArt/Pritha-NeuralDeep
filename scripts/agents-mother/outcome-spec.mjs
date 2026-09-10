import { sha256Text as sha256 } from "../lib/hash.mjs";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { atomicCompareAndSwapFile, atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { today } from "../lib/date.mjs";
import { parseFrontmatter } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaStatePathFrom, resolveTechscopeRoot } from "../lib/paths.mjs";
import { redactSensitiveText } from "../lib/redaction.mjs";
import { slug } from "../lib/slug.mjs";
import { writeUniqueArtifact } from "./artifact-selection.mjs";
import { contractData, contractFingerprint } from "./contract.mjs";
import { authoredAgentId } from "./identity.mjs";
import { outcomeDocumentLock } from "./outcome-lock.mjs";
import { automatedTrialWaiver, automatedTrialWaiverIssues, hasAutomatedTrialWaiver } from "./automated-trial-waiver.mjs";
import { trialInputDeclarations, trialInputDeclarationIssues } from "./trial-input-declarations.mjs";
import { inspectProtectedTrialInputs } from "./delivery-worktree.mjs";
export { outcomeDocumentLock, canonicalOutcomeDocument } from "./outcome-lock.mjs";

export const OUTCOME_SPEC_SCHEMA = "pritha-agent-outcome-spec-v1";
export const TRIAL_PLAN_SCHEMA = "pritha-trial-plan-v1";
export const OUTCOME_APPROVAL_SCHEMA = "pritha-outcome-approval-v1";
export const OUTCOME_STATUSES = new Set(["draft", "approved", "superseded"]);
export const INTERACTION_MODES = new Set(["interface", "headless", "hybrid"]);
export const TRIAL_KINDS = new Set(["automated", "operator-judged"]);
export const TRIAL_ISOLATION = new Set(["none", "sandbox"]);

const SHELL_EXECUTABLES = new Set(["sh", "bash", "zsh", "fish", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"]);
const SHELL_OPERATOR_TOKENS = new Set(["&&", "||", ";", "|", ">", ">>", "<", "<<", "`"]);

function normalizedText(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownSection(text, heading, level = 2) {
  const source = normalizedText(text);
  const marker = "#".repeat(level);
  const startPattern = new RegExp(`^${marker}\\s+${escaped(heading)}\\s*$`, "mi");
  const match = startPattern.exec(source);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = source.slice(start);
  const endPattern = new RegExp(`^#{1,${level}}\\s+`, "m");
  const end = endPattern.exec(rest);
  return (end ? rest.slice(0, end.index) : rest).trim();
}

function labelValues(text, label) {
  const values = [];
  const pattern = new RegExp(`^-\\s+${escaped(label)}:\\s*(.*)$`, "gmi");
  for (const match of normalizedText(text).matchAll(pattern)) values.push(match[1].trim());
  return values;
}

function labelValue(text, label) {
  return labelValues(text, label)[0] || "";
}

function sectionItems(text, heading) {
  return markdownSection(text, heading)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function tableRows(text, heading) {
  const section = markdownSection(text, heading, 3);
  const rows = [];
  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells[0]?.toLowerCase() === "surface") continue;
    if (cells.some(Boolean)) rows.push({ surface: cells[0] || "", purpose: cells[1] || "", primaryAction: cells[2] || "" });
  }
  return rows;
}

function exampleSessions(text) {
  const section = markdownSection(text, "Example sessions", 3);
  const matches = [...section.matchAll(/^####\s+Session:\s*(.+)\s*$/gmi)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? section.length;
    const raw = section.slice(start, end).trim();
    const fence = raw.match(/```(?:transcript|text)?\s*\n([\s\S]*?)\n```/i);
    return { name: match[1].trim(), transcript: normalizedText(fence ? fence[1] : raw).trim() };
  });
}

function demoSteps(text) {
  return markdownSection(text, "Demo script")
    .split("\n")
    .map((line) => line.trim().match(/^\d+[.)]\s+(.+)$/)?.[1]?.trim() || "")
    .filter(Boolean);
}

function safeRelativePath(value, { allowDot = false } = {}) {
  const source = String(value || "").trim().replaceAll("\\", "/");
  if (allowDot && source === ".") return true;
  if (!source || source.includes("\0") || path.posix.isAbsolute(source)) return false;
  const parts = source.split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}

function parseArgv(value) {
  if (!String(value || "").trim()) return { argv: null, error: "missing" };
  let parsed;
  try {
    parsed = parseBoundedJson(value, { maxBytes: 16_384, maxDepth: 3, maxNodes: 256 });
  } catch {
    return { argv: null, error: "invalid-json" };
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 128 || parsed.some((item) => typeof item !== "string" || !item.trim() || item.length > 4096)) {
    return { argv: null, error: "expected-non-empty-string-array" };
  }
  const executable = path.basename(parsed[0]).toLowerCase();
  if (SHELL_EXECUTABLES.has(executable)) return { argv: null, error: "shell-executable-forbidden" };
  if (parsed.some((item) => SHELL_OPERATOR_TOKENS.has(item.trim()))) return { argv: null, error: "shell-operator-forbidden" };
  return { argv: parsed, error: "" };
}

function integerValue(value, fallback = null) {
  if (String(value || "").trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

function artifactContainsAssertions(values) {
  return values.map((value) => {
    const split = value.indexOf("::");
    if (split === -1) return { path: "", contains: "", raw: value };
    return { path: value.slice(0, split).trim(), contains: value.slice(split + 2).trim(), raw: value };
  });
}

function parseTrials(text) {
  const section = markdownSection(text, "Trials");
  const headings = [...section.matchAll(/^###\s+Trial:\s*(.+)\s*$/gmi)];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? section.length;
    const block = section.slice(start, end).trim();
    const argvResult = parseArgv(labelValue(block, "When argv"));
    return {
      id: heading[1].trim().toLowerCase(),
      statement: labelValue(block, "Statement"),
      kind: labelValue(block, "Kind").toLowerCase(),
      covers: labelValues(block, "Covers"),
      given: labelValues(block, "Given"),
      isolation: (labelValue(block, "Isolation") || "none").toLowerCase(),
      argv: argvResult.argv,
      argvError: argvResult.error,
      cwd: labelValue(block, "When cwd") || ".",
      thenExitCode: integerValue(labelValue(block, "Then exit code"), 0),
      thenStdoutContains: labelValues(block, "Then stdout contains"),
      thenStdoutExcludes: labelValues(block, "Then stdout excludes"),
      thenStderrContains: labelValues(block, "Then stderr contains"),
      thenStderrExcludes: labelValues(block, "Then stderr excludes"),
      thenArtifacts: labelValues(block, "Then artifact"),
      thenArtifactContains: artifactContainsAssertions(labelValues(block, "Then artifact contains")),
      thenAbsentPaths: labelValues(block, "Then absent path"),
      thenMinStdoutChars: integerValue(labelValue(block, "Then min stdout chars"), null),
      thenMaxDurationMs: integerValue(labelValue(block, "Then max duration ms"), null),
      passCriteria: labelValue(block, "Pass criteria"),
      fixture: labelValue(block, "Fixture"),
      timeoutMs: integerValue(labelValue(block, "Timeout ms"), 120_000),
      ...trialInputDeclarations({ verifierInputs: labelValues(block, "Verifier input"), productTargets: labelValues(block, "Product target") }),
    };
  });
}

function shapeFields(body) {
  const section = markdownSection(body, "Shape");
  return {
    oneLiner: labelValue(section, "One-liner"),
    doneWhen: labelValue(section, "Done when"),
    interactionMode: labelValue(section, "Interaction mode").toLowerCase(),
  };
}

function interfaceFields(body) {
  const section = markdownSection(body, "User-facing outcome");
  return {
    entryPoint: labelValue(section, "Entry point"),
    journey: {
      goal: labelValue(section, "User journey goal"),
      start: labelValue(section, "User journey start"),
      progress: labelValue(section, "User journey progress"),
      approval: labelValue(section, "User journey approval"),
      completion: labelValue(section, "User journey completion"),
      recovery: labelValue(section, "User journey recovery"),
    },
    surfaces: tableRows(body, "Surfaces"),
    sessions: exampleSessions(body),
  };
}

function headlessFields(body) {
  const section = markdownSection(body, "Headless outcome");
  return {
    trigger: labelValue(section, "Trigger"),
    inputContract: labelValue(section, "Input contract"),
    outputArtifacts: labelValue(section, "Output artifacts"),
    observability: labelValue(section, "Observability"),
    failureVisibility: labelValue(section, "Failure visibility"),
  };
}

export function parseOutcomeSpecText(text) {
  const source = normalizedText(text);
  const { data: frontmatter, body } = parseFrontmatter(source);
  const shape = shapeFields(body);
  return {
    schema: OUTCOME_SPEC_SCHEMA,
    text: source,
    frontmatter,
    body,
    shape,
    interactionMode: String(frontmatter.interaction_mode || shape.interactionMode || "").toLowerCase(),
    userFacing: interfaceFields(body),
    headless: headlessFields(body),
    deliverables: sectionItems(body, "Deliverables"),
    nonGoals: sectionItems(body, "Non-goals v1"),
    trials: parseTrials(body),
    demo: demoSteps(body),
  };
}

export function outcomeSemanticProjection(value) {
  const parsed = typeof value === "string" ? parseOutcomeSpecText(value) : value;
  return {
    schema: OUTCOME_SPEC_SCHEMA,
    contract_path: String(parsed.frontmatter.contract_path || ""),
    contract_fingerprint: String(parsed.frontmatter.contract_fingerprint || ""),
    agent_slug: String(parsed.frontmatter.agent_slug || ""),
    interaction_mode: parsed.interactionMode,
    automated_trial_waiver: automatedTrialWaiver(parsed.frontmatter.automated_trial_waiver),
    shape: parsed.shape,
    user_facing: parsed.userFacing,
    headless: parsed.headless,
    deliverables: parsed.deliverables,
    non_goals: parsed.nonGoals,
    trials: parsed.trials.map(({ argvError: _argvError, ...trial }) => trial),
    demo: parsed.demo,
  };
}



export function outcomeSemanticLock(value) {
  return sha256(JSON.stringify(outcomeSemanticProjection(value)));
}

function issue(code, message, location = "") {
  return { code, message, location };
}

function missing(value) {
  const normalized = String(value || "").trim();
  return !normalized || /^(?:tbd|pending|unknown)$/i.test(normalized);
}

function notApplicable(value) {
  return /^(?:not-applicable|none)$/i.test(String(value || "").trim());
}

export function coverageId(prefix, value, index) {
  return `${prefix}:${String(index + 1).padStart(2, "0")}-${slug(value, { fallback: prefix })}`;
}

export function buildOutcomeCoverage(parsed, contract = null) {
  const expected = [];
  for (const [index, value] of (contract?.coreFunctions || []).entries()) {
    if (!missing(value)) expected.push({ id: coverageId("core", value, index), kind: "core", statement: value });
  }
  for (const [index, value] of parsed.deliverables.entries()) {
    if (!missing(value)) expected.push({ id: coverageId("deliverable", value, index), kind: "deliverable", statement: value });
  }
  const coveredBy = new Map();
  for (const trial of parsed.trials) {
    for (const coverage of trial.covers) {
      const list = coveredBy.get(coverage) || [];
      list.push(trial.id);
      coveredBy.set(coverage, list);
    }
  }
  return expected.map((entry) => ({ ...entry, trials: coveredBy.get(entry.id) || [], covered: coveredBy.has(entry.id) }));
}

function contractForParsed(parsed, options = {}) {
  if (options.contract) return options.contract;
  const contractPath = String(parsed.frontmatter.contract_path || "").trim();
  if (!contractPath || !options.root) return null;
  try {
    return contractData(contractPath, { root: options.root });
  } catch {
    return null;
  }
}

export function validateOutcomeSpecText(text, options = {}) {
  const parsed = parseOutcomeSpecText(text);
  const fm = parsed.frontmatter;
  const issues = [];
  const contract = contractForParsed(parsed, options);
  const status = String(fm.status || "").toLowerCase();

  if (fm.type !== "agent-outcome-spec") issues.push(issue("OS001", 'frontmatter "type" must be agent-outcome-spec', "frontmatter.type"));
  const identity = authoredAgentId(fm);
  if (identity.issue || (contract?.agentId && identity.id !== contract.agentId)) {
    issues.push(issue("OS020", "Outcome identity must match its exact agent contract", "frontmatter.agent_id/subject.id"));
  }
  if (!OUTCOME_STATUSES.has(status) || String(fm.outcome_spec_status || "").toLowerCase() !== status) {
    issues.push(issue("OS002", "status and outcome_spec_status must match an allowed value", "frontmatter.status"));
  }
  if (missing(fm.contract_path) || missing(fm.contract_fingerprint)) {
    issues.push(issue("OS003", "contract_path and contract_fingerprint are required", "frontmatter.contract_fingerprint"));
  } else if (options.root && !contract) {
    issues.push(issue("OS003", "referenced agent contract could not be loaded", "frontmatter.contract_path"));
  } else if (contract && contract.fingerprint !== fm.contract_fingerprint) {
    issues.push(issue("OS003", "contract_fingerprint does not match the referenced contract", "frontmatter.contract_fingerprint"));
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(fm.agent_slug || ""))) issues.push(issue("OS004", "agent_slug must be lowercase kebab-case", "frontmatter.agent_slug"));
  if (!INTERACTION_MODES.has(parsed.interactionMode) || parsed.shape.interactionMode !== parsed.interactionMode) {
    issues.push(issue("OS005", "interaction mode must be interface, headless or hybrid and match the body", "Shape.Interaction mode"));
  }
  if (missing(parsed.shape.oneLiner) || missing(parsed.shape.doneWhen)) issues.push(issue("OS006", "One-liner and Done when must be concrete", "Shape"));

  if (["interface", "hybrid"].includes(parsed.interactionMode)) {
    const journeyValues = Object.values(parsed.userFacing.journey);
    if (missing(parsed.userFacing.entryPoint) || journeyValues.some(missing) || parsed.userFacing.surfaces.length === 0 || parsed.userFacing.sessions.length === 0) {
      issues.push(issue("OS007", "interface outcome requires entry point, complete journey, a surface and an example session", "User-facing outcome"));
    }
  }
  if (["headless", "hybrid"].includes(parsed.interactionMode)) {
    if (Object.values(parsed.headless).some((value) => missing(value) || notApplicable(value))) {
      issues.push(issue("OS008", "headless outcome requires trigger, input, outputs, observability and failure visibility", "Headless outcome"));
    }
  }
  if (parsed.deliverables.length === 0 || parsed.deliverables.some(missing) || parsed.demo.length === 0) {
    issues.push(issue("OS009", "at least one concrete deliverable and demo step are required", "Deliverables/Demo script"));
  }
  if (parsed.trials.length === 0) issues.push(issue("OS010", "at least one Trial is required", "Trials"));

  const ids = new Set();
  let automated = 0;
  for (const trial of parsed.trials) {
    const location = `Trial:${trial.id || "unknown"}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(trial.id) || ids.has(trial.id) || missing(trial.statement) || !TRIAL_KINDS.has(trial.kind)) {
      issues.push(issue("OS010", "Trial needs a unique kebab-case id, statement and valid kind", location));
    }
    ids.add(trial.id);
    if (trial.covers.length === 0 || trial.covers.some((value) => !/^(?:core|deliverable|safety|recovery):[a-z0-9][a-z0-9-]*$/.test(value))) {
      issues.push(issue("OS013", "Trial needs one or more valid Covers references", location));
    }
    if (!TRIAL_ISOLATION.has(trial.isolation)) issues.push(issue("OS011", "Isolation must be none or sandbox", location));
    if (trial.kind === "automated") {
      automated += 1;
      if (trial.argvError || !trial.argv || !safeRelativePath(trial.cwd, { allowDot: true })) {
        issues.push(issue("OS011", `automated Trial requires safe structured When argv and cwd (${trial.argvError || "invalid-cwd"})`, location));
      }
      const assertions = [
        Number.isSafeInteger(trial.thenExitCode),
        trial.thenStdoutContains.length > 0,
        trial.thenStdoutExcludes.length > 0,
        trial.thenStderrContains.length > 0,
        trial.thenStderrExcludes.length > 0,
        trial.thenArtifacts.length > 0,
        trial.thenArtifactContains.length > 0,
        trial.thenAbsentPaths.length > 0,
        trial.thenMinStdoutChars !== null,
        trial.thenMaxDurationMs !== null,
      ];
      if (!assertions.some(Boolean)) issues.push(issue("OS012", "automated Trial requires at least one Then assertion", location));
      if (!Number.isSafeInteger(trial.timeoutMs) || trial.timeoutMs < 1 || trial.timeoutMs > 900_000) issues.push(issue("OS012", "Timeout ms must be an integer from 1 to 900000", location));
      if (!Number.isSafeInteger(trial.thenExitCode) || trial.thenExitCode < 0 || trial.thenExitCode > 255) issues.push(issue("OS012", "Then exit code must be an integer from 0 to 255", location));
      if (trial.thenMinStdoutChars !== null && (!Number.isSafeInteger(trial.thenMinStdoutChars) || trial.thenMinStdoutChars < 0)) issues.push(issue("OS012", "Then min stdout chars must be a non-negative integer", location));
      if (trial.thenMaxDurationMs !== null && (!Number.isSafeInteger(trial.thenMaxDurationMs) || trial.thenMaxDurationMs < 1)) issues.push(issue("OS012", "Then max duration ms must be a positive integer", location));
      const assertionPaths = [...trial.thenArtifacts, ...trial.thenAbsentPaths, ...trial.thenArtifactContains.map((item) => item.path), ...(trial.fixture ? [trial.fixture] : [])];
      if (assertionPaths.some((value) => !safeRelativePath(value))) issues.push(issue("OS012", "artifact and fixture paths must stay project-relative", location));
      if (trial.thenArtifactContains.some((item) => !item.path || !item.contains)) issues.push(issue("OS012", "Then artifact contains uses: relative/path :: expected text", location));
    } else if (trial.kind === "operator-judged" && missing(trial.passCriteria)) {
      issues.push(issue("OS014", "operator-judged Trial requires concrete Pass criteria", location));
    }
  }

  for (const trial of parsed.trials) {
    for (const message of trialInputDeclarationIssues(trial)) issues.push(issue("OS020", message, `Trials.${trial.id}`));
  }
  const waiver = automatedTrialWaiver(fm.automated_trial_waiver);
  for (const message of automatedTrialWaiverIssues(waiver, parsed.trials, { allowLegacy: status === "approved" })) {
    issues.push(issue("OS021", message, "frontmatter.automated_trial_waiver"));
  }
  if (automated === 0 && !hasAutomatedTrialWaiver(waiver)) {
    issues.push(issue("OS017", "at least one automated Trial is required unless a concrete waiver is recorded", "frontmatter.automated_trial_waiver"));
  }

  const coverage = buildOutcomeCoverage(parsed, contract);
  if (coverage.some((entry) => !entry.covered)) {
    issues.push(issue("OS013", `uncovered required outcomes: ${coverage.filter((entry) => !entry.covered).map((entry) => entry.id).join(", ")}`, "Trials.Covers"));
  }

  if (status === "approved") {
    if (contract && contract.fm.status !== "accepted") issues.push(issue("OS019", "approved Outcome Spec requires an accepted agent contract", "frontmatter.contract_path"));
    if (fm.approved_by !== "user" || missing(fm.approved_at)) issues.push(issue("OS016", "approved spec requires approved_by user and approved_at", "frontmatter.approved_by"));
    if (fm.outcome_semantic_lock !== outcomeSemanticLock(parsed) || fm.outcome_document_lock !== outcomeDocumentLock(text)) {
      issues.push(issue("OS015", "approved spec locks are missing or stale", "frontmatter.outcome_*_lock"));
    }
  }

  return { ok: issues.length === 0, issues, parsed, contract, coverage, automatedTrials: automated };
}

function yamlScalar(value) {
  return JSON.stringify(redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim() || "none");
}

function markdownScalar(value, fallback) {
  return redactSensitiveText(String(value || fallback || "")).replace(/\s+/g, " ").trim().replaceAll("|", "&#124;");
}

function inferredInteractionMode(data, requested) {
  if (INTERACTION_MODES.has(requested)) return requested;
  const primary = String(data.primaryInterface || "").toLowerCase();
  const proactive = String(data.proactiveMode || "").toLowerCase();
  if ((primary === "none" || primary === "api") && /scheduled|event-driven|queue-watcher|heartbeat/.test(proactive)) return "headless";
  return "interface";
}

export function renderOutcomeSpecFromContract(data, options = {}) {
  const date = options.date || today();
  const agentSlug = slug(data.agentName, { fallback: "agent" });
  const mode = inferredInteractionMode(data, options.interactionMode);
  const coreFunctions = (data.coreFunctions || []).filter((value) => !missing(value));
  const effectiveCore = coreFunctions.length ? coreFunctions : [data.primaryMission];
  const deliverables = [
    "Working implementation of the approved V1 core functions",
    "Runnable project with a user guide and verification evidence",
  ];
  const coreTrials = effectiveCore.map((value, index) => {
    const covers = [coverageId("core", value, index)];
    if (index === 0) covers.push(coverageId("deliverable", deliverables[0], 0));
    return `### Trial: ${`core-${String(index + 1).padStart(2, "0")}-${slug(value, { fallback: "outcome" })}`}

- Statement: ${markdownScalar(value, "Complete the main V1 outcome")}
- Kind: operator-judged
${covers.map((item) => `- Covers: ${item}`).join("\n")}
- Pass criteria: The demonstrated behavior completes this function through the documented interface without an undocumented implementation step.`;
  }).join("\n\n");
  const interfaceSection = `## User-facing outcome

- Entry point: ${markdownScalar(data.primaryInterface, "Codex project")}
- User journey goal: The user states the desired result in their own words.
- User journey start: The agent confirms the outcome and begins without unnecessary technical questioning.
- User journey progress: The user sees meaningful progress, evidence and any typed blocker.
- User journey approval: Consequential external effects wait for explicit operator approval.
- User journey completion: The agent returns the requested result, verification evidence and a concise usage path.
- User journey recovery: The agent explains the blocker and asks one actionable question with bounded options.

### Surfaces

| Surface | Purpose | Primary action |
| --- | --- | --- |
| ${markdownScalar(data.primaryInterface, "Codex project")} | Main agent interaction | Request, review and correct work |

### Example sessions

#### Session: main-flow

\`\`\`transcript
user: ${markdownScalar(effectiveCore[0], "Complete the main task")}
agent: I will complete this outcome, verify it against the agreed Trials, and only interrupt for a concrete decision.
\`\`\``;
  const headlessSection = `## Headless outcome

- Trigger: ${mode === "headless" || mode === "hybrid" ? markdownScalar(data.triggerSources, "contract-defined trigger") : "not-applicable"}
- Input contract: ${mode === "headless" || mode === "hybrid" ? markdownScalar(data.inputDataTypes, "contract-defined input") : "not-applicable"}
- Output artifacts: ${mode === "headless" || mode === "hybrid" ? markdownScalar(data.storedData, "contract-defined output") : "not-applicable"}
- Observability: ${mode === "headless" || mode === "hybrid" ? "structured run status, logs and verification evidence" : "not-applicable"}
- Failure visibility: ${mode === "headless" || mode === "hybrid" ? "typed blocker or failed run with next action" : "not-applicable"}`;

  return `---
id: ${options.artifactId || `${date}-${agentSlug}-agent-outcome-spec`}
type: agent-outcome-spec
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - outcome-spec
  - ${agentSlug}
tools:
  - Pritha
  - Codex
sources:
  - ${yamlScalar(data.relPath)}
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
related:
  agent_contracts:
    - ${yamlScalar(data.relPath)}
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: ${date}
source_updated: ${date}
source_version: proposed outcome spec v1
retrieved: ${date}
verified: pending
valid_for: ${yamlScalar(`delivery of ${data.agentName}`)}
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: ${data.agentId || agentSlug}
privacy: public
retention: durable
review_status: draft
confidence: medium
contract_path: ${yamlScalar(data.relPath)}
contract_fingerprint: ${data.fingerprint}
agent_slug: ${agentSlug}
interaction_mode: ${mode}
automated_trial_waiver: none
outcome_spec_status: draft
outcome_semantic_lock: pending
outcome_document_lock: pending
approved_by: pending
approved_at: pending
---

# Agent Outcome Spec: ${markdownScalar(data.agentName, agentSlug)}

## Shape

- One-liner: ${markdownScalar(data.primaryMission, "Deliver the requested agent outcome")}
- Done when: ${markdownScalar(data.successCriteria, "The approved outcome is demonstrated and independently verified")}
- Interaction mode: ${mode}

${interfaceSection}

${headlessSection}

## Deliverables

${deliverables.map((value) => `- ${value}.`).join("\n")}

## Non-goals v1

- ${markdownScalar(data.outOfScope, "Functions deferred by the agent contract")}

## Trials

### Trial: harness-smoke

- Statement: The generated project passes its deterministic smoke test.
- Kind: automated
- Covers: ${coverageId("deliverable", deliverables[1], 1)}
- Isolation: none
- When argv: ["node", "scripts/smoke-test.mjs"]
- When cwd: .
- Then exit code: 0
- Timeout ms: 120000

${coreTrials}

## Demo script

1. Open or trigger the primary agent interface.
2. Run the main example session with a realistic input.
3. Inspect the result and its verification evidence.
4. Exercise one failure or recovery path.
5. Record user acceptance or a correction request.
`;
}

export function createOutcomeSpec(contractPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const data = contractData(contractPath, { root });
  const contractDir = path.join(resolvePrithaAgentMemoryRoot({ root, stateRoot: options.stateRoot }), "contracts");
  mkdirSync(contractDir, { recursive: true });
  const date = options.date || today();
  return writeUniqueArtifact(
    path.join(contractDir, `${date}-${slug(data.agentName, { fallback: "agent" })}-agent-outcome-spec.md`),
    ({ artifactId }) => renderOutcomeSpecFromContract(data, { ...options, date, artifactId }),
  );
}

export function reviseOutcomeSpec(specPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const fullPath = path.resolve(root, specPath);
  const original = readFileSync(fullPath, "utf8");
  const parsed = parseOutcomeSpecText(original);
  if (parsed.frontmatter.type !== "agent-outcome-spec") throw new Error("Outcome revision requires an agent-outcome-spec artifact");
  if (parsed.frontmatter.status !== "approved") {
    throw new Error("Outcome revision starts from the currently approved Outcome Spec; edit an existing draft directly");
  }
  const date = options.date || today();
  const contractDir = path.join(resolvePrithaAgentMemoryRoot({ root, stateRoot: options.stateRoot }), "contracts");
  mkdirSync(contractDir, { recursive: true });
  const priorRelPath = path.relative(root, fullPath).replaceAll(path.sep, "/");
  const written = writeUniqueArtifact(
    path.join(contractDir, `${date}-${slug(parsed.frontmatter.agent_slug, { fallback: "agent" })}-agent-outcome-spec.md`),
    ({ artifactId }) => replaceFrontmatterFields(original, {
      id: artifactId,
      status: "draft",
      created: date,
      updated: date,
      verified: "pending",
      source_version: "outcome correction proposal v1",
      review_status: "draft",
      confidence: "medium",
      outcome_spec_status: "draft",
      outcome_semantic_lock: "pending",
      outcome_document_lock: "pending",
      approved_by: "pending",
      approved_at: "pending",
      supersedes: `\n  - ${JSON.stringify(priorRelPath)}`,
      superseded_by: "[]",
    }),
  );
  const nextRelPath = path.relative(root, written.path).replaceAll(path.sep, "/");
  const superseded = replaceFrontmatterFields(original, {
    status: "superseded",
    updated: date,
    review_status: "superseded",
    outcome_spec_status: "superseded",
    superseded_by: `\n  - ${JSON.stringify(nextRelPath)}`,
  });
  atomicCompareAndSwapFile(fullPath, original, superseded);
  return { ...written, path: written.path, previousPath: fullPath, previousRelPath: priorRelPath, relPath: nextRelPath };
}

export function outcomeSpecsForContract(contractPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const data = contractData(contractPath, { root });
  const contractDir = path.join(resolvePrithaAgentMemoryRoot({ root, stateRoot: options.stateRoot }), "contracts");
  if (!existsSync(contractDir)) return [];
  return readdirSync(contractDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(contractDir, entry))
    .map((filePath) => {
      try {
        const text = readFileSync(filePath, "utf8");
        const parsed = parseOutcomeSpecText(text);
        if (parsed.frontmatter.type !== "agent-outcome-spec") return null;
        const samePath = path.normalize(String(parsed.frontmatter.contract_path || "")) === path.normalize(data.relPath);
        const sameFingerprint = parsed.frontmatter.contract_fingerprint === data.fingerprint;
        if (!samePath && !sameFingerprint) return null;
        const validation = validateOutcomeSpecText(text, { root, contract: data });
        return {
          path: filePath,
          relPath: path.relative(root, filePath),
          status: String(parsed.frontmatter.status || "unknown"),
          id: parsed.frontmatter.id,
          semanticLock: parsed.frontmatter.outcome_semantic_lock,
          documentLock: parsed.frontmatter.outcome_document_lock,
          approvedAt: parsed.frontmatter.approved_at,
          valid: validation.ok,
          issues: validation.issues,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const approvalRank = Number(right.status === "approved") - Number(left.status === "approved");
      if (approvalRank) return approvalRank;
      return path.basename(right.path).localeCompare(path.basename(left.path));
    });
}

export function latestOutcomeSpecForContract(contractPath, options = {}) {
  return outcomeSpecsForContract(contractPath, options)[0] || null;
}

function replaceFrontmatterFields(text, updates) {
  const source = normalizedText(text);
  if (!source.startsWith("---\n")) throw new Error("Outcome Spec requires YAML frontmatter");
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Outcome Spec frontmatter is not closed");
  const seen = new Set();
  const lines = source.slice(4, end).split("\n").map((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):/);
    if (!match || !Object.hasOwn(updates, match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}: ${updates[match[1]]}`;
  });
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) lines.push(`${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n${source.slice(end + 5)}`;
}

export function approvalEvidencePath(options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  return resolvePrithaStatePathFrom({ root, stateRoot: options.stateRoot }, "audit", "outcome-approvals.jsonl");
}

function appendApprovalEvent(event, options = {}) {
  const filePath = approvalEvidencePath(options);
  mkdirSync(path.dirname(filePath), { recursive: true });
  withFileLock(filePath, () => appendFileSync(filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }));
  return filePath;
}

function readApprovalEvents(options = {}) {
  const filePath = approvalEvidencePath(options);
  if (!existsSync(filePath)) return [];
  const text = readFileSync(filePath, "utf8");
  if (Buffer.byteLength(text) > 5_000_000) throw new Error("Outcome approval evidence is too large");
  return text.split("\n").filter(Boolean).map((line) => {
    try {
      return parseBoundedJson(line, { maxBytes: 32_768, maxDepth: 8, maxNodes: 256 });
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function verifyOutcomeApproval(specPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const fullPath = path.resolve(root, specPath);
  if (!existsSync(fullPath)) return { ok: false, reasons: ["spec_missing"], event: null };
  const text = readFileSync(fullPath, "utf8");
  const validation = validateOutcomeSpecText(text, { root });
  const fm = validation.parsed.frontmatter;
  const reasons = validation.issues.map((entry) => entry.code.toLowerCase());
  if (String(fm.status || "") !== "approved") reasons.push("spec_not_approved");
  const relPath = path.relative(root, fullPath);
  const events = readApprovalEvents({ ...options, root });
  const event = [...events].reverse().find((candidate) => (
    candidate.schema === OUTCOME_APPROVAL_SCHEMA
    && candidate.spec_path === relPath
    && candidate.spec_id === fm.id
    && candidate.contract_fingerprint === fm.contract_fingerprint
    && candidate.semantic_lock === fm.outcome_semantic_lock
    && candidate.document_lock === fm.outcome_document_lock
    && candidate.approved_by === "user"
  )) || null;
  if (!event) reasons.push("approval_evidence_missing_or_stale");
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], event, validation };
}

export function approveOutcomeSpec(specPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const approvedBy = String(options.approvedBy || "").trim();
  if (approvedBy !== "user") throw new Error("Outcome approval requires explicit --approved-by user");
  const fullPath = path.resolve(root, specPath);
  const original = readFileSync(fullPath, "utf8");
  const current = parseOutcomeSpecText(original);
  if (current.frontmatter.status === "approved") {
    const existing = verifyOutcomeApproval(fullPath, { ...options, root });
    if (existing.ok) return { path: fullPath, text: original, event: existing.event, evidencePath: approvalEvidencePath({ ...options, root }), unchanged: true };
  }
  const validation = validateOutcomeSpecText(original, { root });
  const blocking = validation.issues.filter((entry) => !["OS015", "OS016"].includes(entry.code));
  if (blocking.length) throw new Error(`Outcome Spec is not ready for approval:\n- ${blocking.map((entry) => `${entry.code} ${entry.message}`).join("\n- ")}`);
  if (!validation.contract || validation.contract.fm.status !== "accepted") {
    throw new Error("Outcome Spec approval requires an accepted agent contract");
  }
  // Explicit verifier identities are reviewed before approval locks are written.
  // This reads files only and never executes a project command.
  if (validation.parsed.trials.some(trial => trial.verifierInputs || trial.productTargets)) {
    inspectProtectedTrialInputs({ trials: validation.parsed.trials }, path.resolve(root, options.projectPath || validation.contract.targetFolder));
  }
  const approvedAt = options.approvedAt || new Date().toISOString();
  const semanticLock = outcomeSemanticLock(validation.parsed);
  let next = replaceFrontmatterFields(original, {
    status: "approved",
    outcome_spec_status: "approved",
    updated: approvedAt.slice(0, 10),
    outcome_semantic_lock: semanticLock,
    outcome_document_lock: "pending",
    approved_by: "user",
    approved_at: approvedAt,
    review_status: "accepted",
  });
  const documentLock = outcomeDocumentLock(next);
  next = replaceFrontmatterFields(next, { outcome_document_lock: documentLock });
  const finalValidation = validateOutcomeSpecText(next, { root });
  if (!finalValidation.ok) throw new Error(`Approved Outcome Spec failed validation:\n- ${finalValidation.issues.map((entry) => `${entry.code} ${entry.message}`).join("\n- ")}`);
  atomicCompareAndSwapFile(fullPath, original, next);
  const fm = finalValidation.parsed.frontmatter;
  const event = {
    schema: OUTCOME_APPROVAL_SCHEMA,
    approval_id: randomUUID(),
    spec_id: fm.id,
    spec_path: path.relative(root, fullPath),
    agent_slug: fm.agent_slug,
    contract_fingerprint: fm.contract_fingerprint,
    semantic_lock: semanticLock,
    document_lock: documentLock,
    approved_by: "user",
    approved_at: approvedAt,
  };
  const evidencePath = appendApprovalEvent(event, { ...options, root });
  return { path: fullPath, text: next, event, evidencePath, unchanged: false };
}

export function preflightOutcomeTrialInputs(specPath, options = {}) {
  const root = path.resolve(options.root || resolveTechscopeRoot());
  const validation = outcomeSpecFile(specPath, { ...options, root });
  const base = { schema: "pritha-trial-input-preflight-v1", scope: "verification-inputs-only",
    specId: validation.parsed.frontmatter.id, semanticLock: outcomeSemanticLock(validation.parsed),
    documentLock: outcomeDocumentLock(validation.text), executesCommands: false, writesFiles: false };
  if (!validation.ok) return { ...base, status: "blocked", issues: validation.issues, inputs: [] };
  try {
    const selected = options.projectPath || validation.contract?.targetFolder;
    if (!selected) throw new Error("Select the project with --project before verifier preflight");
    const project = path.resolve(root, selected);
    const inputs = inspectProtectedTrialInputs({ trials: validation.parsed.trials }, project);
    return { ...base, status: "ready", issues: [], inputs,
      productTargets: [...new Set(validation.parsed.trials.flatMap(trial => trial.productTargets || []))],
      nextAction: "Review the verifier, exercise a wrong-product negative control, then approve this exact Outcome revision. Product verification remains separate." };
  } catch (error) {
    return { ...base, status: "blocked", inputs: [], issues: [{ code: error.code || "trial_input_preflight_failed", message: redactSensitiveText(error.message) }] };
  }
}

function safeRunId(value) {
  const runId = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(runId)) throw new Error("run-id must use only letters, digits, dot, underscore and dash");
  return runId;
}

// Read-only compiler shared by the writer and host execution gates. Preserve the
// v1 wire shape so existing immutable plans and evidence locks remain valid.
export function approvedTrialPlan(specPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const fullPath = path.resolve(root, specPath);
  const text = readFileSync(fullPath, "utf8");
  const validation = validateOutcomeSpecText(text, { root });
  if (!validation.ok) throw new Error(`Outcome Spec validation failed:\n- ${validation.issues.map((entry) => `${entry.code} ${entry.message}`).join("\n- ")}`);
  const approval = options.allowDraft ? { ok: true, event: null } : verifyOutcomeApproval(fullPath, { ...options, root });
  if (!approval.ok) throw new Error(`Outcome approval gate failed: ${approval.reasons.join(", ")}`);
  const parsed = validation.parsed;
  const semanticLock = outcomeSemanticLock(parsed);
  const operatorTrials = parsed.trials.filter((trial) => trial.kind === "operator-judged").length;
  const waiver = automatedTrialWaiver(parsed.frontmatter.automated_trial_waiver);
  const plan = {
    schema: TRIAL_PLAN_SCHEMA,
    spec_id: parsed.frontmatter.id,
    spec_path: path.relative(root, fullPath),
    agent_slug: parsed.frontmatter.agent_slug,
    contract_path: parsed.frontmatter.contract_path,
    contract_fingerprint: parsed.frontmatter.contract_fingerprint,
    semantic_lock: semanticLock,
    document_lock: outcomeDocumentLock(text),
    approval_id: approval.event?.approval_id || null,
    interaction_mode: parsed.interactionMode,
    automated_trial_waiver: waiver,
    autonomous_verification_allowed: validation.automatedTrials > 0 && operatorTrials === 0 && !hasAutomatedTrialWaiver(waiver),
    delivery_policy: {
      build_git_mode: validation.contract?.buildGitMode || "disposable-worktree",
      build_executor: validation.contract?.buildExecutor || "codex-cli",
      trial_backend_policy: validation.contract?.trialBackendPolicy || "local-or-codex-cli",
      max_iterations: validation.contract?.buildIterationBudget || 6,
      max_elapsed_ms: validation.contract?.buildElapsedBudgetMs || 5_400_000,
      max_tokens: validation.contract?.buildTokenBudget || 1_000_000,
      token_budget_source: validation.contract?.buildTokenBudgetSource || "legacy-default",
      repeated_failure_threshold: validation.contract?.repeatedFailureThreshold || 3,
      autonomous_effects_denied: validation.contract?.autonomousEffectsDenied || "push, merge, deployment, service enablement, secret provisioning, Outcome Spec mutation, verifier mutation",
      acceptance_policy: validation.contract?.acceptancePolicy || "verified is distinct from accepted",
    },
    counts: {
      trials: parsed.trials.length,
      automated: validation.automatedTrials,
      operator_judged: operatorTrials,
    },
    coverage: validation.coverage,
    trials: parsed.trials.map(({ argvError: _argvError, ...trial }) => trial),
    demo: parsed.demo,
  };
  return plan;
}

export function verifyCompiledTrialPlan(plan, options = {}) {
  if (!plan || typeof plan.spec_path !== "string") return false;
  try {
    const expected = approvedTrialPlan(plan.spec_path, options);
    // Object key order is serialization, not permission. Unknown fields,
    // commands, assertions, policy and demo changes all invalidate the plan.
    const canonical = (value) => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return JSON.stringify(canonical(expected)) === JSON.stringify(canonical(plan));
  } catch { return false; }
}

export function compileOutcomeSpec(specPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const plan = approvedTrialPlan(specPath, options);
  const runId = safeRunId(options.runId || `plan-${plan.semantic_lock.slice(7, 19)}`);
  const runRoot = resolvePrithaStatePathFrom({ root, stateRoot: options.stateRoot }, "builds", plan.agent_slug, runId);
  const planPath = path.join(runRoot, "trial-plan.json");
  const planText = `${JSON.stringify(plan, null, 2)}\n`;
  mkdirSync(runRoot, { recursive: true });
  if (existsSync(planPath)) {
    const existing = readFileSync(planPath, "utf8");
    if (existing !== planText) throw new Error(`Refusing to replace a different Trial plan for run ${runId}`);
  } else {
    atomicWriteFile(planPath, planText);
  }
  return { plan, planPath, runRoot, runId, text: planText };
}

export function outcomeSpecFile(specPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const fullPath = path.resolve(root, specPath);
  const text = readFileSync(fullPath, "utf8");
  return { root, fullPath, relPath: path.relative(root, fullPath), text, ...validateOutcomeSpecText(text, { root }) };
}

export function formatOutcomeIssues(issues) {
  return issues.map((entry) => `${entry.code} ${entry.location ? `[${entry.location}] ` : ""}${entry.message}`);
}

export function contractFingerprintForText(text) {
  return contractFingerprint(text);
}
