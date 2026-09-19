import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeInterviewBrief, parseInterviewBrief, serializeInterviewBrief, validateInterviewBrief } from "../scripts/agents-mother/interview-brief.mjs";
import { contractData, validateContract } from "../scripts/agents-mother/contract.mjs";

import {
  applyInterviewTechnicalProposal,
  parseInterviewBriefDecisions,
  researchMarkdown,
} from "../scripts/agents-mother/index.mjs";

const QUAKE_BRIEF = `---
id: quake-board-interview-brief
type: brief
---

# Quake Board — interview brief

## Identity
- Name: Quake Board
- Slug: quake-board

## Mission
Показывать землетрясения за последние сутки по публичному USGS GeoJSON.

## Confirmed decisions
- Runtime: \`runtimeFamily: api\`, \`serviceMode: process\`, \`primaryInterface: web\`.
- GitHub research: policy \`not-applicable\`, adoption mode \`none\`.
- Явно не выбрано: Telegram, NeuralDeep, Tailscale, launchd/cron, SQLite, API keys, LLM.

## Success criterion
Живой http://127.0.0.1:3006 показывает карточки землетрясений.

## Next steps (следующие ходы, не в этом)
1. Contract draft.
`;

test("parseInterviewBriefDecisions reads confirmed api-process decisions", () => {
  const parsed = parseInterviewBriefDecisions(QUAKE_BRIEF);
  assert.equal(parsed.data.agentName, "Quake Board");
  assert.equal(parsed.cliOptions.runtime, "api");
  assert.equal(parsed.cliOptions.service, "process");
  assert.equal(parsed.cliOptions.interface, "web");
  assert.equal(parsed.cliOptions["repository-policy"], "not-applicable");
  assert.equal(parsed.cliOptions["repository-adoption"], "none");
  assert.match(parsed.data.successCriteria, /карточки/);
});

test("parseInterviewBriefDecisions reads a confirmed table-format brief", () => {
  const parsed = parseInterviewBriefDecisions(`# Interview Brief — HN Board

## Confirmed (явно задано пользователем)

| Параметр | Значение |
|---|---|
| Name / slug | HN Board / \`hn-board\` |
| runtimeFamily | \`api\` |
| serviceMode | \`process\` (ручной запуск) |
| primaryInterface | \`web\` |
| GitHub research | policy \`not-applicable\`, adoption \`none\` |

## Non-goals (исключено пользователем)

Telegram; launchd; API keys.
`);
  assert.equal(parsed.cliOptions.runtime, "api");
  assert.equal(parsed.cliOptions.service, "process");
  assert.equal(parsed.cliOptions.interface, "web");
  assert.equal(parsed.cliOptions["repository-policy"], "not-applicable");
  assert.equal(parsed.cliOptions["repository-adoption"], "none");
});

test("init from interview brief fills api-process defaults instead of a generic stub", () => {
  const parsed = parseInterviewBriefDecisions(QUAKE_BRIEF);
  const data = {
    agentName: parsed.data.agentName,
    primaryMission: parsed.data.primaryMission,
    successCriteria: parsed.data.successCriteria,
    outOfScope: parsed.data.outOfScope,
    primaryInterface: parsed.data.primaryInterface,
  };
  applyInterviewTechnicalProposal(data, parsed.cliOptions);
  assert.equal(data.runtimeFamily, "api");
  assert.equal(data.serviceMode, "process");
  assert.equal(data.runtimePlacementProfile, "deterministic-first");
  assert.equal(data.repositoryResearchPolicy, "not-applicable");
  assert.equal(data.repositoryAdoptionMode, "none");
  assert.equal(data.repositoryResearchWaiverReason, "TBD", "legacy waiver has no invented source-specific justification");
  assert.equal(data.repositoryResearchTopics, "none");
  assert.equal(data.startCommand, "node scripts/service-control.mjs start");
  assert.equal(data.stopCommand, "node scripts/service-control.mjs stop");
  assert.equal(data.healthcheckCommand, "node scripts/healthcheck.mjs");
  assert.match(data.testsHealthchecks, /read-only GET \/health/);
});

