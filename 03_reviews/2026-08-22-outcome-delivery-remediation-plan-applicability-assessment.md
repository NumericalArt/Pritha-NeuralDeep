---
id: 2026-08-22-outcome-delivery-remediation-plan-applicability-assessment
type: assessment
status: complete
created: 2026-08-22
updated: 2026-08-22
topics:
  - outcome-driven-delivery
  - remediation
  - architecture
  - privacy
  - evidence-integrity
  - developer-experience
tools:
  - Git
  - Codex App Server
sources:
  - operator-provided-remediation-plan-2026-08-21
  - 01_sources/signals/2026-08-22-outcome-delivery-remediation-plan-signal.md
  - https://developers.openai.com/codex/use-cases
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  workflows:
    - 07_workflows/2026-08-22-outcome-delivery-remediation-execution-preparation.md
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
recommendation: implementation-plan
source_published: 2026-08-21
source_updated: 2026-08-21
source_version: operator-provided remediation plan, two contiguous fragments
retrieved: 2026-08-22
verified: 2026-08-22
valid_for: Pritha remediation branch based on d115c2d and Codex CLI 0.135.0
temporal_status: implemented
---

# Applicability Assessment: Outcome Delivery Remediation Plan

## Recommendation

Adopt with revisions. The corrections below were incorporated into the
implementation. B7 proceeded only after the operator accepted its contract
budget, Goal enforcement, crash accounting, and user-only fallback semantics.
`README.ru.md` remains a short pointer to the canonical English documentation.

## Positive Changes

- The plan is cause-first and asks for a regression test with each change.
- B1 correctly separates authored lineage from mutable lifecycle metadata and
  prevents a legitimate revision from looking like document-lock tampering.
- B2 recognizes that disposable worktrees need a complete lifecycle and keeps
  verified or acceptance-pending results available for inspection.
- B3 closes a real freshness gap between a green Trial result and the live
  approved outcome.
- B4 moves runtime evidence toward a stable machine-comparable vocabulary.
- B5 extends privacy protection to older lifecycle surfaces instead of treating
  delivery reports as the only publication path.
- B6 makes runtime capability assumptions visible in append-only evidence.
- B7 preserves the Outcome Spec as canonical while proposing a stronger
  runtime-enforced budget projection.
- D1 makes the principal product capability discoverable and documents honest
  isolation and Git prerequisites.
- The proposed Good State checkpoint after the core fixes is appropriate.

## Applicability Matrix

| Item | Finding | Decision | Required correction |
| --- | --- | --- | --- |
| Preparation | Stale in this checkout | Replace | Do not rename or delete current uncommitted files. Start remediation only from a deliberately clean branch or worktree based on the current reviewed revision. |
| B1 | Defect confirmed | Adopt | Add only `superseded_by` to mutable document fields. Test lock invariance, semantic-lock invariance, superseded status, and reciprocal lineage. A superseded spec must still fail the approval-status gate. |
| B2 | Lifecycle gap confirmed | Adopt with redesign | Never auto-run forced removal on a dirty worktree. Accepted clean worktrees may be removed after the verified checkpoint. Dirty failed, abandoned or cancelled worktrees must be retained with `cleanup_required` unless an explicit discard action preserves or knowingly discards their contents. |
| B3 | Freshness gap confirmed | Adopt | Pass the Outcome Spec path through every internal delivery and acceptance call. Compare the live semantic lock and validated contract fingerprint. Do not make `approved_at` or other mutable approval metadata stale. |
| B4 | Mixed evidence types confirmed | Adopt with compatibility | Normalize only the evidence projection to `host`, `enabled`, `restricted`, or `disabled`. Introduce an explicit backend/evidence schema version and retain a read path for existing v1 results. Do not change the App Server wire request. |
| B5 | Absolute paths confirmed in lifecycle reports | Adopt with broader scope | The proposed `index.mjs`-only change is insufficient. Redact the final rendered content in scaffold, test, handoff, operations and deployment report writers with project, state, root and home context. Keep human stdout unchanged. |
| B6 | `probe()` methods are unused | Adopt with clarified boundary | Probe the actual Trial command backend and the autonomous build executor before their first use, record bounded redacted results in the ledger, and fail closed when required isolation is unavailable. A command-backend probe alone does not establish that the build-thread API is usable. |
| B7 | Protocol capability confirmed; policy accepted after audit | Adopt as isolated enhancement | Codex CLI 0.135.0 exposes `thread/goal/set`, `get`, `clear`, `tokenBudget`, `tokensUsed`, and `timeUsedSeconds`. Persist a user-confirmed contract budget, project the remaining run budget to each ephemeral thread, reconcile unique thread/turn usage after crashes, and require an explicit user-only waiver if Goal is unavailable. |
| D1 | Documentation gap confirmed | Adopt | Update the canonical README, Getting Started and Architecture. Keep `README.ru.md` as the tested pointer to the canonical README, optionally adding only a concise pointer sentence. Update public-doc tests with behavior-level assertions. |
| `release_readiness` | Separate design question | Defer | Resolve security, operations and deployment semantics in a decision record before adding another state field. |

## Important Risks The Plan Missed

### Destructive cleanup

`git worktree remove --force` can erase uncommitted implementation evidence.
Automatic cleanup must be conservative, path-bound, branch-bound and dirty-state
aware. Bulk stale cleanup must default to a plan, require an explicit age
threshold, exclude active, verified and awaiting-acceptance runs, and require a
separate apply confirmation.

### Report-writer coverage

The older lifecycle reports are written directly by multiple modules. Replacing
helpers in the top-level command dispatcher would leave handoff, test,
operations, deployment and parts of scaffold output exposed. Tests must exercise
each writer or a shared final-render boundary.

### Evidence versioning

Changing `networkAccess` from Boolean to enum alters the locked evidence shape.
A version bump without a backward verifier would unnecessarily invalidate old
stored results. Compatibility behavior must be tested before migration.

### Goal lifetime

The current build executor starts a new ephemeral App Server thread for each
build iteration. A goal set on that thread is not automatically a persisted
run-wide budget. Either reuse a run-bound thread safely or define the goal as a
per-iteration projection with an explicit remaining token budget.

## Expert-Lens Review

- Architecture: B1 and B3 strengthen binding between approved intent and
  evidence; B2 needs a non-destructive terminal-state policy; B6 must distinguish
  Trial command capability from build-thread capability.
- Security and privacy: B5 is necessary and broader than proposed. B2 bulk
  cleanup and metadata paths need canonicalization, symlink rejection and exact
  run/branch binding.
- Developer experience: idempotent manual cleanup and public command examples
  are valuable, but destructive flags must not be the default.
- Product pragmatism: B1, B3, B5 and D1 yielded the most immediate value. B7 was
  kept in a separate commit after correctness and privacy work.
- Evidence quality: all code claims were checked against the current checkout.
  Current OpenAI documentation describes durable Codex goals at the product
  level; the exact experimental RPC shape was additionally verified against the
  schema generated by the installed Codex CLI.

## Checks Performed

- Good State alignment for the affected outcome-delivery surface: no conflict.
- Full unit suite: 439 passed, 0 failed.
- Strict privacy audit: passed.
- Memory validation: passed for 690 authored Markdown files before these new
  audit artifacts were added.
- Git base: local `main` and `origin/main` both at `d115c2d` during audit.

These counts are the initial audit observations, not the release acceptance
gate. The plan's expected count of 383 tests and accepted Control Center
failures is obsolete; the release requires zero failures without pinning an
exact count.
