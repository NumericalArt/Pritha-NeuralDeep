---
id: agent-untrusted-input-security
type: standard
status: draft
created: 2026-05-26
updated: 2026-07-13
last_reviewed: 2026-07-13
owner: Techscope/user
topics:
  - agent-security
  - prompt-injection
  - untrusted-input
  - cost-abuse
  - agents-mother
tools:
  - Codex
  - OpenAI Agent Builder
  - OpenAI Realtime API
  - Claude
  - OpenClaw
  - OWASP LLM Top 10
agent_platforms:
  - Codex
  - OpenAI API
  - Claude
  - OpenClaw
model_context:
  - frontier reasoning models
  - local models
  - realtime models
runtime_environment:
  - local-project
  - messaging-gateway
  - web-ui
  - email-ingestion
  - telegram-ingestion
config_surfaces:
  - AGENTS.md
  - agent-contract
  - tool schemas
  - queue policy
  - operations manifest
  - security policy
portability: portable
sources:
  - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  - 02_briefs/2026-05-26-openclaw-hacked-prompt-injection-brief.md
  - https://developers.openai.com/api/docs/guides/agent-builder-safety
  - https://openai.com/index/designing-agents-to-resist-prompt-injection/
  - https://owasp.org/www-project-top-10-for-large-language-model-applications/
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool
  - 02_briefs/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-brief.md
  - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
  - https://docs.nvidia.com/nemoclaw/latest/reference/network-policies
  - https://docs.nvidia.com/nemoclaw/latest/security/best-practices
  - 01_sources/signals/2026-06-28-open-source-agent-building-repos-signal.md
  - 03_reviews/2026-06-28-open-source-agent-building-repos-review.md
related:
  workflows:
    - 07_workflows/agents-mother.md
  reviews:
    - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  briefs:
    - 02_briefs/2026-05-26-openclaw-hacked-prompt-injection-brief.md
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-04-03
source_updated: 2026-07-13
source_version: draft based on OpenClaw security demo plus OpenAI/Anthropic/OWASP/NemoClaw guidance and contract-aware GitHub repository research boundaries checked 2026-07-13
retrieved: 2026-05-26
verified: 2026-07-13
valid_for: Pritha child-agent research and Agents Mother-created agents that ingest external/untrusted content
temporal_status: current
---

# Standard: Agent Untrusted Input Security

Status: draft
Owner: Techscope/user
Last reviewed: 2026-07-13

## Rule

Any agent that ingests external content must treat that content as hostile until proven otherwise.

External content includes email, Telegram messages, forwarded posts, websites, YouTube transcripts, uploaded files, screenshots, OCR, comments, PR text, issue text, scraped docs and user-provided archives.

For GitHub repository research, repository descriptions, topics, README and
LICENSE text, issues, pull requests, releases, manifests, scripts, assets and
install/update instructions are all external content. Official hosting or an
`accepted-for-review` registry label improves provenance but does not make that
content trusted instructions.

Untrusted content must not directly control:

- system/developer instructions;
- tool selection;
- file writes;
- network calls;
- memory updates;
- secrets or private data access;
- high-cost model calls;
- external publication or messaging.

## Use when

- creating an agent with Telegram, email, web, browser, YouTube, file-upload or repository intake;
- building a personal assistant with access to private files, accounts or credentials;
- giving a model tools that can spend money, call APIs, write files or send messages;
- processing arbitrary external text before indexing it into memory.

## Avoid when

- the agent has no external input and no durable action path;
- all inputs are manually curated by the operator before reaching the model;
- the task is a one-off local analysis with no secrets, tool calls or publication.

## Required practices

- Record an `untrusted_input_policy` in the agent contract.
- Normalize external events before model processing.
- Run external content through a bounded intake queue.
- Set maximum size/token/media budgets per item.
- Strip or quarantine suspicious payloads before retrieval/memory insertion.
- Extract structured facts from untrusted content instead of injecting the raw content into the main agent context.
- Treat format override attempts, tool-use instructions, hidden instructions and "system command" wording as suspicious.
- Keep secrets and private account data outside the model context unless explicitly required and approved.
- Require human approval before:
  - sending external messages;
  - publishing content;
  - exposing private data;
  - executing destructive commands;
  - running high-cost or long-running jobs;
  - changing service/deployment state.
