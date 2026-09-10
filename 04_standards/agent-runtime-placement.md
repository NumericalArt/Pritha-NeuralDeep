---
id: agent-runtime-placement
type: standard
status: draft
created: 2026-05-26
updated: 2026-06-02
last_reviewed: 2026-06-02
owner: Techscope/user
topics:
  - agent-engineering
  - model-routing
  - local-inference
  - runtime-placement
  - hybrid-agent-architecture
tools:
  - Codex
  - Agents Mother
  - OpenClaw
  - LM Studio
  - NVIDIA RTX
  - NVIDIA DGX Spark
  - OpenAI API
  - Anthropic API
  - local open-weight models
sources:
  - 02_briefs/2026-05-26-openclaw-expensive-local-ai-brief.md
  - 03_reviews/2026-05-26-openclaw-local-inference-cost-assessment.md
  - anonymous incoming video source (purged)
  - https://www.nvidia.com/en-us/products/workstations/dgx-spark../
  - https://docs.nvidia.com/openshell/latest/tutorials/local-inference-lmstudio
  - https://lmstudio.ai/docs/api
  - https://nvidianews.nvidia.com/news/nvidia-debuts-nemotron-3-family-of-open-models
  - https://openai.com/index/introducing-gpt-5-4/
  - https://platform.claude.com/docs/en/about-claude/pricing
  - 02_briefs/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-brief.md
  - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
  - https://docs.nvidia.com/nemoclaw/latest/about/how-it-works
  - https://docs.nvidia.com/nemoclaw/latest/reference/architecture
  - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
  - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-26-openclaw-local-inference-cost-assessment.md
    - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
    - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
  briefs:
    - 02_briefs/2026-05-26-openclaw-expensive-local-ai-brief.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-04-13
source_updated: 2026-06-02
source_version: Techscope draft standard v4; official runtime/provider/NemoClaw docs plus 2026 harness and Codex/AWS source batches
retrieved: 2026-05-26
verified: 2026-06-02
valid_for: Agents Mother contracts and new agent architecture from 2026-05-26 onward
temporal_status: current
---

# Standard: agent-runtime-placement

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-02

## Rule

Every non-trivial agent must decide runtime placement per task class. Do not
choose one global model and assume it is correct for all work.

This standard defines the placement method, not a permanent list of model names,
prices or hardware. Concrete models, context limits, prices, quotas, local
runtimes and hardware examples are temporal snapshots. They must be rechecked
against current official sources before being copied into a future
`agent-contract`.

The default pattern is hybrid:

- frontier cloud model for unknown, high-complexity, high-risk or creative
  planning work;
- smaller hosted model for cheap structured tasks when local operation is not
  worth it;
- local open-weight model for stable, repeated, privacy-sensitive or high-volume
  bounded tasks after evals prove quality;
- deterministic code/script for tasks that do not need an LLM.

## Use when

- creating an `agent-contract`;
- designing model routing for a voice, Telegram, media, memory or coding agent;
- the user asks to use different models for different tasks;
- the agent contract genuinely requires multi-model routing for cost, quality,
  latency, privacy or risk reasons;
- deciding whether to add local inference;
- estimating model spend;
- deciding where sensitive user data may be processed.

## Avoid when

- the agent is a tiny one-off scaffold with no repeated inference workload;
- the user did not request different models and the contract does not need
  multi-model routing;
- the local model/runtime has not been tested on representative examples;
- the task requires best-available coding, planning, security analysis or
  adversarial robustness;
- hardware, electricity, maintenance, fallback and quality costs are unknown.

## Required practices

- Record task classes in the contract: planning, coding, extraction,
  summarization, classification, transcription, embedding, chat, memory query,
  tool selection, validation and reporting.
- For each class, record preferred runtime: deterministic, local model, small
  hosted model, frontier hosted model or manual/human.
- If a concrete model is named, record it as `current_candidate`, with
  `verified` date and `recheck_before_scaffold: true`.
- Do not preserve model names or prices as standing rules. Preserve only the
  reason for choosing a class of runtime.
- Record fallback runtime and failure behavior.
- Record harness assumptions for each runtime class: expected context size,
  tool-call behavior, schema strictness, retry policy, compaction behavior and
  required verification surfaces.
