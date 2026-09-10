---
id: 2026-05-28-pritha-product-identity-self-knowledge-brief
type: brief
status: active
created: 2026-05-28
updated: 2026-05-28
topics: [pritha, product-identity, marketing, self-knowledge, agents-mother]
tools: [Pritha, Techscope, Codex]
agent_platforms: [Codex, Claude Code]
model_context: [GPT-5 Codex]
runtime_environment: [local-project, codex-desktop, cli]
config_surfaces: [README.md, docs, workflows, memory]
portability: codex-native
sources:
  - README.md
  - docs/architecture.md
  - docs/pritha.md
  - docs/realtime.md
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 05_decisions/2026-05-28-pritha-rebrand.md
  - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
related:
  intakes: []
  reviews:
    - 03_reviews/2026-05-28-techscope-quality-and-release-pattern-review.md
  decisions:
    - 05_decisions/2026-05-28-pritha-rebrand.md
  contracts:
    - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: pritha-v0.1-local-release-candidate
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha product identity and self-description before v0.1.0 GitHub release
temporal_status: current
---

# Brief: Pritha Product Identity As Self-Knowledge

Date: 2026-05-28
Source: local Pritha roadmap, README and release docs
Status: active

## Summary

Pritha's informational and marketing layer is part of the Techscope/Pritha knowledge base, not a detached website copy block. It describes what Pritha is, who it is for, what promises it makes, and which claims must stay synchronized with actual capabilities.

## Key Claims

- Product name: Pritha.
- Category: Mother of Agents / AI Agent Creator.
- Technical description: spec-to-agent compiler.
- Plain-English technical metaphor: Pritha is a harness for an agent that builds the harness of a new agent.
- Lineage metaphor: Pritha uses a genetic principle: seed, inheritance, mutation, trial and descendant.
- Primary slogan: "The AI agent that creates AI agents."
- Secondary slogan: "From spec to specialist."
- Practical promise: Pritha turns a user-provided or dialog-created agent specification into a working, testable agent scaffold with documented harness, memory, tools, operations and handoff.
- Compatibility promise: Pritha v0.1 is Codex-native; a Claude Code version is coming as a future adapter, not as a current release claim.

## Knowledge Handling Rule

Product identity, positioning, landing-page copy, short descriptions, slogans, release notes and public-facing claims are treated as curated knowledge. They can be updated through the same flow as other Techscope knowledge:

- new source or user correction enters as intake/brief/review;
- claims are checked against current implementation and release status;
- outdated claims are marked `outdated` or superseded;
- public docs are updated only after the knowledge artifact and evidence agree.

## Guardrails

- Marketing claims must not outrun implementation. If GitHub release, live CI, hosted demos, connectors, MCP support or skills support are not actually available, public copy must say so.
- The product story should reflect Pritha's real architecture: contract-selected modules, minimal sufficient harness, explicit setup/status checks, and no silent autostart or secret copying.
- "Adopted pattern" means "available for Pritha to select by contract", not "installed into every generated agent".
- If realtime voice control is selected, the default realtime tool surface is internet access, memory access and Codex CLI sidecar access. Product/docs language can describe this as a setup default only when setup readiness reports those tool surfaces.
- "Claude Code version is coming" is allowed as roadmap copy; it must not imply that v0.1 already generates or tests Claude Code-native projects.
- Pritha-created agents remain evolvable after scaffold. The normal Codex-native continuation path is to open the descendant in Codex App and improve it through its own instructions, manifests, tests and memory.
- Internet resources that do not directly belong to a descendant's domain are still useful as self-improvement inputs. They should be evaluated for possible improvements to harness, memory, tools, skills, MCP, evals, UX, safety or operations, not silently mixed into domain memory.

## Existing Knowledge And Freshness

- Related existing artifacts: README, Pritha docs, rebrand decision, quality roadmap, pattern review.
- Relationship to existing knowledge: refines.
- Official/current sources checked: local source of truth.
- Freshness status: current.
- Source published: 2026-05-28.
- Source updated: 2026-05-28.
- Source version: pritha-v0.1-local-release-candidate.
- Retrieved: 2026-05-28.
- Verified: 2026-05-28.
- Valid for: pre-GitHub-release Pritha self-description.
- Temporal status: current.
- Artifacts to mark outdated or superseded: none.

## Recommendation

Keep this brief linked from future marketing/docs/release decisions. When Pritha gains new capabilities, such as live GitHub release, MCP catalog composition, external skills packaging or hosted demos, update this self-knowledge brief or create a superseding one before changing public claims.

## Next Step

After GitHub publication, create a release brief that updates `source_version`, verifies public URLs and marks any pre-release caveats as superseded.
