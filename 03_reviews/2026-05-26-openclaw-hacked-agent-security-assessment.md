---
id: 2026-05-26-openclaw-hacked-agent-security-assessment
type: assessment
status: draft
created: 2026-05-26
updated: 2026-05-26
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
  - OpenAI Agent Builder
  - OWASP LLM Top 10
  - Anthropic Computer Use
agent_platforms:
  - Codex
  - OpenClaw
  - Claude
  - OpenAI API
model_context:
  - Claude Opus 4.6
  - frontier reasoning models
  - local models
runtime_environment:
  - personal-agent
  - messaging-gateway
  - email-ingestion
  - local-project
config_surfaces:
  - AGENTS.md
  - tool schemas
  - queue policy
  - permissions
  - operations manifest
portability: portable
sources:
  - 00_inbox/links/2026-05-26-youtube-openclaw-hacked-prompt-injection-intake.md
  - 01_sources/notes/2026-05-26-openclaw-hacked-prompt-injection-source-note.md
  - 02_briefs/2026-05-26-openclaw-hacked-prompt-injection-brief.md
  - anonymous incoming video source (purged)
  - https://developers.openai.com/api/docs/guides/agent-builder-safety
  - https://openai.com/index/designing-agents-to-resist-prompt-injection/
  - https://owasp.org/www-project-top-10-for-large-language-model-applications/
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool
related:
  intakes:
    - 00_inbox/links/2026-05-26-youtube-openclaw-hacked-prompt-injection-intake.md
  briefs:
    - 02_briefs/2026-05-26-openclaw-hacked-prompt-injection-brief.md
  reviews:
    - 03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-04-03
source_updated: 2026-04-03
source_version: YouTube video plus official docs checked 2026-05-26
retrieved: 2026-05-26
verified: 2026-05-26
valid_for: Agents Mother-created agents that ingest untrusted external content
temporal_status: current
recommendation: standard
---

# Assessment: OpenClaw Hacked Agent Security

Date: 2026-05-26
Status: draft
Recommendation: standard

## One-paragraph read

This video is worth keeping because it dramatizes a real design problem for Agents Mother: once an agent reads email, Telegram, websites, files or transcripts, external content becomes an attack surface. The reusable takeaway is not "OpenClaw is secure" or "Claude Opus 4.6 solves prompt injection"; it is the need for an explicit untrusted-input security layer with quarantine, budget caps, structured extraction, strong scanners for high-risk surfaces, and human approval before sensitive actions.

## Why it matters

Agents Mother is already creating agents that process YouTube, web links, Telegram posts, files and local project data. Those are exactly the surfaces where prompt injection, data leakage and cost-abuse attacks enter. This video gives us a concrete story to turn into a repeatable contract rule.

## Technical claims

- External messages can carry adversarial instructions.
- Large token payloads can be used for wallet/budget exhaustion.
- Output format override can be an early compromise signal.
- Narrow task surfaces are easier to defend than broad all-powerful agents.
- Stronger frontier/reasoning models may be better scanners for high-risk untrusted content, but cost and latency must be considered.
- Human approval is required for sensitive data release, account actions and high-cost operations.
- One successful red-team session does not prove permanent security.

## Agent environment profile

- Agent platforms: OpenClaw source scenario; portable to Codex-native agents and Realtime/server-tool agents.
- Model context: Claude Opus 4.6 in the video; official sources confirm prompt injection remains a live frontier-agent risk.
- Runtime environment: personal agent with email/messaging ingress and sensitive data access.
- Config surfaces: `AGENTS.md`, security policy, queue rules, tool schemas, budget caps, operations manifest.
- Portability: portable.
- Codex adaptation: add untrusted-input section to every `agent-contract`; implement as queue/scanner/quarantine before Codex or Realtime sees rich content.
- Environment-specific caveats: Claude/OpenClaw specifics do not transfer literally to Codex; the boundary pattern does.

## Existing knowledge check

- Related existing artifacts:
  - `02_briefs/2026-05-17-openclaw-personal-agent-architecture-brief.md`
  - `03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-tool-integration-selection.md`
  - `04_standards/realtime-voice-control-for-codex-agents.md`
- Relationship to existing knowledge: refines.
- Artifacts to mark outdated or superseded: none.

## Freshness check

- Official/current sources checked:
  - OpenAI agent safety docs;
  - OpenAI prompt-injection article;
  - OWASP Top 10 for LLM Applications project;
  - Anthropic computer-use security docs;
  - Anthropic Claude Opus 4.6 announcement for model existence/context.
- Freshness status: current.
- Source published: 2026-04-03.
- Source updated: 2026-04-03.
- Source version: YouTube video plus official docs checked 2026-05-26.
- Retrieved: 2026-05-26.
- Verified: 2026-05-26.
- Valid for: Agents Mother security requirements for external input.
- Temporal status: current.
- Temporal compatibility with existing artifacts: compatible; adds security specificity to existing OpenClaw and Agents Mother notes.
- Notes: exact model names, model defenses and vendor APIs must be rechecked before implementation.

## Programming relevance

Score: 5/5

- Directly impacts architecture of agents that ingest external input.
- Changes queue, API, tool and budget design.

## Agent Engineering relevance

Score: 5/5

- Core issue for autonomous agents: malicious instructions inside content the agent reads.
- Applies to Telegram bots, email agents, browser agents, code agents and media-processing agents.

## DX relevance

Score: 4/5

- Adds explicit constraints and more scaffolding work.
- Saves painful debugging/security incidents later.

## Security relevance

Score: 5/5

- Covers prompt injection, secret leakage, tool misuse, high-cost token flooding and unsafe external actions.

## Evidence strength

Score: 4/5

- Strong official-source support for the class of risk.
- The video itself is one demo, not a broad benchmark.

## Product pragmatism

Score: 5/5

- Highly practical for Agents Mother: make this a contract checklist and scaffold pattern.

## Risk

Score: 4/5

- Over-hardening can slow useful agents.
- Under-hardening can leak secrets, burn budget or let untrusted content drive tools.
- Need risk-tiered defaults.

## Recommendation details

Create and use a draft standard: `04_standards/agent-untrusted-input-security.md`.

For every new agent, Agents Mother should ask:

- Does the agent ingest untrusted external content?
- Can that content reach a model, tool, memory, queue or budget-consuming path?
- What is the maximum token/media budget per item?
- What gets quarantined?
- Which actions require human approval?
- Which model/scanner handles high-risk content?
- What sensitive data is excluded from the context?

## What to ignore

- The Greptile sponsor section as evidence for code-review tooling.
- Any claim that one successful test proves OpenClaw security generally.
- The idea that frontier model choice alone is a sufficient defense.

## Next action

Adopt the new draft standard as a required reference in Agents Mother contracts for any external-input agent.
