---
id: raster-ui-asset-generation
type: workflow
status: draft
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
  - 04_standards/raster-ui-assets-for-child-agents.md
  - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
related:
  standards:
    - 04_standards/raster-ui-assets-for-child-agents.md
    - 04_standards/agent-interface-experience.md
  reviews:
    - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  skills:
    - 11_agents/skills/raster-ui-asset-design/SKILL.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-21
source_updated: 2026-06-21
source_version: raster UI asset generation workflow v1
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Pritha child-agent UI design in interactive Codex threads
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: workflow
  id: raster-ui-asset-generation
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Workflow: Raster UI Asset Generation

Status: draft

## Goal

Use raster image generation in child-agent UI only when it strengthens a focused
operator surface: visible state, user control and understandable consequences.

## Trigger

Run this workflow when a Pritha child-agent contract selects a non-chat UI and a
raster image might help the user inspect a workflow, generated artifact,
comparison, media preview, product state, lesson scene, empty/error state,
texture or sprite.

## Protocol

1. Confirm the interface job first:
   - user journey;
   - visibility needs;
   - control needs;
   - state model;
   - side-effect policy;
   - rendering boundary;
   - framework/stack;
   - fallback text summary;
   - mobile/accessibility;
   - privacy/permission prompts;
   - readiness check.
2. Decide whether raster is necessary:
   - use DOM/CSS/native UI for text, controls, status and forms;
   - use SVG/vector for icons, marks, simple diagrams and geometric UI;
   - use raster only when bitmap texture, generated visual content, preview,
     scene, screenshot-like artifact or image editing is the actual value.
3. Create an asset spec:
   - asset name and target component;
   - workflow step and state shown;
   - what the user must learn from the image;
   - what the user can accept, reject, edit, stop or regenerate;
   - side effects represented by the image;
   - source/reference images and their trust/privacy level;
   - output size, aspect ratio, format and variants;
   - alt/fallback policy;
   - readiness checks.
4. Use hybrid user controls for visual intent:
   - prompt field or summarized prompt;
   - style chips;
   - aspect ratio and crop picker;
   - reference image selector;
   - generate/edit mode;
   - preview thumbnails;
   - accept/reject/regenerate/edit actions.
5. Generate or edit:
   - use Codex built-in `imagegen` for normal project-bound assets;
   - use hosted OpenAI `image_generation` only when the implementation
     explicitly selects API use and current docs have been checked;
   - use CLI/API fallback only when the selected contract and environment allow
     it.
6. Review with the user or operator:
   - check whether the image communicates the intended state;
   - check whether real controls and text remain outside the image;
   - capture requested changes as single targeted iterations.
7. Integrate:
   - save the accepted asset in the child-agent workspace;
   - generate or export responsive variants when needed;
   - wire it into the component with width/height, loading/decoding and
     alt/fallback;
   - keep discarded previews out of durable memory unless needed for audit.
8. Verify readiness:
   - mobile crop and readability;
   - no text/control/status hidden only inside pixels;
   - design-system consistency;
   - file size and format fallback;
   - responsive variants;
   - correct alt or empty alt;
   - privacy and retention policy;
   - user can accept, reject, edit or regenerate where appropriate.
9. Record the outcome in the scaffold report or UI notes:
   - prompt/spec;
   - final asset path;
   - tool path used;
   - variants;
   - accessibility/fallback decision;
   - known limitations.

## Asset spec template

```yaml
raster_asset:
  name:
  target_component:
  user_journey_step:
  visibility_need:
  control_need:
  state_shown:
  side_effects_shown_or_hidden:
  rendering_boundary: DOM/CSS/native controls plus raster asset
  generation_path: codex-imagegen | openai-image-generation | existing-asset | manual
  source_or_reference_images:
    - path_or_description:
      role: reference | edit-target | supporting-input
      privacy_risk: low | medium | high | unknown
  output:
    aspect_ratio:
    sizes:
    format:
    quality:
    background:
  accessibility:
    alt_policy: empty | functional | informative | complex-summary | real-text-duplicate
    fallback_text_summary:
  verification:
    - mobile_readability
    - no_hidden_controls_or_status
    - responsive_variants
    - optimized_file_size
    - privacy_boundary
```

## Prompt shape

```text
Use case: ui-workflow-asset
Asset type: <target component and slot>
Primary request: <what image should depict>
UI context: <child-agent workflow and state>
User-visible purpose: <what the user learns or compares>
Controls around image: <accept/reject/edit/regenerate/etc>
Visual hierarchy: <most important elements>
Exact text: "<only if required; otherwise no text>"
Style constraints: <design system, tone, medium>
Negative constraints: no hidden UI controls, no fake buttons, no watermark, no unrelated dashboard chrome
Output: <aspect ratio, size, format, quality>
Accessibility/fallback: <alt or real text summary requirement>
```

## Stop conditions

- The user cannot state or confirm what the image helps them do.
- The asset would contain the only copy of status, warning, instruction or
  control text.
- The reference material includes private data and no permission boundary is
  defined.
- The UI cannot provide responsive behavior or text alternatives.
- A vector/native implementation is simpler and more maintainable.
