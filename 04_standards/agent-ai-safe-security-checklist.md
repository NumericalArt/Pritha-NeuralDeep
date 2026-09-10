---
id: agent-ai-safe-security-checklist
type: standard
status: draft
created: 2026-06-07
updated: 2026-06-07
last_reviewed: 2026-06-07
owner: Pritha
topics:
  - agent-security
  - ai-safe
  - threat-modeling
  - child-agents
  - codex-native
  - governance
tools:
  - Pritha
  - Codex
  - AI-SAFE
  - OWASP LLM Top 10
  - OWASP MCP Top 10
  - OWASP Agentic Applications
sources:
  - 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
  - https://yandex.cloud/ru/security/ai-safe
  - https://storage.yandexcloud.net/cloud-www-assets/blog-assets/ru/posts/2025/09/ai-safe-framework/AI%20Secure%20Agentic%20Framework%20Essentials%20%28AI-SAFE%29%20v%201.0.pdf
  - https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/
  - https://owasp.org/www-project-mcp-top-10/
  - https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/
  - https://genai.owasp.org/resource/securing-agentic-applications-guide-1-0/
related:
  assessments:
    - 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-proactivity-scheduling.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-09-26
source_updated: 2025-10-15
source_version: Pritha AI-SAFE adaptation v1; based on AI-SAFE v1.0 with OWASP references checked 2026-06-07
retrieved: 2026-06-07
verified: 2026-06-07
valid_for: Pritha child-agent contracts, scaffold readiness and security reviews
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

# Standard: Agent AI-SAFE Security Checklist

Status: draft
Owner: Pritha
Last reviewed: 2026-06-07

## Rule

Every non-trivial Pritha child agent must receive an AI-SAFE security profile before scaffold readiness is marked complete.

The profile is a cross-layer check over the modules selected in the `agent-contract`: interface, reasoning/planning, knowledge, tools/execution and infrastructure/orchestration. It is not a requirement to use Yandex Cloud products.

For small local agents with no external input, no durable memory, no privileged tools, no deployment and no proactivity, the profile may be marked `minimal`. For agents with external input, tools, memory, MCP, skills, scheduled behavior, service deployment or multi-agent coordination, the relevant layers must be explicitly reviewed.

## Use When

- Creating or validating an `agent-contract`.
- Scaffolding a Codex-native child agent.
- Adding Telegram, web, API, voice, MCP, skills, browser, file upload, RAG, memory, deployment, proactivity or multi-agent communication.
- Reviewing an existing project that may become a Pritha-managed agent.
- Writing scaffold, test, handoff, operations or deployment reports.

## Avoid When

- The task is a one-off local analysis with no retained state and no privileged action path.
- The user only asked for a small code change in Techscope.
- The source freshness of a concrete external framework version cannot be checked and the rule would affect production deployment.

## Layer Names

Use layer names as stable keys. AI-SAFE v1.0's threat matrix and practical checklist do not use exactly the same numbering order for levels 2-5. Pritha therefore records both number and name where useful, but decisions are based on names.

| AI-SAFE Layer | Pritha Boundary | Typical Pritha Artifacts |
| --- | --- | --- |
| Interface / Input-Output | User, external source and rendered-output boundary | interface profile, Telegram/web/API adapter, output schema |
| Reasoning & Planning | Goal, instruction, planning and control-flow boundary | `AGENTS.md`, agent contract, plans, evals, approval policy |
| Knowledge / Data | Memory, RAG, sources and embeddings boundary | memory manifest, source policy, Markdown/SQLite/vector indexes |
| Execution & Tools | Tool-call, shell, MCP, skills and code execution boundary | tool manifest, MCP manifest, skill manifest, sandbox policy |
| Infrastructure & Orchestration | Runtime, deployment, scheduling and multi-agent boundary | operations manifest, deploy scripts, queue/scheduler policy |

## Contract Fields

Every relevant child-agent contract should include:

