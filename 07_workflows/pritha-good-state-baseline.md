---
id: pritha-good-state-baseline
type: workflow
status: active
created: 2026-07-02
updated: 2026-07-02
topics:
  - pritha
  - good-state-baseline
  - baseline-alignment
  - git
  - memory
  - regression-recovery
tools:
  - Pritha
  - Codex
  - Git
  - GitHub
  - Node.js
sources:
  - source-pritha-good-state-baseline-protocol-2026-07-02
related:
  templates:
    - 08_templates/pritha-good-state-baseline-report.md
  reports:
    - 11_agents/reports/2026-07-02-pritha-good-state-baseline-voice-ducking-control-centers.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/pritha-self-model.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-02
source_updated: 2026-07-02
source_version: pritha-good-state-baseline-v2
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha accepted-state capture and future regression recovery
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
  - agent-building-knowledge
subject:
  kind: workflow
  id: pritha-good-state-baseline
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Workflow: Pritha Good State Baseline

Date: 2026-07-02
Status: active

## Purpose

Capture moments when the operator accepts the current Pritha or child-agent
state as especially good, correct or desirable. The baseline should make that
state searchable in memory and recoverable through Git without storing private
runtime state. Accepted baselines also become near-term alignment guardrails
for future changes.

## Trigger

Use this workflow when the operator says a variant of:

- "this is the Pritha we wanted";
- "this works exactly as needed";
- "great, keep this";
- "fix/record this state";
- "everything works now";
- "this configuration is good";
- "зафиксируем это состояние";
- "это то, что нам нужно".

These examples are not a fixed phrase list. Any clear positive acceptance
signal counts, including informal praise or affectionate wording, when the
meaning is that the current state is good and worth preserving.

The trigger can apply to all of Pritha, one clone, one child agent, one UI
surface or a focused feature.

When the trigger arrives through browser Realtime Voice Control, first use
`record_good_state_signal`. That creates a private voice-confirmed Good State
Alignment signal and runs a bounded alignment lookup without starting Codex. Do
not tell the operator that a separate UI approval is required for this private
signal. Continue to the full tracked Git/tag baseline capture procedure only
when the operator explicitly asks for a durable recovery point.

## Capture Procedure

1. Identify the accepted scope:
   - Pritha overall;
   - one or more Pritha clones;
   - one child agent;
   - a feature surface such as Voice Control, Agents, Tailscale or memory.
2. Record the recent work cycle:
   - what changed;
   - which commits are relevant;
   - which user-visible behavior is now accepted;
   - which problems were fixed.
3. Run proportionate checks:
   - at minimum `git status --short`;
   - focused tests for the accepted feature;
   - `node scripts/validate-memory.mjs` when adding memory artifacts;
   - `node scripts/privacy-audit.mjs --strict` before commit;
   - relevant UI health or build checks when the accepted state is a UI/runtime state.
4. Create a tracked Markdown report using
   `08_templates/pritha-good-state-baseline-report.md`.
5. Keep private runtime state out of the report:
   - no secrets;
   - no `.env` values;
   - no raw Tailscale URLs or tailnet identifiers;
   - no `.private`, `.memory-private`, `.logs`, `.queue`, `.snapshots` contents.
6. Commit the report and any supporting workflow/template changes.
7. Create an annotated tag:
   - format: `pritha-good-state-YYYY-MM-DD-short-title`;
   - message: one-line accepted state and the report path.
8. Push the commit and tag unless the operator explicitly asks not to publish.
9. Rebuild local memory indexes so keyword and semantic search can find the
   baseline.

## Alignment Use Before Future Changes

Before future Pritha development, use recent accepted baselines as guardrails
according to `04_standards/pritha-good-state-alignment.md`.

Default lookup depth is the latest 3 relevant accepted baseline reports for the
affected scope:

```sh
node scripts/good-state-alignment.mjs --scope "<affected surface>" --limit 3
```

Classify the planned change:

- `aligned`: the change preserves or extends accepted behavior;
- `no-relevant-baseline`: no recent accepted baseline covers the scope;
- `needs-user-confirmation`: the change materially conflicts with accepted
  behavior, protected invariants, privacy/runtime guardrails, recovery notes or
  regression signals from a relevant baseline.

Proceed without operator interruption for `aligned` and `no-relevant-baseline`.
Ask for explicit confirmation only for `needs-user-confirmation`, and include
the baseline report, tag, conflicting invariant, reason, fallback plan and
verification checks.

## Report Contents

Each baseline report must include:

- accepted scope;
- operator acceptance signal;
- Git branch, tag and relevant commits;
- recent work summary;
- accepted behavior;
- protected baseline invariants or future alignment notes, when useful;
- checks and results;
- known acceptable warnings;
- private/runtime exclusions;
- regression signals;
- recovery notes.

## Recovery Use

When a future change breaks behavior, search memory for:

- `good-state-baseline`;
- the affected surface, for example `voice music ducking`;
- the child agent or clone name;
- the git tag name.

Then compare the current code and behavior against the baseline report and use
the tag as a complete or partial recovery anchor.
