---
id: agents-mother-roadmap
type: workflow
status: active
created: 2026-05-18
updated: 2026-07-13
topics:
  - agent-engineering
  - agent-factory
  - roadmap
  - harness-engineering
  - codex
tools:
  - Codex
  - AGENTS.md
  - Telegram
  - CLI
  - OpenAI Agents SDK
  - SQLite
sources:
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
  - 01_sources/registries/github-agent-building-repos.md
  - 01_sources/signals/2026-06-28-open-source-agent-building-repos-signal.md
  - 03_reviews/2026-06-28-open-source-agent-building-repos-review.md
related:
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/memory-indexing.md
  templates:
    - 08_templates/agent-project-contract.md
    - 08_templates/agent-scaffold-report.md
    - 08_templates/agent-operations-report.md
    - 08_templates/github-source-registry-entry.md
supersedes: []
superseded_by: []
---

# Roadmap: Agents Mother

Status: active
Owner: TechScope/user
Started: 2026-05-18

## Goal

Build TechScope into a full agent creation environment: it should interview the user, design a new agent, validate the architecture against TechScope memory and current sources, generate a working sibling project, test it, hand it off, and feed the results back into TechScope knowledge.

Default target: production-testable agents, not paper-only specifications.

## Layer 1: Governance and Contract Layer

Status: done

Purpose: make agent creation a governed TechScope workflow, not an ad hoc prompt.

Deliverables:

- Workflow `07_workflows/agents-mother.md`.
- Standard `04_standards/agent-creation-harness.md`.
- Template `08_templates/agent-project-contract.md`.
- Template `08_templates/agent-scaffold-report.md`.
- `AGENTS.md` rules for creating new agents.
- Memory validator/indexer support for `agent-contract` and `scaffold-report`.

Acceptance criteria:

- TechScope knows that new agents must start from an `agent-contract`.
- Telegram is defined as an optional interface adapter, not a mandatory feature.
- Contracts and scaffold reports are indexed into memory.

## Layer 2: Interview and Specification Layer

Status: done

Purpose: turn a fuzzy user idea into a decision-complete agent contract.

Deliverables:

- `scripts/agents-mother.mjs interview` command.
- Guided staged interview:
  - purpose and target user;
  - v1 core functions and deferred functions;
  - runtime family;
  - interface choices, including Telegram;
  - data, tools, memory, permissions and secrets;
  - acceptance tests and training plan.
- Draft contract writer that creates an `agent-contract` from the template.
- Contract validator for required decisions.
- `scripts/agents-mother.mjs init`, `questions`, `validate` and `list` commands.

Acceptance criteria:

- A user can describe an agent conversationally and receive a complete contract file.
- The contract explicitly says whether Telegram is `none`, `primary-chat`, `intake-channel`, `notifications-only` or `operator-control`.
- Missing high-impact decisions are reported before scaffold begins.

## Layer 3: Research and Architecture Validation Layer

Status: done

Purpose: prevent TechScope from generating stale or poorly grounded agent architectures.

Deliverables:

- `scripts/agents-mother.mjs research <contract>` command.
- Local memory retrieval:
  - related standards;
  - related reviews/briefs;
  - prior agent contracts;
  - prior scaffold reports;
  - relevant wiki pages if present.
- Internet verification checklist for volatile topics:
  - official docs first;
  - changelogs/releases when tool behavior matters;
  - trusted secondary sources only as support;
  - publication/update dates recorded.
- Contract-aware GitHub repository research:
  - contract policy: `auto`, `required`, `registry-only` or `not-applicable`;
  - capability scopes: `agent-harness`, `agent-memory`, `agent-evals`,
    `mcp-tools`, `agent-skills`, `agent-interface`, `agent-voice` and
    `agent-operations`;
  - curated registry searched before bounded online discovery;
  - online shortlist limited to 5 candidates by default and 10 at most;
  - explicitly selected repositories preserved within the hard maximum of 10;
  - duplicate repository URLs merged into one advisory candidate;
  - online results never mutate the curated registry automatically.
- Research-only trust boundary: discovery may read bounded repository metadata but
  never clones, installs, executes, vendors, links, activates or registers code.
- Separate repository adoption decision: `none`, `reference-only` or
  `selected-module`.
- Architecture recommendation section added to the contract or a linked review.
- Research reports saved in `11_agents/research/`.

Acceptance criteria:

