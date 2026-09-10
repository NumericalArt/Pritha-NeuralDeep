---
id: 2026-06-01-production-agent-controls-signal
type: signal
status: refined
created: 2026-06-01
updated: 2026-06-01
topics:
  - production-agents
  - agent-operations
  - model-routing
  - prompt-registry
  - guardrails
  - budget-control
  - mcp
  - observability
  - evals
  - harness-engineering
tools:
  - MCP
  - OpenTelemetry
  - LLM gateway
  - prompt registry
sources:
  - source-62df33d7-c7a1-452b-a60e-f53b3f6b7ee4
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/media-intake-processing.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-mcp-connector-lifecycle.md
source_type: video
source_class: video
ingested_at: 2026-06-01
processed_at: 2026-06-01T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-62df33d7-c7a1-452b-a60e-f53b3f6b7ee4
generated_from:
  - source-62df33d7-c7a1-452b-a60e-f53b3f6b7ee4
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-62df33d7-c7a1-452b-a60e-f53b3f6b7ee4

Date: 2026-06-01
Status: refined
Source class: video
Retention: source-purged

## Core Signal

Multi-user production agents need an operations/control plane, not only a good
prompt and tools. The useful checklist has seven layers:

1. Model control through a gateway or routing layer.
2. Prompt registry with versioning and testable configuration.
3. Input, output and tool-call guardrails.
4. Budget limits for models, tools and runaway loops.
5. Tool and MCP governance with central auth and granular permissions.
6. Monitoring and tracing across requests, responses, tools, errors and latency.
7. Evals before and after production release.

## Pritha Implications

- `agent-contract` should ask whether the child agent is single-user,
  multi-user or production-facing.
- Multi-user agents should receive explicit control-plane decisions for model
  routing, prompt versioning, guardrails, budget caps, tool/MCP permissions,
  tracing and evals.
- MCP should remain a scoped connector layer with central auth and narrow
  toolsets, matching `agent-mcp-connector-lifecycle`.
- Evals should be treated as continuous production feedback, not only preflight
  tests.

## Candidate Rules

- Do not ship a multi-user agent without budget caps and observability.
- Treat prompts as versioned operational assets, not embedded strings.
- Route model calls through a layer that can swap models, hide credentials and
  test structured outputs.
- Treat tools and MCP servers as permissioned production dependencies.
- Use traces to create regression evals from real failures.

## Noise Removed

Introductory framing, sponsorship language, UI walkthrough details and direct
source provenance are intentionally excluded.

## Verification Required

- Compare the checklist with existing Pritha standards before promotion.
- Verify specific platform claims only if choosing a concrete production gateway.
- Extend `agent-project-contract` only where the checklist improves default
  child-agent simplicity.
