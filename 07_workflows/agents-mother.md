---
id: agents-mother
type: workflow
status: experimental
created: 2026-05-18
updated: 2026-08-22
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - codex
tools:
  - Codex
  - AGENTS.md
  - Telegram
  - CLI
  - OpenAI Agents SDK
  - OpenAI Realtime API
  - gpt-realtime-2
  - Pritha
  - A2A Protocol
sources:
  - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-26-funny-teacher-agent-user-interaction-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  - 04_standards/agent-runtime-placement.md
  - 04_standards/agent-harness-evaluation.md
  - 04_standards/agent-team-operating-model.md
  - 04_standards/agent-skill-pack-lifecycle.md
  - 04_standards/agent-mcp-connector-lifecycle.md
  - 04_standards/agent-a2a-interoperability.md
  - 04_standards/agent-ai-safe-security-checklist.md
  - 01_sources/registries/github-agent-building-repos.md
  - 01_sources/signals/2026-06-28-open-source-agent-building-repos-signal.md
  - 03_reviews/2026-06-28-open-source-agent-building-repos-review.md
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
  - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
  - 07_workflows/agent-sensor-and-eval-design.md
related:
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-a2a-interoperability.md
    - 04_standards/agent-ai-safe-security-checklist.md
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
  templates:
    - 08_templates/agent-project-contract.md
    - 08_templates/agent-outcome-spec.md
    - 08_templates/agent-scaffold-report.md
    - 08_templates/agent-delivery-report.md
    - 08_templates/github-source-registry-entry.md
  workflows:
    - 07_workflows/agents-mother-roadmap.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
    - 07_workflows/agent-skill-pack-selection.md
    - 07_workflows/agent-mcp-connector-selection.md
    - 07_workflows/agent-a2a-communication-selection.md
    - 07_workflows/agent-sensor-and-eval-design.md
supersedes: []
superseded_by: []
---

# Workflow: agents-mother / Pritha

Status: experimental

## Goal

Use Pritha as an outcome-driven agent factory: jointly define the desired
product, design its architecture, build it to executable acceptance evidence,
and hand off a working agent from a user request.

Pritha is the public alias and product name for this layer. Existing `agents-mother` paths and artifact types remain valid for compatibility; new user-facing CLI/docs should prefer Pritha vocabulary.

The default v1 target is a production-testable sibling project. The first
implementation path is `codex-native + optional interface adapters`.

FESPA26 is the first successful external agent captured in this lifecycle. It is
not a template to copy blindly, but it provides the first evidence-backed event
and reportage agent pattern: `event material -> source memory -> Codex
processing -> reviewed feed card -> explicit publication`. Its current voice
architecture also upgrades the reusable voice-control pattern to `Realtime
dispatcher + deterministic server tools + Codex App/thread transport + Codex
CLI/queue fallback`.

Funny Teacher is the first successful language-learning voice agent. It adds
evidence for `Realtime teacher + durable SQLite lesson memory + semantic
retrieval + explicit selected-memory-focus/reset controls`.

Funny Teacher is also the canonical Pritha feedback-loop example: the useful
agent shape emerged through user corrections, mobile testing, memory UX
questions, idempotency fixes and version fixation, not from the initial scaffold
alone. Use `11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md`
when comparing a future voice or learning agent against proven lineage evidence.

## Core rule

Do not scaffold a new agent directly from a vague idea. First turn the idea into
a concrete proposal, then create two separately approved and locked artifacts:
an `agent-contract` for the architecture and an `agent-outcome-spec` for the
observable final result. Validate them against Pritha memory and current
sources, compile the Outcome Spec into executable Trials, and continue through
the bounded delivery loop until the Trials pass for a committed revision or a
typed blocker requires a user decision. A scaffold is an intermediate result,
not the completion condition. The low-level compatibility scaffold may still
run from an accepted contract before Outcome approval, but it must report the
missing lifecycle gate and cannot be presented as delivered. A draft contract
may be scaffolded only with an explicit experimental
`--allow-draft-scaffold` override.

For Voice Control and Predictive Voice Control creation tasks, a visible Agents
card is part of the minimum successful outcome. The card can show explicit
runtime blockers, but creation is not complete while the agent is missing from
`11_agents/registry.md` or the Control Center Agents model.

## Workflow

