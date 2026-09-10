---
id: 2026-06-22-pritha-child-agent-external-research-gate-implementation-plan
type: workflow
status: draft
created: 2026-06-22
updated: 2026-06-22
topics:
  - pritha
  - child-agents
  - external-research
  - memory-research
  - voice-control
  - last30days
  - scaffold-gate
tools:
  - Codex
  - Node.js
  - SQLite
  - Git
  - last30days-skill
  - Python
agent_platforms:
  - Codex
model_context:
  - codex-desktop
runtime_environment:
  - macOS
  - local-project
  - codex-native
config_surfaces:
  - scripts/agents-mother/index.mjs
  - scripts/agents-mother/scaffold/index.mjs
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - 08_templates/agent-project-contract.md
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
portability: codex-native
sources:
  - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-untrusted-input-security.md
  - 08_templates/agent-project-contract.md
  - https://github.com/mvanhorn/last30days-skill
  - https://github.com/mvanhorn/last30days-skill/blob/main/CHANGELOG.md
  - https://github.com/mvanhorn/last30days-skill/issues/487
  - https://github.com/mvanhorn/last30days-skill/issues/513
  - https://github.com/mvanhorn/last30days-skill/issues/573
  - https://github.com/mvanhorn/last30days-skill/issues/641
related:
  reviews:
    - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: last30days main inspected at commit 9f77d3ac314d95052c6718d2605f934c24a9ee0a on 2026-06-22
source_updated: 2026-06-22
source_version: implementation plan v1
retrieved: 2026-06-22
verified: 2026-06-22
valid_for: Pritha child-agent creation harness before implementing external research gate
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - governance
subject:
  kind: workflow
  id: child-agent-external-research-gate
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Coding Implementation Plan: Child-Agent External Research Gate

Date: 2026-06-22
Status: draft
Owner: Pritha / Codex

## Objective

Make every non-experimental Pritha child-agent scaffold pass a real research
gate before project generation:

1. Search Pritha memory for relevant patterns, standards, limitations and prior
   child-agent evidence.
2. Run a fresh external research check for volatile technologies, APIs,
   runtimes, interfaces, models, security constraints and integration risks.
3. Compare external evidence against Pritha memory.
4. Write a durable research artifact with machine-readable gate status.
5. Block scaffold unless the gate is complete or explicitly marked
   not-applicable for a narrow test fixture.

The same rule must apply whether the request starts in a Codex thread, CLI,
Control Center, or Pritha Voice Control.

## Decisions Confirmed

- `last30days-skill` is optional, pinned by commit, and not vendored into the
  Pritha repository in phase 1.
- Python 3.12+ is optional for the `last30days` backend only. It is not a
  required Pritha runtime dependency.
- Phase 1 external sources are free/keyless plus Codex web research. No X
  cookies, paid APIs, ScrapeCreators, Perplexity, secret-backed providers, or
  outbound delivery.
- Voice may start public read-only research inside an approved `agent_creation`
  Codex task. Paid providers, credential use, delivery, deployment, services,
  deletion and broad system changes remain UI approval-gated.
- Canonical child-agent research output lives in `11_agents/research/`.
  Significant reusable findings may additionally become `03_reviews/` or
  `01_sources/signals/`.

## Current Baseline

Observed local implementation:

- `scripts/agents-mother/index.mjs` has `research <contract>`, local FTS memory
  search, domain-aware search and a generated external verification checklist.
- `scripts/agents-mother/scaffold/index.mjs` requires a research report before
  scaffold, but current external verification status is inferred from loose
  text in the contract/research body.
- `interfaces/control-center/src/lib/realtime/pritha-runtime.ts` already routes
  voice child-agent creation through `run_codex_task` with
  `task_type=agent_creation`.
- The voice task runtime already adds the sibling-agent parent as writable for
  agent creation and holds workspace-write tasks behind the existing approval
  gate.
- `08_templates/agent-project-contract.md` already has fields for Pritha memory
  research and current-docs verification, but they are not yet a strict evidence
  schema.

Observed local runtime:

