---
id: 2026-06-07-yandex-ai-safe-agent-security-assessment
type: assessment
status: draft
created: 2026-06-07
updated: 2026-06-07
topics:
  - agent-security
  - ai-safe
  - threat-modeling
  - child-agents
  - codex-native
  - mcp-security
  - memory-security
tools:
  - Pritha
  - Codex
  - AI-SAFE
  - OWASP LLM Top 10
  - OWASP MCP Top 10
  - OWASP Agentic Applications
sources:
  - https://yandex.cloud/ru/security/ai-safe
  - https://storage.yandexcloud.net/cloud-www-assets/blog-assets/ru/posts/2025/09/ai-safe-framework/AI%20Secure%20Agentic%20Framework%20Essentials%20%28AI-SAFE%29%20v%201.0.pdf
  - https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/
  - https://owasp.org/www-project-mcp-top-10/
  - https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/
  - https://genai.owasp.org/resource/securing-agentic-applications-guide-1-0/
related:
  intakes:
    - 00_inbox/links/2026-06-07-ai-safe-agentic-framework.md
  source_notes:
    - 01_sources/notes/2026-06-07-ai-safe-framework-source-note.md
  signals:
    - 01_sources/signals/2026-06-07-ai-safe-agent-security-signal.md
  standards:
    - 04_standards/agent-ai-safe-security-checklist.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-proactivity-scheduling.md
supersedes: []
superseded_by: []
source_type: document
source_class: document
ingested_at: 2026-06-07T17:05:15Z
processed_at: 2026-06-07T17:05:15Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-9520dbee-1888-466a-94d4-55c0305b06b9
recommendation: standard
freshness_status: changed
source_published: 2025-09-26
source_updated: 2025-10-15
source_version: AI-SAFE v1.0, PDF metadata modified 2025-10-15, OWASP references checked 2026-06-07
retrieved: 2026-06-07
verified: 2026-06-07
valid_for: Pritha child-agent security review as a five-layer checklist, with OWASP-agentic appendix treated as version-bound
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: ai-safe-agent-security-checklist
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Assessment: AI-SAFE v1.0 for Pritha Child-Agent Security

Date: 2026-06-07
Status: draft
Recommendation: standard

## One-Paragraph Read

AI-SAFE v1.0 is a strong security lens for Pritha because it organizes agentic AI risks by system layer rather than by one narrow attack type. For Codex-native child agents, the useful part is not the Yandex Cloud product mapping, but the model of interface, reasoning/planning, knowledge, execution/tools and infrastructure/orchestration controls. It confirms most of Pritha's current standards and adds a compact checklist that can be embedded into agent contracts and scaffold readiness.

## Why It Matters

- Pritha creates agents by composing modules. AI-SAFE gives a security pass for each module boundary.
- Child agents may ingest links, Telegram posts, files, repositories, websites, screenshots, voice and RAG material. These are exactly the inputs AI-SAFE treats as cross-layer attack surfaces.
- Codex-native architecture still has privileged surfaces: AGENTS.md, shell, local repo files, MCP, skills, memory indexes, interface adapters and operations scripts.
- AI-SAFE's checklist is immediately useful as a contract/template addition.

## Technical Claims

- Agent systems are not just LLMs. They include interface, memory, planning, tools, feedback and infrastructure.
- Prompt injection, output handling and rate limiting belong at the interface boundary.
- Tool misuse, privilege escalation, tool metadata poisoning and auth bypass belong at the execution/tool boundary.
- Supply-chain issues, resource overload, cross-agent poisoning and orchestration attacks belong at the infrastructure/multi-agent boundary.
- Jailbreaking, reasoning collapse, goal manipulation and HITL overload belong at the reasoning/planning boundary.
- Memory/RAG threats include knowledge-base poisoning, sensitive data disclosure, retrieval manipulation and embedding inversion.
- The practical checklist recommends validation, rate limits, output schemas, prompt hardening, execution timeouts, audit logs, RBAC for knowledge, PII masking, knowledge-base integrity, least privilege, sandboxing, human approval, supply-chain scanning, cost budgets and agent isolation.

## Agent Environment Profile

- Agent platforms: Pritha-created Codex-native agents, optional Telegram/web/API adapters, MCP/skills-enabled agents, multi-agent descendants.
- Model context: frontier reasoning/Codex for planning and coding; smaller/local models only for validated bounded subtasks.
- Runtime environment: local project folder, Codex App/thread, CLI, optional service/runtime adapters.
- Config surfaces: `AGENTS.md`, `agent-contract`, tool schemas, MCP manifests, skill metadata, memory manifests, operations manifests.
- Portability: adapter-needed.
- Codex adaptation: use decision/tool/action traces rather than hidden chain-of-thought logs; use local scripts/tests for deterministic checks; keep raw external inputs quarantined before memory writes.
- Environment-specific caveats: Yandex Cloud products are examples, not required Pritha dependencies.

