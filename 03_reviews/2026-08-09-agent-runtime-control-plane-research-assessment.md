---
id: 2026-08-09-agent-runtime-control-plane-research-assessment
type: assessment
status: accepted
created: 2026-08-09
updated: 2026-08-09
topics:
  - agent-runtime
  - control-plane
  - long-running-agents
  - mcp
  - agent-skills
  - agent-memory
  - agent-evaluation
  - supply-chain-security
tools:
  - Pritha
  - Codex
  - MCP
  - Google Managed Agents
  - Anthropic Managed Agents
  - LangChain Deep Agents
  - LongHorizon-Harness
  - SWE-Touch
sources:
  - 00_inbox/texts/2026-08-09-agent-runtime-control-plane-research-intake.md
  - https://blog.modelcontextprotocol.io/posts/2026-07-28/
  - https://modelcontextprotocol.io/seps/2575-stateless-mcp
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents
  - https://ai.google.dev/gemini-api/docs/agent-hooks
  - https://platform.claude.com/docs/en/managed-agents
  - https://platform.claude.com/docs/en/build-with-claude/task-budgets
  - https://www.langchain.com/blog/introducing-managed-deep-agents
  - https://github.com/langchain-ai/deepagents
  - https://github.com/openai/plugins
  - https://arxiv.org/abs/2608.00808
  - https://arxiv.org/abs/2608.01964
  - https://github.com/AMAP-ML/LongHorizon-Harness
  - https://arxiv.org/abs/2607.26637
  - https://arxiv.org/abs/2608.02499
  - https://github.com/Trae1ounG/SWE-Touch
  - https://arxiv.org/abs/2608.05223
  - https://github.com/awsm-research/AgentJailbreak
  - https://arxiv.org/abs/2607.25619
  - https://arxiv.org/abs/2608.02302
related:
  signals:
    - 01_sources/signals/2026-08-09-agent-runtime-control-plane-signal.md
  standards:
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-harness-evaluation.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-28
source_updated: 2026-08-09
source_version: MCP 2026-07-28; vendor documentation and repositories verified at current HEAD on 2026-08-09
retrieved: 2026-08-09
verified: 2026-08-09
valid_for: agent architecture research and Pritha child-agent contracts from 2026-08-09
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-runtime-control-plane
privacy: public
retention: durable
review_status: accepted
confidence: high
recommendation: adopt-portable-invariants-with-vendor-adapters
---

# Assessment: Agent Runtime Control Plane Research

## Executive Assessment

Исследование содержит сильную архитектурную гипотезу, но неоднородную
доказательную базу. Его полезное ядро подтверждено: долгоживущим агентам нужен
отдельный control plane с durable state, typed lifecycle, независимой политикой,
актуальностью workspace и внешней проверкой завершения.

Pritha не должна переносить vendor-specific API напрямую в child-agent
scaffolds. Следует принять переносимые контракты и адаптеры, а конкретные
платформы выбирать по agent contract.

Итог:

- **adopt now:** execution ledger, workspace revision binding, independent
  verifier, fail-closed skill activation, MCP 2026-07-28 compatibility rules;
- **experiment:** lifecycle memory policy, paired stale-workspace evals,
  structured pause/resume reasons;
- **watch:** vendor-managed agent runtimes, self-segmented training data;
- **reject as current fact:** неподтвержденные релизы, названия и метрики.

## Verification Method

- Official documentation and protocol specifications were preferred.
- Research claims were checked against paper abstracts and available code.
- GitHub repositories were inspected read-only at their current default branch;
  no external repository was cloned, installed or executed.
- Product availability, version and beta status were checked on 2026-08-09.
- Unverifiable claims remain explicit open questions.

## Claim Verification Matrix