- `node` exists and is current enough for Pritha local scripts.
- `sqlite3` exists.
- Host `python3` is 3.9.6.
- `python3.12`, `python3.13`, `uv`, `go` and the optional
  platform-specific media downloader binary were not found.
- Therefore `last30days-skill` cannot run on this host until an optional Python
  3.12+ runtime is installed or configured.

Observed `last30days-skill` context:

- Repo inspected at commit `9f77d3ac314d95052c6718d2605f934c24a9ee0a`.
- `SKILL.md`, `.claude-plugin/plugin.json` and `pyproject.toml` report version
  `3.8.0`.
- Latest GitHub release observed was behind the repo version, so pin by commit,
  not by "latest release".
- The CLI supports `--emit=json`, `--quick`, `--diagnose`, `--search`,
  `--days`, `--as-of` and optional `--save-dir`/`--store`.
- External issues show useful caution areas: source adapter breakage, structured
  JSON integration needs, security/install warnings, `.env` permissions,
  scheduled delivery friction, and social-rank/off-topic noise.

## Non-Goals

- Do not globally install the `last30days` skill into Claude/Codex/other agent
  environments.
- Do not vendor the 37 MB external repository into Pritha in phase 1.
- Do not add cron, launchd, heartbeat, queue watcher, scheduled briefs or
  background internet polling.
- Do not use secret-backed providers by default.
- Do not store raw social/media outputs as canonical Pritha knowledge.
- Do not make `last30days` success the only way to create child agents.
- Do not change existing child-agent projects unless a later task explicitly
  requests migration.

## Safety Invariants

- Existing dirty worktree content must not be reverted.
- New code must be additive or narrowly scoped.
- Scaffold must fail closed when required research status is missing, pending,
  stale or malformed.
- Test fixtures must pass through explicit `not-applicable`, not accidental
  free-text matching.
- External data is untrusted input. It can influence recommendations only after
  synthesis and source attribution.
- Raw external cache is ignored or local-private. Curated summaries are tracked.
- Any mutating install/update command for external tools requires explicit
  `--yes`.
- No `.env`, credentials, cookies, auth tokens, private memory, queues, logs or
  secret values may enter child scaffolds or tracked research artifacts.

## Target Data Model

Add a strict research gate block to child-agent research reports.

Preferred frontmatter fields:

```yaml
research_gate_status: complete | pending | not-applicable | failed
memory_research_status: complete | pending | not-applicable | failed
external_research_status: complete | pending | not-applicable | failed
external_research_backend: codex-web | last30days | manual | none
external_research_completed_at: YYYY-MM-DDTHH:mm:ssZ | pending
external_research_freshness_window_days: 30
external_research_lock:
  tool: last30days-skill
  repo: https://github.com/mvanhorn/last30days-skill
  commit: 9f77d3ac314d95052c6718d2605f934c24a9ee0a
  version: "3.8.0"
external_research_topics:
  - topic: OpenAI Realtime API model and session behavior
    reason: voice interface selected
    required: true
    status: complete
synthesis_status: complete | pending | not-applicable | failed
```

Add required sections:

- `## Research Gate Status`
- `## Local Memory Evidence`
- `## External Research Topics`
- `## External Research Evidence`
- `## Memory vs External Comparison`
- `## Architecture Recommendation`
- `## Scaffold Gate Decision`

The scaffold gate must use frontmatter/status parsing, not regex matching over
the whole Markdown body.

## Implementation Phases

### Phase 0: Preflight Snapshot

Goal: record the current state before any code edit.

Commands:

```sh
git status --short
node scripts/validate-memory.mjs
node --test --test-concurrency=1 tests/agents-mother-contract.test.mjs tests/scaffold-snapshot.test.mjs tests/pritha-voice-control.test.mjs tests/control-center-codex-safety.test.mjs tests/control-center-codex-planning.test.mjs
```

Expected:

- No unrelated files are reverted.
- Memory validation passes.
- Existing targeted tests pass or failures are recorded before edits.

Rollback:

- No file changes in this phase.

### Phase 1: Add Research Gate Status Helpers

Goal: create deterministic status parsing and reduce loose text matching.

Files:

- `scripts/agents-mother/research-gate.mjs`
- `scripts/agents-mother/scaffold/index.mjs`
- `tests/agents-mother-research-gate.test.mjs`
- `tests/scaffold-snapshot.test.mjs`

Code changes:

1. Add `research-gate.mjs` with pure helpers:
   - `parseResearchGateFrontmatter(text)`
   - `normalizeResearchGateStatus(value)`
   - `researchGateStatusForReport(text)`
   - `researchGateStatusForContractAndReport(contractData, reportText)`
   - `isExternalResearchNotApplicable(contractData, report)`
   - `isScaffoldResearchGateComplete(contractData, report)`
2. Modify `researchReportStatus(data)` in scaffold path to return:
   - `status`
   - `path`
   - `frontmatter`
   - `gate`
3. Replace current `externalVerificationStatus(data)` implementation with a
   strict check based on the newest matching research report.
4. Keep `--allow-missing-research` and `--allow-pending-external-verification`,
   but only as explicit experimental overrides.
5. In scaffold report, print the parsed gate fields, not an inferred text
   status.

Tests:

- Report with `external_research_status: pending` blocks scaffold.
- Report with no research gate block blocks scaffold.
- Report with `external_research_status: complete`,
  `memory_research_status: complete`, `synthesis_status: complete` passes.
- Fixture report with `external_research_status: not-applicable` passes only
  when contract says `External verification needs: none for fixture` or
  `Current-docs verification required: no-with-reason`.
- The previous text-only fixture no longer passes accidentally.

Verification:

```sh
node --test --test-concurrency=1 tests/agents-mother-research-gate.test.mjs tests/scaffold-snapshot.test.mjs
node scripts/validate-memory.mjs
```

Rollback:

- Revert only `research-gate.mjs` imports and scaffold gate edits.

### Phase 2: Extend Research Report Generation

Goal: make `node scripts/pritha.mjs research <contract>` write a real gate
report skeleton every time.

Files:

- `scripts/agents-mother/index.mjs`
- `scripts/agents-mother/external-research-topics.mjs`
- `tests/agents-mother-research-topics.test.mjs`
- `08_templates/agent-project-contract.md`
- `07_workflows/agents-mother.md`

Code changes:

1. Add `external-research-topics.mjs` with pure topic derivation:
   - runtime docs topic when runtime is API, hybrid, local-model or
     environment-specific;
   - model/API topic when Realtime, OpenAI, Agents SDK, embeddings,
     transcription or external hosted models are selected;
   - interface topic for Telegram, web, API, realtime voice or MCP;
   - deployment/security topic for services, launchd, cron, VPS, cloud,
     external messaging, untrusted input or credentials;
   - package/version topic for declared dependencies.
2. Update `researchMarkdown(...)` to include:
   - frontmatter gate fields;
   - derived external research topics;
   - explicit pending evidence section;
   - memory vs external comparison placeholder;
   - scaffold gate decision.
3. If no volatile topics are detected and contract explicitly says current docs
   are not applicable, set `external_research_status: not-applicable`.
4. Otherwise default `external_research_status: pending`.
5. Mark `memory_research_status: complete` only when local and domain memory
   searches actually ran and produced the report.
6. Mark `synthesis_status: pending` until external evidence exists.

Template updates:

- Add fields:
  - `External research policy: required | not-applicable | skipped-by-user`
  - `External research backend: codex-web | last30days | manual | none`
  - `External research report:`
  - `External research status: pending | complete | not-applicable | failed`
  - `External research topics:`
- Update acceptance checklist to require the external evidence gate, not only
  current primary docs as free text.

Tests:

- Valid fixture contract derives no required external topics when marked fixture
  only.
- Voice/realtime contract derives Realtime/OpenAI/current-docs topics.
- Telegram contract derives Telegram Bot API/security topics.
- Local-model contract derives runtime/license/hardware topics.
- Generated research report contains frontmatter gate fields.

Verification:

```sh
node --test --test-concurrency=1 tests/agents-mother-research-topics.test.mjs tests/agents-mother-contract.test.mjs
node scripts/pritha.mjs research tests/fixtures/contracts/valid-agent-contract.md --limit 4
node scripts/validate-memory.mjs
```