- Use the strongest practical scanner/model for high-risk content. This is risk-tiered, not a blanket rule.
- Use cheaper/local models only for low-risk prefiltering unless validated against realistic prompt-injection tests.
- Store raw hostile or suspicious material in raw/quarantine storage, not in curated memory.
- Log rejected/quarantined inputs with source, timestamp, reason and next action.
- For always-on, external-facing or permission-heavy agents, explicitly decide whether the agent needs a runtime boundary: process-only, container, sandbox, remote sandbox or no isolation.
- Keep provider/API credentials outside the agent execution boundary when practical. Prefer host-side or gateway-held credentials for agents with broad tools or untrusted input.
- Prefer allowlisted or deny-by-default network policy for agents that can autonomously browse, call APIs, use messaging channels or install packages.
- Treat broad integration presets as risky. Enable only the messaging, GitHub, package-manager, browser or productivity endpoints the agent's contract actually requires.
- Keep repository discovery metadata-only and bounded. A discovery pass may
  read the curated registry and public GitHub metadata, but must not clone,
  install, execute, vendor, link, activate or automatically register code.
- Sanitize and bound repository names, descriptions, topics and errors before
  writing them into Markdown. Treat them as data, never as instructions for the
  researching agent.
- Separate candidate discovery from adoption. Before a repository module can be
  selected, require an exact immutable pin, license decision, inspection of
  scripts/dependencies/references/assets, network/filesystem/secrets permission
  review, contract-specific evals and explicit user approval.
- Keep a selected repository module blocked when current metadata is missing,
  license is unknown or incompatible, the source cannot be pinned, security or
  permission review is incomplete, evals fail, or approval is absent.

## Recommended architecture

1. Ingress adapter receives external content.
2. Intake queue records source metadata and size.
3. Cheap deterministic filters enforce size, type and budget limits.
4. Security scanner classifies prompt-injection, cost-abuse and data-exfiltration risk.
5. Structured extractor produces safe fields or compact summaries.
6. Human approval gate handles suspicious/high-impact cases.
7. Main agent receives only safe structured fields and bounded evidence.
8. Durable memory records the final curated artifact, not the raw hostile payload.

## Risk tiers

- `trusted-manual`: user pasted curated content directly; low automation risk.
- `external-readonly`: external content can be summarized but cannot trigger tools.
- `external-tooling`: external content may influence tools; requires strict schemas and approval.
- `external-sensitive`: content touches private files/accounts/secrets; requires quarantine, strong scanner and human confirmation.
- `external-publication`: content can send/publish externally; requires explicit approval and audit log.
- `external-high-cost`: content can trigger expensive model/media jobs; requires budget caps and rate limits.

## Agent contract questions

- What external sources can reach the agent?
- Can external content reach a model context directly?
- Can external content update memory?
- Can external content trigger tools or queue jobs?
- What is the per-item budget cap?
- What is quarantined?
- What needs human approval?
- Which model or deterministic layer scans high-risk input?
- What sensitive data is excluded?
- How are rejected inputs logged?
- Does this agent need sandboxing or another runtime isolation boundary?
- Where are credentials stored relative to the agent process?
- Is network egress unrestricted, allowlisted, deny-by-default or operator-approved?
- Which integration presets are enabled and why?

## Examples

- A Telegram intake bot should queue messages, extract links/media, cap processing cost, and send only concise status replies.
- A YouTube research agent should store full transcripts as raw artifacts, then index only compact derivative knowledge.
- A personal email agent should not let email body text directly call tools, read secrets or send replies.
- A voice agent should not let spoken or retrieved text silently trigger deployment, publication or destructive file changes.

## Temporal validity

- Source published: 2026-04-03.
- Source updated: 2026-07-13.
- Source version: draft based on OpenClaw hacked demo plus OpenAI, Anthropic,
  OWASP and NemoClaw guidance and the Pritha GitHub repository candidate review
  boundary checked 2026-07-13.
- Retrieved: 2026-05-26.
- Verified: 2026-07-13.
- Valid for: Pritha child-agent research and Agents Mother-created agents that ingest untrusted external content.
- Freshness status: current.
- Temporal status: current.
- Recheck when: OpenAI/Anthropic agent safety docs change, OWASP LLM Top 10 changes, or a new created agent exposes external input in a new way.

## Related decisions

- No decision record yet. This is a draft standard candidate based on one video, prior OpenClaw research and current official security guidance.