- Before scaffold, TechScope can show which sources and internal artifacts justify the architecture.
- Platform-specific ideas are classified as `codex-native`, `portable`, `adapter-needed` or `environment-specific`.
- Stale or unverified claims cannot silently become scaffold defaults.
- Repository research records its policy, mode, status, online status, scopes,
  candidate count, adoption status, completion time and evidence locks.
- `candidate` and `accepted-for-review` repositories remain advisory and cannot
  silently become dependencies or scaffold defaults.
- A `selected-module` cannot pass the scaffold gate until the contract records
  the exact repository and directory module, immutable pin and module tree SHA,
  pin-bound module-local license URL/blob SHA/content SHA-256/detected SPDX,
  compatible license decision, security review, required permissions, eval
  result, current exact `github-repository-review` evidence, completed synthesis
  and explicit user approval.
- `reference-only` requires current evidence for every exact canonical selected
  repository and never authorizes code use.
- Retrieval time alone cannot prove source freshness, and quarantined external
  instructions cannot satisfy evidence or synthesis.
- Repository payload, visible rendered section, external evidence, synthesis and
  the full research document are integrity locked.

## Layer 4: Scaffold Generation Layer

Status: done

Purpose: create working agent projects in neighboring folders.

Deliverables:

- `scripts/agents-mother.mjs scaffold <contract>` command.
- Default profile: `codex-native`.
- Optional profile: `codex-native + telegram`.
- Generated minimum structure:
  - `AGENTS.md`;
  - `README.md`;
  - `.env.example`;
  - workflow notes;
  - scripts or entrypoints;
  - smoke test or healthcheck;
  - user training guide.
- Scaffold report generated after creation.
- Scaffold refuses to write into non-empty target folders.
- Smoke test runs immediately after generation.

Acceptance criteria:

- A sibling folder can be generated from an accepted contract.
- The generated agent can be opened immediately in Codex.
- No TechScope secrets or `.env` values are copied.
- The scaffold report records what was created, what passed and what remains open.

## Layer 5: Interface Adapter Layer

Status: done

Purpose: make interfaces modular so each new agent gets only the channels it needs.

Deliverables:

- Telegram adapter scaffold:
  - `.env.example` variables for token and allowed users;
  - incoming message queue;
  - text/link/media routing;
  - concise human-readable replies;
  - processing log;
  - healthcheck.
- CLI adapter scaffold:
  - command entrypoint;
  - help output;
  - local config handling.
- Interface manifest and per-adapter docs.
- Web/API/custom adapters as documented placeholders until their runtime is explicitly designed.
- Telegram dry-run queue flow for scaffold verification without real token.

Acceptance criteria:

- Telegram can be selected or omitted per agent contract.
- Telegram agents have a queue and completion-status replies by default.
- Non-Telegram agents are not polluted with Telegram-specific files.
- Every scaffold has `interfaces/manifest.json` and `scripts/interface-status.mjs`.

## Layer 6: Tool, Memory and Knowledge Layer

Status: done

Purpose: give generated agents an appropriate memory and tool surface instead of blindly copying TechScope.

Deliverables:

- Memory profiles:
  - minimal Markdown;
  - Markdown + SQLite index;
  - Markdown + embeddings;
  - external/vector/graph only when justified.
- Tool profiles:
  - local CLI/scripts;
  - skills/workflows;
  - MCP/API;
  - browser/manual verification.
- Project-specific `AGENTS.md` generator that keeps instructions concise.
- `memory/manifest.json`, `tools/manifest.json`, `scripts/memory-status.mjs` and `scripts/tools-status.mjs`.

Acceptance criteria:

- Each generated agent has a documented memory model and tool boundary.
- Heavy memory/search infrastructure is added only when the contract requires it.
- Tool choices follow `agent-tool-integration-selection`.
- Scaffold smoke test verifies memory/tool manifests exist.

## Layer 7: Test, Eval and Observability Layer

Status: done

Purpose: make every generated agent immediately testable.

Deliverables:

- `scripts/agents-mother.mjs test <agent-path>` command.
- Existing project inspection and classification:
  - `techscope-generated-agent`;
  - `agent-project`;
  - `project-with-agent-signals`;
  - `project-without-agent-harness`.
- Standard smoke tests:
  - structure validation;
  - environment file check;
  - command/help check;
  - healthcheck;
  - Telegram adapter dry test when selected.
- Scaffold report updates with pass/fail results.
- `agent-test-report` for generated or existing projects.
- Logging conventions for generated agents.

Acceptance criteria:

- A generated agent is not considered handed off until tests run.
- Failures are recorded with next actions.
- User can reproduce the first test locally.
- Existing projects can be inspected without mutation before deciding whether to add or improve an agent harness.