Cleanup:

- If the research command creates a fixture research file in the real repo
  during development, remove only that newly created test artifact before final
  handoff, or run it under a temp `TECHSCOPE_ROOT`.

### Phase 3: Add Optional External Research Backend Interface

Goal: allow external evidence to be produced by `last30days`, Codex web/manual
research, or a future backend without changing scaffold rules.

Files:

- `scripts/agents-mother/external-research.mjs`
- `scripts/agents-mother/index.mjs`
- `tests/agents-mother-external-research.test.mjs`

Code changes:

1. Add backend-independent evidence types:
   - `topic`
   - `query`
   - `backend`
   - `source_url`
   - `source_type`
   - `source_published`
   - `source_updated`
   - `retrieved_at`
   - `claim`
   - `evidence_summary`
   - `risk_note`
   - `confidence`
2. Add `summarizeExternalEvidence(evidence, memoryFindings)` that produces:
   - confirmations;
   - contradictions;
   - updates/staleness risks;
   - unresolved questions;
   - architecture implications.
3. Add a command shape:

```sh
node scripts/pritha.mjs external-research <contract> --backend last30days
node scripts/pritha.mjs external-research <contract> --backend manual --input <json>
node scripts/pritha.mjs external-research <contract> --backend status
```

4. For phase 1, `manual --input` is enough for Codex web research results. The
   Codex task can browse, write a bounded JSON evidence file, then ingest it.
5. `external-research` updates or creates the matching `11_agents/research/...`
   artifact with:
   - `external_research_status: complete` only when required topics have at
     least one acceptable source or an explicit unresolved blocker;
   - `synthesis_status: complete` only after comparison text is written;
   - `research_gate_status: complete` only when memory, external and synthesis
     are complete or not-applicable.

Tests:

- Manual evidence JSON can update a research report to complete.
- Empty evidence cannot mark complete.
- Evidence with source errors produces `failed` or `pending`, not `complete`.
- Evidence for only one of multiple required topics leaves gate pending.
- Output redacts common token/cookie patterns.

Verification:

```sh
node --test --test-concurrency=1 tests/agents-mother-external-research.test.mjs tests/agents-mother-research-gate.test.mjs
node scripts/validate-memory.mjs
```

### Phase 4: Add `last30days` Tool Manager

Goal: support optional pinned installs without vendoring or global skill
mutation.

Files:

- `scripts/external-research-tools.mjs`
- `tools/external-research/last30days-lock.json`
- `.gitignore`
- `tests/external-research-tools.test.mjs`

Lock file:

```json
{
  "tools": {
    "last30days": {
      "repo": "https://github.com/mvanhorn/last30days-skill",
      "commit": "9f77d3ac314d95052c6718d2605f934c24a9ee0a",
      "version": "3.8.0",
      "python": ">=3.12",
      "installed_path": ".cache/pritha-tools/last30days-skill/9f77d3ac314d95052c6718d2605f934c24a9ee0a"
    }
  }
}
```

Commands:

```sh
node scripts/external-research-tools.mjs status
node scripts/external-research-tools.mjs install last30days --yes
node scripts/external-research-tools.mjs update last30days --commit <commit> --yes
node scripts/external-research-tools.mjs diagnose last30days
```

Implementation details:

- `status` is read-only.
- `install` and `update` require `--yes`.
- Install target is `.cache/pritha-tools/...`, ignored by Git.
- Do not call `npx skills add -g`.
- Do not write into `$HOME/.claude`, `$HOME/.codex`, global plugin caches, or
  any agent runtime cache.
- Detect `LAST30DAYS_PYTHON`, `python3.13`, `python3.12`.
- If Python 3.12+ is missing, status is `pending-runtime`, not a Pritha failure.
- `diagnose` runs only with sanitized environment and no secret providers.

Sanitized environment:

