---
id: 2026-06-07-ai-safe-agent-security-signal
type: signal
status: refined
created: 2026-06-07
updated: 2026-06-07
topics:
  - agent-security
  - ai-safe
  - threat-modeling
  - child-agents
  - codex-native
tools:
  - Pritha
  - Codex
  - AI-SAFE
  - OWASP LLM Top 10
  - OWASP MCP Top 10
sources:
  - source-9520dbee-1888-466a-94d4-55c0305b06b9
related:
  intakes:
    - 00_inbox/links/2026-06-07-ai-safe-agentic-framework.md
  source_notes:
    - 01_sources/notes/2026-06-07-ai-safe-framework-source-note.md
  assessments:
    - 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
  standards:
    - 04_standards/agent-ai-safe-security-checklist.md
generated_from:
  - source-9520dbee-1888-466a-94d4-55c0305b06b9
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: ai-safe-agent-security-checklist
privacy: public
retention: source-purged
review_status: draft
confidence: high
---

# Signal: AI-SAFE as Pritha Child-Agent Security Lens

Date: 2026-06-07
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core Signal

AI-SAFE is useful for Pritha as a cross-layer security review vocabulary for created agents. Its five layers map cleanly onto child-agent contracts: interface, reasoning/planning, memory/RAG, tools/execution and infrastructure/orchestration.

## Technical Details

- Interface risks cover prompt injection, context-window overload, output handling and user/API ingress.
- Reasoning risks cover jailbreaks, goal manipulation, looping, excessive task complexity and HITL overload.
- Knowledge risks cover memory poisoning, sensitive data disclosure, retrieval manipulation and embedding/vector-store exposure.
- Execution risks cover tool misuse, privilege escalation, tool metadata poisoning and auth bypass.
- Infrastructure risks cover supply chain, budget/resource overload, agent isolation and cross-agent communication poisoning.

## Agent Design Implications

- A Pritha child-agent contract should record an AI-SAFE review status for each selected module.
- `codex-native` does not remove the need for this review: AGENTS.md, shell tools, local files, MCP, skills, memory indexes and interface adapters are all security surfaces.
- For Codex-native agents, "reasoning trace" should mean a decision/tool/action trace, not storing hidden model chain-of-thought.
- The AI-SAFE checklist should be vendor-neutral. Yandex services are examples, not required dependencies.

## Candidate Rules

- Add an `AI-SAFE security profile` section to the agent contract template.
- Require the checklist before scaffolding agents with external input, tools, memory, deployment, proactivity or multi-agent coordination.
- Treat layer numbers as less stable than layer names because the source's threat matrix and checklist order differ.
- Recheck current OWASP agentic guidance before using the source appendix as authoritative taxonomy.

## Noise Removed

- Cloud-provider product recommendations.
- Incident anecdotes that are illustrative but not enough to define Pritha standards alone.
- Vendor-specific control names where a local, Codex-native control is the correct equivalent.

## Verification Required

- Confirm current OWASP agentic application guidance before production promotion.
- Run the new checklist against at least one future child-agent contract and capture lifecycle evidence.

## Codex Refinement Result

Create a draft standard and link it into Pritha's creation workflow and contract template.