test("GitHub discovery waiver leaves runtime and source research pending", () => {
  const fingerprint = `sha256:${"a".repeat(64)}`;
  const md = researchMarkdown(
    {
      agentName: "HN Board",
      relPath: "11_agents/contracts/hn-board-agent-contract.md",
      fingerprint,
      runtimeFamily: "api",
      serviceMode: "process",
      primaryInterface: "web",
      repositoryResearchPolicy: "not-applicable",
      repositoryAdoptionMode: "none",
      telegramMode: "none",
    },
    [],
    { agentBuildingKnowledge: [], prithaSelf: [], childAgents: [] },
    [],
    {
      installed: [],
      candidates: [],
      blocked: [],
      policy: {
        skillNeeds: "auto",
        allowedSkillSources: "local-only",
        skillInstallMode: "recommend",
        skillMutationPolicy: "read-only",
      },
    },
    {
      patternPack: {
        relPath: "11_agents/research/hn-board-agent-pattern-pack.md",
        lock: `sha256:${"b".repeat(64)}`,
        contractFingerprint: fingerprint,
        status: "complete",
        semantic: { status: "ok" },
        externalResearchSeeds: ["sqlite", "telegram bot api", "launchd cron"],
      },
    },
  );
  assert.match(md, /research_gate_status: pending/);
  assert.match(md, /external_research_status: pending/);
  assert.match(md, /repository_research_status: not-applicable/);
  assert.match(md, /node-http-runtime/);
  assert.match(md, /pattern-sqlite/);
});

test("table and final-section briefs preserve user intent, permissions and all acceptance criteria", () => {
  const brief = parseInterviewBrief(`| Параметр | Значение |
|---|---|
| Name / slug | Signal Desk ND / \`signal-desk-nd\` |
| Миссия | Читать ленты и сохранять дайджест |
| Пользователь | Один оператор |
| Критерии успеха | Дайджест виден; экспортируется Markdown |
| Сетевой доступ | Только указанные источники |
| Файловый доступ | Только каталог агента |
| Права | Локальный оператор |
| preset | llm-app |

## Sources
- https://example.test/feed.xml
- https://other.example.test/rss

## Non-goals
- No external publishing

## Constraints
- Maximum 20 articles
- Preserve data on source failure`);
  assert.deepEqual(brief.successCriteria, ["Дайджест виден", "экспортируется Markdown"]);
  assert.equal(brief.user, "Один оператор");
  assert.equal(brief.sources.length, 2);
  assert.deepEqual(brief.permissions, { network: ["Только указанные источники"], filesystem: ["Только каталог агента"], authorization: "Локальный оператор" });
  assert.deepEqual(brief.constraints, ["Maximum 20 articles", "Preserve data on source failure"]);
  assert.deepEqual(parseInterviewBrief(serializeInterviewBrief(brief)), brief);
  assert.deepEqual(validateInterviewBrief(brief, { requireComplete: true }), []);
});