- Clear or do not pass `AUTH_TOKEN`, `CT0`, `SCRAPECREATORS_API_KEY`,
  `PERPLEXITY_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `APIFY_API_TOKEN`,
  `BRAVE_API_KEY`, `SERPER_API_KEY`, `PARALLEL_API_KEY`, `BSKY_APP_PASSWORD`,
  `TRUTHSOCIAL_TOKEN`.
- Pass `LAST30DAYS_CONFIG_DIR=""`.
- Pass `LAST30DAYS_MEMORY_DIR=""` unless the user explicitly chooses a local
  cache.
- Pass `LAST30DAYS_STORE=""` unless a later operations decision selects a
  research staging database.

Tests:

- Missing Python 3.12 returns `pending-runtime`.
- `install` without `--yes` fails before mutation.
- Lock file is read and validated.
- Env sanitizer removes secret-like keys.
- Status command does not create directories.

Verification:

```sh
node --test --test-concurrency=1 tests/external-research-tools.test.mjs
node scripts/external-research-tools.mjs status
node scripts/validate-memory.mjs
```

### Phase 5: Wire `last30days` as One Backend

Goal: let the external research gate use `last30days` when available, while
keeping fallback paths.

Files:

- `scripts/agents-mother/external-research-last30days.mjs`
- `scripts/agents-mother/external-research.mjs`
- `tests/agents-mother-last30days-backend.test.mjs`

Command pattern:

```sh
<python3.12+> <last30days>/skills/last30days/scripts/last30days.py \
  "<topic query>" \
  --emit=json \
  --quick \
  --days 30 \
  --as-of 2026-06-22 \
  --search github,hackernews,reddit,grounding
