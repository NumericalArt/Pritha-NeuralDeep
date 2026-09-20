---
id: 2026-09-19-agent-creation-remediation
type: review
status: draft
created: 2026-09-19
updated: 2026-09-20
topics:
  - agent-engineering
  - agent-creation
  - outcome-verification
  - recovery
tools:
  - Pritha
  - NeuralDeep
  - Codex CLI
  - SQLite
sources:
  - scripts/neuraldeep/agent-creation.mjs
  - scripts/neuraldeep/creation-delivery.mjs
  - scripts/neuraldeep/creation-execution-root.mjs
  - tests/agent-creation-scaffold.test.mjs
  - tests/creation-execution-root.test.mjs
related:
  workflows:
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/pritha-good-state-baseline.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: pritha
  id: agent-creation
privacy: public
retention: durable
review_status: implementation-under-validation
confidence: medium
---

# Agent creation remediation: engineering draft

A later UI attempt exposed a semantic preparation defect: the brief requested
durable database storage and a single provider, while the generated proposal
still contained generic Markdown storage, alternative-provider fallbacks and a
large unrelated model-routing table. The typed brief now carries storage,
records, input types, sensitivity and risks into the contract. App/feed presets
generate product-specific runtime rows and bounded harness defaults; explicit
repository research decisions are included in the authoring shape. A real CLI
regression preserves these decisions, a smaller host allocation, separate
approval status, authored edits and init idempotency.

Coordinated creation respects the configured step timeout, subject to the
existing thirty-minute hard cap and remaining total active allowance. The old
twelve-minute default remains for legacy phase chats. A new creation can use a
smaller explicit token allocation through the UI; the host validates and
persists it, including across recovery. This cannot settle another job's
unknown usage or raise an allocation through request replay.

The release updater now atomically records a verified deployment before
removing the retired build. Bounded cleanup retries leave a recorded pending
cleanup if filesystem metadata prevents removal. A failure while recording the
cleanup result retains the earlier deployment receipt. Fault-injection tests
check both failures and retain the existing ownership, health, isolation, Git
and rollback requirements.

The budget-protected UI trial exposed a request-format regression before any
upstream call: a recursive check interpreted tool JSON-schema properties as
actual media inputs. Validation now follows Responses input/content boundaries
and executable tool kinds. Local function namespaces remain supported; actual
media, opaque history and provider-hosted tools still fail closed. Budgeted CLI
runs disable native hosted search and independent delegation, retaining the
existing Pritha Search tools. Format incompatibility, exhausted allocation and
unconfirmed usage have distinct user-facing explanations. A local real-CLI
round trip (request, command result, final answer) passed with a fake provider
and zero external requests. This does not establish that Signal Desk is ready.

This document records implementation and focused regression evidence. It is
**not a release acceptance report**. The initial candidate passed 1205 self-test
checks, 65 desktop/mobile browser cases and distribution checks, then reached
both installations at the same published commit. The first UI creation exposed
further issues described below. A successful creation remains a separate
completion gate. No successful Signal Desk ND creation is claimed here.

The audit identifiers A–J below refer to the source audit's findings. Private
histories, host paths, account identifiers, runtime snapshots, and operating
receipts remain in instance-local storage and are intentionally absent here.

## Intended behavior

One CreationJob connects a chat, a reserved child target, a release SHA, two
separately approved documents, research, scaffold, delivery, and its checkpoint.
The host chooses the next phase from verified artifacts. Operators should not
need to type phase markers, copy checkpoints, or open replacement chats.

The architecture contract and Outcome Spec remain different decisions. The
host records the reviewed document revision, request identity, actual operator,
and delegated authority when applicable. Validation alone is not approval.
Machine verification is not personal acceptance of the product.

## Audit trace

