---
id: pritha-good-state-alignment
type: standard
status: active
created: 2026-07-02
updated: 2026-07-02
last_reviewed: 2026-07-02
owner: Pritha
topics:
  - pritha
  - good-state-baseline
  - baseline-alignment
  - change-management
  - regression-prevention
tools:
  - Pritha
  - Codex
  - Git
  - SQLite
  - Node.js
  - Realtime Voice Control
sources:
  - source-pritha-good-state-alignment-2026-07-02
related:
  workflows:
    - 07_workflows/pritha-good-state-baseline.md
  templates:
    - 08_templates/pritha-good-state-baseline-report.md
  reports:
    - 11_agents/reports/2026-07-02-pritha-good-state-baseline-voice-ducking-control-centers.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-02
source_updated: 2026-07-02
source_version: pritha-good-state-alignment-v1
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha change planning and regression prevention
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
  - agent-building-knowledge
subject:
  kind: standard
  id: pritha-good-state-alignment
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Standard: Pritha Good State Alignment

Date: 2026-07-02
Status: active

## Purpose

Use accepted Good State Baseline reports as near-term guardrails when changing
Pritha, child-agent scaffolds, runtime behavior, interfaces, memory, operations
or agent harness code. The goal is to prevent accidental regressions without
turning normal development into a stream of operator confirmations.

## Core Rule

Before implementing or committing a Pritha-related change, perform a
proportionate alignment check against recent accepted Good State Baseline
reports for the affected scope.

Default depth is the latest 3 relevant accepted baselines. Expand beyond that
only when the change is unusually broad, the operator asks for deeper history,
or a regression symptom clearly points to an older accepted state.

Good State acceptance signals can arrive through a Codex thread or through
browser Realtime Voice Control. Voice signals do not need fixed trigger
phrases. If the operator clearly praises, accepts, loves, approves or wants to
preserve the current state, the voice runtime should call the narrow
`record_good_state_signal` tool and create a private voice-confirmed alignment
signal. That capture is part of Good State Alignment. It is intentionally not a
tracked Git baseline unless the operator separately asks for a durable Git/tag
recovery point.

## Alignment Procedure

1. Name the affected scope:
   - Pritha overall;
   - a clone such as JKL, Dasha or Sasha;
   - a child-agent harness or template;
   - a surface such as Voice Control, Agents, Tailscale, memory, Control
     Center, A2A, operations or deployment.
2. Retrieve recent relevant accepted baselines:

```sh
node scripts/good-state-alignment.mjs --scope "<affected surface>" --limit 3
```

3. Read the baseline fields that define expected behavior:
   - `Accepted Behavior`;
   - `Protected Baseline Invariants`, when present;
   - `Regression Signals`;
   - `Known Acceptable Warnings`;
   - `Recovery Notes`.
4. Classify the proposed change:
   - `aligned`: preserves the baseline or extends it without weakening it;
   - `no-relevant-baseline`: no recent accepted baseline covers this scope;
   - `needs-user-confirmation`: materially conflicts with a relevant baseline.
5. Proceed without interrupting the operator for `aligned` and
   `no-relevant-baseline` changes.
6. Pause for explicit operator confirmation only for
   `needs-user-confirmation`.

## Confirmation Gate

Ask the operator before changing files or runtime state when the proposed
change would materially conflict with a recent accepted baseline. A material
conflict includes:

- removing or disabling accepted user-visible behavior;
- replacing a smooth/working behavior with a less capable mode;
- weakening a privacy, security, secret-handling or Tailscale guardrail;
- changing runtime placement, ports, process ownership, stop/start semantics or
  access assumptions that the baseline marked as accepted;
- bypassing or deleting tests/checks that made the baseline trustworthy;
- storing runtime/private state in tracked Git artifacts;
- making the Git tag or recovery path unusable.

The confirmation request must include:

- the baseline report and tag being contradicted;
- the concrete accepted behavior or invariant at risk;
- why the conflict may be necessary;
- the fallback or recovery plan;
- the checks that will prove the new behavior is acceptable.

## No-Confirmation Cases

Do not ask the operator for confirmation when the change:

- preserves accepted behavior and only changes implementation details;
- adds tests, documentation, reports or memory artifacts;
- adds a new capability while keeping the baseline path intact;
- fixes a bug that the baseline already names as a regression signal;
- updates generated indexes or rebuildable local memory;
- touches an unrelated scope with no relevant recent baseline.

These changes still need the alignment check, but the check can be summarized
as `aligned` or `no-relevant-baseline`.

## Proportionality

For tiny documentation or isolated test changes, a light alignment check is
enough: identify scope and confirm no recent baseline is relevant.

For feature, UI, voice, Agents, Tailscale, memory, operations, deployment or
child-agent harness changes, run the helper command and inspect the returned
baseline sections before editing.

For broad changes across clones, runtime control, process lifecycle, access
rules, privacy or scaffolding standards, run the helper command for each major
scope and include the alignment result in the implementation summary.

## Superseding A Baseline

An accepted baseline can be intentionally superseded, but only after explicit
operator confirmation of the material conflict. The follow-up work must record
the decision in a durable Markdown artifact and, once the new behavior is
accepted, create a new Good State Baseline tag/report.

Do not silently treat an old baseline as obsolete because a newer change was
implemented. A baseline becomes obsolete only through an explicit decision,
superseding artifact or a newer accepted baseline for the same scope.

## Voice Capture

Realtime Voice Control may directly record a Good State signal through
`record_good_state_signal`.

The tool is intentionally narrow:

- it writes a private voice-confirmed signal under the Control Center runtime
  state;
- it captures scope, sanitized operator signal, current Git anchor and recent
  alignment snapshot;
- it does not write tracked Markdown;
- it does not create a commit, tag or GitHub push;
- it does not start a Codex task by itself.

No separate UI approval is required for the private voice signal. If the
operator later asks for a durable Git recovery point, use the full Good State
Baseline workflow: review the signal, run proportionate checks, create the
tracked baseline report, commit, tag, push and rebuild memory.

## Privacy

Good State Alignment must not cause private or runtime state to be copied into
tracked memory. Use placeholders for private endpoints and refer to local setup
state only as an untracked source.