```

Implementation details:

- Source allowlist is phase-1 conservative and may be adjusted after
  `--diagnose`.
- Unknown or unavailable source names must degrade per source, not mark the
  whole gate complete.
- Parse JSON defensively:
  - accept known fields like `items_by_source`, `errors_by_source`,
    `query_plan`;
  - tolerate missing fields;
  - record raw source counts and errors;
  - extract URLs/titles/snippets only when present.
- Do not trust engagement rank as truth. The synthesis must describe social
  signals as "reported discussion/sentiment", not factual confirmation.
- A successful process with zero useful evidence is `pending`, not `complete`.
- Save raw JSON only to ignored cache, or store a bounded redacted excerpt in
  the research artifact.

Tests:

- Mocked last30days JSON maps into generic evidence rows.
- Mocked `errors_by_source` appears in research risks.
- Zero findings cannot complete a required topic.
- Backend timeout leaves gate pending with a clear next action.
- Secret-looking strings in JSON are redacted before writing Markdown.

Verification:

```sh
node --test --test-concurrency=1 tests/agents-mother-last30days-backend.test.mjs tests/agents-mother-external-research.test.mjs
node scripts/external-research-tools.mjs status
```

Manual smoke when Python 3.12+ is available:

```sh
node scripts/external-research-tools.mjs install last30days --yes
node scripts/external-research-tools.mjs diagnose last30days
node scripts/pritha.mjs external-research 11_agents/contracts/<contract>.md --backend last30days
```

### Phase 6: Make Scaffold Gate Mandatory

Goal: guarantee no production child-agent scaffold bypasses memory plus external
research.

Files:

- `scripts/agents-mother/scaffold/index.mjs`
- `tests/scaffold-snapshot.test.mjs`
- `tests/agents-mother-research-gate.test.mjs`
- `08_templates/agent-scaffold-report.md`

Code changes:

1. Scaffold reads latest matching research report.
2. It requires:
   - `memory_research_status: complete` or `not-applicable`;
   - `external_research_status: complete` or `not-applicable`;
   - `synthesis_status: complete` or `not-applicable`;
   - `research_gate_status: complete` or `not-applicable`.
3. It rejects:
   - missing research report;
   - pending external evidence;
   - stale evidence outside freshness window;
   - malformed gate status;
   - report that belongs to another contract/agent.
4. `--allow-pending-external-verification` remains, but scaffold report must
   record it as an experimental override with the exact flag.
5. Scaffold report includes a `Research Gate` verification table.

Tests:

- Production scaffold fails without gate-complete report.
- Experimental override still works and logs warning.
- Report for another agent does not satisfy gate.
- Fresh complete report satisfies gate.
- Not-applicable fixture satisfies gate only for fixture contract.

Verification:

```sh
node --test --test-concurrency=1 tests/scaffold-snapshot.test.mjs tests/agents-mother-research-gate.test.mjs
```

### Phase 7: Wire Voice Control Agent-Creation Instructions

Goal: make voice-originated child-agent creation use the same gate.

Files:

- `interfaces/control-center/src/lib/realtime/pritha-runtime.ts`
- `tests/control-center-codex-planning.test.mjs`
- `tests/control-center-codex-safety.test.mjs`
- `tests/pritha-voice-control.test.mjs`

Code changes:

1. Update realtime instructions:
   - when creating a child agent, Codex must create/validate a contract;
   - run Pritha memory research;
   - run fresh external research for volatile details;
   - compare external evidence with memory;
   - scaffold only after gate complete.
2. Add `agent_creation_research_gate` to task payload when
   `task_type=agent_creation`:

```json
{
  "required": true,
  "memory_domains": ["agent-building-knowledge", "pritha-self", "child-agents"],
  "external_research": {
    "required": true,
    "preferred_backends": ["codex-web", "last30days", "manual"],
    "free_keyless_only_by_default": true,
    "no_secret_backends_without_ui_approval": true
  },
  "scaffold_blocker": "research_gate_status must be complete or not-applicable"
}
```

3. Keep the existing workspace-write UI approval gate.
4. Do not add a new voice tool for web search in phase 1. Voice delegates deep
   research to Codex task, which can browse or use configured external backend.
5. When a task asks for paid providers, cookies, delivery, deployment or
   service setup, existing approval reasons should hold the task.

Tests:

- Realtime instructions mention the mandatory research gate.
- Agent-creation task payload includes `agent_creation_research_gate`.
- Agent-creation still gets workspace-write gate.
- Non-agent implementation tasks do not get the child-agent gate payload.
- Voice queue writes only private ignored task state.

Verification:

```sh
node --test --test-concurrency=1 tests/pritha-voice-control.test.mjs tests/control-center-codex-safety.test.mjs tests/control-center-codex-planning.test.mjs
```

### Phase 8: Add Recurring Topic Watchlist Without Scheduler

Goal: support regular research topics manually first, without background
automation.

Files:

- `11_agents/research/external-research-watchlist.md`
- `scripts/agents-mother/external-watchlist.mjs`
- `tests/agents-mother-external-watchlist.test.mjs`

Initial watchlist topics:

- Codex and AGENTS.md behavior.
- OpenAI Realtime API and realtime voice model behavior.
- OpenAI Agents SDK and tool/handoff/guardrail changes.
- MCP and MCP Apps/connector security.
- Agent skill/plugin lifecycle and installation security.
- Local agent deployment patterns on macOS.
- Child-agent memory/RAG/storage patterns.
- Voice-Control + Codex deep-task transport patterns.
- last30days-skill itself as optional external research backend.

Commands:

```sh
node scripts/pritha.mjs external-watchlist list
node scripts/pritha.mjs external-watchlist plan
node scripts/pritha.mjs external-watchlist run --topic <id> --backend codex-web
node scripts/pritha.mjs external-watchlist run --topic <id> --backend last30days
```

Rules:

- No cron/launchd/heartbeat in this phase.
- `run` is manual.
- Results are drafts until reviewed.
- Significant findings become `03_reviews/` or `01_sources/signals/`.
- The watchlist does not replace child-agent contract-specific research.

Tests:

- Watchlist parser validates topics.
- `plan` is read-only.
- `run` without backend availability leaves a pending report.
- No scheduler files are created.

Verification:

```sh
node --test --test-concurrency=1 tests/agents-mother-external-watchlist.test.mjs
node scripts/pritha.mjs external-watchlist plan
```

### Phase 9: Documentation and Standards Update

Goal: make the rule durable for future Pritha work.

Files:

- `07_workflows/agents-mother.md`
- `04_standards/agent-creation-harness.md`
- `04_standards/agent-untrusted-input-security.md`
- `08_templates/agent-project-contract.md`
- `08_templates/agent-scaffold-report.md`
- `README.md` if user-facing command examples change

Required wording:

- Child-agent scaffold requires Pritha memory research and external evidence
  gate.
- External sources are untrusted.
- Official docs and primary sources come first for APIs/runtime/model choices.
- Community/social sources are signals, not ground truth.
- `last30days` is an optional backend, not canonical memory.
- Raw external outputs are staging; curated Markdown is durable memory.
- Voice Control routes child-agent creation to Codex with the same gate.

Verification:

```sh
rg -n "external research|research gate|last30days|Current-docs verification|Pritha memory research" 07_workflows 04_standards 08_templates README.md
node scripts/validate-memory.mjs
```

### Phase 10: Final Test Matrix

Run targeted tests:

```sh
node --test --test-concurrency=1 \
  tests/agents-mother-contract.test.mjs \
  tests/agents-mother-research-gate.test.mjs \
  tests/agents-mother-research-topics.test.mjs \
  tests/agents-mother-external-research.test.mjs \
  tests/agents-mother-last30days-backend.test.mjs \
  tests/scaffold-snapshot.test.mjs \
  tests/pritha-voice-control.test.mjs \
  tests/control-center-codex-safety.test.mjs \
  tests/control-center-codex-planning.test.mjs
