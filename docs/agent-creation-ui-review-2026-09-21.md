---
id: 2026-09-21-agent-creation-ui-review
type: review
status: processed
created: 2026-09-21
updated: 2026-09-21
topics: [agent-creation, outcome-verification, recovery, release]
tools: [Pritha, NeuralDeep, Codex CLI, SQLite]
sources:
  - docs/agent-creation-remediation.md
  - scripts/neuraldeep/agent-creation.mjs
  - scripts/agents-mother/outcome-spec.mjs
  - tests/agent-creation-gateway.test.mjs
related:
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject: {kind: pritha, id: agent-creation}
privacy: public
retention: durable
review_status: reviewed-incomplete
confidence: high
---

# Bounded UI creation review: product completion remains blocked

**Signal Desk was not created.** Two bounded UI attempts reached separately
reviewed documents and automatic research, but neither reached scaffold or
delivery. No application journey, live digest, export or product acceptance
is claimed. The outer operator made no child source, contract, registry or
verifier edits and used no creation CLI/API bypass.

The control plane and context handoff improved, but a successful automated
test suite did not predict successful, affordable creation with the selected
model. This is an incomplete engineering outcome, with retained evidence and
specific follow-up work rather than another automatically extended attempt.

## Released and checked code

The first attempt ran on `5b2b47847a0067cdebc360c2e179dc94ae6bbe86`.
The second ran on `8397be75d27f9cd14d442b7368932f636e85be6a`, after a bounded
correction to product Outcome defaults and research instructions. Before the
second attempt, MacBook, GitHub and Mac Mini were verified at that same commit.
Both running Control Centers passed six route checks and thirteen chunk checks.
The final report publication changes documentation only; failed executions
remain pinned to the code they actually used.

The `8397be7` candidate passed:

- 1,242 unit/self-test checks, with no warnings or regressions;
- 67 desktop/mobile browser scenarios; thirteen existing opt-in cases remained
  skipped;
- TypeScript, production build, strict health, privacy and distribution checks;
- clean installation, copied-state migration and restore on the second host,
  including 53 focused Node 24 checks;
- restoration and integrity checks for seven source-host SQLite snapshots;
- an installed Codex CLI scenario against a local provider simulator: nine
  requests and zero paid inference requests.

An initial browser run encountered a connection reset in its health setup;
the unchanged full rerun passed and the first trace was retained. A targeted
test launch initially shared an inappropriate fixture state root; restoring
per-test isolation made the unchanged assertions pass. Neither result was
obtained by weakening an assertion or deleting a test.

Managed deployment retained the second host's twelve chats, 3,332 immutable
events and 126 agent artifacts. Brief Desk ND v1.1.0 remained healthy. Fourteen
missing historical projects remained historical rather than active services.
One source-host update rolled back correctly when two existing agents refreshed
their own data during the isolation check. Retrying between their refreshes
passed without weakening the guard or changing those agents.

## UI observations and cost

Both attempts used Qwen3.8-27b at Medium reasoning. The operator entered only
the product request, reviewed documents in the UI and confirmed each separately
as Codex acting under explicit user delegation. Personal acceptance remained
separate. Pritha selected subsequent phases automatically. Reloading its page
retained the task, approvals and execution without a duplicate dispatch.

| Attempt | Internal turns | Provider requests | Accounted tokens | Active execution | Result |
|---|---:|---:|---:|---:|---|
| First | 4 | 35 | 913,219 | 17.67 min | Stopped in research; cancelled through UI with evidence retained |
| Second | 6 | 43 | 913,597 | 17.64 min | Stopped in research; checkpoint and approvals retained |
| Total | 10 | 78 | 1,826,816 | 35.31 min | No application |

The explicitly authorized cycle allowance was 2,000,000 tokens: 1,980,000 for
creation/corrections and 20,000 for real digest checks. No digest was run.
The unused allowance is 173,184 tokens, including that 20,000 reserve. Of the
creation remainder, 86,403 is still inside the second job's cap and 66,781 was
not allocated to it. A remainder is not permission to bypass a request reserve
or reset an attempt's ledger. All 78 requests have known usage; historical
unsettled usage was retained separately. These are token counts, not a claim
about monetary charges.

Input accounted for 1,752,161 tokens (about 96% of the total), including cached
input. Output accounted for 74,655. Fresh internal sessions reduced carried
conversation context, but repeated document reads inside a step still made
the next conservative reservation exceed the remaining job allowance.

