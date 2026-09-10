---
id: 2026-06-02-agent-skills-source-batch-signal
type: signal
status: refined
created: 2026-06-02
updated: 2026-06-11
topics:
  - agent-skills
  - procedural-memory
  - progressive-disclosure
  - skill-evals
  - prompt-injection
  - supply-chain-security
  - pritha
tools:
  - Agent Skills
  - Codex
  - Claude
  - GitHub Copilot
  - GitHub CLI
  - LangChain
  - MCP
sources:
  - source-agent-skills-batch-2026-06-02
related:
  reviews:
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
  standards:
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
  workflows:
    - 07_workflows/agent-skill-pack-selection.md
generated_from:
  - source-agent-skills-batch-2026-06-02
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-agent-skills-batch-2026-06-02
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-skill-pack-lifecycle
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Signal: Agent Skills Source Batch

Date: 2026-06-02
Status: refined
Source class: mixed
Retention: source-purged

## Core Signal

Agent Skills have become a portable procedural-memory layer for agents: a
skill is a focused package with `SKILL.md` plus optional references, scripts and
assets, discovered through compact metadata and loaded on demand. The same
property that makes skills valuable also makes them risky: external skills are
instruction-bearing supply-chain artifacts that can hide prompt injections,
malicious scripts, unsafe network calls or overly broad tool guidance.

## Useful Delta For Pritha

- Skills belong in the contract-selected harness layer, not in every child
  agent by default.
- Progressive disclosure is the right context model: expose concise skill
  metadata first, then load the full skill only when relevant.
- A skill catalog or official repository is discovery, not approval. Even
  official examples need license, version, script and dependency review before
  vendoring into a child scaffold.
- External skills must stay `candidate-only` until Pritha records provenance,
  pinning, hash, license, risk review and explicit user approval.
- Review must inspect all bundled files, not only `SKILL.md`: scripts,
  references, assets, dependency manifests and network calls are part of the
  behavior surface.
- Skill quality needs evals. A useful skill should be tested for trigger
  correctness, task improvement, artifact quality, required-step compliance,
  command/tool behavior and unwanted side effects.
- Small or local models may not select skills reliably. If a descendant uses a
  local/small model path, skill adoption needs model-specific evals rather than
  an assumption that the skill improves behavior.

## Pritha Rule Candidate

When a child-agent contract selects skills, Pritha should require:

- allowed skill sources;
- install mode;
- mutation policy;
- script/network policy;
- source pinning strategy;
- approval gate;
- eval plan;
- audit/update command;
- readiness status.

## Noise Removed

- Marketplace excitement and adoption claims are not promoted as standards.
- Concrete third-party catalog recommendations are treated as candidates, not
  trusted install sources.
- Product-specific install commands are kept as reference knowledge, not as
  automatic runtime behavior for Pritha.
