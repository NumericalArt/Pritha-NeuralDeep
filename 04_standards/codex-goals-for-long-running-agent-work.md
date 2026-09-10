---
id: codex-goals-for-long-running-agent-work
type: standard
status: draft
created: 2026-05-21
updated: 2026-06-20
last_reviewed: 2026-06-20
owner: Techscope/user
topics:
  - codex
  - goals
  - agent-harness
  - long-running-work
  - evidence-based-completion
tools:
  - Codex
  - Codex Goals
  - AGENTS.md
agent_platforms:
  - Codex
model_context:
  - Codex app and CLI builds supporting Goals
runtime_environment:
  - codex-desktop
  - codex-cli
config_surfaces:
  - thread goal state
  - AGENTS.md
  - workflows
portability: codex-native
sources:
  - 00_inbox/links/2026-05-21-openai-codex-goals-intake.md
  - 01_sources/notes/2026-06-20-openai-codex-goals-source-note.md
  - 03_reviews/2026-05-21-openai-codex-goals-assessment.md
  - https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
  - https://developers.openai.com/codex/codex-manual.md
  - https://github.com/openai/openai-cookbook/commit/9b4e6279edd4dceb6b4b7da582482a7c882f7544
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-21-openai-codex-goals-assessment.md
  source_notes:
    - 01_sources/notes/2026-06-20-openai-codex-goals-source-note.md
  briefs: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-09
source_updated: 2026-05-13
source_version: OpenAI Cookbook page published 2026-05-09; source notebook commit 9b4e6279edd4dceb6b4b7da582482a7c882f7544 on 2026-05-13; Codex manual fetched 2026-06-20; Codex Goals available from Codex 0.128.0 according to source
retrieved: 2026-05-21
verified: 2026-06-20
valid_for: Techscope Codex workflows on builds supporting Goals from 0.128.0 onward and current Codex app/IDE/CLI Goal mode docs checked on 2026-06-20
temporal_status: current
---

# Standard: Codex Goals for long-running agent work

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-20

## Rule

Use Codex Goals for long-running Codex work when the desired outcome is clear, evidence can verify completion, and the path to completion may require several turns of investigation or repair.

A Goal is not a bigger prompt. It is a thread-scoped completion contract: outcome, evidence, constraints, boundaries, iteration policy and blocked stop condition.

Goal state belongs to the active Codex thread. It is not global memory, not a replacement for `AGENTS.md`, and not a project-level standing instruction.

## Use when

- building or upgrading an agent with Agents Mother;
- processing a multi-step media/source backlog;
- running benchmark-driven or test-driven optimization;
- debugging flaky tests or uncertain failures;
- performing a research audit that must separate confirmed, partial, blocked and uncertain claims;
- executing a migration where correctness must be checked by tests, docs, generated artifacts or command output;
- continuing until a queue, checklist or verification report is actually complete.

## Avoid when

- the request is a one-line edit;
- the user asks a simple question;
- the task has no verifiable finish line;
- the evidence source is unavailable and no proxy evidence standard is defined;
- the work needs fresh user decisions at each step;
- the Codex build does not support Goals.
- the operating contract is longer than `/goal` should carry directly; put long instructions in a file and point the Goal at it.

## Command surface and scope

- Use `/goal <objective>` to set the current thread's Goal.
- Use `/goal` to view the current Goal.
- Use `/goal pause`, `/goal resume` and `/goal clear` to manage lifecycle from the CLI command surface.
- In the Codex app, use the Goal progress controls above the composer when available.
- If `/goal` is not visible, official Codex docs currently document `features.goals` in `config.toml` and `codex features enable goals` as enablement paths.
- Goal objectives must be non-empty and, in the current CLI docs, no longer than 4,000 characters.
- Use `/plan` first when the outcome needs shaping before activating a Goal.

## Required Goal shape

Every Techscope Goal should include:

- outcome: what must be true when done;
- verification surface: command, test, benchmark, report, artifact or source material proving completion;
- constraints: what must not regress or be changed;
- boundaries: allowed files, tools, repositories, sources and data;
- iteration policy: how Codex should choose the next action after each result;
- blocked stop condition: when to stop and what evidence/blocker to report.

Recommended template:

```text
/goal <desired end state>, verified by <specific evidence>, while preserving <constraints>.
Use only <allowed files/tools/sources/boundaries>.
Between iterations, record <what changed, what evidence showed, and next best action>.
If blocked or no valid paths remain, stop with <attempted paths, evidence gathered, blocker, and next input needed>.
```

## Techscope examples

### Agents Mother implementation

```text
/goal Create a working agent project from the approved contract, verified by passing lint/tests/build/smoke and a handoff report, while preserving Techscope source-of-truth rules and not copying secrets. Use only the target sibling folder, official docs, existing Techscope standards and approved local tools. Between iterations, record completed layer, failed check and next fix. If blocked, stop with the blocker, evidence and exact user input needed.
```

### FESPA26 queue cleanup

```text
/goal Process the FESPA26 queued jobs until queuedJobs, runningJobs and failedJobs are all zero or every blocker is documented, verified by /api/fespa/feed counts and SQLite job status queries. Preserve existing reviewed cards and do not publish externally. Between iterations, process the next oldest job, inspect failures and retry only when the cause is understood. If blocked, report the failed job ids, errors and next required input.
```

### Research-to-standard audit

```text
/goal Produce an evidence-backed assessment and draft standard for the supplied source, verified by Markdown artifacts passing Techscope validation and citations to official/current sources. Preserve source/raw distinction and mark uncertain claims explicitly. Between iterations, compare against existing standards and update only when justified. If blocked, report missing evidence and what source would unlock the decision.
```

## Relationship to AGENTS.md and workflows

- `AGENTS.md` defines standing project rules.
- Workflows define repeatable project procedures.
- A Goal defines the current thread's completion contract.
- A Goal must not override project safety rules, source-of-truth rules or tool permissions.

## Completion rule

Do not mark a Goal complete because the output looks plausible. Completion requires evidence from the named verification surface:

- passing tests;
- benchmark output;
- successful build;
- database/API state;
- generated artifact;
- source-linked report;
- explicit blocker report when completion is impossible under current constraints.

## Temporal validity

- Source published: 2026-05-09.
- Source updated: 2026-05-13.
- Source version: OpenAI Cookbook page published 2026-05-09; source notebook commit `9b4e6279edd4dceb6b4b7da582482a7c882f7544` on 2026-05-13; Codex manual fetched 2026-06-20; Codex Goals available from Codex 0.128.0 according to source.
- Retrieved: 2026-05-21.
- Verified: 2026-06-20.
- Valid for: Techscope Codex workflows on builds supporting Goals from 0.128.0 onward and current Codex app/IDE/CLI Goal mode docs checked on 2026-06-20.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Codex changes Goal command syntax, lifecycle behavior, budget handling, continuation policy or availability in app/CLI.

## Related artifacts

- `00_inbox/links/2026-05-21-openai-codex-goals-intake.md`
- `01_sources/notes/2026-06-20-openai-codex-goals-source-note.md`
- `03_reviews/2026-05-21-openai-codex-goals-assessment.md`
- `04_standards/agent-creation-harness.md`
