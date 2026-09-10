---
id: 2026-08-22-outcome-delivery-remediation-execution-preparation
type: workflow
status: implemented-awaiting-release
created: 2026-08-22
updated: 2026-08-22
topics:
  - outcome-driven-delivery
  - remediation
  - execution-plan
  - privacy
  - evidence-integrity
tools:
  - Git
  - Codex App Server
sources:
  - operator-provided-remediation-plan-2026-08-21
  - 03_reviews/2026-08-22-outcome-delivery-remediation-plan-applicability-assessment.md
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  workflows:
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
memory_domain: agent-engineering
subject:
  kind: workflow
  id: outcome-driven-agent-delivery
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_published: 2026-08-21
source_updated: 2026-08-21
source_version: audited execution preparation for the complete operator-provided plan
retrieved: 2026-08-22
verified: 2026-08-22
valid_for: Pritha remediation branch based on d115c2d and Codex CLI 0.135.0
temporal_status: current
---

# Outcome Delivery Remediation: Execution Preparation

## Goal

Implement the applicable remediation items without modifying unrelated local
work, weakening existing privacy boundaries, invalidating historical evidence
without a migration path, or deleting uncommitted delivery work.

## Prerequisites Applied

1. Separate the current unrelated dirty changes through their own reviewed
   workflow. Do not reset, stash, rename, delete or include them automatically.
2. Create a clean remediation branch or dedicated worktree from the reviewed
   current base. Use the required `codex/` branch prefix.
3. Re-run Good State alignment for `outcome-driven delivery`.
4. Record the clean baseline results of the unit suite, strict privacy audit,
   memory validation and `git diff --check`. Require all applicable tests to
   pass; do not encode an exact test count or accepted dependency failures.
5. Keep all runtime delivery state and newly created child-agent artifacts in
   the current instance state root. Do not promote them into tracked
   `11_agents/` or copy them between Pritha instances.

## Execution Units

Each unit is independently reviewable and should end in one focused commit only
after its regression tests pass.

### Unit 1: B1 — Supersession Lock Stability

- Add `superseded_by` to `MUTABLE_DOCUMENT_FIELDS` in `outcome-spec.mjs`.
- Extend the existing revision test rather than creating a duplicate fixture.
- Assert that the superseded document still recomputes to its stored document
  lock, the old and new semantic locks remain equal for a metadata-only
  correction, reciprocal `supersedes`/`superseded_by` links are exact, and the
  old spec is no longer approval-valid because its status is superseded.
- Do not mask `supersedes`.

### Unit 2: B3 — Live Outcome Freshness

- Add optional `outcomeSpecPath` and root context to Trial freshness checking.
- When supplied, read and validate the live spec, recompute the semantic lock,
  and compare the validated contract fingerprint with the Trial result.
- Pass the path in every internal delivery, resume and acceptance call.
- Add a semantic-change regression and a mutable-approval-metadata control.
- Return the typed reason `outcome_spec_changed` without leaking filesystem
  paths.

### Unit 3: B5 — Lifecycle Report Path Redaction

- Apply `redactFilesystemPaths` to the final tracked or durable report text in
  scaffold, test, handoff, operations and deployment writers.
- Supply `projectRoot`, `stateRoot`, Pritha root and home context where
  applicable. Ensure secret redaction remains first in the pipeline.
- Do not redact human-facing stdout that is intentionally local.
- Add writer-level fixtures proving absence of home, project, state and temp
  absolute paths and presence of stable placeholders.
- Run the strict privacy audit after this unit.

### Unit 4: B2 — Safe Worktree Lifecycle

Split B2 into a safe primitive and lifecycle integration.

#### B2a: cleanup primitive and manual command

- Validate run ID, metadata schema, source repository, canonical worktree path,
  registered worktree entry and exact `pritha/build-*` branch binding.
- Reject symlinks, paths outside the run-owned worktree parent, branch mismatch
  and tampered metadata.
- Preserve the branch in v1.
- If the directory is absent, prune stale Git metadata and return an
  idempotent already-clean result.
- Refuse dirty cleanup by default. A destructive discard must be a separate,
  explicit action and is not part of automatic lifecycle cleanup.
- Record cleanup status and timestamp or an append-only cleanup event.
- Implement `delivery cleanup <run-id>` as plan-only by default, with explicit
  apply confirmation.

#### B2b: terminal integration and stale planning

- Clean an accepted worktree only after freshness and verified checkpoint
  checks and only when it is clean.