The second attempt's costs identify where the work stopped:

| Step | Tokens | Observation |
|---|---:|---|
| Initial contract | 88,527 | Valid product-specific proposal |
| Initial Outcome | 161,707 | Valid proposal; canonical-name collision blocked approval |
| Revised contract | 259,235 | History comparisons and patch retries; product requirements unchanged |
| Revised Outcome | 205,278 | Both revised documents then approved separately |
| Research | 133,563 | Local report/pattern pack created; request reserve stopped progress |
| One UI continuation | 65,287 | Re-read research material; stopped again before completion |

The stop happened before another upstream request. The host retained document
hashes, command receipts and a bounded manifest of the two new research files.
After the last stop, release inspection reported no unresolved execution,
host control or held claim. There was no automatic third attempt or budget raise.

## Remaining defects

1. **Repeated display names collide in Outcome publication.** Initial Outcome
   filenames derive from the display name, while distinct attempts have distinct
   technical slugs. The second attempt could not approve its Outcome because
   the first attempt already occupied the canonical path. The host correctly
   refused replacement. The existing UI proposal-revision action provided a
   workaround in the same job and target, preserving accounting and requiring
   both approvals again. This workaround does not fix the generator defect.

   The bounded correction should derive new Outcome identity/path from the
   contract's technical identity while preserving existing authored paths.
   A regression must create two agents with the same display name and different
   technical identities, approve both documents independently, and prove that
   all earlier bytes and receipts remain unchanged.

2. **Preparation consumes the allocation before implementation.** Product
   defaults reduced the first Outcome cost, but repeat review and research still
   produced excessive reads and patch retries. The final continuation read
   research material again without completing primary-source verification.
   Raising the budget alone did not establish a working creation path.

   The next correction should provide bounded, reusable research facts and
   checkpoint evidence, avoid re-reading full generated packs, and allocate
   preparation work so implementation remains feasible. A realistic large-pack
   simulator must verify complete requirements, current-source evidence,
   bounded request context, separate approvals and unchanged cumulative usage
   across restart/replay before another real UI trial is authorized.

## Audit A–J evidence and limits

The detailed implementation/test mapping is in
[the remediation review](agent-creation-remediation.md#audit-trace).
“Verified” below describes the stated mechanism, not acceptance of Signal Desk.

| Finding | Evidence in this cycle | Closure limit |
|---|---|---|
| A — version disagreement | Exact source/runtime/execution versions shown in UI; clean pinned execution; both installations matched published code | Verified; old attempts retain their old execution release |
| B — manual phases | One job/chat; automatic contract → Outcome → research, including UI revision recovery | Partial: no completed creation/delivery |
| C — missing shell-write checkpoints | Manifest regressions passed; real checkpoint retained new research files and command outcomes | Verified at platform/checkpoint scope |
| D — false functional coverage | Protected verifier and stdout-only negative control passed; missing/changed verifier fails closed | Partial: actual application and live-provider journey were not run |
| E — destructive Outcome init | Author-insert/idempotency regressions passed; old documents survived UI revision | Original loss fixed; new name-collision inconvenience remains above |
| F — overbroad research waiver | API/runtime/source requirements survived repository waiver; targeted gate tests passed | Actual external research did not finish in these attempts |
| G — executor self-approval | UI required two exact-revision approvals with actual delegated actor/authority; model assertions cannot substitute | Verified; no personal acceptance recorded |
| H — brief/default/health errors | Valid proposals retained all requested data, rights, sources and success criteria; CLI/preset regressions passed | Preparation cost and actual app behavior remain unresolved |
| I — registry/report mismatch | Release Watch and Paper Radar report bindings checked; historical missing projects not active; availability/verification/acceptance remain distinct | Unproven historical binding remains unbound; no filename-only identity inference |
| J — unsafe recovery/accounting | Descendant/unknown/replay fault tests passed; new receipts additive; terminal release-state inspection ready | Historical unknown usage stays unknown; no production paid-run crash experiment claimed |

The minimum next work is to fix and locally validate the two defects above,
then perform a separately bounded UI creation and the full Signal Desk journey.
The current cycle stops with its checkpoint. Private transcripts, screenshots,
host identities, paths, release receipts and snapshots remain local. A Good
State Baseline requires later personal acceptance and was not created here.