1. Capture the request as an intake or direct thread brief.
2. Run a proposal-first product interview. Pritha first synthesizes a concrete
   candidate and asks only about choices that materially change the result:
   - final user-visible result and primary user;
   - observable done conditions;
   - main interface and first end-to-end journey;
   - core v1 outcomes and deliberately excluded outcomes;
   - sensitive data, consequential actions and approval boundaries.
   Routine technical choices are filled by Pritha as an editable architecture
   proposal: runtime family and placement, team mode, memory, tools, skills,
   MCP/A2A, isolation, interface implementation, Git/repository research,
   operations and test strategy. Ask a follow-up only when uncertainty changes
   product behavior, material cost, privacy/security, an irreversible action or
   an external dependency. Creation, improvement, fixing and harness evolution
   are the same class of agent-development task and need the same quality of
   brief.
3. Create an `agent-contract` from `08_templates/agent-project-contract.md`.
3a. Create an `agent-outcome-spec` from
    `08_templates/agent-outcome-spec.md`. It must describe the final experience,
    observable success, deliverables, non-goals and Trial blocks. Validate its
    coverage, approve it independently from the contract, record host-side
    approval evidence, lock its content and compile it to `trial-plan.json` in
    `PRITHA_STATE_ROOT`.
4. Create a reusable `agent-pattern-pack` artifact in `11_agents/research/`.
   The pack must combine FTS search, domain-routed memory search and an
   attempted semantic/embedding search:
   - first, `agent-building-knowledge` for standards, workflows and reusable
     architecture patterns;
   - second, `pritha-self` for current capabilities and limitations;
   - third, `child-agents` for comparable lifecycle evidence and successful
     patterns, not templates to copy;
   - optionally, `user-model` local-private preferences only when available and
     permitted.
   If semantic/embedding search is unavailable, stale or fails, continue with a
   warning, record the status in the pattern pack, and append the failure to
   `.private/agents-mother/semantic-memory-failures.jsonl` for later repair.
5. Derive external research topics from both the contract and the selected
   pattern-pack seeds. Verify volatile architecture choices through current
   primary sources and trusted secondary sources.
   When the contract or pattern pack implies an external harness, memory/RAG
   layer, eval/security component, MCP/tool server, external skill source or
   declared dependency, run contract-aware GitHub repository research:
   - apply `Repository research policy`: `auto`, `required`, `registry-only` or
     `not-applicable`; `not-applicable` requires a recorded waiver reason;
   - derive only the relevant scopes: `agent-harness`, `agent-memory`,
     `agent-evals`, `mcp-tools`, `agent-skills`, `agent-interface`,
     `agent-voice` and/or `agent-operations`;
   - search the curated
     `01_sources/registries/github-agent-building-repos.md` first;
   - in `auto` or `online` mode, augment registry matches with bounded GitHub API
     discovery; default to five candidates and never exceed ten per research run;
   - merge and deduplicate candidates into the research report without mutating
     the registry;
   - preserve all explicitly selected repositories within a hard maximum of ten,
     even when the requested shortlist limit is lower;
   - treat the shortlist as advisory-only. Discovery must not clone, install,
     execute, vendor, link, activate or trust repository code.
   For `reference-only`, require current `github-repository-review` evidence for
   every exact canonical repository. For `selected-module` v1, require exactly
   one directory module verified as a tree at the immutable pin plus module-local
   license evidence bound to that pin. Treat GitHub HEAD license metadata as
   advisory only.
   If no volatile external choice or repository-relevant scope is present,
   record why that verification is not needed.
6. Record an architecture recommendation:
   - selected runtime family;
   - selected interface adapters;
   - interface experience profile, user controls, state model, rendering trust
     boundary and fallback;
   - UI framework choice and message/state contract when a web/workflow UI is
     selected;
   - raster asset purpose, generation path, prompt/spec, format/size policy,
     alt/fallback, privacy boundary and readiness check when a raster visual
     asset layer is selected;
   - 3D renderer/framework, scene state contract, asset policy, performance
     target and fallback when a 3D visual layer is selected;
   - Codex account/rate-limit telemetry mode, bucket/field display and privacy
     boundary when an app-server-backed UI is selected;
   - harness evaluation plan when a non-Codex or local-model harness is being considered;
   - harness inventory;
   - sensor and feedback design: critical completion verifier, pre-action
     controls, in-loop budgets/non-progress detection, post-action read-back,
     eval integrity, balanced metrics and human judgment boundaries;
   - security and permission model;
   - AI-SAFE layer review status for selected modules;
   - untrusted-input risk tier and scanner/quarantine path;
   - skill candidates, trust/risk score and activation decision;
   - MCP connector candidates, auth/readiness state, toolset scope and activation decision;
   - GitHub repository shortlist, research status and adoption mode;
   - for every selected repository module: canonical repository, exact
     verified commit/tree SHA, safe repository-relative directory path and
     module tree SHA; module-local LICENSE/manifest source URL, Git blob SHA,
     content SHA-256, detected SPDX and `license_scope: module-local`; compatible
     license decision; security and permission review,
     contract-specific eval result, current `github-repository-review` evidence,
     completed synthesis and explicit user approval;
   - testing and observability model.
