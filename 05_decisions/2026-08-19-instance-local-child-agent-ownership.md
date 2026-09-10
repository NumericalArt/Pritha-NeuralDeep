---
id: 2026-08-19-instance-local-child-agent-ownership
type: decision
status: accepted
created: 2026-08-19
updated: 2026-08-19
topics:
  - pritha
  - child-agents
  - instance-isolation
  - github-publication
tools:
  - Git
  - GitHub
  - Codex
sources:
  - operator-architecture-direction-2026-08-19
related:
  intakes: []
  briefs: []
  reviews: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/memory-domains.md
  workflows:
    - docs/instance-isolation.md
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-19
source_updated: 2026-08-19
source_version: operator decision 2026-08-19
retrieved: 2026-08-19
verified: 2026-08-19
valid_for: Pritha multi-instance architecture from 2026-08-19
temporal_status: current
review_date: 2026-11-19
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
subject:
  kind: decision
  id: instance-local-child-agent-ownership
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: Instance-Local Child-Agent Ownership

Date: 2026-08-19
Status: accepted

## Context

Pritha has multiple local instances that share one platform architecture through
GitHub. Each instance can also create child agents, their contracts, Outcome
Specs, research, lifecycle reports, profiles, registry entries and sibling
project folders. Treating those live artifacts as shared repository content
causes one instance's agents to appear in other instances after an update.

## Decision

- GitHub carries Pritha platform code, shared standards, workflows, templates
  and explicitly promoted reusable knowledge.
- Every new child agent belongs to exactly one Pritha instance.
- Live child-agent artifacts are stored under that instance's external
  `PRITHA_STATE_ROOT/agents/`.
- If external instance configuration is unavailable in a Git checkout, live
  child-agent artifacts fall back to gitignored `.private/agents/`, never to
  tracked `11_agents/`.
- Child-agent project folders resolve only through the owning instance's
  `PRITHA_AGENT_PARENT`.
- Fleet rollout updates shared Pritha architecture only. It does not copy,
  merge or reconcile child agents between instances.
- Moving local child-agent material into shared authored knowledge requires a
  separate explicit promotion and review. Promotion is selective knowledge
  reuse, not transfer of agent ownership or runtime state.

## Consequences

- Updating Pritha from GitHub cannot introduce another instance's newly created
  agents.
- Local registries may intentionally differ while all instances run the same
  Pritha commit.
- Instance configuration must be loaded before Agents Mother modules initialize.
- Fleet verification must check both shared commit equality and local registry
  isolation.
- Existing historical material in tracked `11_agents/` remains shared reference
  knowledge but is not the live registry for an isolated instance.

## Alternatives considered

- One shared Git registry for all child agents: rejected because it creates
  implicit cross-instance transfer.
- Automatic registry merge during fleet rollout: rejected because ownership and
  privacy boundaries cannot be inferred safely.
- Naming conventions alone: rejected because names do not prevent filesystem or
  Git synchronization.

## Temporal basis

- Source published: 2026-08-19
- Source updated: 2026-08-19
- Source version: operator decision 2026-08-19
- Retrieved: 2026-08-19
- Verified: 2026-08-19
- Valid for: Pritha multi-instance architecture from 2026-08-19
- Freshness status: current
- Temporal status: current
- Supersedes: none
- Superseded by: none

## Review date

2026-11-19
