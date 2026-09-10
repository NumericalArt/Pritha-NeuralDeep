---
id: 2026-06-21-raster-ui-assets-for-child-agents-signal
type: signal
status: extracted
created: 2026-06-21
updated: 2026-06-21
topics:
  - raster-ui-assets
  - image-generation
  - child-agent-ui
  - operator-surface
tools:
  - Pritha
  - Codex
  - imagegen
  - OpenAI image_generation
sources:
  - source-raster-ui-assets-2026-06-21
  - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
related:
  intakes:
    - 00_inbox/texts/2026-06-21-raster-ui-assets-for-child-agents.md
  reviews:
    - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  standards:
    - 04_standards/raster-ui-assets-for-child-agents.md
  workflows:
    - 07_workflows/raster-ui-asset-generation.md
generated_from:
  - source-raster-ui-assets-2026-06-21
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - source-material
subject:
  kind: pattern
  id: raster-ui-assets-for-child-agents
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Signal: Raster UI Assets for Child Agents

Date: 2026-06-21
Status: extracted
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

Generated raster images are useful for Pritha-created child agents when they
make a workflow state, comparison, consequence or artifact easier to inspect.
They should be treated as explicit workflow assets with purpose, state, control
and fallback requirements, not as decorative UI polish.

## Technical details

- Codex can generate or edit image assets directly, including icons, banners,
  illustrations, sprite sheets and placeholder art; reference images can guide
  transformations.
- The hosted OpenAI `image_generation` tool supports prompt-based generation,
  optional image inputs, size, quality, format, compression, background and
  generate/edit/auto action choices. It also supports partial-image streaming
  for faster visual feedback in interactive flows.
- Prompting should read like an artifact specification: deliverable, UI
  context, hierarchy, exact text, visual language, constraints, output size and
  quality.
- Users struggle to articulate visual intent through text-only prompts, so a
  child-agent UI should offer small controls such as style chips, aspect ratio,
  preview thumbnails and accept/reject/regenerate/edit actions.
- Raster assets need format, responsive, accessibility, privacy and fallback
  decisions before integration.

## Agent design implications

Pritha should ask or infer the same non-chat UI fields before raster generation:
user journey, visibility needs, control needs, state model, side-effect policy,
rendering boundary, framework/stack, fallback text summary, mobile/accessibility,
privacy/permission prompts and readiness check.

The practical child-agent shape is a small operator surface around one workflow:
show state, control and consequences. Avoid universal dashboards whose images
only make the agent look more vivid.

## Candidate rules

- Select raster imagery only after DOM/CSS/vector-first rendering is considered.
- Do not put meaningful text, controls, warnings or status only inside pixels.
- Create an asset spec before invoking `imagegen` or hosted image generation.
- Use hybrid prompt-plus-controls for user-facing generation.
- Save project-bound generated assets in the child-agent workspace and connect
  them to real components with alt/fallback and responsive variants.
- Verify mobile readability, file weight, consistency and accessibility before
  marking the UI module ready.

## Noise removed

- Treating image generation as a general beautification step.
- Choosing one raster format for all use cases.
- Letting generated images replace real UI controls or state.

## Verification required

- Recheck OpenAI image-generation model/tool parameters before implementation,
  because model names, supported formats, transparency behavior and streaming
  options are temporal.
- Recheck browser image-format support before choosing AVIF/WebP-only output.

## Codex refinement required

Completed in the current Codex thread on 2026-06-21.

## Source links

See `03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md`
for the verified external source list.