7. Mark the contract `accepted` before scaffold. Separately approve the Outcome
   Spec before autonomous delivery, and verify both content locks immediately
   before use. A compatibility scaffold created before Outcome approval remains
   an intermediate artifact only.
   If `Repository adoption mode` is `selected-module`, keep scaffold blocked until
   the repository research is current and the selected-module gates above are
   complete. `candidate`, `accepted-for-review` and `reference-only` never grant
   runtime or vendoring permission.
8. Scaffold the new agent in a sibling folder unless the contract explicitly
   chooses another location. Embed contract/Outcome lineage in the generated
   child, but keep approval evidence and live delivery state outside the child
   repository. When `Build Git mode` is `disposable-worktree`, initialize a
   local repository and clean scaffold baseline commit without adding a remote,
   pushing or bypassing hooks.
9. Generate minimum project files:
   - `AGENTS.md` or runtime-native equivalent;
   - `README.md`;
   - `.env.example`;
   - workflow notes;
   - scripts or app entrypoints;
   - skill pack manifest, candidates and audit/status command;
   - MCP manifest, candidates and status command when MCP is selected;
   - smoke test or healthcheck;
   - user training guide.
10. If Telegram is selected, include a Telegram adapter profile:
   - one-user or multi-user mode;
   - queue for incoming updates;
   - text/link/media handling policy;
   - concise human-readable replies;
   - processing log;
   - token and user id only through environment variables.
11. Run the compiled Trials once before a build attempt. Use this as independent
    baseline evidence, not as a prompt-authored claim.
12. Create a `scaffold-report` from `08_templates/agent-scaffold-report.md`.
13. Start delivery in a clean disposable Git worktree and a single-writer run
    ledger. Refuse to use a dirty active target checkout because Pritha cannot
    safely distinguish user changes from build changes.
14. Repeat until verified or blocked:
    - run the immutable Trial plan through the selected portable backend;
    - give only bounded failure evidence and the locked goal to the build
      executor;
    - reject protected-spec/verifier mutation, stale evidence, symlink escapes,
      non-progress, repeated failure and budget overruns;
    - commit a green checkpoint on `pritha/build-*` without bypassing hooks;
    - rerun every Trial against that exact commit.
15. Create an `agent-delivery-report` at every typed blocker and at final
    verification. Redact absolute paths and keep the live ledger exclusively in
    runtime state. Every non-terminal ledger state must contain exactly one
    `next_action` or a non-empty typed blocker list.
16. Move a fully verified result to `awaiting_acceptance`. Only the user may
    transition it to `accepted`; Pritha must not push, merge, deploy or publish
    during delivery.
17. Rebuild the Pritha child-agent registry and run
    `node scripts/pritha.mjs card-readiness <agent-slug>`. If the status is
    `missing`, treat the creation task as blocked. If the status is `blocked`,
    report the card blockers and next operator tasks; do not hide the card
    behind unfinished runtime work.
18. After the first meaningful accepted version, create an
    `agent-post-creation-review` and record the interaction path: initial prompt,
    clarifications, user feedback, failed assumptions and product decisions
    discovered during the build.
19. Rebuild Pritha memory indexes so the contract, Outcome Spec and lifecycle
    reports become searchable.

## Current commands

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs init --name "agent-name" --mission "mission"
node scripts/pritha.mjs outcome init 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs outcome validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/pritha.mjs outcome revise 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/pritha.mjs outcome approve 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --approved-by user
node scripts/pritha.mjs outcome compile 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/pritha.mjs create --name "agent-name" --mission "mission"
node scripts/pritha.mjs research 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --github-mode auto --github-limit 5
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs skills status
node scripts/pritha.mjs skills select 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs skills audit ../existing-or-generated-agent
node scripts/pritha.mjs test ../existing-or-generated-agent
node scripts/pritha.mjs publish ../existing-or-generated-agent
node scripts/pritha.mjs lineage
node scripts/pritha.mjs registry
node scripts/pritha.mjs card-readiness agent-name
node scripts/pritha.mjs trial run 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --project ../agent-name
node scripts/pritha.mjs deliver 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --project ../agent-name
node scripts/pritha.mjs delivery status <run-id>
node scripts/pritha.mjs delivery resume <run-id> --answer <option-id>
node scripts/pritha.mjs delivery accept <run-id> --accepted-by user

