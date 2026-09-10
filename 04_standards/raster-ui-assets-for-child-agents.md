---
id: raster-ui-assets-for-child-agents
type: standard
status: draft
created: 2026-06-21
updated: 2026-06-21
last_reviewed: 2026-06-21
owner: Pritha
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
  - UI asset pipeline
portability: codex-native
sources:
  - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  - 01_sources/signals/2026-06-21-raster-ui-assets-for-child-agents-signal.md
  - https://developers.openai.com/codex/cli/features
  - https://developers.openai.com/api/docs/guides/tools-image-generation
  - https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
  - https://www.nngroup.com/articles/ai-articulation-barrier/
  - https://www.nngroup.com/articles/imagery-in-visual-design/
  - https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
  - https://web.dev/learn/design/responsive-images
  - https://www.w3.org/WAI/tutorials/images/decision-tree/
related:
  reviews:
    - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  workflows:
    - 07_workflows/raster-ui-asset-generation.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-skill-pack-lifecycle.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2021-12-09..2026-04-21
source_updated: 2021-12-09..2026-06-21
source_version: raster UI asset protocol v1, source batch verified 2026-06-21
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Pritha child-agent UI design and scaffold contracts
temporal_status: version-bound
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

# Standard: Raster UI Assets for Child Agents

Status: draft
Owner: Pritha
Last reviewed: 2026-06-21

## Rule

Pritha treats generated raster images as workflow assets for a child-agent UI,
not as decoration. A raster asset is selected only when it helps the user see a
state, compare an option, inspect a generated artifact, understand a consequence
or operate a concrete workflow.

For non-chat child-agent UI, Pritha must decide the raster layer after the
interface job is clear: user journey, visibility needs, control needs, state
model, side-effect policy, rendering boundary, framework/stack, fallback text
summary, mobile/accessibility, privacy/permission prompts and readiness check.

## Use when

- A workflow needs a preview, illustration, product/media thumbnail, generated
  artifact, state visualization, texture, sprite or empty/error state.
- The user needs to compare generated visual candidates before accepting one.
- The UI benefits from a bitmap image but still keeps real controls and text in
  DOM/native UI.
- A child-agent contract selects a web/workflow/operator surface and the raster
  asset has a named purpose.

## Avoid when

- The image is only making a dashboard look busy.
- The need is a simple icon, logo, geometric mark, chart or control that should
  be SVG, DOM, canvas or design-system native.
- Meaningful text, warning, status or user control would exist only inside the
  image.
- The privacy boundary for reference images, screenshots or user media is not
  defined.
- The team cannot verify mobile readability, file size, responsive behavior and
  text alternative.

## Required practices

- Start with a raster asset spec before generation:
  - `user_journey_step`
  - `visibility_need`
  - `control_need`
  - `state_shown`
  - `side_effects_shown_or_hidden`
  - `rendering_boundary`
  - `target_component`
  - `generation_path`
  - `output_format`
  - `output_sizes`
  - `accessibility_alt_policy`
  - `fallback_text_summary`
  - `privacy_or_permission_risk`
  - `readiness_check`
- Prefer DOM/CSS/vector/native UI for text, controls, forms, status, warnings,
  layout and icons. Use raster only for bitmap-specific value.
- Use hybrid prompt-plus-controls when the user participates in image creation:
  style chips, aspect-ratio picker, reference image selector, preview
  thumbnails, accept/reject/regenerate/edit and notes about what changed.
- Shape prompts as artifact specs:
  - deliverable and target component;
  - UI context and workflow state;
  - visual hierarchy;
  - exact text, if any;
  - style constraints and negative constraints;
  - size, quality and format;
  - accessibility and fallback notes when relevant.
- Save project-bound generated assets inside the child-agent workspace. Do not
  leave referenced assets only in Codex's default generated-image location.
- Keep reference images and screenshots under the untrusted-input/privacy
  policy selected by the child-agent contract.

## Format policy

- Photos and rich still images: prefer WebP or JPEG, with AVIF considered when
  browser support and fallback are handled.
- Transparent raster assets: PNG or WebP with alpha; use SVG instead when the
  asset is geometric/vector-friendly.
- Small high-detail icons: prefer SVG; use PNG only when bitmap detail is
  essential.
- Generated UI mockups and previews: use PNG/WebP during iteration; export the
  production format after compression and responsive sizing.
- Newer formats such as AVIF/WebP require fallback where target browsers or
  embedded hosts are uncertain.

## Accessibility policy

- If the image is decorative or redundant to nearby real text, use empty alt.
- If the image is inside a button or link, the accessible name must describe the
  action or destination.
- If the image communicates a simple state or preview, provide a brief alt that
  conveys the meaning.
- If the image contains text, status, warning, data or instructions, duplicate
  that content as real text or structured data outside the image.
- If the image is complex, provide a nearby summary or details panel rather
  than relying on alt alone.

## Responsive and performance policy

- Generate or export variants for the intended slots, not one oversized file for
  every viewport.
- Record width and height, use `srcset`/`sizes` or framework equivalents when
  multiple sizes are available, and choose lazy/eager loading by importance.
- Use `decoding="async"` for ordinary images and reserve sync/eager behavior for
  primary content that must appear with the first render.
- Check mobile crop, readability, file size and layout shift before readiness.

## Agent environment compatibility

- Agent platforms: Pritha-created Codex-native agents.
- Model context: Codex thread and `imagegen` by default; hosted
  `image_generation` only when the implementation explicitly selects API use.
- Runtime environment: local project UI, Codex App/CLI, optional web UI.
- Config surfaces: child-agent contract, UI manifest, skill manifest, asset
  directory and component code.
- Portability: codex-native as a tool workflow; portable as a design rule.
- Codex adaptation: built-in image generation is the normal project asset path;
  CLI/API fallback is a separate, permissioned implementation choice.
- Environment-specific caveats: model names, output controls, transparency and
  streaming support are temporal and must be checked before implementation.

## Temporal validity

- Source published: 2021-12-09..2026-04-21.
- Source updated: 2021-12-09..2026-06-21.
- Source version: raster UI asset protocol v1, source batch verified 2026-06-21.
- Retrieved: 2026-06-21.
- Verified: 2026-06-21.
- Valid for: Pritha child-agent UI design and scaffold contracts.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: OpenAI image-generation models/tool parameters change, Codex
  imagegen behavior changes, browser image-format support changes, or Pritha
  adds a reusable UI asset pipeline.

## Examples

Good fit:

- A media-review child agent shows generated thumbnail variants for a reviewed
  feed card, with accept/reject/regenerate controls and real metadata beside it.
- A deployment assistant shows a generated visual map of a selected deployment
  topology while keeping approval buttons, warnings and commands in DOM.
- A learning agent generates lesson illustration variants, then stores the
  accepted asset with alt text and a real-text lesson summary.

Poor fit:

- A universal "agent dashboard" filled with decorative generated panels.
- A warning screen where the warning text exists only inside an image.
- Generated icons for ordinary toolbar actions when the UI already has a vector
  icon system.

## Related decisions

- `04_standards/agent-interface-experience.md`
- `07_workflows/raster-ui-asset-generation.md`
- `11_agents/skills/raster-ui-asset-design/SKILL.md`