| Finding | Implemented mechanism | Focused regression evidence | Remaining closure |
|---|---|---|---|
| A — source, runtime, and execution version disagreement | New creation requires matching clean source/runtime identity; execution uses a registered worktree at the saved release. Authoring cwd is the job's draft directory. The runner requires a live admission receipt, exact saved intent, job identity, and a clean pinned worktree before using a separate code root. | `creation-execution-root.test.mjs`, `agent-creation-transport.test.mjs`, execution workspace and gateway tests | Verify version display and actual first/resumed dispatch in the staged UI. An existing job must not silently move to a different release. |
| B — manual phase protocol | CreationJob persists in the existing coordination store; UI actions use `requestId` and `expectedRevision`. Host actions connect research/scaffold to the existing delivery ledger and original task. | `agent-creation-store.test.mjs`, `agent-creation-gateway.test.mjs`, `neuraldeep-creation-delivery.test.mjs` | Complete the real UI-only creation without phase commands or external child edits. |
| C — shell writes absent from checkpoints | Bounded path/size/hash manifests include untracked files in the authorized target. Checkpoints and process receipts are independent of a model's claimed changed-file list. | `neuraldeep-target-file-manifest.test.mjs`, `creation-runtime-receipt.test.mjs`, delivery attempt tests | Observe a saved checkpoint during the controlled UI run; retain private diagnostics for failures. |
| D — smoke text masquerading as functional Trials | Generic scaffold smoke no longer creates duplicate data-shape/live-path coverage. Explicit presets install host verifier bytes with protected hashes. Fixtures exercise actual source/provider calls, durable state, deduplication, failure handling, and recovery. Missing or modified verifiers fail closed. | `agents-mother-outcome-verifiers.test.mjs`, Outcome and result-readiness tests; stdout-only smoke negative control | Verify the actual app UI, SQLite storage, owned service lifecycle, and live NeuralDeep digest. These are not inferred from fixture success. |
| E — repeated Outcome init loses authored text | Init returns the existing document without rewriting it. An explicit pre-scaffold proposal revision preserves accepted documents and receipts, then requires two new approvals. Contract lookup uses exact identity rather than equal content or basename. | `agents-mother-outcome-spec.test.mjs`, `creation-revision.test.mjs` | Confirm the user-facing document review and revision path in the staged UI. |
| F — repository waiver suppresses unrelated research | A repository policy only controls repository discovery. API, runtime, provider, and external-source topics remain required. Host promotion verifies the original complete gate before rebinding paths and locks. | Research topic/gate tests and `agent-creation-scaffold.test.mjs` | Obtain current authoritative evidence for the actual chosen sources/provider during creation. |
| G — executor self-approval instruction | Preparation prompts stop at validation. Host approvals bind exact reviewed bytes to separate requests; delegated operator metadata is preserved. Canonical documents and audit are outside authoring writable roots. | `agent-creation-artifacts.test.mjs`, `agent-creation-gateway.test.mjs`, `creation-execution-root.test.mjs` | Record the two explicit UI approvals and retain personal acceptance as a later event. |
| H — fragile brief/defaults/health behavior | Typed brief parsing preserves product decisions, canonical `--brief` supports the compatibility alias, and explicit presets choose checks. The implementation prompt includes both immutable approved documents, preserving requirements outside Trials. Health reads `/health`; refresh is a separate action. Draft adapter/port problems become actionable warnings so the model can correct them; approved configuration stays gated. | Contract/interview and build-executor tests, `scaffold-api-process.test.mjs`, `creation-preflight.test.mjs` | Prove a medium-complexity natural-language request reaches valid proposals without technical operator repair. |
| I — mismatched registry/report/result identities | Approval identity rejects basename substitution. Explicit migration tooling requires instance, contract, and artifact evidence. Availability, verification, and acceptance are distinct concepts. | `agent-identity-migration.test.mjs`, approval identity and result-readiness tests | Apply and review instance-specific migration maps; verify historical reports and missing-project presentation on both installations. |
| J — recovery mistakes absent workers for settled usage | Worker exit, descendant exit, adapter closure, and usage evidence are separate. Unknown usage blocks another paid dispatch. Receipt accounting is idempotent; verified delivery is adopted only into the unchanged clean scaffold baseline. | Runner configuration/recovery tests, delivery attempt tests, `neuraldeep-creation-delivery.test.mjs` | Validate rollout recovery and preserve abandoned history; do not infer production crash recovery from fixture tests alone. |

## Integration corrections found during implementation

The first production release attempt stopped before the build swap because
the isolation guard compared SQLite storage bytes, including changing SHM/WAL
files, and Finder view metadata. Read-only history access or a checkpoint can
change these bytes while preserving every application row. Protected SQLite
files now use a transactional digest of schema, metadata and ordered rows,
including committed data still in WAL. Auxiliary files are omitted only when
their adjacent base file is a regular, verified SQLite database; orphan files,
non-SQLite lookalikes and symlink targets remain protected. Finder's regular
`.DS_Store` files do not represent application state. Corrupt or unreadable
databases fail the release check. Regression controls cover checkpoint churn,
uncheckpointed user edits, schema changes, corruption and ordinary files.

