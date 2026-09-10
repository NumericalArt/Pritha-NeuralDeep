---
id: 2026-05-27-local-agent-harness-benchmark-assessment
type: assessment
status: draft
created: 2026-05-27
updated: 2026-05-27
topics:
  - agent-harness
  - local-models
  - coding-agent-benchmark
  - harness-evaluation
  - runtime-placement
tools:
  - OpenCode
  - Pi
  - Hermes
  - OpenClaw
  - vLLM
  - llama.cpp
  - Qwen
  - Gemma
agent_platforms:
  - OpenCode
  - Pi
  - Hermes
  - OpenClaw
  - Codex
model_context:
  - local open-weight models
runtime_environment:
  - local-model
  - Docker
  - OpenAI-compatible-local-endpoint
config_surfaces:
  - benchmark runner
  - task prompt
  - hidden grader
  - harness config
  - run metadata
portability: portable
sources:
  - 00_inbox/links/2026-05-27-youtube-local-harness-benchmark-intake.md
  - 01_sources/notes/2026-05-27-local-harness-benchmark-source-note.md
  - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  - anonymous incoming video source (purged)
  - https://github.com/Zux1U/microbench_16
  - https://docs.vllm.ai/en/latest/
  - https://github.com/ggml-org/llama.cpp
  - https://opencode.ai/docs/providers/
  - https://github.com/earendil-works/pi
related:
  intakes:
    - 00_inbox/links/2026-05-27-youtube-local-harness-benchmark-intake.md
  briefs:
    - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-05-26
source_version: YouTube video plus benchmark repo checked 2026-05-27
retrieved: 2026-05-27
verified: 2026-05-27
valid_for: Agents Mother harness evaluation and local-model stack selection
temporal_status: current
recommendation: standard
---

# Assessment: Local Agent Harness Benchmark

Date: 2026-05-27
Status: draft
Recommendation: standard

## One-paragraph read

This is useful, but only if we store the evaluation discipline rather than the
winner list. The benchmark shows how to compare harnesses under controlled local
conditions, and the n8n-like task shows why hidden coding tasks are not enough.
For Techscope, the right move is to require a small, project-specific eval pack
before choosing OpenCode, Pi, Hermes, OpenClaw or any local-model harness for a
new agent.

## Why it matters

Agents Mother will increasingly face decisions like: "build this new agent in
Codex, OpenCode, Pi, Hermes, OpenClaw, custom CLI or API harness?" Without evals,
that becomes vibes plus YouTube rankings. With evals, it becomes a repeatable
engineering decision.

## Technical claims

- A fair harness benchmark should isolate workspaces and state.
- Hidden graders should not be visible to the agent.
- Grading should happen outside the agent container.
- Timeout, infra errors, runner errors and wrong answers should be tracked
  separately.
- Applied tasks should measure recovery, integration, UI/functionality and token
  spend, not only pass/fail on small coding exercises.

## Agent environment profile

- Agent platforms: OpenCode, Pi, Hermes, OpenClaw source comparison; Codex target
  adaptation.
- Model context: local open-weight models through vLLM/llama.cpp.
- Runtime environment: Docker plus OpenAI-compatible local endpoints.
- Config surfaces: benchmark runner, task prompt, hidden grader, harness config,
  run metadata.
- Portability: portable as evaluation discipline; environment-specific as exact
  outcome.
- Codex adaptation: use the same method to test Codex-native agents and external
  harness candidates before promotion.
- Environment-specific caveats: local inference backend settings can dominate
  apparent speed/quality.

## Existing knowledge check

- Related existing artifacts:
  - `04_standards/agent-runtime-placement.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-tool-integration-selection.md`
  - `02_briefs/2026-05-26-openclaw-expensive-local-ai-brief.md`
- Relationship to existing knowledge: refines.
- Artifacts to mark outdated or superseded: none.

## Freshness check

- Official/current sources checked: microbench repo, vLLM docs, llama.cpp repo,
  OpenCode docs, Pi repo.
- Freshness status: current.
- Source published: 2026-05-26.
- Source updated: 2026-05-26.
- Source version: YouTube video plus benchmark repo checked 2026-05-27.
- Retrieved: 2026-05-27.
- Verified: 2026-05-27.
- Valid for: Agents Mother harness evaluation and local-model stack selection.
- Temporal status: current.
- Temporal compatibility with existing artifacts: compatible; strengthens
  runtime-placement and agent-creation checks.
- Notes: recheck harness versions and model support before any concrete choice.

## Programming relevance

Score: 5/5

The benchmark focuses on actual software-engineering tasks and hidden graders.

## Agent engineering relevance

Score: 5/5

Directly relevant to harness selection, local model routing, eval design and
failure taxonomy.

## DX impact

Score: 4/5

Good evals prevent painful harness choices. Building and maintaining evals costs
time, but pays back before serious agent work.

## Evidence quality

Score: 3/5

The benchmark repo is real and inspectable, but the reported results are not
independently reproduced here.

## Practicality

Score: 4/5

Immediately useful as a template for our own harness-eval pack.

## Leverage

Score: 5/5

High leverage because one harness choice can affect every future agent.

## Risk

Score: 3/5

Main risk is overfitting to a small benchmark or treating a version-bound winner
as a universal rule.

## Expert lenses

### Programming

Require hidden tests and real workspace mutation, not screenshot-based demos.

### Agent Engineering

Evaluate model plus backend plus harness as a stack. Do not attribute every
failure to the model.

### DX

Track loops, timeouts, setup failures and token usage because these are what the
operator feels.

### Security

Containerization and hidden graders are useful, but harnesses still need
untrusted-input and tool-permission controls before production.

### Evidence

Store benchmark configuration and timestamps. Exact rankings expire quickly.

### Product Pragmatism

Use a small eval pack before switching runtime families; avoid rebuilding the
agent foundation because one video showed a temporary leaderboard.

## Decision

Create `04_standards/agent-harness-evaluation.md` as a draft standard and link it
from Agents Mother.

## Next artifact

standard
