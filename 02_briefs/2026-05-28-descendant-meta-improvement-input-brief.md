---
id: 2026-05-28-descendant-meta-improvement-input-brief
type: brief
status: active
created: 2026-05-28
updated: 2026-05-28
topics: [pritha, descendant-agents, meta-improvement, codex-native, harness]
tools: [Pritha, Codex, AGENTS.md, MCP, skills]
agent_platforms: [Codex]
model_context: [GPT-5 Codex]
runtime_environment: [codex-desktop, local-project]
config_surfaces: [AGENTS.md, docs, standards, memory]
portability: codex-native
sources:
  - AGENTS.md
  - 04_standards/agent-creation-harness.md
  - docs/pritha.md
related:
  standards:
    - 04_standards/agent-creation-harness.md
  briefs:
    - 02_briefs/2026-05-28-pritha-product-identity-self-knowledge-brief.md
  reviews: []
  decisions: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: pritha-descendant-meta-improvement-rule-v1
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha descendant-agent evolution workflow from 2026-05-28 onward
temporal_status: current
---

# Brief: Descendant Meta-Improvement Input

Date: 2026-05-28
Source: user clarification and local Pritha standards
Status: active

## Summary

Pritha creates minimal sufficient descendants, but those agents are expected to keep evolving. For Codex-native agents, the primary evolution path is opening the descendant project in Codex App and continuing work through the agent's own instructions, manifests, tests and memory.

## Key Claims

- A generated agent scaffold is a starting point, not a final ceiling.
- Future functionality can be added through the agent's native interface, especially Codex App for Codex-native descendants.
- If a descendant receives an external internet resource that is not directly relevant to its mission, the agent should not silently merge it into domain memory.
- Such material should be handled as meta-improvement input: possible evidence for improving harness, memory, data handling, skills, MCP, tools, evals, UX, safety or operations.
- Useful distilled lessons can stay inside the descendant's own memory or be sent back to Pritha/Techscope as reusable scaffold knowledge.

## Routing Rule

When an external resource arrives:

| Resource relation | Route |
| --- | --- |
| Directly supports the agent's domain task | Process through the agent's domain intake workflow. |
| Improves the agent's own architecture or operations | Process as self-improvement brief/review/decision. |
| Reusable across future agents | Send distilled lesson back to Pritha/Techscope as candidate scaffold knowledge. |
| Irrelevant or weak evidence | Archive or ignore with a short note. |

## Recommendation

Future Pritha descendants should document both paths: domain intake and self-improvement intake. This keeps agent memory clean while still allowing broad learning from YouTube videos, articles, repositories, docs, forum posts and other resources.

## Next Step

When scaffold templates are next updated, add this routing rule to generated `AGENTS.md` or descendant handoff docs.