- `ai_safe_profile`: `minimal`, `standard`, `high-risk`, `not-applicable` or `unknown`;
- `ai_safe_layers_selected`;
- `interface_controls`;
- `reasoning_planning_controls`;
- `knowledge_controls`;
- `execution_tool_controls`;
- `infrastructure_orchestration_controls`;
- `ai_safe_open_risks`;
- `ai_safe_review_status`: `draft`, `reviewed`, `blocked`, `deferred`;
- `ai_safe_recheck_sources`: current OWASP/Yandex/NIST/MITRE or project-specific references when production risk matters.

## Layer 1: Interface / Input-Output

Apply when the agent accepts user prompts, external messages, links, uploads, screenshots, transcripts, web pages, voice, API requests or rendered UI output.

Required checks:

- Define trusted, semi-trusted and untrusted input sources.
- Apply `agent-untrusted-input-security` before raw external content can influence tools, memory, spend or publication.
- Set per-item token, media, file-size, API and cost limits.
- Validate structured input with schemas where practical.
- Treat model output as untrusted before sending it to a browser, database, shell, API, email, Telegram, publication surface or downstream parser.
- Validate structured output with JSON Schema, typed parsers, tests or deterministic code when it will drive state changes.
- Encode or sanitize output rendered in web UI to avoid XSS and injection.
- Add rate limits, backpressure or queue limits for public or automated ingress.
- Document fallback behavior for malformed, oversized or suspicious input.

Codex-native adaptation:

- User-pasted text can be treated as manually curated only for the current thread. It becomes untrusted if it asks to override project instructions, tool policy, memory policy or security controls.
- Browser, GitHub, issue text, PR comments, webpages, PDFs and transcripts are untrusted source material unless curated into an artifact.

## Layer 2: Reasoning & Planning

Apply when the agent plans multi-step work, uses persistent instructions, makes decisions over time or asks humans to approve actions.

Required checks:

- Define the agent's mission, out-of-scope behavior and forbidden actions in the contract.
- Keep `AGENTS.md` concise and map-like; detailed policy belongs in versioned standards/workflows.
- Use goal-locking: external content must not silently change the agent's purpose, safety boundaries or task success criteria.
- Add timeouts, max-iteration limits and circuit breakers for loops, retries and tool-call chains.
- Keep high-risk planning on Codex/frontier models or manual review unless eval evidence supports another runtime.
- Require human approval for destructive, public, high-cost, credential, deployment and irreversible actions.
- Protect human reviewers from approval fatigue: group, prioritize and explain requests rather than emitting repeated ambiguous prompts.
- Log a decision/tool/action trace sufficient for audit and debugging.

Codex-native adaptation:

- Do not store hidden chain-of-thought or private model reasoning as an audit artifact. Record plans, decisions, tool calls, approvals, file diffs, test results and user-visible rationale.
- Model swaps are harness changes. Re-run representative evals when prompt shape, tool behavior or planning quality changes.

## Layer 3: Knowledge / Data

Apply when the agent has durable memory, RAG, embeddings, source notes, user data, private files, database access or cross-session state.

Required checks:

- Select memory domains and privacy boundaries before scaffold.
- Keep raw external source material out of curated memory unless an explicit retention decision exists.
- Separate raw/quarantine storage from curated Markdown, SQLite, embeddings and generated wiki layers.
- Validate and summarize untrusted source material before memory writes.
- Require approval for sensitive memory updates and child-agent self-model changes.
- Apply RBAC or local equivalent access boundaries for knowledge stores.
- Mask or exclude PII, secrets, credentials and local-private user-model data from public tracked memory.
- Version knowledge sources and preserve enough temporal metadata to explain why a decision was made.
- Protect vector/embedding stores as sensitive, not as anonymized safe data.
- Monitor for memory poisoning, stale knowledge, retrieval manipulation and cross-user/context leakage.

Codex-native adaptation:

- Markdown remains the authored source of truth; SQLite, FTS, embeddings and generated wiki pages are rebuildable support layers.
- `privacy: local-private` and `memory_domain: user-model` stay outside tracked Markdown and public memory snapshots.

## Layer 4: Execution & Tools

