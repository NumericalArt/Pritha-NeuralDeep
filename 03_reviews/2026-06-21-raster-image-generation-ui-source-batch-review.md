---
id: 2026-06-21-raster-image-generation-ui-source-batch-review
type: review
status: draft
created: 2026-06-21
updated: 2026-06-21
topics:
  - raster-ui-assets
  - image-generation
  - child-agent-ui
  - interface-design
  - accessibility
  - responsive-images
tools:
  - Pritha
  - Codex
  - imagegen
  - OpenAI image_generation
  - gpt-image-2
  - WebP
  - AVIF
  - PNG
  - JPEG
agent_platforms:
  - Codex
  - Pritha
model_context:
  - Codex image generation skill
  - OpenAI hosted image_generation tool
runtime_environment:
  - Codex App
  - Codex CLI
  - web UI
config_surfaces:
  - agent-contract
  - AGENTS.md
  - skills/manifest.json
  - UI component code
portability: codex-native
sources:
  - 00_inbox/texts/2026-06-21-raster-ui-assets-for-child-agents.md
  - https://developers.openai.com/codex/cli/features
  - https://developers.openai.com/api/docs/guides/tools-image-generation
  - https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
  - https://www.nngroup.com/articles/ai-articulation-barrier/
  - https://www.nngroup.com/articles/imagery-in-visual-design/
  - https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
  - https://web.dev/learn/design/responsive-images
  - https://www.w3.org/WAI/tutorials/images/decision-tree/
related:
  intakes:
    - 00_inbox/texts/2026-06-21-raster-ui-assets-for-child-agents.md
  signals:
    - 01_sources/signals/2026-06-21-raster-ui-assets-for-child-agents-signal.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/raster-ui-assets-for-child-agents.md
  workflows:
    - 07_workflows/raster-ui-asset-generation.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2021-12-09..2026-04-21
source_updated: 2021-12-09..2026-06-21
source_version: source batch verified 2026-06-21; OpenAI docs current at retrieval; MDN modified 2026-04-07; W3C WAI updated 2024-05-13
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Pritha child-agent UI raster asset selection and workflow design
temporal_status: version-bound
source_type: article
source_class: mixed
ingested_at: 2026-06-21
processed_at: 2026-06-21T16:43:13Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-raster-ui-assets-2026-06-21
recommendation: standard
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: raster-ui-assets-for-child-agents
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Review: Raster Image Generation for Child-Agent UI

Date: 2026-06-21
Status: draft
Recommendation: standard

## Question

How should Pritha integrate raster image generation into the design of
non-chat child-agent UIs without turning every child agent into a decorative
dashboard?

## Options

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Prompt-only image generation | Fast and flexible for expert users | High articulation burden; weak control over workflow fit | Poor default |
| DOM/CSS/vector-first UI, raster assets by exception | Accessible, testable, lightweight; keeps controls real | May miss useful illustration, preview and texture use cases | Best baseline |
| Raster workflow asset protocol | Makes generation reviewable and tied to user journey/state/control | Adds contract and readiness overhead | Best for child-agent UI |
| Universal visual dashboard | Looks rich and demo-friendly | Hides state/control, creates maintenance and accessibility risk | Reject |

## Comparison

The source batch supports a contract-selected raster layer, not raster UI by
default. OpenAI sources make generation/editing and iterative workflows
practical. NN/g sources explain why users need hybrid controls rather than
prompt-only visual articulation. MDN, web.dev and W3C WAI define the technical
guardrails: format choice, responsive variants and text alternatives.

## Agent environment profile

- Agent platforms: Pritha-created Codex-native child agents.
- Model context: Codex thread, Codex image generation skill, OpenAI hosted image tool when explicitly selected by implementation.
- Runtime environment: local project UI, Codex App/CLI, optional web workflow UI.
- Config surfaces: `agent-contract`, `AGENTS.md`, `skills/manifest.json`, UI asset directories and component code.
- Portability: codex-native for the workflow; portable as a design rule.
- Codex adaptation: use built-in `imagegen` for normal project-bound assets, save final assets into the workspace, and treat API/CLI fallback as a separate implementation choice.
- Environment-specific caveats: hosted model names, supported output controls and transparency behavior must be rechecked before implementation.

## Existing knowledge and temporal context

- Related existing artifacts:
  - `04_standards/agent-interface-experience.md`
  - `07_workflows/agents-mother.md`
  - `04_standards/agent-skill-pack-lifecycle.md`
- Relationship to existing knowledge: refines `agent-interface-experience` with a raster visual asset layer.
- Source published: 2021-12-09 to 2026-04-21 where visible.
- Source updated: mixed; OpenAI pages checked live 2026-06-21, MDN modified 2026-04-07, W3C WAI updated 2024-05-13.
- Source version: current source batch verified 2026-06-21.
- Retrieved: 2026-06-21.
- Verified: 2026-06-21.
- Valid for: child-agent UI design and scaffold contracts.
- Freshness status: current.
- Temporal status: version-bound because image-generation tool options can change.
- Artifacts to mark outdated or superseded: none.

## Source Verdicts

| Source | Verdict | Pritha fit |
| --- | --- | --- |
| OpenAI Codex CLI features | adopt | Confirms Codex can generate/edit image assets and use references; useful for local project asset workflow. |
| OpenAI image generation tool docs | adopt, recheck before build | Confirms generate/edit action, size, quality, format, compression, background and partial-image streaming controls. |
| OpenAI Cookbook prompting guide | adopt | Supports prompt-as-artifact-spec: exact deliverable, hierarchy, text, style and constraints. |
| NN/g articulation barrier | adopt | Child-agent image-generation UI should be hybrid prompt plus GUI controls. |
| NN/g imagery in visual design | adopt | Images must carry information, match design characteristics, balance quality/file size and include robust alternatives. |
| MDN image format guide | adopt | Use format-specific policy rather than one default format. |
| web.dev responsive images | adopt | Generate/export size variants and set width/height/loading/decoding/srcset/sizes where relevant. |
| W3C WAI alt decision tree | adopt | Alt/fallback decision is mandatory, especially for image-buttons, text-in-image and complex images. |

## Expert notes

### Architecture

Raster assets belong at the UI/module boundary, not in the agent core. The child
agent should store final assets in the workspace and render them through normal
components. The state model and side-effect policy remain real data and controls
in the UI, not pixels.

### Security

Reference images, screenshots and user-provided media are untrusted input and
may contain private data. The contract should define permission prompts,
retention, allowed sources and whether images can leave the local workspace for
hosted generation.

### Developer Experience

The protocol needs a small asset spec and checklist so future Codex threads can
repeat the workflow. Do not require a large design system for a small operator
surface; require stable file paths, dimensions, alt/fallback and mobile checks.

### Product Pragmatist

Raster generation is worth the overhead when it helps the user inspect a result,
compare options, understand a workflow state or review a generated artifact. It
is not worth it for ordinary app chrome, button icons or decorative cards.

### Research Scout

OpenAI docs are temporal and should be rechecked for model/tool options before
using API parameters. MDN and WAI are stable enough for current format and alt
policy, with compatibility checks before production.

## Recommendation

Create a standard and workflow named `raster-ui-assets-for-child-agents`. Update
`agent-interface-experience` and the child-agent contract template so any
selected non-chat UI records whether a raster layer is needed, what workflow job
it serves, which generation path is used, and how the asset is verified.