- Record provider boundary when enterprise governance matters: direct OpenAI,
  ChatGPT sign-in, API key, AWS Bedrock, local provider, managed service or
  mixed. Provider choice changes auth, feature availability, logs, cost
  ownership, region support and compliance posture.
- Record privacy level and whether data may leave the local environment.
- Record where routing runs: inside the agent process, host-side gateway, local proxy, remote service or manual operator path.
- For sandboxed agents, prefer an in-sandbox stable inference endpoint with host-side provider/model routing and host-side credentials.
- Record cost budget and whether usage is expected to be bursty or repeated.
- If AWS Bedrock or another enterprise provider path is selected, record region,
  identity boundary, feature gaps versus first-party hosted surfaces, audit log
  location, procurement owner and readiness check.
- Record eval fixtures before moving a task from frontier model to local/small
  model.
- Treat a model change as a harness compatibility change. Re-run representative
  evals and update prompts, tool schemas, context ordering or verification
  surfaces when the new model behaves differently.
- Keep routing config explicit and testable.
- Do not route untrusted external input directly to tools or memory just because
  the model is local.
- Do not treat sponsor hardware claims or anecdotal savings as purchase
  justification without local measurement.

## Runtime placement matrix

| Task class | Default first runtime | Candidate offload runtime | Notes |
| --- | --- | --- | --- |
| New workflow discovery | frontier hosted model | none until stable | Optimize for capability and fast iteration. |
| Coding and code review | frontier hosted model | local only with strong eval evidence | Quality failures are expensive. |
| Complex planning/orchestration | frontier hosted model | smaller hosted model for bounded plans | Keep hard coordination on the strongest available model. |
| Embeddings | local or cheap hosted model | local model | Good early local candidate. |
| Transcription | local or hosted audio model | local model | Use local when latency and accuracy are acceptable. |
| Extraction/classification | frontier while designing | local or small hosted model | Move after schemas and examples stabilize. |
| Summarization of trusted text | frontier while designing | local or small hosted model | Add quality checks for compression loss. |
| Memory/CRM query | frontier while designing | local or small hosted model | Privacy benefit can be high. |
| Voice teaching/chat | Realtime/hosted voice model | local only if speech stack is mature | Latency and conversational quality dominate. |
| Security scanning | frontier or specialized scanner | local only for low-risk prefilter | Do not underpower sensitive scanners. |
| Deterministic validation | code/script | code/script | Prefer non-LLM checks where possible. |

## Lifecycle rule

Use three phases:

1. Experiment: use the best reliable model and avoid premature local routing.
2. Productionize: identify stable repeated subtasks, add eval examples and
   measure cost/latency/quality.
3. Scale: offload proven subtasks to local or smaller models with fallback.

## Contract fields

Every relevant `agent-contract` should include:

- `runtime_placement_profile`;
- `multi_model_routing_requested`;
- `task_routes`;
- `local_inference_required`;
- `local_inference_adapter`;
- `provider_fallbacks`;
- `privacy_routing_rules`;
- `model_budget_policy`;
- `provider_boundary`;
- `enterprise_governance_required`;
- `enterprise_provider_notes`;
- `runtime_eval_fixtures`;
- `route_healthcheck`;
- `route_change_log`.

When multi-model routing is requested by the user, task routes should separate
stable runtime class from current candidate:

```yaml
runtime_placement:
  multi_model_routing_requested: true
  task_routes:
    planning:
      runtime_class: frontier-hosted
      current_candidate: checked-current-model-name
      verified: YYYY-MM-DD
      recheck_before_scaffold: true
    classification:
      runtime_class: local-or-small-hosted
      current_candidate: TBD after eval
      eval_required: true
```

## Temporal validity

- Source published: 2026-04-13.
- Source updated: 2026-06-02.
- Source version: Techscope draft standard v4; official runtime/provider/NemoClaw
  docs plus 2026 harness and Codex/AWS source batches.
- Retrieved: 2026-05-26.
- Verified: 2026-06-02.
- Valid for: Agents Mother contracts and new agent architecture from 2026-05-26
  onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: OpenAI, Anthropic, local model runtimes, NVIDIA/Apple hardware,
  LM Studio/Ollama/vLLM or selected model families change pricing,
  capabilities, context limits, tool-use support or deployment APIs.

## Related decisions

- `04_standards/agent-creation-harness.md`
- `04_standards/agent-tool-integration-selection.md`
- `04_standards/agent-untrusted-input-security.md`