Apply when the agent can call shell commands, scripts, MCP servers, APIs, skills, browser automation, code execution, messaging, GitHub, deployment commands or filesystem writes.

Required checks:

- Choose the narrowest reliable boundary: CLI/script, skill, MCP, browser/manual or API.
- Record tool capability, side effects, auth boundary, filesystem boundary, network boundary and fallback.
- Use least privilege for every tool and connector.
- Keep secrets out of repo files and model-visible context.
- Scope MCP toolsets and skills; do not expose broad catalogs by default.
- Review tool metadata and skill instructions as supply-chain inputs.
- Separate data from instructions in tool descriptions and retrieved tool outputs.
- Use sandbox/container/project-folder isolation for code execution or high-risk external input.
- Require approval before destructive commands, external messages, publication, deployments, cost-bearing actions or credential changes.
- Audit tool calls and preserve enough context to reproduce unsafe behavior without storing private raw input.

Codex-native adaptation:

- `apply_patch`, shell, MCP, Browser and generated scripts are privileged surfaces. Their use must follow the child agent's explicit contract and current workspace policy.
- External skills and MCP servers are not trusted merely because they are discoverable.

## Layer 5: Infrastructure & Orchestration

Apply when the agent is deployed as a service, runs on a schedule, watches queues/events, coordinates with other agents, uses cloud resources or exposes external network surfaces.

Required checks:

- Record deployment target, service mode, autostart, runtime isolation and stop/kill behavior.
- Do not enable cron, launchd, heartbeat, queue watcher or proactive notifications unless the contract selects them.
- Set cost/token/media/API budgets and alerts for repeated or autonomous jobs.
- Add circuit breakers and max-runtime limits for background work.
- Use supply-chain checks for dependencies, generated containers, base images, scripts, skills and MCP servers.
- Record network policy: unrestricted, allowlist, deny-by-default or operator-approved.
- Isolate child agents from each other when they have different users, credentials, memories, tools or trust domains.
- Authenticate inter-agent or service-to-service communication where applicable.
- Monitor cross-agent messages and shared queues for poisoning and replay.
- Keep operations logs, deployment reports and incident notes discoverable.

Codex-native adaptation:

- A local Codex-native project starts as manual and non-service. Any service behavior must be selected in `operations/manifest.json` and deployment reports.
- Sibling child-agent folders should not inherit Techscope secrets, `.env`, `.queue`, `.logs`, `.memory-private` or private user state.

## Minimal Readiness Labels

Use these labels in contract, scaffold and handoff reports:

| Label | Meaning |
| --- | --- |
| `selected-reviewed` | Layer is selected and controls are documented. |
| `selected-pending` | Layer is selected but auth, evals or implementation are not ready. |
| `selected-blocked` | Layer is selected but a safety blocker prevents scaffold readiness. |
| `skipped` | Layer is not selected for this agent. |
| `minimal` | Layer exists only as a low-risk local/manual boundary. |
| `unknown` | Needs follow-up before production use. |

## Pritha Defaults

- Default `ai_safe_profile`: `standard` for non-trivial child agents.
- Default for one-off local agents: `minimal`.
- Default external input status: untrusted until curated.
- Default memory writes from external input: disabled or approval-required.
- Default tool side effects: approval-required.
- Default proactivity: none/manual.
- Default service deployment: disabled.
- Default raw source retention: source-purged.

## Promotion Criteria

This standard remains draft until at least one child-agent contract, scaffold report or existing-project test report uses the checklist and records whether it caught meaningful issues.

## Temporal Validity

- Source published: 2025-09-26 public announcement.
- Source updated: 2025-10-15 PDF metadata.
- Source version: AI-SAFE v1.0 plus current OWASP checks on 2026-06-07.
- Retrieved: 2026-06-07.
- Verified: 2026-06-07.
- Valid for: Pritha child-agent security reviews.
- Freshness status: current for Pritha adaptation; source appendix is version-bound.
- Recheck when: OWASP LLM, MCP, Agentic Applications, NIST AI RMF, MITRE ATLAS, OpenAI/Codex tool policy or selected deployment platform guidance changes.