# Compatibility aliases retained for v0.1:
node scripts/agents-mother.mjs questions
node scripts/agents-mother.mjs interview
node scripts/agents-mother.mjs init --name "agent-name" --mission "mission"
node scripts/agents-mother.mjs outcome init 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs outcome validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/agents-mother.mjs outcome revise 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md
node scripts/agents-mother.mjs outcome approve 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --approved-by user
node scripts/agents-mother.mjs research 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs scaffold 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs test ../existing-or-generated-agent
node scripts/agents-mother.mjs handoff ../existing-or-generated-agent
node scripts/agents-mother.mjs operations ../existing-or-generated-agent
node scripts/agents-mother.mjs deploy ../existing-or-generated-agent plan
node scripts/agents-mother.mjs evolve ../existing-or-generated-agent --notes "lessons"
node scripts/agents-mother.mjs registry
node scripts/agents-mother.mjs card-readiness agent-name
node scripts/agents-mother.mjs deliver 11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md --project ../agent-name
node scripts/agents-mother.mjs delivery status <run-id>
node scripts/agents-mother.mjs delivery resume <run-id> --answer <option-id>
node scripts/agents-mother.mjs delivery accept <run-id> --accepted-by user
node scripts/agents-mother.mjs validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs list
```

Fresh generated contracts use `Target folder: sibling of Pritha`; scaffold
resolves that logical default through `PRITHA_AGENT_PARENT`. An explicit
contract path or `--output` remains an intentional override. Subsequent lifecycle
commands should use the actual scaffold path printed by Pritha rather than assume
the legacy `../agent-name` layout in an isolated instance.

Repository-research flags for `research`:

- `--github-mode auto|online|registry-only|skip`: `auto` is the normal
  registry-first path and performs bounded online discovery only for derived
  repository scopes; `online` requests online augmentation when contract policy
  permits it;
  `registry-only` disables network discovery; `skip` records a failed/pending
  result when repository research is required.
- `--github-limit <1..10>`: requested merged shortlist size; default `5`.
  Explicit contract selections raise the effective limit so none is silently
  dropped, while the hard maximum remains ten.
- `--github-timeout-ms <1000..60000>`: per GitHub request timeout; default
  `15000`. The full online discovery pass also has a 45-second fail-closed
  deadline so several unavailable scopes cannot block the workflow indefinitely.
- `--github-fixture <json>`: deterministic test/development input only. Fixture
  metadata remains untrusted and never counts as approval to adopt a module.

Invalid policy or mode values must fail before network access. Do not silently
fall back to `auto`. Policy `not-applicable` is invalid with every adoption mode
except `none`, including `reference-only`.

These flags control discovery, not adoption. The command only writes the
contract-specific research and pattern-pack artifacts; it does not alter the
curated GitHub registry.

Experimental scaffold overrides:

```sh
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --allow-draft-scaffold
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --allow-missing-research
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --allow-pending-external-verification
```

Use these only for explicit experiments, not production descendant readiness.

## Voice Control transport

When the request comes through Pritha Voice Control, child-agent creation and
evolution still use the same Codex task path as a Codex thread. Do not downgrade
voice tasks to read-only just because the transport is voice.

Risky actions are held at a UI decision gate before execution:

- service install/uninstall;
- scheduler, cron, launchd, heartbeat or queue-watcher enablement;
- deployment, publish, release or GitHub push;
- deletion or destructive migration;
- credential or secret writes;
- `danger-full-access` sandbox.

The task card must show Approve and Reject. Approve starts the saved Codex task;
Reject records a terminal rejection. Secret values must be entered through the
child-agent credential UI or local `.env` flow, not spoken into the Realtime
session.

## Pritha lineage vocabulary

- Seed: the user-facing specification for a new agent; technically this remains an `agent-contract`.
- Descendant: a generated child agent project.
- Lineage: the contract, scaffold report, test reports, handoff, operations and post-creation review chain.
- Traits: reusable capabilities and harness patterns proven by lifecycle evidence.
- Inheritance: base safety, memory, tool and operating rules carried into a descendant.
- Mutation: adaptation of inherited rules to the user's specific task and runtime.
- Trial: testing/evaluation before handoff or release.

Do not rename frontmatter `type` values, directories or memory schema as part of Pritha v0.1. The rebrand is a compatibility alias and narrative layer first.

## Default scaffold profile

- Location: sibling folder next to TechScope.
- Runtime: Codex-native project scaffold.
- Interface: project folder and instructions; Telegram optional if selected in the contract.
- Interface adapters: `interfaces/manifest.json`, `interfaces/README.md`, per-adapter notes and `scripts/interface-status.mjs`.
- Memory profile: `memory/manifest.json`, `memory/README.md` and `scripts/memory-status.mjs`.
- Tool profile: `tools/manifest.json`, `tools/README.md` and `scripts/tools-status.mjs`.
- Source of truth: Markdown plus runtime-specific files.
- Memory: start with local Markdown; add database/vector/graph layers only when the contract requires them.
- Safety: no copied secrets, no hidden long-running services, no deployment without explicit confirmation.

## Telegram decision point

Telegram is an interface adapter, not a mandatory property of every agent.

When Telegram is requested, decide whether it is:

- primary chat interface;
- intake/media upload channel;
- notification channel only;
- operator control channel;
- out of scope for v1.

Telegram-enabled agents must include an explicit queue and completion-status replies. User-facing bot responses should summarize the useful result, not expose internal file churn unless requested.

Current scaffold behavior:

- CLI/local status adapter is always generated for maintenance and smoke tests.
- Telegram files are generated only when `Telegram mode` is not `none`.
- Web/API/custom interfaces receive documented placeholders until a dedicated runtime layer is implemented.
- Telegram scaffold includes queue directories, dry-run polling, queue processing and healthcheck commands.

## Memory and tool profiles

Generated agents receive explicit memory and tool manifests:

- `minimal-markdown`: notes only;
- `markdown-first`: notes and decisions;
- `markdown-sqlite`: Markdown plus rebuildable SQLite placeholder;
- `markdown-embeddings`: Markdown plus index and embeddings placeholders;
- `external-or-specialized`: documented external/vector/graph integration placeholder.

Tool profiles are selected from the contract and can include `cli-script`, `workflow`, `mcp-api`, `browser-manual` and `telegram-adapter`.

MCP is an optional connector module, not a default property of every descendant.
When selected, use `04_standards/agent-mcp-connector-lifecycle.md` and
`07_workflows/agent-mcp-connector-selection.md`. External MCP servers should be
recommended, reviewed, scoped and marked for readiness; they should not be
installed silently or exposed with broad toolsets.

A2A is an optional peer-agent communication module, not a default property of
every descendant. When selected, use
`04_standards/agent-a2a-interoperability.md` and
`07_workflows/agent-a2a-communication-selection.md`. A2A should expose only
selected Agent Skills through an adapter layer, with private/direct discovery by
default for sibling agents, explicit trust registry, untrusted-input handling,
auth policy and readiness checks.

## Runtime Placement Decision Point

Every non-trivial agent must decide where each class of inference work runs.
Use:

```text
04_standards/agent-runtime-placement.md
```

Default placement heuristic:

- use deterministic code/scripts for validation, indexing, file movement and
  repeatable non-language work;
- use frontier hosted models or Codex for workflow discovery, coding, complex
  planning, architecture and high-risk analysis;
- use smaller hosted models for bounded structured tasks when local operation is
  not worth the maintenance;
- use local open-weight models for stable, repeated, privacy-sensitive or
  high-volume tasks after eval examples prove quality.

The contract should record task routes, provider fallbacks, budget policy,
privacy routing rules, eval fixtures and route healthchecks. Local inference is
not "free" by default: hardware, power, model quality, operations, fallback and
security costs must be explicit.

Multi-model routing is not mandatory complexity. Add it when the user asks to
use different models for different tasks, or when cost, privacy, latency, risk or
quality requirements make it necessary. Concrete model names, prices and quotas
are only date-stamped candidates; the reusable rule is the placement principle,
and current official docs must be rechecked before scaffold or deployment.

## GitHub Repository Research Decision Point

Repository research is a scoped part of the existing child-agent research gate,
not a package installer. Use it when a contract or pattern-pack seed creates a
real choice among external harness, memory, eval/security or MCP/tool modules.

The contract records:

- `Repository research policy`: `auto`, `required`, `registry-only` or
  `not-applicable`;
- `Repository research topics`: any of `agent-harness`, `agent-memory`,
  `agent-evals`, `mcp-tools`, `agent-skills`, `agent-interface`, `agent-voice`
  and `agent-operations`;
- `Repository research waiver reason` when policy is `not-applicable`;
- `Repository adoption mode`: `none`, `reference-only` or `selected-module`;
- selected repository/module and, for `selected-module`, the exact pin, license
  decision, security review, permission boundary, eval status and user approval.

Unknown scopes and a sentinel mixed with explicit scopes are contract errors and
must fail before any GitHub request without reflecting the raw rejected value.

The generated research review records these machine-readable fields:

```yaml
repository_research_required: true | false
repository_research_policy: auto | required | registry-only | not-applicable
repository_research_mode: auto | online | registry-only | skip
repository_research_status: complete | pending | not-applicable | failed
repository_research_completed_at: ISO-8601 | pending
repository_research_online_status: complete | fixture | failed | registry-only | skipped | not-applicable
repository_research_lock: sha256:... | pending | not-applicable
repository_candidate_count: 0
repository_adoption_status: none | reference-only | pending-review
repository_research_scopes:
  - agent-harness | agent-memory | agent-evals | mcp-tools | agent-skills | agent-interface | agent-voice | agent-operations | not-applicable