| Claim area | Status | Evidence and correction | Pritha consequence |
| --- | --- | --- | --- |
| MCP 2026-07-28 stateless core | confirmed | Official release removes mandatory initialization/session identity from the core request model, adds explicit per-request identity/capabilities, discovery, MRTR, cache-oriented metadata and extensions including Tasks. | Implement a version-aware adapter and migration tests; do not assume old session semantics. |
| Google managed sandboxes and lifecycle | confirmed with caveats | Managed Agents are Pre-GA; persistent sandbox state, environment reuse, network allowlists and triggers are documented. Sandboxes are not a production assurance by themselves. | Useful reference for environment/state separation, not a default vendor dependency. |
| Google Agent Hooks as security enforcement | partly confirmed, unsafe as sole gate | Hooks can run before/after tools and may deny. Documentation also says crash, timeout, non-2xx and malformed response permit execution. | Hard security policy must be enforced by a fail-closed host/runtime boundary outside hooks. |
| AWS Dogwood temporal policy release | unverified | Current AgentCore Policy documentation confirms deterministic Cedar gateway policy, but no primary source for the named Dogwood release or asserted trajectory semantics was found. | Keep temporal policy as a Pritha architectural requirement without attributing it to this product claim. |
| Anthropic inference hooks, hard money budget and advisor role | unverified or overstated | Managed Agents, sessions, environments, skills and advisory task token budgets are documented. The checked docs do not establish the claimed external inference-hook security server, `budget_reached` status, hard money cap or advisor role. | Use only documented primitives; enforce hard budgets in Pritha's host control plane. |
| LangChain Managed Deep Agents public beta | contradicted | Official announcement and current signup describe private beta. Open-source `deepagents` is available under MIT and relies on LangGraph/LangChain middleware and host tools. | Open-source library may be evaluated; managed service must remain candidate-only. |
| Universal Agent Plugins root manifest | contradicted/mixed | OpenAI's current format requires `.codex-plugin/plugin.json`. A root `plugin.json` appears in another plugin ecosystem and is not a cross-vendor universal standard. | Treat plugin schemas as platform adapters; keep a Pritha-owned internal manifest. |
| Codex CLI 0.147 specific features | unverified | Current official Codex material checked for this assessment documents Agent Plugins around CLI 0.146 and does not support the pasted 0.147 details. | Pin and verify actual CLI version before scaffold or migration decisions. |
| AWS cloud-to-local MCP bridge reference implementation | unverified | No matching primary AWS reference with the asserted browser-extension/native-messaging design was found. | The pattern is a design hypothesis only; require explicit threat model and implementation evidence. |
| Prime Intellect released multi-agent RL abstractions | unverified/forward-looking | Current `prime-rl` supports asynchronous RL infrastructure; Prime Intellect described multi-agent training as future work in the checked material. | Do not encode the claimed Agent/Episode/Hierarchical-GRPO API as current capability. |
| Named cyber incidents and OpenAI Astra rating | unverified | No matching primary incident report or official product/system-card evidence was found. | Preserve the general rule that prompts are not a sandbox; discard the unsupported names and numbers. |

## Research and Code Evidence

### Ledger

The 2026-08-01 preprint reports that a compact external ledger improved several
SWE-bench Verified agents while reducing cost. This is author-reported preprint
evidence; no matching public implementation was found during verification.

Adopt the concept, not the claimed implementation:

- task decomposition;
- verified fact vs agent claim;
- artifact and workspace revision;
- next action and blocker;
- compact rendering back into context.

### LongHorizon-Harness

The paper and MIT repository provide the strongest directly inspectable runtime
evidence in the batch. The code separates manager, executor and auditor roles;
stores task state and task contract between rounds; rejects completion without a
clean, aligned audit; detects auditor writes; and restores the pre-audit
workspace snapshot when possible.

Reusable pattern:

```text
manager -> fresh executor -> read-only auditor -> verified task state
```

Do not vendor the harness by default. Its topology should first be reproduced
as a small contract-specific eval because extra agents add latency and cost.

### Filesystem Memory

The 2026-07-29 paper supports three cautious conclusions:

- file organization can reduce retrieval cost at larger scale;
- most tested agents do not maintain organization reliably over time;
- the available filesystem tools influence memory structure as much as the
  model.

Therefore lifecycle policy belongs in deterministic code: promotion,
deduplication, compaction, expiry, quarantine and retrieval logging. A stronger
model is not an adequate memory-maintenance strategy.

### SWE-Touch

The paper and MIT repository evaluate coding agents after a user changes code
during the task. Its pipeline uses immutable intermediate artifacts, independent
three-state candidate validation and paired runs with controlled variables.

Pritha should add a stale-workspace eval class:

1. agent reads revision `r1`;
2. external actor creates `r2`;
3. agent must detect the mismatch;
4. old evidence is invalidated or selectively reverified;
5. the agent preserves authoritative user changes.

### Malicious Skills and SkillGate

Two preprints provide empirical evidence that skill files are a high-risk
instruction surface and that pre-install scanning can reduce exposure. The
AgentJailbreak repository contains a replication pipeline and attack corpus, but
has no detected repository license and includes executable adversarial content.
It must not be installed, vendored or used as an active child-agent skill.

SkillGate is research evidence for layered scanning, not an endorsed package or
automatic trust decision. Static or model-based scanning can miss attacks and
must be combined with provenance, content locks, permissions, isolation,
side-effect evals and human approval.

### Self-Segmented Trajectories

The preprint supports self-segmentation as a possible data-preparation technique,
but its reported downstream preference-optimization result is limited. Keep it
research-only until independent reproduction shows benefit for Pritha's own
agent tasks.

### Unverified Paper Names

No matching primary publication was found for the supplied `LoopsBench` and
`MAPLE-Guard` names and metrics. Similar names in unrelated products must not be
used as substitute evidence.

