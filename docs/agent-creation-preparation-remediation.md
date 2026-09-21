---
id: 2026-09-21-agent-creation-preparation-remediation
type: review
status: processed
created: 2026-09-21
updated: 2026-09-21
topics: [agent-creation, outcome-identity, context-budget, recovery]
tools: [Pritha, Codex CLI, SQLite]
sources:
  - scripts/neuraldeep/creation-stock-cli-acceptance.mjs
  - tests/creation-outcome-identity.test.mjs
  - tests/creation-host-preparation.test.mjs
  - tests/creation-preparation-budget.test.mjs
related:
  reviews: [docs/agent-creation-ui-review-2026-09-21.md]
  workflows: [07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject: {kind: pritha, id: agent-creation}
privacy: public
retention: durable
review_status: platform-tested-product-acceptance-pending
confidence: high
---

# Outcome identity and bounded preparation

Two independent agents may share a display name. New creation jobs reserve a
versioned document identity and filename using the technical slug, job and
proposal generation. Display names do not determine canonical destinations.
Repeated initialization returns the existing contract-bound document, including
an author's additions. Historical paths, approval events and hashes are not
rewritten. A conflicting file still blocks publication.

The model now supplies one typed product brief. The host validates that brief,
creates the contract, waits for its exact-revision approval, and creates the
Outcome without a provider call. Outcome approval is a separate operator
action. Durable host operations record their input hash and intended bytes
before publication, so recovery completes the same operation. One structural
JSON repair is permitted; another invalid response pauses preparation. Authored
changes and accepted documents cannot be silently regenerated.

Each internal preparation session receives exact operator dialogue, the brief,
current document identities, verified research facts and a structured checkpoint.
The full chat retains prior commands. Locked research is prepared once per
contract/provider/release context; the host checks complete primary artifacts
before presenting rule excerpts and required topics. A hash-bound reader
returns at most 8 KiB of serialized JSON per page. Compact facts do not open the
research gate without the original evidence and valid locks.

## Enforced limits

New jobs persist an immutable version-2 policy based on the authorized creation
budget B. Existing jobs keep their original policy and are not automatically
migrated or restarted.

| Limit | Policy |
|---|---|
| Brief and substantive document revisions | 10% of B |
| Research, including continuations | 20% of B |
| Total preparation | 30% of B |
| Protected implementation allocation | 70% of B |
| Ordinary host Outcome generation | 0 model requests |
| Actual preparation requests | 12 across sessions and proposal generations |
| Fresh full serialized request | 64 KiB |
| Checkpoint boundary | 96 KiB |
| Absolute preparation request limit | 128 KiB |
| Preparation response | At most 8,192 tokens |
| Automatic context rotations | One per phase, with verified semantic progress |

A transactional check runs before every upstream request. It includes known
current responses, unresolved usage, previous process-tree exit, phase and job
balance, document approvals, full serialized bytes and a conservative response
reservation. Bytes and tokens are distinct measurements. A rotation, UI reload,
proposal revision or Continue action does not reset accounting. Repeated reads
without semantic progress stop dispatch. Timestamps and a model's claim of
completion do not count as progress.

The creation card presents phase use, actual request counts, prepared request
bytes, conservative reservation, remaining research topics and the precise
blocker. Pending/unknown use is explicit. A final receipt replaces provisional
accounting for the same work; it is not added again.

## Connected stock-CLI evidence

The opt-in scenario runs the installed Codex CLI against a local Responses
provider imitation. Real generators, host approvals, research imports,
scaffold, delivery ledger, protected functional verifiers and adoption are
used on isolated state. No personal credentials, production agent files or
paid provider endpoints are involved.

Run from a clean committed checkout:

```sh
node scripts/neuraldeep/creation-stock-cli-acceptance.mjs --synthetic --report .private/creation-acceptance.json
```

A complete run with Codex CLI 0.154.0 used three native preparation sessions
and seven actual preparation requests. The synthetic usage, computed from
actual wire sizes rather than fixed success receipts, was 118,427 tokens:
9,866 for brief and 108,561 for research. These are fixture measurements, not
NeuralDeep billing or a forecast of a real model's cost. Preparation request
sizes were 38,508; 60,736; 66,107; 78,747; 89,366; 61,014; and 68,000 bytes.
Paths and CLI versions can change exact sizes on another installation.

The next oversized request stopped before the upstream call; one verified
research topic and the full tool history survived rotation. The fresh session
received that verified fact without the old large command outputs. Host Outcome
generation used zero provider calls. The first delivery build only printed
`Smoke test passed.` and failed independent functional verification. A second
build exercised real controlled-source parsing, deduplication and preservation
of prior data on failure, then passed verification and host adoption. Product
acceptance remained `not_accepted`.

This integration also found that report path redaction destroyed scaffold
identity when state lived outside the checkout. A versioned opaque report
binding now covers exact project/contract/state, outcome locks and scaffold
revision without publishing private paths. Recovery rejects a substituted
binding and resumes the same completed scaffold after a registry failure.

## Audit trace and remaining product gate

| Audit | Relevant evidence or preserved requirement |
|---|---|
| A — versions | Pinned job release and execution-intent identity; staged release health/chunk checks |
| B — manual phases | Connected brief → two approvals → research rotation → host scaffold → delivery |
| C — shell checkpoints | Original manifest/receipt regressions plus real CLI shell-output preservation |
| D — false verification | Protected verifier rejects stdout-only build before accepting functional behavior |
| E — Outcome loss/collision | Same display name/different slug regression; init/author/replay and legacy receipt tests |
| F — research waiver | Repository waiver preserves runtime/source/provider topics; original evidence gates remain mandatory |
| G — self-approval | Two host revision-bound events; JSON/model statements do not grant approval |
| H — brief/defaults | Typed brief and host renderers preserve product requirements; Outcome requires no model authoring |
| I — reports | Exact versioned scaffold binding, privacy preserved; existing catalog/history checks retained |
| J — recovery/accounting | No reset on session/revision/replay; unknown usage/live descendants block dispatch |

Release acceptance also requires the complete self-test/unit suite, TypeScript,
production build, desktop/mobile browser scenarios, distribution/privacy,
clean-install and copied-state restoration checks. Host identities, snapshots,
rollback receipts, exact deployed SHA and run logs remain in the private release
protocol. Their evidence must be checked before each service switch.

A successful synthetic platform scenario is not a successful Signal Desk UI
trial. The original product task remains incomplete until a new, explicitly
budgeted UI-only creation and its full RSS/SQLite/NeuralDeep/export/error/restart
journey pass. No new paid allowance or automatic series of attempts is granted
by this correction. Personal acceptance and a Good State Baseline remain separate.
