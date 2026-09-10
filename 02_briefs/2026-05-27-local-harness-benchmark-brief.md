---
id: 2026-05-27-local-harness-benchmark-brief
type: brief
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
  - Qwen3.6
  - Gemma 4
runtime_environment:
  - local-model
  - vLLM
  - llama.cpp
  - Docker
  - OpenAI-compatible-local-endpoint
config_surfaces:
  - benchmark runner
  - containerized harness image
  - task prompt
  - hidden grader
  - run metadata
portability: portable
sources:
  - 00_inbox/links/2026-05-27-youtube-local-harness-benchmark-intake.md
  - 01_sources/notes/2026-05-27-local-harness-benchmark-source-note.md
  - anonymous incoming video source (purged)
  - https://github.com/Zux1U/microbench_16
  - https://docs.vllm.ai/en/latest/
  - https://github.com/ggml-org/llama.cpp
  - https://opencode.ai/docs/providers/
  - https://github.com/earendil-works/pi
  - https://docs.qwencloud.com/developer-guides/getting-started/vision-models
related:
  intakes:
    - 00_inbox/links/2026-05-27-youtube-local-harness-benchmark-intake.md
  reviews:
    - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
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
valid_for: Agents Mother harness selection and local-model evaluation workflows
temporal_status: current
---

# Brief: Local Harness Benchmark

Date: 2026-05-27
Source: ServerFlow video plus benchmark repo/current docs
Status: draft

## Summary

The useful takeaway is not a permanent ranking of OpenCode, Pi, Hermes and
OpenClaw. The reusable lesson is how to evaluate coding-agent harnesses with
local models: isolate each run, hide graders, separate harness failures from
wrong answers, measure time and token spend, then add at least one applied
end-to-end task that resembles the real product.

## Key claims

- Agent performance is a stack property: model, quantization, inference backend,
  serving settings and harness all matter.
- Small hidden-grader benchmarks catch contract-following and code-repair
  ability, but they do not fully capture product-building ability.
- Applied tasks expose loops, broken dependencies, UI incompleteness, missing
  final outputs and local endpoint integration failures.
- Exact winners are version-bound and should not become standards.
- For Agents Mother, harness selection should be based on project-specific evals
  before adopting a non-Codex harness.

## Agent environment profile

- Agent platforms: OpenCode, Pi, Hermes and OpenClaw are compared; Codex is the
  target environment for adapting the benchmark discipline.
- Model context: local Qwen/Gemma-class open-weight models in the video; model
  identities are temporal snapshots.
- Runtime environment: local model server through vLLM/llama.cpp and
  OpenAI-compatible endpoints, with containerized harness runs.
- Config surfaces: benchmark tasks, hidden graders, run metadata, Docker images,
  harness config and local model endpoint.
- Portability: portable as an evaluation method, environment-specific as a
  ranking.

## Evidence

- The video describes the benchmark setup and applied n8n-like task.
- The linked repo documents 16 tasks, hidden graders, host-side grading,
  containerized runners and OpenAI-compatible local model endpoints.
- vLLM, llama.cpp, OpenCode and Pi docs/repos support the runtime assumptions:
  local serving, OpenAI-compatible endpoints and local model/harness operation.

## Existing knowledge and freshness

- Related existing artifacts:
  - `04_standards/agent-runtime-placement.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-tool-integration-selection.md`
  - `02_briefs/2026-05-26-openclaw-expensive-local-ai-brief.md`
- Relationship to existing knowledge: refines.
- Official/current sources checked: benchmark repo, vLLM docs, llama.cpp repo,
  OpenCode docs, Pi repo, QwenCloud docs.
- Freshness status: current.
- Source published: 2026-05-26.
- Source updated: 2026-05-26.
- Source version: YouTube video plus benchmark repo checked 2026-05-27.
- Retrieved: 2026-05-27.
- Verified: 2026-05-27.
- Valid for: Agents Mother harness selection and local-model evaluation.
- Temporal status: current.
- Artifacts to mark outdated or superseded: none.

## Risks and caveats

- The benchmark repo is small and new, with limited external adoption.
- We did not reproduce the benchmark locally.
- Rankings are sensitive to harness version, model version, quantization,
  inference backend, serving parameters, timeout and hardware.
- A local harness that wins on coding tasks may still be wrong for a voice,
  Telegram, media-ingestion or long-running operations agent.

## Recommendation

Create a draft standard: `agent-harness-evaluation`. Future Agents Mother
contracts should require an evaluation plan before choosing an external harness
or switching from Codex-native to OpenCode/Pi/Hermes/OpenClaw-style runtimes.

## Next step

Use the standard to define a small Techscope harness-eval pack before any future
agent is based on a non-Codex harness or a local model stack.
