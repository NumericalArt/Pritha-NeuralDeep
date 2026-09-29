# Changelog

All notable changes to this project will be documented in this file.

The format follows Keep a Changelog, and this project uses semantic versioning for public releases.

## [0.2.0] — 2026-09-29

Agent creation from the Control Center now reaches a verified, runnable child
agent, with host-owned checks and an explicit operator decision at every stop.

### Added

- Task Chat → New child agent runs a durable host-operated preparation: model
  interview and brief, contract, model-authored Outcome Spec, source research
  and scaffold, each with its own approval and bounded budget.
- Generic `llm-operation-v1` verifier for LLM web agents: model call through the
  Pritha binding, saved results, export, provider failures, a missing binding,
  recovery and restart persistence.
- Instance NeuralDeep binding for child agents: a scoped broker capability,
  60-second calls, 4096-token responses and an operator decision for a request
  whose usage stayed unknown.
- Host checks during delivery: an idle build turn is followed up in the same
  attempt, scripts that do not parse and servers that do not start are reported
  to the next turn, and a managed process agent must pass its scaffold lifecycle
  test (Start, /health, Stop) before adoption.
- Managed Start passes a declared `.state/data` directory as `PRITHA_DATA_DIR`;
  new process agents get a free local port from 3010.

### Changed

- Creation limits doubled (default 2,000,000 tokens, 180 active minutes and 12
  build iterations). Continue grows an exhausted budget, settles unknown usage
  at its upper bound and never leaves a job dead-ended.
- Provider rejections such as 504 are retried; a build turn stopped by the token
  budget after changing the project is verified before the run stops.
- Per-model execution profiles size output caps to the provider's 15-minute
  response window (Gemma 4 build responses: 8,192 tokens).
- Dependencies: sentence-transformers 6.1.0, zod 4.6.5, GitHub Actions v7.
- AGENTS.md is shorter; raw intake material is separated from the platform.

### Fixed

- NeuralDeep Responses streams: a terminal snapshot that re-issues item IDs,
  trims streamed text or omits whitespace-only messages no longer loses or
  duplicates tool calls, and a response cut at its output limit is recorded.
- Research keeps relevant passages by masking credential-shaped text instead of
  dropping them, and retries a curated primary source after a transient failure.
- CI no longer reads the local instance pointer; verified checkpoints are
  committed with Pritha's machine identity.

## [0.1.0] — 2026-09-10

First standalone Pritha NeuralDeep distribution, synchronized with the completed
NeuralDeep Search and runtime work.

- Complete Control Center and curated engineering knowledge; fresh private state.
- Tool-neutral ZIP installation with isolated storage and local links.
- NeuralDeep Voice, Kimi task model and Auto Search defaults.
- One bundled agent: Brief Desk ND, with offline demo, provider settings and
  Telegram setup/checks. Publication requires explicit approval.
- No source workspace conversations, credentials or other agents' live records.

## Source history

The entries below describe inherited platform work; they are not prior releases
of this standalone distribution.

## NeuralDeep roadmap implementation

These source changes are being verified in the ND implementation worktree.
The installed build and completed release are recorded separately in
`07_workflows/2026-09-08-neuraldeep-roadmap-execution.md`.

### Added

- Durable admission, immutable request receipts, shared Task Chat/Voice ownership,
  exact-session queues and owned CLI process-tree shutdown.
- Complete private history with bounded pages, full originals, archive/copy,
  signed cursors, independent drafts and shared background summary events.
- Original attachment storage with exact model/path capability evidence.
- Isolated execution worktrees, resource claims and initial/resume sandbox checks.
- Same-run budget amendments, preserved unknown usage and overshoot, host
  verification and protected Trials before delivery handoff.
- Selected child scaffold modules, child `npm test` and API lifecycle fixtures.

### Changed

- Bounded diagnostics, instance-local memory setup and explicit unavailable/busy
  memory status; legacy launchd requirements are evaluated by applicability.
- Identical CLI helpers are shared; unused internal exports are reduced.
- Russian orientation, source-history changelog and UI design document location.

## [NeuralDeep local releases] — 2026-09-01 to 2026-09-06

This is a source-history summary, not a new semantic-version release.

- Persisted Voice topics, shared admission and exact CLI exec/resume bindings
  (`92b211b`, `7e56cf9`, `e442bbd`).
- Added account, billing and usage diagnostics (`c5424ab`) and retained Task Chat
  history/settings improvements (`e8be0aa`).
- Added pinned local staged releases with verified rollback (`07c234b`) and
  canonical filesystem invocation (`28cc130`).
- Adopted the accepted graphite palette and three appearance themes
  (`ce88ae0`, `a3820b5`); consolidated local release evidence in `31b438e`.

## [Source milestones] — 2026-08

- Added NeuralDeep transport and isolated Codex CLI integration (`5a79c10`,
  `178abd7`).
- Hardened runtime adoption and Control Center runtime handling (`120eceb`,
  `4cd6795`), bounded access probes (`66c9bfb`, `93613d3`) and isolated self-test
  health checks (`bfe7c65`).
- Improved Task Chat scrolling and dictation language (`6fdbca5`); preserved
  mutable chat state during rollout (`c91bf41`).
- Added delivery goal/budget enforcement and runtime readiness checks
  (`88b2cdc`, `c1ccf68`). ND now adapts those contracts to its CLI-only runtime.

## [0.1.0] - 2026-05-28

### Added

- Pritha alias-first CLI (`scripts/pritha.mjs`).
- Agents Mother compatibility shim.
- Modular Agents Mother lifecycle modules.
- Quality gate, golden checks and self-test pulse.
- English open-source documentation pack.

### Changed

- Public product identity is now Pritha.
- Markdown remains the source of truth; generated memory indexes remain rebuildable.