test("brief schema rejects malformed typed inputs and unsupported versions", () => {
  assert.throws(() => normalizeInterviewBrief({ schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => normalizeInterviewBrief({ sources: [{ url: "https://example.test" }] }), /sources/);
  assert.throws(() => parseInterviewBrief('{"technical":{"preset":"invented"}}'), /preset/);
  assert.ok(validateInterviewBrief({}, { requireComplete: true }).length >= 4);
});

test("API process does not imply feed semantics while explicit presets have different provider and research needs", () => {
  const generic = applyInterviewTechnicalProposal({ agentName: "Generic", primaryMission: "A model-backed local tool" }, { runtime: "api", service: "process" });
  assert.equal(generic.repositoryResearchPolicy, "auto");
  assert.equal(generic.interviewPreset, "generic");
  assert.doesNotMatch(generic.repositoryResearchWaiverReason, /feed|JSON/);
  const feed = applyInterviewTechnicalProposal({ agentName: "Feed" }, { preset: "local-feed", "source-format": "rss" });
  assert.equal(feed.runtimeFamily, "api");
  assert.equal(feed.primaryInterface, "web");
  assert.equal(feed.repositoryResearchTopics, "none");
  assert.equal(feed.runtimePlacementProfile, "deterministic-first");
  assert.match(feed.repositoryResearchWaiverReason, /evidence remain required/);
  const llm = applyInterviewTechnicalProposal({ agentName: "Model" }, { preset: "llm-app" });
  assert.equal(llm.repositoryResearchPolicy, "auto");
  assert.equal(llm.runtimePlacementProfile, "hybrid");
  assert.match(llm.providerBinding, /NeuralDeep/);
  assert.equal(llm.healthcheckCommand, "node scripts/healthcheck.mjs");
  assert.throws(() => applyInterviewTechnicalProposal({ agentName: "Wrong preset" }, { preset: "llm-app", runtime: "cli" }), /requires api runtime/);
  assert.throws(() => applyInterviewTechnicalProposal({ agentName: "Wrong format" }, { "source-format": "invented" }), /Invalid source format/);
});

test("CLI aliases preserve canonical artifacts, authored edits and complete brief product fields", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-brief-repeat-"));
  const root = path.join(temp, "root");
  const state = path.join(temp, "state");
  const parent = path.join(temp, "children");
  mkdirSync(root, { recursive: true });
  const briefPath = path.join(temp, "brief.json");
  const brief = normalizeInterviewBrief({
    identity: { name: "Signal Desk ND", slug: "signal-desk" }, goal: "Summarize articles", user: "Local operator",
    successCriteria: ["Stored summaries survive restart", "Download Markdown"], coreFunctions: ["Fetch RSS", "Generate digest"],
    sources: ["https://example.test/rss"], constraints: ["At most 20 items"], nonGoals: ["No automatic publishing"],
    permissions: { network: ["Declared feeds only"], filesystem: ["Agent project only"], authorization: "One local operator" },
    technical: { preset: "llm-app" },
  });
  writeFileSync(briefPath, serializeInterviewBrief(brief));
  const run = (args) => spawnSync(process.execPath, ["scripts/pritha.mjs", "init", "--no-input", ...args], {
    cwd: path.resolve("."), encoding: "utf8", env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: state, PRITHA_AGENT_PARENT: parent },
  });
  try {
    const first = run(["--brief", briefPath]);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const dir = path.join(state, "agents", "contracts");
    const contractPath = path.join(dir, readdirSync(dir).find((name) => name.endsWith("-agent-contract.md")));
    const outcomePath = path.join(dir, readdirSync(dir).find((name) => name.endsWith("-agent-outcome-spec.md")));
    const text = readFileSync(contractPath, "utf8");
    const contract = contractData(contractPath, { root });
    assert.deepEqual(validateContract(contractPath, { print: false }), []);
    assert.equal(contract.technicalSlug, "signal-desk");
    assert.equal(contract.targetFolder, path.join(parent, "signal-desk"));
    assert.match(text, /Product data sources: https:\/\/example.test\/rss/);
    assert.match(text, /Product constraints: At most 20 items/);
    assert.equal(contract.targetUser, "Local operator");
    assert.match(contract.successCriteria, /survive restart; Download Markdown/);
    assert.match(text, /Allowed network access: Declared feeds only/);
    assert.match(text, /outcome_trial_preset: llm-http-app-v1/);
    writeFileSync(contractPath, `${text}\nUser-authored requirement remains.\n`);
    const outcomeBefore = readFileSync(outcomePath, "utf8");
    const second = run(["--from-brief", briefPath]);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /Reused:/);
    assert.equal(readdirSync(dir).filter((name) => name.endsWith(".md")).length, 2);
    assert.equal(readFileSync(contractPath, "utf8"), `${text}\nUser-authored requirement remains.\n`);
    assert.equal(readFileSync(outcomePath, "utf8"), outcomeBefore);
    const changed = run(["--brief", briefPath, "--mission", "Different product"]);
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /differs from the existing/);
    assert.equal(readdirSync(dir).filter((name) => name.endsWith(".md")).length, 2);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("contract-only init can be retried and prevents a second identity binding the same target", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-contract-only-"));
  const root = path.join(temp, "root"), state = path.join(temp, "state"), target = path.join(temp, "children", "reserved");
  mkdirSync(root, { recursive: true });
  const args = ["--name", "Review Product", "--mission", "Produce a review", "--success", "Review is saved", "--target-folder", target];
  const run = (extra) => spawnSync(process.execPath, ["scripts/pritha.mjs", "init", "--no-input", ...args, ...extra], {
    cwd: path.resolve("."), encoding: "utf8", env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: state, PRITHA_AGENT_PARENT: path.dirname(target) },
  });
  try {
    const first = run(["--contract-only"]);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const dir = path.join(state, "agents", "contracts");
    assert.equal(readdirSync(dir).filter(name => name.endsWith(".md")).length, 1);
    const retry = run(["--contract-only"]);
    assert.equal(retry.status, 0, retry.stderr || retry.stdout);
    assert.match(retry.stdout, /Reused:/);
    const collision = run(["--slug", "another-agent", "--contract-only"]);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /existing agent contract/);
    assert.equal(readdirSync(dir).filter(name => name.endsWith(".md")).length, 1);
    const withOutcome = run([]);
    assert.equal(withOutcome.status, 0, withOutcome.stderr || withOutcome.stdout);
    assert.equal(readdirSync(dir).filter(name => name.endsWith(".md")).length, 2);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
