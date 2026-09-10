---
id: 2026-08-22-outcome-delivery-remediation-plan-signal
type: signal
status: refined
created: 2026-08-22
updated: 2026-08-22
topics:
  - outcome-driven-delivery
  - remediation
  - evidence-integrity
  - privacy
  - worktree-lifecycle
tools:
  - Git
  - Codex App Server
sources:
  - operator-provided-remediation-plan-2026-08-21
  - official-codex-use-cases-docs-verified-2026-08-22
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  workflows:
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
generated_from:
  - operator-provided-remediation-plan-2026-08-21
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
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
source_type: operator-provided-text
source_class: operator-provided-text
ingested_at: 2026-08-22
processed_at: 2026-08-22
retention_status: source-retained-outside-repository
usefulness: high
evidence_quality: high
anonymous_source_id: operator-provided-remediation-plan-2026-08-21
source_published: 2026-08-21
source_updated: 2026-08-21
source_version: operator-provided remediation plan, two contiguous fragments
retrieved: 2026-08-22
verified: 2026-08-22
valid_for: Pritha remediation branch based on d115c2d and Codex CLI 0.135.0
temporal_status: implemented
---

# Signal: Outcome Delivery Remediation Plan

The remediation plan identifies seven implementation issues or improvements and
one public-documentation gap in the outcome-driven delivery surface. Direct code
inspection confirmed the underlying condition for B1 through B6 and D1. The
operator subsequently accepted the B7 contract policy: new autonomous contracts
propose a user-confirmed `1,000,000`-token build budget, while legacy accepted
contracts inherit the same default.

The plan is directionally strong: it protects approved intent, improves evidence
freshness and comparability, closes path disclosure in lifecycle reports, makes
runtime capability discovery observable, and exposes outcome delivery in public
documentation. It should not be executed verbatim. Worktree cleanup must refuse
to destroy dirty uncommitted work, path redaction must be applied in every report
writer rather than only in the CLI dispatcher, and evidence schema compatibility
must be explicit.

The implementation now includes B1 through B7 and D1, plus instance-local agent
state, publication guards, safe fleet rollout, and backward readers for legacy
ledgers and Trial evidence. Goal absence fails into a typed blocker; continuing
without Goal requires a one-use waiver explicitly attributed to the user. Exact
test counts remain observations rather than acceptance criteria.