## Reusable Architecture for Child Agents

### Execution ledger

Minimum record:

```yaml
run_id: stable-id
objective_version: sha256-or-revision
workspace_revision: git-sha-or-state-token
state: running|input_required|paused|budget_exhausted|blocked|verifying|complete
verified_facts: []
agent_claims: []
artifacts: []
next_action: null
budget_state: {}
policy_decisions: []
evidence_refs: []
```

An `agent_claim` never becomes a `verified_fact` merely because it was repeated,
summarized or stored in memory.

### Hook bus

Normalize hooks as observable extension points:

- `on_run_start`;
- `before_tool`;
- `after_tool`;
- `before_external_effect`;
- `on_pause`;
- `on_resume`;
- `before_completion`;
- `after_verification`.

Hooks may enrich, log, advise or request a pause. A fail-open vendor hook must
not implement the only authorization boundary. Irreversible effects require a
host-owned fail-closed gate.

### Typed lifecycle

Use structured reason codes such as:

- `input_required`;
- `policy_denied`;
- `budget_exhausted`;
- `workspace_stale`;
- `dependency_unavailable`;
- `verification_failed`;
- `operator_paused`.

Resume must revalidate contract version, workspace revision, credential lease,
budgets and pending side effects.

### Memory lifecycle

Separate:

- transient run context;
- verified execution state;
- curated reusable knowledge;
- private user memory;
- quarantined untrusted input.

Promotion between layers requires explicit evidence and privacy routing.

### Protocol and plugin adapters

- Keep Pritha's internal connector/plugin manifest vendor-neutral.
- Translate to platform-specific MCP/plugin schemas at the boundary.
- Store protocol and platform version with generated configuration.
- Test old/new MCP semantics during migration.
- Do not infer cross-platform portability from similar folder names.

## Expert Lenses

### Architecture

The control plane should remain a small deterministic kernel around model
workers. Durable state, policies, lifecycle and evidence are host concerns;
planning and execution can remain model-driven.

### Security and Privacy

Untrusted skills, tool schemas, hook output, MCP metadata and repository content
must remain outside trusted instructions until reviewed. Prompts do not replace
OS, network, credential or approval boundaries. Raw adversarial payloads do not
belong in tracked memory.

### Developer Experience

Typed states and one compact ledger simplify debugging and restart. The danger
is ceremony: lightweight, one-shot tasks need a reduced contract rather than the
full manager/executor/auditor topology.

### Product Pragmatism

Adopt invariants before platforms. The highest-value near-term work is updating
existing Pritha standards and eval contracts, not building a new orchestration
service or adopting a managed-agent vendor.

### Standards Editing

The research mainly confirms and sharpens existing standards. Three focused
updates are preferable to a new overlapping standard:

- trajectory control: ledger, revision freshness, typed lifecycle;
- MCP lifecycle: 2026-07-28 migration boundary and MRTR;
- skill lifecycle: empirical threat evidence and isolated activation gate.

## Trade-offs

| Pattern | Benefit | Cost or risk |
| --- | --- | --- |
| Execution ledger | recoverability, compact context, auditability | schema/version maintenance |
| Independent verifier | stronger completion evidence | extra latency and inference cost |
| Workspace revision binding | prevents stale-action errors | revalidation and retry overhead |
| Host policy gate | security independent of model | more deterministic runtime code |
| Lifecycle memory | lower context cost and less contamination | curation, expiry and migration work |
| MCP dual-version adapter | safer protocol migration | temporary compatibility complexity |
| Skill quarantine and smoke eval | reduces supply-chain risk | slower activation and reviewer effort |

## Decision

Accepted as an enrichment of `agent-building-knowledge` with these boundaries:

- adopt portable invariants and test shapes;
- do not adopt external repositories or managed platforms automatically;
- retain unverified claims only in this assessment matrix;
- recheck vendor-specific APIs immediately before a child-agent contract uses
  them;
- require contract-specific evaluation before promoting experimental patterns.

## Open Questions

- What is the minimum ledger schema that Pritha's current harness can emit
  without duplicating existing run reports?
- Which state token should represent non-Git workspaces?
- Should stale-workspace intervention become a required eval only for coding
  agents, or for all mutable external systems?
- When will enough MCP clients and servers support 2026-07-28 semantics to drop
  compatibility paths?
- Can a small deterministic skill scanner achieve useful recall without making
  normal skill authoring too costly?

## Temporal Validity

- Research publication window: 2026-07-28 through 2026-08-05.
- Product documentation and repositories retrieved and verified: 2026-08-09.
- Valid for: architecture selection and child-agent contract research from
  2026-08-09.
- Recheck when: MCP publishes another protocol revision; vendor beta status or
  hook semantics change; Pritha implements durable agent runtime; or external
  skills/plugins become activatable by default.
