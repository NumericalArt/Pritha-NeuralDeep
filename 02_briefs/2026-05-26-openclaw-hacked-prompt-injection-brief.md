---
id: 2026-05-26-openclaw-hacked-prompt-injection-brief
type: brief
status: draft
created: 2026-05-26
updated: 2026-06-01
topics:
  - prompt-injection
  - agent-security
  - untrusted-input
  - openclaw
  - agents-mother
  - cost-abuse
tools:
  - OpenClaw
  - Claude Opus 4.6
  - Gmail
  - OpenAI Agent Builder
  - OWASP LLM Top 10
sources:
  - source-511135b7-653f-4147-90c2-b515bc79b59b
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
supersedes:[]
superseded_by:[]
source_type: telegram
source_class: telegram
ingested_at: 2026-05-26
processed_at: 2026-06-01T21:03:38.436Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-511135b7-653f-4147-90c2-b515bc79b59b
agent_platforms:
  - Codex
  - OpenClaw
  - Claude
  - OpenAI Realtime API
model_context:
  - Claude Opus 4.6
  - frontier reasoning models
  - local models
runtime_environment:
  - personal-agent
  - messaging-gateway
  - email-ingestion
  - web-ui
config_surfaces:
  - AGENTS.md
  - security policy
  - tool schemas
  - queue policy
  - operations manifest
portability: portable
freshness_status: current
source_published: 2026-04-03
source_updated: 2026-04-03
source_version: YouTube video plus official docs checked 2026-05-26
retrieved: 2026-05-26
verified: 2026-05-26
valid_for: Agents Mother security design for agents ingesting untrusted external content
temporal_status: current
---

# Artifact: source-511135b7-653f-4147-90c2-b515bc79b59b

Date: 2026-05-26
Status: draft
Source class: telegram
Retention: source-purged

Date: 2026-05-26
Status: draft

## Summary

The video is a useful adversarial demo for personal agents that read external messages. The main signal is not that one OpenClaw setup survived one attacker. The durable lesson is that email, Telegram, websites, files and media transcripts must be treated as untrusted input. Before such input can affect model instructions, tools, memory or spend, it needs filtering, quota limits, structured extraction, quarantine and human approval gates.

## Key claims

- Prompt injection does not require a website or browser; an email or forwarded message is enough.
- Token-flood payloads can be both probing attacks and economic attacks.
- Format override is an early signal of compromised instruction hierarchy even without full exfiltration.
- Narrow agents with fewer tools and narrower tasks are easier to defend.
- Strong frontier/reasoning models are better candidates for security scanning than small/local models when the exposed surface is sensitive.
- Human confirmation remains essential before sensitive data release, external communication, irreversible tool use or high-cost work.

## Agent environment profile

- Agent platforms: OpenClaw in the video; portable to Codex-native agents, Realtime voice agents, Telegram agents and email/web-ingestion agents.
- Model context: video uses Claude Opus 4.6 as the target/scanner context; official docs confirm frontier systems still need sandboxing and prompt-injection mitigations.
- Runtime environment: personal agent with email ingress and access to sensitive local/account data.
- Config surfaces: security policy, tool schemas, queue policy, budget policy, human approval gates, operations manifest.
- Portability: portable as a harness pattern; implementation is adapter-specific.

## Evidence

- The video shows multiple prompt-injection/cost-abuse attempts against a personal AI system.
- OpenAI agent safety docs define prompt injection as untrusted data trying to override behavior and recommend structured extraction, guardrails, confirmations and validation.
- OpenAI's prompt-injection article emphasizes that sensitive transmissions and dangerous actions should not happen silently.
- OWASP places prompt injection in the LLM application top risk set.
- Anthropic computer-use docs warn that prompt injection persists across frontier systems and recommend containers/VMs, minimal privileges, domain allowlists and human confirmation.

## Existing knowledge and freshness

- Related existing artifacts:
  - `02_briefs/2026-05-17-openclaw-personal-agent-architecture-brief.md`
  - `03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-tool-integration-selection.md`
  - `04_standards/realtime-voice-control-for-codex-agents.md`
- Relationship to existing knowledge: refines.
- Official/current sources checked: OpenAI, Anthropic, OWASP.
- Freshness status: current.
- Retrieved: 2026-05-26.
- Verified: 2026-05-26.
- Valid for: personal agents and Agents Mother-created agents ingesting untrusted external content.
- Temporal status: current.
- Artifacts to mark outdated or superseded: none.

## Risks and caveats

- This is a single demo, not statistical proof that a specific OpenClaw setup is secure.
- Some defense in the early attempts came from Gmail spam filtering, not the AI system itself.
- "Use the best model as scanner" is a useful heuristic, but expensive. It should become a risk-tiered policy, not a blanket rule.
- The Greptile sponsorship block is not evidence for adopting Greptile.
- Prompt-injection defenses age quickly; recheck primary docs before promoting implementation details.

## Recommendation

Create a draft standard for untrusted-input security in Agents Mother. This should become a default contract section for any new agent that ingests external text, files, websites, email, Telegram posts, YouTube transcripts or screenshots.

## Next step

Use `04_standards/agent-untrusted-input-security.md` as a draft rule and add it to future `agent-contract` validation/interview questions.
