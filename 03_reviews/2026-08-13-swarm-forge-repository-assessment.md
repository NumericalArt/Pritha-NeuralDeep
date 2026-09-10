---
id: 2026-08-13-swarm-forge-repository-assessment
type: assessment
status: accepted
created: 2026-08-13
updated: 2026-08-13
topics:
  - multi-agent-orchestration
  - durable-handoffs
  - coding-agents
  - git-worktrees
  - agent-team-topology
  - agent-runtime-security
tools:
  - SwarmForge
  - Git
  - tmux
  - Babashka
  - Codex
  - Claude Code
sources:
  - 00_inbox/links/2026-08-13-swarm-forge-repository-intake.md
  - https://github.com/unclebob/swarm-forge
  - https://github.com/unclebob/swarm-forge/tree/9acd54d2239fef7e41ddacd8fd30dfb0e69672fe
  - https://github.com/unclebob/swarm-forge/blob/9acd54d2239fef7e41ddacd8fd30dfb0e69672fe/swarmforge/handoff-protocol.md
  - https://github.com/unclebob/swarm-forge/blob/9acd54d2239fef7e41ddacd8fd30dfb0e69672fe/swarmforge/scripts/handoffd.bb
  - https://github.com/unclebob/swarm-forge/blob/9acd54d2239fef7e41ddacd8fd30dfb0e69672fe/swarmforge/scripts/swarm_handoff.bb
  - https://github.com/unclebob/swarm-forge/issues/29
  - https://github.com/unclebob/swarm-forge/issues/32
  - https://github.com/unclebob/swarm-forge/issues/34
  - https://github.com/unclebob/swarm-forge/issues/41
related:
  signals:
    - 01_sources/signals/2026-08-13-swarm-forge-agent-handoff-signal.md
  standards:
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
  decisions:
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-04-17
source_updated: 2026-08-12
source_version: main 9acd54d2239fef7e41ddacd8fd30dfb0e69672fe; two-pack 892b1f22a529dd5ce4bc12af862fb84a38b71502; four-pack f17aeec716ff971b1ff9e73742726466410c99fb; six-pack 59803dadb38e0e09d5357d749452036e4a82ae60
retrieved: 2026-08-13
verified: 2026-08-13
valid_for: Pritha child-agent team and handoff architecture research from 2026-08-13
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: repository
  id: swarm-forge
privacy: public
retention: durable
review_status: accepted
confidence: high
recommendation: reference-only-do-not-adopt-code
repository_adoption_recommendation: reject
---

# Assessment: SwarmForge Repository

## Executive Assessment

SwarmForge is useful to Pritha as an inspectable reference for local multi-agent
coding coordination. Its strongest contribution is not the fixed `two-pack`,
`four-pack` or `six-pack` role set; it is the attempt to turn handoffs into a
small durable protocol rather than unstructured agent conversation.

The repository should not be installed, vendored or used as a selected module:

- no license file or GitHub-detected license was present at verification time;
- no releases, security policy or CI workflow were found;
- runnable branches fetch operational scripts from a floating `main` archive;
- wake-up delivery has a documented liveness failure;
- examples allow broad permission-bypass arguments;
- Git worktrees isolate source-control state, not process, network, credentials
  or the host filesystem.

Decision: **reference-only for architecture patterns; reject code adoption at
the verified revision.**

## Repository Snapshot

Verified on 2026-08-13:

| Surface | Observation |
| --- | --- |
| Repository age | Created 2026-04-17; early-stage project. |
| Main revision | `9acd54d2239fef7e41ddacd8fd30dfb0e69672fe`, committed 2026-07-10. |
| Runnable revisions | `two-pack`, `four-pack` and `six-pack` are separate branches with different revisions and dates. |
| Languages | Primarily Clojure/Babashka with Shell adapters. |
| Release state | No GitHub release detected. |
| License | No license metadata or license file detected. |
| CI/security | Test source exists; no tracked GitHub Actions workflow or `SECURITY.md` detected. |
| Test execution | Not run by Pritha because repository content is untrusted research input; no upstream CI result was available. |

Repository `pushed_at` was 2026-08-12 because another branch remained active;
that date must not be mistaken for freshness of `main` or the three runnable
pack branches.

## Architecture

### Runtime shape

SwarmForge launches one role per tmux session. Writing roles receive dedicated
Git worktrees; the first role may run directly in the main checkout. Role
behavior is composed from:

- project-local configuration;
- a layered constitution;
- role-specific prompt files;
- shared Babashka/Shell helper scripts;
- a file-backed handoff daemon;
- terminal presentation adapters.

The model/backend is selectable per role. Current main code recognizes Codex,
Claude, Copilot and Grok. The terminal layer is separated behind a small adapter
contract, which is a good example of keeping presentation outside orchestration.

### Role packs

- `two-pack`: coder and cleaner;
- `four-pack`: specifier, coder, refactorer and architect;
- `six-pack`: specifier, coder, cleaner, architect, hardener and QA.

This progression is useful as a topology-selection heuristic: add roles only
when task risk and verification value justify the extra context, latency, merge
traffic and cost. It is not evidence that these exact roles or quality tools are
universally optimal.

The specifier's explicit user approval before implementation is a sound gate.
The QA role is separated from the coder, but it is not a fully independent,
read-only verifier because it may change and commit project artifacts.

## Handoff Protocol Review

### Strong elements

SwarmForge narrows agent messages to two types:

- `git_handoff`: recipient, priority, stable task name and commit;
- `note`: recipient, priority and a short bounded message.

The implementation provides several reusable invariants:

- sender identity is derived from runtime state rather than supplied freely;
- recipients are validated against configured roles;
- commit references must be exactly ten hexadecimal characters, resolve
  unambiguously and point to a Git commit;
- agent-supplied reserved headers are rejected;
- publication uses a temporary file followed by rename;
- queue filenames sort by priority, timestamp and sequence;
- sequence allocation uses a lock;
- recipient state moves through `new`, `in_process` and `completed`;
- task mode refuses multiple concurrent in-process items;
- batch mode groups equal-priority work;
- failed and sent directories provide an operational audit surface.

These are useful deterministic controls around probabilistic workers.

### Critical liveness gap

The daemon copies a handoff into the durable inbox and injects one wake-up into
the recipient's terminal through `tmux send-keys`. It then watches only sender
outboxes. It does not reconcile old files in recipient `inbox/new`.

Issue 34 documents a real six-role run that stalled for hours after the inbox
file was delivered but the single wake-up was missed. This demonstrates an
important general rule:

```text
durable task state + lossy notification + no reconciliation = durable deadlock
```

Required correction for any Pritha implementation:

- treat inbox state as authoritative;
- treat wake-up as an idempotent hint;
- periodically reconcile queued-but-unclaimed work;
- re-notify with backoff and a maximum attempt policy;
- expose stale queue age and current owner in health/status;
- allow safe polling on restart and after task completion;
- distinguish worker failure, notification failure and task failure.

### Ambiguous merge semantics

The generated payload contains the command-shaped phrase
`merge_and_process <sender> <commit>`, but no such executable exists. Issue 29
reports that an agent attempted to run it as a shell command and stopped.

A Pritha handoff must use one of two explicit forms:

- a deterministic merge tool with typed output and conflict policy; or
- a clearly labeled natural-language action with exact allowed Git operations.

Never encode prose so that it resembles a nonexistent command.

## Security and Supply-Chain Review

### Floating bootstrap

Runnable branch wrappers download an archive from a branch URL through
`curl | tar` when shared scripts are missing. There is no pinned commit, content
hash or signature verification. The downloaded scripts then enter every role's
`PATH` and launch agent CLIs.

This conflicts with Pritha's repository and skill lifecycle requirements.
Future reconsideration would require an exact commit/tree pin, license,
checksums, full bundle review and isolated eval.

### Permission posture

Configuration passes arbitrary extra arguments to each agent CLI. The README
shows `--yolo` and `--dangerously-skip-permissions` examples, and the Grok path
maps similar flags to bypass mode. This is convenience, not an acceptable
default for Pritha-created agents.

The shared engineering constitution additionally tells agents to obtain the
latest versions of external quality tools at startup. This creates floating
dependencies, network activity and execution of newly fetched code inside the
project runtime.

### Isolation limits

Worktrees reduce branch collisions but share:

- operating-system user privileges;
- network access;
- credential stores and environment unless separately scoped;
- local services and ports;
- package/build caches;
- the main Git object database.

SwarmForge does not provide a sandbox or security boundary. A role assigned to
`master` also works directly in the user's main checkout.

### Prompt and configuration trust

Constitution and role prompts are recursively loaded as instructions. Existing
local constitution articles may override shared names, but the runtime does not
bind the effective instruction set to a reviewed manifest/hash in the inspected
code. Any Pritha analogue must version and fingerprint role contracts and scan
all inherited instruction files as untrusted supply-chain input.

