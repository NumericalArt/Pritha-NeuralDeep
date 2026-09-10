---
id: neuraldeep-large-history-adaptation
type: brief
status: implemented
created: 2026-09-08
updated: 2026-09-08
topics: [neuraldeep, task-chat, large-history, audit]
tools: [Pritha, Codex CLI, NeuralDeep]
sources: [docs/neuraldeep-task-chat-adaptation.md, docs/task-chat-large-history.md]
related:
  workflows: [07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: workflow
  id: neuraldeep-large-history-adaptation
privacy: public
retention: durable
review_status: reviewed
confidence: medium
source_version: "Historical baseline 8307bec; implementation and local release a0fb828fb85f5778e08f23a21e65f5aa99e06e07"
verified: 2026-09-08
---

# Separate adaptation for NeuralDeep and CLI audit

> Реализация завершена и выпущена в ND 2026-09-08: [отчёт, версии и проверки](neuraldeep-roadmap-release-2026-09-08.md).
> Исходная инвентаризация ниже описывает baseline до реализации; она не является текущим списком открытых дефектов. CLI-only архитектура и capability gates сохранены.

This document is an implementation instruction for the isolated NeuralDeep
checkout. The canonical Pritha patch does not change that checkout or its
services. Preserve the `neuraldeep_cli` profile and provider. Do not substitute
the desktop app-server or copy canonical Pritha state into this instance.

## Establish the durable source first

At the inspected revision, NeuralDeep runs CLI exec/resume and keeps normalized
turns in its private binding; `safeTurns`/upsert bounds that collection at 200.
Pagination over this bounded collection cannot recover older discarded turns.
Before adding a paginated browser API, identify and test the durable complete
source: an existing native rollout readable by the selected CLI, or a new
append-only instance-private event store. A migration must not fabricate missing
history. Mark already unavailable history explicitly and retain existing IDs,
receipts, archive flags and resume bindings.

Do not rewrite active native JSONL files or load the entire private registry
for each page. Prefer an indexed projection with a stable sequence/offset and
per-turn item records, rebuilt from the durable source. Keep it under the
instance's own `PRITHA_STATE_ROOT`, outside tracked knowledge.

## Implement the browser read contract

Port the bounded history API contract and UI behavior from
`docs/task-chat-large-history.md`, not the canonical app-server transport.
Provide latest 20 turns, activity pages of 40 items, 256 KiB page envelopes and
64 KiB original text chunks. Scope cursors to the NeuralDeep instance, provider,
source generation and chat. Preserve pagination during appends, reject expired
positions explicitly, and keep already displayed text on errors.

Use incremental/streaming reads of the durable source, coalesce identical reads,
cap memory caches, and keep read-only history work separate from CLI execution.
A history timeout must never spawn `exec`, `resume`, or a second audit job.
Reuse the existing audit execution/idempotency policy for actual task requests.

## CLI audit is a separate consumer

A headless audit does not pay the browser's multi-megabyte JSON transfer or DOM
rendering cost. It can still suffer from whole-log parsing, memory growth,
context assembly and truncated input. Read the source as a stream or bounded
pages; maintain explicit completeness and cursor/checkpoint metadata. Select
relevant evidence for the model separately from preserving the full durable
transcript. A model context limit does not justify silently dropping evidence.

Keep audit continuation and transcript pagination independent. The native CLI's
own resume performance is controlled by that CLI version; a Pritha web patch
cannot promise to change it. Verify the chosen binary/profile and its actual
resume behavior with a disposable audit fixture before deployment.

## Acceptance and rollout

Test over 10,000 turns, one turn with thousands of commands, a message over
10 MiB with Unicode, archive/restore, source append during pagination, read
failure, process restart, and full response copy. For headless audit, require
bounded memory growth, a complete source count/digest, explicit gaps if the
legacy 200-turn cap already lost data, and no duplicate audit execution on
retry. Repeat instance isolation and profile checks.

Prepare the migration/rebuild and rollback strategy in a separate reviewed
patch. Only then apply the managed deployment workflow with that instance's
separate lifecycle approval. No fleet rollout is implied by this document.