## Layer 8: Handoff and User Training Layer

Status: done

Purpose: make the new agent usable by the user immediately after creation.

Deliverables:

- `scripts/agents-mother.mjs handoff <agent-path>` command.
- Generated handoff guide:
  - how to start;
  - how to stop;
  - how to configure secrets;
  - how to run tests;
  - first exercise;
  - troubleshooting notes.
- Optional interactive training session in the new agent folder.
- `agent-handoff-report` generated in TechScope reports.

Acceptance criteria:

- User can run the new agent without reading TechScope internals.
- The first user exercise proves the main v1 function works.
- Handoff distinguishes ready features from deferred features.
- Existing projects without harness get a handoff that points back to agent-contract creation rather than pretending they are ready.

## Layer 9: Operations and Service Layer

Status: done

Purpose: support agents that need to live as services.

Deliverables:

- Launch profile for Mac mini/local service.
- Optional `launchd` template generated only when the contract selects `launchd` or `launchd-on-approval`.
- Log paths and rotation notes.
- Healthcheck and restart instructions.
- Deployment/deactivation checklist.
- `operations/manifest.json`, `operations/README.md` and `scripts/operations-status.mjs` in generated scaffolds.
- Deployment target/profile and proactivity model captured in each agent contract.
- `scripts/agents-mother.mjs operations <agent-path>` command.
- `scripts/deploy-service.mjs` in generated scaffolds with `plan`, `status`, `install`, `uninstall`.
- `scripts/agents-mother.mjs deploy <agent-path> plan|status|install|uninstall [--yes]` orchestration command.
- `agent-operations-report` generated in TechScope reports.
- `agent-deployment-report` generated in TechScope reports.

Acceptance criteria:

- Service agents can be started/stopped predictably.
- Long-running processes are explicit and documented.
- Autostart is configurable through the contract: default `disabled`, optional `launchd-on-approval` or `external`.
- No service starts and no autostart is installed without explicit user confirmation.
- Deployment plan/status are read-only; install/uninstall require `--yes`.
- Each agent explicitly answers where it will be deployed and whether it has scheduler, heartbeat, pulse, webhook or queue-watcher behavior.

## Layer 10: Feedback and Evolution Layer

Status: done

Purpose: make every created agent improve TechScope's future agent-building ability.

Deliverables:

- Agent registry in TechScope memory.
- Contract/report indexing.
- Post-creation review template.
- `scripts/agents-mother.mjs evolve <agent-path>` command.
- `scripts/agents-mother.mjs registry` command.
- Lessons learned section:
  - useful scaffold patterns;
  - failed assumptions;
  - reusable standards;
  - outdated patterns.
- Promotion path from successful agent patterns to standards.

Acceptance criteria:

- TechScope can answer which agents were created, why, how, and with which outcomes.
- Reusable patterns become standards only after evidence.
- Deprecated or failed patterns remain visible but marked.

## Implementation order

1. Done: create governance layer, standard, workflow and templates.
2. Done: implement `agents-mother.mjs interview` and contract validation.
3. Done: implement `agents-mother.mjs research` using local memory, current-source
   verification and contract-aware, registry-first GitHub repository discovery.
4. Done: implement `agents-mother.mjs scaffold` for `codex-native`.
5. Done: add modular interface adapter layer with optional Telegram scaffold profile.
6. Done: implement memory and tool profiles in generated scaffolds.
7. Done: implement `agents-mother.mjs test` and agent-test-report generation.
8. Done: implement `agents-mother.mjs handoff` and agent-handoff-report generation.
9. Done: add service/launchd profile, operations manifest, deployment automation, configurable autostart policy and operations/deployment reports.
10. Done: add agent registry and post-creation feedback loop.

## Current default decisions

- New agents are created as sibling folders by default.
- First runtime target is `codex-native`.
- Telegram is optional and selected per contract.
- First generated agents should be working and testable immediately.
- TechScope Markdown remains the source of truth.
- Generated project files must not include TechScope secrets.
- Autostart defaults to `disabled`, but can be explicitly configured per agent contract.
- Repository discovery defaults to contract policy `auto`; its shortlist is
  advisory and does not authorize code adoption.

## Open questions

- Should the first created external agent use Telegram as primary interface or only as optional future adapter?
- Should the first scaffold include SQLite/embeddings memory or start with Markdown-only memory?
- For the first external agent, should service mode remain `disabled/manual` until core behavior is proven, or should we prepare `launchd-on-approval` from the start?