## Comparison with Existing Pritha Knowledge

### Confirms

- `agent-team-operating-model`: more agents are justified only by distinct
  responsibilities and verification value.
- `agent-trajectory-control-and-evidence`: worker handoff, worktree ownership,
  artifact revision and independent completion evidence need structured events.
- `agent-harness-evaluation`: handoff and recovery failures are harness failures,
  not merely model failures.
- `agent-untrusted-input-security`: prompt files, downloaded scripts and tool
  metadata are executable trust surfaces.
- A2A decision: local file/Git coordination is a harness-specific transport,
  not a reason to add cross-agent network protocol support to every agent.

### Adds

- a concrete minimal file schema for local role handoff;
- a useful distinction between task transport and wake notification;
- explicit queue lifecycle directories and one-current-task invariant;
- empirical evidence that durable delivery still needs liveness reconciliation;
- a topology ladder from compact review pair to fuller verification pipeline.

### Contradicts or sharpens

- worktree-per-role is insufficient as runtime isolation;
- a separate QA role is not independent if it can repair the evidence it grades;
- `latest` dependency installation and permission bypass must not be inherited
  from a role constitution;
- observable terminal windows are useful for humans but are not monitoring,
  health checks or completion evidence.

## Recommended Pritha Pattern

For a local multi-agent coding team, use a small host-owned handoff envelope:

```yaml
handoff_id: stable-id
task_id: stable-task
from_role: coder
to_role: reviewer
artifact_revision: full-commit-sha
contract_revision: instruction-hash
priority: 50
state: queued|claimed|completed|failed|cancelled
created_at: timestamp
claimed_at: null
lease_expires_at: null
verification_required: true
```

Required host behavior:

1. validate the sender, recipient, contract revision and full artifact identity;
2. publish atomically;
3. claim with an atomic move or lease;
4. make notification idempotent and non-authoritative;
5. reconcile stale queued and claimed work;
6. separate executor, reviewer and read-only verifier when risk warrants it;
7. preserve user changes and check workspace revision before merge;
8. keep runtime queues out of tracked authored memory;
9. record only curated lessons after the run.

## Expert Lenses

### Architecture

The file queue and adapter boundaries are appropriately small. The branch-based
distribution model and terminal-dependent liveness couple packaging,
orchestration and UI more tightly than Pritha should accept.

### Security

No license, floating downloads, startup installation of latest tools and
permission-bypass examples are blocking adoption risks. Worktrees are not a
sandbox.

### Developer Experience

Watching role terminals and using simple helper commands is understandable.
Six separate windows, implicit merge prose and branch-specific installation
increase operator burden. A single status surface should summarize queue age,
role state, current revision and recovery action.

### Product Pragmatism

The two-role pattern may be useful for selected coding agents. Four or six roles
should require measured improvement over one executor plus one fresh verifier.
Otherwise token cost, latency and merge churn outweigh the extra ceremony.

### Standards Editing

No new standalone Pritha standard is needed. The durable handoff and liveness
requirements belong in `agent-team-operating-model`; isolation and evidence
remain governed by existing standards.

## Adoption Decision

`repository_adoption_recommendation: reject`

This means reject code/module adoption at the verified revisions, not reject the
ideas. Use the repository as reference-only evidence for:

- typed local handoffs;
- durable queue lifecycle;
- role/worktree ownership;
- minimal-to-full team topology selection;
- transport/notification separation;
- liveness and reconciliation eval cases.

Reconsider only if the repository gains a compatible license, pinned release or
commit-based bootstrap, permission-safe defaults, inbox reconciliation,
unambiguous merge semantics, CI evidence and a contract-specific Pritha eval.

## Open Questions

- Will issue 34 be resolved with at-least-once notification and inbox
  reconciliation?
- Will a license and versioned release process be added?
- Can the role topology demonstrate higher accepted-result quality per cost than
  a simpler executor/verifier pair?
- Can the QA role become read-only or be followed by a truly independent grader?
- Can effective prompt/constitution bundles be content-locked and audited?

## Temporal Validity

- Repository created: 2026-04-17.
- Main revision checked: 2026-07-10 commit `9acd54d223...`.
- Repository activity checked through: 2026-08-12.
- Retrieved and verified: 2026-08-13.
- Recheck on: license addition, tagged release, handoff-daemon liveness fix,
  bootstrap redesign, CI/security policy or a Pritha child-agent contract that
  proposes SwarmForge adoption.