- For failed, abandoned or cancelled runs, attempt safe cleanup only; retain a
  dirty worktree and expose `cleanup_required` without changing the terminal
  delivery outcome.
- Never auto-clean verified or awaiting-acceptance worktrees.
- Define stale as a terminal clean run older than an explicit threshold, not
  claimed by an active target and not pending acceptance.
- Make `--all-stale` a bounded plan. Require an explicit age threshold and
  separate apply confirmation.
- Test clean removal, dirty refusal, missing-directory pruning, wrong branch,
  tampered path, retained branch, protected acceptance states and idempotency.

### Unit 5: D1 — Public Outcome Delivery Documentation

- Update the canonical README promise and add the real command sequence:
  `outcome init`, `outcome approve`, `deliver`, `delivery accept`.
- State the clean-Git prerequisite, App Server requirement for autonomous
  implementation, local backend limitation and distinction between verified
  and accepted.
- Update Getting Started and Architecture consistently.
- Keep `README.ru.md` as a concise pointer to the canonical README, in line with
  the existing public-doc contract.
- Extend `public-install-docs.test.mjs` with semantic assertions rather than
  brittle paragraph snapshots.

### Unit 6: B4 — Evidence Policy Normalization

- Define the evidence-only enum and a single normalization function.
- Leave App Server wire policy types untouched.
- Version the backend/evidence shape explicitly and retain verification support
  for existing v1 stored results.
- Test local, workspace-write false/true, read-only and external-sandbox cases,
  plus verification of a legacy fixture.

### Unit 7: B6 — Runtime Probe Evidence

- Add distinct probes for the Trial execution backend and build executor.
- Invoke each once before its first use, redact and bound the response, and
  append the result to the delivery ledger before the first iteration.
- Fail closed when the approved policy requires isolation that the probe cannot
  establish.
- Test ordering, unavailable capability, redaction and no duplicate probe on a
  resumed run.

### Unit 8: B7 — Goal Budget Enhancement

B7 remains separate from the correctness fixes.

- Persist the confirmed run-wide token budget in the contract, compiled policy,
  and ledger v2; normalize legacy ledgers to `1,000,000`.
- Probe Goal support for the installed runtime before its first build turn.
- Set a bounded Goal after `thread/start` and before `turn/start`, projecting the
  remaining run budget to the ephemeral thread without paths or full spec text.
- Read usage after the turn and account each unique thread/turn exactly once;
  reconcile saved results on resume.
- If Goal is unavailable, block with upgrade/retry, one user-only waiver, or
  abandon. Never select the waiver on behalf of the user.
- If usage is unavailable after a completed turn, preserve the result and block
  every subsequent iteration.
- Never treat the App Server Goal as canonical outcome evidence.

## Verification Per Unit

1. Run the nearest existing test file for the changed module.
2. Run the full unit suite with zero accepted failures.
3. Run `node scripts/privacy-audit.mjs --strict`.
4. Run `node scripts/validate-memory.mjs` for authored-artifact changes.
5. Run `git diff --check` and inspect the focused diff.
6. For public documentation, run `tests/public-install-docs.test.mjs`.
7. For App Server protocol changes, generate the installed experimental schema
   in a temporary directory and exercise the method-unavailable fallback.

## Implementation Record

The work was committed in reviewable boundaries: instance isolation and
publication guards; unborn Git workspace support; B1; B3; B5; B2 primitive;
B2 terminal/CLI integration; B4; B6; B7; D1; and isolated fleet rollout. Each
boundary passed its nearest regression tests and `git diff --check` before the
commit. The final all-project gates, publication, canary rollout, and post-rollout
Good State recovery tag remain separate release actions.

Revisit the six-iteration, 90-minute and repeated-failure thresholds only from
pilot evidence. Publication and fleet rollout use one pinned Git commit and
stop on the first health, memory, Git, or agent-state fingerprint failure.
Instance-local child-agent state is never copied or published. The Good State
Baseline and recovery tag follow a successful rollout and explicit acceptance.

## Rollback Boundaries

- Revert one execution unit at a time; do not combine unrelated fixes.
- Never roll back by resetting the user's active worktree.
- Retain old evidence readers until a documented migration proves they are no
  longer needed.
- A failed cleanup migration must leave worktrees and branches intact.
- A failed Goal probe must create the typed user-decision blocker; it must not
  silently fall back or self-authorize a waiver.