external_evidence_count: 0
external_evidence_topics: []
external_research_lock: sha256:... | pending
synthesis_lock: sha256:... | pending
research_content_lock: sha256:... | pending
```

The final synthesis must classify each relationship to current Pritha memory as
`confirms`, `refines`, `contradicts` or `makes-outdated`. Candidate discovery
may complete while adoption remains blocked: a shortlist proves only that
research ran. It does not prove license compatibility, code safety, permissions,
runtime fit or quality.

When repository adoption mode is `reference-only` or `selected-module`, the
locked synthesis payload must also contain
`repository_adoption_recommendation: proceed | hold | reject`. This enum, not
free-form architecture prose, controls scaffold authorization: `proceed` makes
an otherwise complete gate eligible, `hold` keeps it pending, and `reject`
makes the overall gate failed while preserving the completed research record.

For `reference-only`, current external evidence must use adoption decision
`reference-only` and bind to every exact selected canonical repository. Each
authorizing review must pass freshness independently; topic-level coverage from
another review cannot make a stale repository review current.

For a selected module, recheck current repository metadata and primary files,
then select exactly one public repository in the v1 contract. The module must be
a safe repository-relative directory verified as a Git tree at the immutable
commit/tree pin; a file/blob module is not accepted. Verify a module-local
LICENSE or supported manifest under that directory at the same pin and record
its exact GitHub blob URL, Git blob SHA, SHA-256 content identity, safely detected
SPDX and `license_scope: module-local`. A root-only license and GitHub current-HEAD
license metadata are advisory and cannot close this gate. Also record scripts
and dependency-manifest inspection, network/filesystem/secrets permissions,
prompt-injection/supply-chain review, contract-specific evals and explicit user
approval. The external evidence must include a valid
`github-repository-review` topic, and the evidence-to-memory synthesis must be
complete. Until every selected-module field is complete, keep the module
candidate-only and the production scaffold gate pending.
The evidence item must match the contract's canonical repository, module,
immutable pin, license decision, exact permission set, passing eval and explicit
approval; evidence for a different repository cannot close the gate.

Retrieval time alone does not establish freshness. Current evidence must provide
source publication/update dates, or substantive `version_context` and
`temporal_compatibility` plus locked
`temporal_compatibility_status: compatible | incompatible | unknown` when those
dates are unavailable. Only `compatible` may satisfy the version-based freshness
fallback. External narrative is
untrusted: redact sensitive values and quarantine instruction-like content before
coverage or synthesis. `repository_research_lock`, `external_research_lock`,
`synthesis_lock` and the full-document `research_content_lock` must all verify;
the repository payload additionally binds the visible rendered GitHub section.
The generated selected-module manifest must additionally remain a bounded
non-symlink regular file and match its generated SHA-256 plus the verified
`repository_research_lock` during child smoke/health checks.

## Harness Evaluation Decision Point

If a contract considers OpenCode, Pi, Hermes, OpenClaw or another external
harness instead of the Codex-native default, apply:

```text
04_standards/agent-harness-evaluation.md
```

The research step should define a small project-relevant eval pack before
choosing the harness. Exact public benchmark rankings are treated as temporal
evidence, not as a standing rule.

## Sensor and Feedback Design Decision Point

For every non-trivial new agent or material harness change, apply:

```text
04_standards/agent-feedback-sensors-and-evaluation-loops.md
07_workflows/agent-sensor-and-eval-design.md
```

Before accepting the contract, require an explicit sensor map. It must prove
completion from fresh durable state, prevent consequential invalid actions
before tool execution, bound repeated or stalled loops, verify critical side
effects after execution, protect evaluator integrity and name the remaining
human judgment boundary. Small local/manual agents may mark production or
periodic sensors not applicable with reasons, but cannot waive completion
verification, permission checks or bounded execution.

## Agent Team Decision Point

If the user wants one agent to cover multiple durable domains, or if the project
has separate roles, schedules, memories, notification streams or long-running
workers, apply:

```text
04_standards/agent-team-operating-model.md
```

Default is still one focused agent. Split into coordinator/specialists/workers
only when it reduces context/tool sprawl or matches real user workflows.

## Untrusted Input Decision Point

If a new agent reads external messages, email, websites, media transcripts,
uploads, screenshots, repository text or other user-forwarded media, apply:

```text
04_standards/agent-untrusted-input-security.md
```

The contract must explicitly choose:

- external sources that can reach the agent;
- whether raw content can reach the model context;
- whether raw content can update memory;
- per-item token/media/job budget caps;
- quarantine conditions;
- human approval gates;
- scanner model or deterministic validation layer;
- sensitive data that must be excluded from context.

External content must not directly select tools, mutate memory, spend budget or
send/publish data without passing through the chosen intake/security boundary.

## AI-SAFE Security Review Decision Point

For every non-trivial child agent, apply:

```text
04_standards/agent-ai-safe-security-checklist.md
```

The contract should record a layer-by-layer security profile:

- interface/input-output controls;
- reasoning and planning controls;
- knowledge, memory and RAG controls;
- execution, tool, MCP and skill controls;
- infrastructure, operations, scheduling and multi-agent controls.

Use `minimal` only for small local/manual agents with no external input, no
durable memory, no privileged tools, no deployment and no proactivity. Selected
but unready layers must be marked `selected-pending`, `selected-blocked` or
`unknown`, not silently treated as ready.

## Voice Agent Decision Point

If the user wants a voice interface, do not treat the Realtime model as the whole
agent. Start from the active standard:

```text
04_standards/realtime-voice-control-for-codex-agents.md
```

Default voice architecture candidate:

- Realtime model: low-latency speech, concise answers and tool-call dispatch.
- Server tools: deterministic validation, state changes, queueing and approval
  gates.
- Codex App/thread transport: preferred foreground route for complex tasks that
  need Codex context and structured output.
- Codex CLI/queue fallback: worker or fallback route for synthesis,
  verification, media/file work, code changes and background jobs.
- Durable memory: explicit local or external state chosen by the contract.

The contract must still decide:

- whether voice is the primary interface or one adapter among several;
- which model is used for Realtime;
- what tools the voice model can call;
- which actions require confirmation;
- whether heavy work goes through Codex App/thread, contract-file handoff,
  Codex CLI, queue worker, synchronous tools or is disabled;
- how transcripts and media are retained.

## Existing project inspection

Agents Mother can be pointed at an existing project folder. It must classify the folder before proposing changes:

- `techscope-generated-agent`: manifests and generated markers are present;
- `agent-project`: an instruction surface such as `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` exists;
- `project-with-agent-signals`: some adapter/script signals exist, but the harness is incomplete;
- `project-without-agent-harness`: no meaningful agent harness found.

For existing projects, do not modify files during `test`. Create an `agent-test-report` and use it to discuss whether to add an agent contract or improve the existing harness.

## Handoff

Use `handoff` after scaffold or project inspection to create a user-facing operation guide. The handoff report should explain:

- how to start and test the agent;
- which secrets must be configured in `.env`;
- what is ready now;
- what is not ready or risky;
- the first user exercise;
- which layer should be improved next.

## Operations and service readiness

Generated agents must make service behavior explicit even when they are not services yet:

- `operations/manifest.json` records deployment target, deployment profile, service mode, autostart mode, proactivity model, start/stop commands, healthcheck and log path.
- `scripts/operations-status.mjs` prints the current operations profile.
- `scripts/deploy-service.mjs` automates deployment plan, status, install and uninstall.
- `launchd` support is generated only as a template when the contract selects `launchd` or `launchd-on-approval`.
- Scaffold, test, handoff and operations inspection must not start long-running processes or install autostart.
- Autostart is configurable, not globally forbidden: use `disabled` by default, then `optional`, `launchd-on-approval` or `external` only after the user explicitly chooses it.
- Deployment mutations require `--yes` and produce an `agent-deployment-report`.
- Before scaffold, ask where the agent will actually be deployed: local Mac, Mac mini, VPS, cloud, embedded/user device, external runtime or nowhere yet.
- Before scaffold, ask whether the agent should be proactive: none/manual, scheduled chrono/cron, heartbeat/pulse, event-driven webhook, queue watcher or hybrid.
- If any proactive mode other than `none` or `manual` is selected, apply
  `04_standards/agent-proactivity-scheduling.md`: record scheduler owner,
  schedule/timezone, concurrency policy, missed-run policy, retry/backoff,
  memory write policy, monitoring, alert channel and kill switch before
  scaffold marks operations ready.
- Do not add a background pulse, queue watcher, scheduler or notification loop unless the contract explicitly selects it.

Use:

```sh
node scripts/agents-mother.mjs operations <agent-path>
node scripts/agents-mother.mjs deploy <agent-path> plan
node scripts/agents-mother.mjs deploy <agent-path> status
node scripts/agents-mother.mjs deploy <agent-path> install --yes
node scripts/agents-mother.mjs deploy <agent-path> uninstall --yes
```

This creates `agent-operations-report` and `agent-deployment-report` artifacts in `11_agents/reports/`.

## Feedback and evolution

After an agent has lifecycle evidence, create a post-creation review and update the registry:

```sh
node scripts/agents-mother.mjs evolve <agent-path> --notes "what changed after real use"
node scripts/agents-mother.mjs registry
```

For a concrete improvement request, create an agent-development task brief
before implementation:

```sh
node scripts/pritha.mjs improve <agent-path> --task "describe the desired change"
```

This writes a development task and a pattern pack, then Codex App/CLI can use
that brief to implement the smallest verified change after required
current-source enrichment.

The post-creation review must separate:

- useful scaffold patterns;
- failed assumptions;
- reusable standard candidates;
- outdated or risky patterns.

For every agent that reaches a meaningful working version, also preserve the
interaction path with the user. This can be a dedicated
`agent-user-interaction-review`-style report using `type:
agent-post-creation-review`, or a clearly labeled section inside the
post-creation review for small agents. It must capture:

- the initial user request;
- clarifying prompts and answers;
- important user corrections;
- UX/product decisions discovered during real testing;
- assumptions that changed;
- reusable interaction patterns for future Agents Mother runs.

Do not promote a pattern into `04_standards/` from one lucky run. Promotion needs evidence from lifecycle reports and an explicit review/decision.

The realtime voice-control standard is active as of 2026-05-29 because FESPA26
and Funny Teacher confirm the shared boundary in two domains. Keep it
version-bound: recheck when Realtime APIs, Codex App transport or Codex CLI
sandbox behavior changes.

## Completion criteria

An Agents Mother run is complete only when:

- an `agent-contract` exists and validates;
- a separate `agent-outcome-spec` exists, validates, has independent approval
  evidence and has a content lock that still matches;
- every core outcome and required deliverable has executable Trial coverage,
  with safety and recovery coverage where applicable;
- the selected architecture is grounded in TechScope memory, a pattern-pack
  artifact and current sources;
- any contract-relevant GitHub shortlist is recorded as advisory evidence, and
  every selected repository module has passed exact-pin, license, security,
  permission, eval, `github-repository-review`, synthesis and
  explicit-user-approval gates;
- a working scaffold exists in the chosen folder, but is not mistaken for the
  final result;
- the delivery ledger is either terminal or contains exactly one actionable
  next step or a non-empty typed blocker list;
- all required Trials pass against the exact verified commit after the final
  checkpoint, or a typed blocker states what decision or authority is missing;
- machine verification and user acceptance remain separate lifecycle states;
- the contract's sensor map covers completion verification, consequential
  actions, loop bounds, critical side effects, protected eval evidence,
  balanced metrics and human judgment boundaries;
- environment setup instructions are present;
- smoke tests or healthchecks pass, or failures are documented;
- the user has a short handoff guide explaining how to run and test the new agent;
- post-creation lessons are captured when the agent has meaningful lifecycle evidence.
- the user interaction/revision path is captured after the first successful working version.

## Non-goals for v1

- Universal generator for every agent platform.
- Automatic deployment.
- Automatic secret provisioning.
- Copying TechScope internals 1:1 into every new agent.
- Treating Telegram as mandatory.

## Roadmap

See `07_workflows/agents-mother-roadmap.md` for the full layered implementation roadmap.