Finder can also modify view metadata in a prepared rollback copy. New rollback
receipts use a versioned digest that excludes only regular `.DS_Store` files
with the Finder binary header; these files are omitted when copying the build.
Text lookalikes, symlinks and directories with that name are still checked,
as are all chunks, manifests and build identity.
Existing receipts retain their original byte-level digest; they are never
reinterpreted under the new rule. Regression controls cover metadata churn,
changed executable bytes, symlink substitution and unknown digest versions.
The updater carries the verified digest version into its second copy check;
an integration regression visits the backup with Finder metadata before a
failed staged release, then confirms restoration of the original healthy build.

A subsequent release attempt reached the manager stop but retained the old
build: a terminal-started manager used a relative script path, while the stop
check searched for an absolute path. Stop now verifies the process working
directory and an exact Node/script/run prefix for absolute or relative paths.
An unconfirmed wrapper or failed listener inspection blocks the stop explicitly.
Tests exercise real wrapper/child shutdown and reject foreign directories,
missing process evidence, path lookalikes and script names appearing only as
another program's arguments. The release still uses the instance manager;
no port-based process termination or live build replacement is introduced.

Real launchd startup also exposed two lifecycle gaps hidden by ordinary
terminal fixtures. The web UI service was classified as background work;
on the affected host, runnable processes received almost no CPU and health
requests timed out. The instance template now uses the Interactive class for
this HTTP UI and a finite shutdown allowance longer than its child grace
period, following [Apple's launchd policy definitions](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5).
Starting a stopped service refreshes its installed template. If the wrapper
dies first, the manager independently verifies the saved instance, lock,
child command, working directory and process group before bounded termination.
Only previously observed, recognized read-only probes are also cleaned up;
unrelated child-agent services remain outside that authority. Regression
fixtures cover orphan recovery, SIGTERM-resistant children and foreign locks.

The mobile browser run exposed a history-navigation race: refreshing a turn's
activity tail disabled the earlier-actions button and could cancel an explicit
page request. Tail refreshes now coalesce behind active reads, while explicit
pagination can supersede a background read. Loaded earlier actions and their
pagination position survive subsequent turn updates. A controlled browser
regression reproduces the disabled navigation on the original build and checks
overlapping reads, older-page preservation and exhaustion of the cursor after
the fix. It and the existing response/recovery scenarios passed three runs on
desktop and mobile viewports (18 cases), without changing their assertions.

Research created under an execution worktree contains references relative to
that worktree. Copying its bytes to the primary instance changes how those
references resolve. Promotion now checks the original complete gate and frozen
pattern-pack bytes, preserves original hashes and source revision privately,
rewrites only exact artifact references, and verifies the relocated gate before
publishing the canonical report. Invalid original evidence is never repaired by
recomputing a lock. Evidence input is restricted to the active code or authoring
root, including symlink boundary checks.

A scaffold may finish before a registry rebuild or before the job update is
saved. The host stores a durable completion receipt before rebuilding the
registry. Recovery requires the same clean Git revision, an exact host scaffold
report, approved document locks, and child lineage. A changed target is blocked;
no reset or overwrite is used to make it look clean.

The authoring root must survive the gateway, typed runner, CLI runtime, and
environment sanitization. A transport regression exercises this chain. The
launcher bearer is removed before the model process is spawned. The separate
code root is accepted only against host coordination records, not an arbitrary
environment value or path supplied by the model.

Adapter or port problems in an unapproved proposal must permit a correction
turn. Preflight exposes these as draft warnings. Document boundaries, target
ownership, provider availability, and model validity still gate execution.
Host document approval may omit provider probing because it launches no model;
it does not omit configuration checks.

Before scaffold, the explicit proposal-revision action preserves native chat,
working directory, target and accounting. It archives bounded drafts, seeds a
new contract generation, and requires a corrective authoring turn followed by
two separate approvals. Private intent receipts recover the same generation
after a crash. Queued aliases, live descendants, unknown or unaccounted usage,
and any scaffold/product evidence block this operation. Only an exact verified
host verifier reservation may be cleared. After scaffold starts, material
changes require a new task and target. Old canonical documents and approvals
remain byte-for-byte unchanged.

Release display reads sealed build metadata and matches the running process's
full commit and BUILD_ID when present; replaced on-disk build metadata cannot
claim to be the loaded process.

The final integration review found that the build prompt projected Trials and
demo steps but omitted requirements authored only in the accepted contract or
other Outcome sections. Sources, storage choice, language and selection limits
could therefore disappear between proposal and implementation. The host now
includes the exact accepted contract and approved Outcome in the build prompt,
after checking their saved approval, document and semantic locks and contract
fingerprint. Every paid delivery dispatch rechecks the binding. The immutable
v1 Trial-plan format is unchanged, so valid earlier plans need no replacement
approval. A typed-brief regression carries both feed URLs, SQLite, Russian
output, a twenty-item limit, permissions and success criteria into the captured
build prompt without duplicating them in Trials; changed approved artifacts
block the model call.

## Findings from the first UI creation

The first natural-language control request exhausted the preparation step's
twelve-minute timeout while the model inspected CLI implementation details.
No draft contract or child files were produced. The saved checkpoint correctly
reported an unchanged target. The host prompt named the init command without
supplying the typed brief format, and help misleadingly displayed name and
mission as mandatory even when a brief supplied them. Preparation now receives
a complete shape generated by the shared brief normalizer, the exact
noninteractive command and its validation command. A real CLI regression fills
that shape for all three presets, verifies an approvable draft with preserved
requirements, and retries it without creating extra documents or a child.

Reloading the UI preserved the creation task but reset the unfinished operator
selection. The operator and delegation text now persist for that task in the
browser session. Review checkboxes reset, and restoring this form creates no
approval. Browser tests verify both this distinction and separate approvals.

A timeout during a provider response also exposed an accounting gap: the
launcher observed usage only from the final native turn event. Successful
individual requests could therefore disappear from accounting when a turn did
not finish. Each provider request now records normalized counts independently
in the existing private coordination database. Run accounting uses those deltas
without also adding native cumulative totals. An interrupted or malformed
response with no complete usage remains unknown and blocks another dispatch;
replaying a receipt never adds its cost twice. Fixtures exercise a launcher
without a final turn event, an incomplete response, a rejected next dispatch,
and repeated sessions. The UI labels completed-step totals explicitly and does
not present an unknown total as zero.

Rollback compatibility preserves the native cumulative counter separately from
per-request charges. When a final native counter exists, an older launcher can
resume from that exact anchor without charging recent requests twice. Without
one, it establishes an unknown transition before further accounting; a request
delta is never guessed to be a whole-session counter. A regression first
reproduced duplicate charging and now verifies both rollback paths.

These corrections cannot reconstruct a missing historical provider receipt.
The first trial's unknown remainder stays unknown pending provider evidence;
its history and original release binding are retained. A fresh successful
creation is still required after generation changes.

After the follow-up release reached both installations, a read-only card check
found that a metadata worker could take longer to start than the shared 2.5-second
runtime-read deadline. Installed manifests were then displayed as absent even
while the corresponding services answered their health endpoints. Project
metadata now has its own bounded 15-second policy, with a 30-second hard maximum.
An incomplete read reports unknown presence and an unavailable status with a
retry action; it does not claim that installation is missing or that a file is
unsafe. Confirmed missing files and rejected symlinks remain distinct. A delayed
worker regression failed on the previous policy and now reads the real fixture
manifest successfully; timeout and unsafe-file controls still fail closed.

## Follow-up UI findings and request budgets

The typed brief guide produced a valid draft in the next UI attempt. Operator
review still found contradictory storage defaults and unfinished risk/boundary
sections. Pritha revised the draft through the UI and the delegated operator
approved that exact contract revision separately. The Outcome was not approved,
and no successful product creation is claimed. Preparation instructions now
require a semantic review against the brief, give the exact Outcome command and
avoid repeating host approval comparisons or inspecting unrelated CLI source.

The same trial exposed a budget defect: preparation checked consumption between
turns, allowing a single tool turn to spend beyond the remaining allocation.
A regression on the previous release forwarded three controlled requests where
the supplied budget could cover only one. The operator paused the actual trial;
its partial receipts and unknown interrupted response remain intact. Additional
allocation was explicitly authorized by the user, but this does not authorize
unlimited retries or convert missing usage into zero.

Budgeted launchers now check durable request receipts before each provider call.
A transaction rechecks the active creation owner, generation and remainder while
recording the dispatch reservation. Completed requests are counted once; an
in-flight or unmeasured response blocks another dispatch. The request reserves
UTF-8 text bytes plus a framing allowance and a capped response. This is a
conservative estimate, not a provider usage measurement or a billing guarantee.
Opaque media, provider-side conversation references, hosted tools and alternative
paid endpoints cannot bypass that text reservation. The original caller request
identity remains stable when the host reduces its response cap, so an exact retry
cannot become another payable request. No automatic limit increase is introduced.

The existing delivery ledger supplies the current remainder to capability,
implementation and summary phases, and each launcher enforces it within the
phase. A refusal before dispatch has a known zero cost; a lost upstream response
remains unknown. The creation UI also shows the known lower bound from partial
request receipts without adding it to completed-step accounting twice.

The preceding published release passed 1,219 self-test cases, 65 desktop/mobile
browser cases, 1,604 distribution checks, TypeScript, production build and strict
page/chunk/identity health. A fresh dependency/state installation and copied-state
migration/restore checks also passed on the second host. Both installations
reached that release and preserved history and existing agents. These results
are evidence for that preceding release only; the request-budget changes require
a new candidate validation and another authorized UI creation from an empty target.

## Functional verifier boundary

`public-json-feed-v1` tests the explicit JSON-feed protocol. It is not silently
selected for an RSS/Atom product. `llm-http-app-v1` checks a local HTTP app against
controlled RSS and provider fixtures. The fixture uses random input and an
injected scoped bearer, exercises 429/503/malformed/disabled responses, and
checks saved data after an owned process restart.

The real child receives `PRITHA_LLM_BASE_URL`, `PRITHA_LLM_MODEL`, and
`PRITHA_LLM_TOKEN` only in its server process environment. The token authorizes
the instance-local broker. It is not the actual provider credential and must
not enter source, documents, `.env`, or browser code. Binding availability is
checked by the broker on each request. The verifier substitutes a local mock
through the same environment contract.

Passing these fixtures proves the tested protocol, not complete product
usability. The successful control run still must show both real feeds, no
duplicates, filters, read/favorite state, a Russian NeuralDeep digest, Markdown
download, persistence, source recovery, binding recovery, and Pritha reload
without duplicate execution.

## Validation recorded so far

The following focused runs passed during implementation; their counts overlap
and must not be added together as a full-suite total:

- 52 tests covering research promotion, real scaffold recovery, Outcome,
  pattern/research gates, and API scaffold behavior.
- 8 independent HTTP verifier tests, including stdout-only and missing-bearer
  negative controls.
- 22 execution-root, preflight, and launcher tests, including process-tree
  recovery. These require ordinary local socket and process-inspection access.
- 6 transport and host-scaffold tests after the execution-root review.
- Earlier delivery integration runs exercised the existing ledger, task
  binding, cancellation, canonical adoption, and receipt accounting.
- The final context-preservation regression run passed all 40 build-executor,
  Outcome and delivery-loop tests, including a changed artifact after the
  dispatch hook blocking before any paid probe.

The audit's eleven original test failures have two causes. One contract-init
failure came from an invalid repository-topic default; normalized brief and
repository-policy defaults repair it. Ten result-readiness cases were blocked
by fabricated data-shape/live-path Trials expecting a scaffold smoke message.
Removing those unsupported generic coverage claims and adding explicit host
functional verifier presets repairs the cause. The result-readiness fixture
still prints its original synthetic result; neither its output nor its checks
were weakened. All eleven cases passed in the pre-final-context-change full
suite (1,183 tests). The additional context-preservation change requires a new
final candidate validation; that earlier suite is not evidence for later code.

The final release still needs the full suite, TypeScript, production build,
desktop/mobile UI checks, distribution/privacy checks, clean installation,
state compatibility, backup restoration, strict page/chunk health, and exact
published SHA verification. A sandbox's refusal to permit loopback listening
or process inspection is reported separately from a product failure; the same
isolated tests must pass with those required local capabilities available.

## Release and UI completion gates

1. Finish integration and tests on the source installation, preserving its
   local data, and commit a reviewable candidate.
2. Use the staged-release workflow with an exact SHA, service ownership proof,
   and prepared rollback. Publish without rewriting shared history.
3. Move the second installation through an explicit plan/apply adoption of a
   clean checkout. Preserve its previous checkout/build, local configuration,
   existing agents, and consistent state snapshot.
4. Create Signal Desk ND through Pritha's UI only. The external test operator
   may inspect logs but must not edit the child's code, contract, registry, or
   Trials, or invoke creation CLI/API outside the UI.
5. Record defects, versions, task/run IDs, approvals, model, known usage, and
   retries privately. If generation, approval, scaffold, or coordination changes,
   repeat creation from an empty target and retain the previous attempt.
6. Verify both installations and GitHub use the same final release. Record
   personal acceptance and a new Good State Baseline only after demonstration.

The initial limits remain one million accounted tokens, ninety minutes of
active execution, six delivery iterations, and diagnostic pause after three
matching failures. Unknown usage remains unknown; limits do not increase
automatically. No external publishing, schedules, or external deployment are
part of this control scenario.