```

Run broader health checks:

```sh
node scripts/validate-memory.mjs
node scripts/self-test.mjs
```

Run optional backend checks:

```sh
node scripts/external-research-tools.mjs status
node scripts/external-research-tools.mjs diagnose last30days
```

Do not run:

- `launchctl`
- `cron`/`crontab`
- service install/uninstall
- deployment/publish
- global skill install
- paid provider calls

## Acceptance Criteria

- A normal child-agent scaffold cannot proceed from only a contract and a loose
  checklist.
- `node scripts/pritha.mjs research <contract>` creates a research artifact with
  explicit gate fields.
- Scaffold reads gate fields and fails closed when they are pending/missing.
- Voice-originated `agent_creation` tasks carry the same gate requirement.
- `last30days` can be detected and optionally installed by pinned commit, but
  missing Python 3.12+ does not break Pritha.
- Tests cover pending, complete, failed and not-applicable gate states.
- No background automation or secret-backed provider is introduced.
- Memory validation passes after Markdown changes.

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Loose text still satisfies scaffold gate | Use frontmatter/status parser, not body regex. |
| External backend unavailable | Gate remains pending with clear next command; Codex web/manual path can satisfy evidence. |
| `last30days` source adapters return empty data silently | Record per-source errors/counts and do not mark complete on zero useful evidence. |
| Secret leakage from external tool env | Sanitize env and redact output before writing Markdown. |
| Raw social data pollutes canonical memory | Store only curated evidence summaries and source links in tracked artifacts. |
| Voice bypasses CLI scaffold gate | Put requirement in voice task payload and keep scaffold server-side check authoritative. |
| Test fixtures become over-constrained | Use explicit not-applicable gate fixture with reason. |
| Future scheduler added accidentally | Keep watchlist manual; scheduler needs separate operations/deployment report and explicit user approval. |

## Suggested Implementation Order

1. Phase 1 gate parser and scaffold fail-closed tests.
2. Phase 2 research report frontmatter/topics.
3. Phase 3 backend-independent external evidence ingest.
4. Phase 7 voice payload/instructions, because it depends only on gate semantics.
5. Phase 4 optional tool manager.
6. Phase 5 last30days backend adapter.
7. Phase 8 manual watchlist.
8. Phase 9 docs/standards.
9. Phase 10 final tests.

This order gives the strongest safety improvement first: even before
`last30days` works locally, scaffold stops trusting loose external-verification
phrases.

## First Coding Task

Implement Phase 1 only:

- add `scripts/agents-mother/research-gate.mjs`;
- update scaffold to use strict research gate status;
- update scaffold tests with explicit complete/pending/not-applicable fixtures;
- run targeted tests and `node scripts/validate-memory.mjs`.

Do not install `last30days` or change voice runtime in the first coding task.