## Existing Knowledge Check

- Related existing artifacts:
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-untrusted-input-security.md`
  - `04_standards/agent-runtime-placement.md`
  - `04_standards/agent-tool-integration-selection.md`
  - `04_standards/agent-mcp-connector-lifecycle.md`
  - `04_standards/agent-skill-pack-lifecycle.md`
  - `04_standards/agent-proactivity-scheduling.md`
  - `04_standards/agent-interface-experience.md`
- Relationship to existing knowledge: refines.
- Artifacts to mark outdated or superseded: none.

AI-SAFE confirms Pritha's existing rules for untrusted input, least-privilege tools, sandbox/isolation decisions, no copied secrets, approval gates, memory-domain separation and explicit operations policy. It refines them by providing a single cross-layer review checklist for every non-trivial child-agent contract.

## Techscope Adoption Check

- Techscope/Agents Mother fit: adopt.
- Why: adopt as a contract/scaffold security lens, not as a vendor platform dependency.
- Implementation cost: low.
- Operational complexity: low to medium.
- Current architecture impact: add a checklist standard and contract fields; no runtime rewrite required.
- Freshness/technology timing: useful now, but the OWASP agentic appendix is version-bound.
- Decision: create `04_standards/agent-ai-safe-security-checklist.md` and wire it into Pritha workflow/template.

## Freshness Check

- Official/current sources checked:
  - Yandex AI-SAFE public page and PDF.
  - OWASP Top 10 for LLM Applications 2025.
  - OWASP MCP Top 10 project page.
  - OWASP Top 10 for Agentic Applications 2026 announcement.
  - OWASP Securing Agentic Applications Guide 1.0.
- Freshness status: changed.
- Source published: 2025-09-26 public announcement.
- Source updated: 2025-10-15 PDF metadata.
- Source version: AI-SAFE v1.0.
- Retrieved: 2026-06-07.
- Verified: 2026-06-07.
- Valid for: Pritha security checklist and threat-modeling vocabulary.
- Temporal status: version-bound.
- Temporal compatibility with existing artifacts: compatible, but the source's OWASP Agentic AI Top 15 appendix should not be treated as current final OWASP taxonomy after OWASP's late-2025/2026 agentic Top 10 materials.
- Notes: AI-SAFE's threat matrix and practical checklist use different ordering for levels 2-5. Pritha should use layer names as stable keys, not only level numbers.

## Programming Relevance

Score: 5/5

Useful for building agent backends, tool policies, validation layers, output schemas, RAG storage, sandboxing and operational budgets.

## Agent Engineering Relevance

Score: 5/5

Directly relevant to Pritha's mission: it helps turn a vague agent idea into a security-reviewed contract before scaffold.

## DX Impact

Score: 4/5

A concise layer checklist improves consistency without forcing every small agent into heavy enterprise controls. The checklist must stay conditional: selected modules get checked, skipped modules stay skipped.

## Evidence Quality

Score: 4/5

The source is official vendor security guidance and aligns with OWASP/NIST/MITRE framing. Evidence is high enough for a draft Pritha standard, but not enough to copy its incident claims or vendor controls uncritically.

## Practicality

Score: 5/5

Immediately applicable to contract templates, scaffold readiness reports and child-agent reviews.

## Leverage

Score: 4/5

The highest leverage is preventing cross-layer blind spots: secure prompt text alone is not enough if tool permissions, memory writes, output handling or service budgets are weak.

## Risk

Score: 3/5

The main risk is overfitting to Yandex Cloud controls or stale OWASP taxonomy. Mitigation: keep the standard vendor-neutral and recheck OWASP agentic guidance before production promotion.

## Expert Lenses

### Programming

Adopt the validation, schema, timeout, budget, sandbox and supply-chain parts as engineering requirements for relevant modules.

### Agent Engineering

Use AI-SAFE as the child-agent security profile. It should sit beside runtime placement, MCP lifecycle, skills lifecycle and untrusted-input policy.

### DX

Add fields to the contract template. Avoid making small local agents fill irrelevant controls for unselected modules.

### Security

Strong fit. It reinforces least privilege, RBAC, secret boundaries, sandboxing, tool metadata integrity, memory poisoning defenses, budget caps and cross-agent isolation.

### Evidence

The framework is credible as vendor guidance. Current OWASP pages show the agentic taxonomy has evolved, so appendix terms should be checked before being used as final classification.

### Product Pragmatism

Adopt the checklist now. Do not spend engineering effort integrating Yandex-specific services unless a child agent is actually deployed on Yandex Cloud.

## Decision

Create a draft standard and wire it into the Pritha creation flow as a reusable child-agent security profile.

## Next Artifact

standard
