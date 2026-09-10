---
id: signal-2026-06-16-webgl-3d-interface-resource-batch
type: signal
status: refined
created: 2026-06-16
updated: 2026-06-16
topics:
  - threejs
  - react-three-fiber
  - webgl
  - 3d-interface
  - canvas-accessibility
  - model-loading
  - frontend-frameworks
tools:
  - Three.js
  - React Three Fiber
  - Drei
  - WebGL
  - GLTFLoader
  - DRACOLoader
  - gltfjsx
  - model-viewer
  - PlayCanvas
  - Babylon.js
  - TresJS
  - Threlte
  - PixiJS
sources:
  - source-f7c3b6a0-0b1a-4c54-bd12-e676c3d93b4e
related:
  intakes:
    - 00_inbox/links/2026-06-16-webgl-3d-interface-resource-batch-intake.md
  reviews:
    - 03_reviews/2026-06-16-webgl-3d-interface-resource-batch-review.md
  standards:
    - 04_standards/agent-interface-experience.md
generated_from:
  - source-f7c3b6a0-0b1a-4c54-bd12-e676c3d93b4e
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
freshness_status: current
source_published: 2022-01-05..2026-02-02
source_updated: mixed
retrieved: 2026-06-16
verified: 2026-06-16
valid_for: 3D/WebGL interface pattern selection for Pritha child agents
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: pattern
  id: agent-interface-experience
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_class: mixed
source_type: mixed
ingested_at: 2026-06-16
processed_at: 2026-06-16
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-f7c3b6a0-0b1a-4c54-bd12-e676c3d93b4e
---

# Signal: WebGL 3D Interface Resource Batch

Date: 2026-06-16
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

Pritha needs a more concrete 3D/WebGL UI pattern library under
`agent-interface-experience`. The durable rule is not "use Three.js"; it is to
choose the smallest visual layer that satisfies the workflow, then enforce
canvas layout, render loop, model-loading, performance, accessibility and
verification constraints.

The batch refines the earlier Three.js review from a renderer-selection rule
into an implementation checklist for ordinary product UI:

```text
normal DOM/UI shell
-> optional embedded model viewer OR WebGL canvas
-> explicit scene state contract
-> responsive canvas/render-loop policy
-> asset/performance/accessibility gates
-> screenshot/canvas and fallback verification
```

## Technical details

- Responsive Three.js UI should let CSS own the displayed canvas size while code
  resizes the drawing buffer, updates camera projection on resize and caps high
  DPR where GPU cost would exceed the value.
- Continuous rendering is appropriate for live animation, simulations, games or
  always-moving effects. Static product viewers, diagrams, editors and catalogs
  should prefer on-demand rendering triggered by controls, resize, model load,
  data updates or user input.
- Pages with many 3D blocks should avoid one WebGL context per card. Prefer one
  renderer/canvas with virtual views or scissor rectangles, or a framework helper
  that implements the same pattern.
- HTML labels, forms and explanatory text should stay in DOM when possible.
  Project 3D positions into CSS coordinates and handle occlusion/z-ordering, but
  do not turn normal UI text into canvas pixels without a fallback.
- GLB/glTF is the default real-model path. Use the standard loader for glTF and
  add a Draco decoder only when file-size savings justify decoder cost and
  client-side decode time.
- React projects should prefer React Three Fiber and Drei when the scene needs
  React state/lifecycle integration, but avoid React state updates inside hot
  render loops.
- WebGL performance gates must include draw calls, VRAM budget, texture strategy,
  mipmaps/compressed textures, shader compile behavior, blocking API calls,
  resource disposal and mobile constraints.
- Canvas/WebGL accessibility requires explicit fallback content, accessible names
  or DOM equivalents for informational or interactive content. Decorative canvas
  layers should be treated as decorative and not own essential UI.
- Use a simple model-viewer component when the task is just product/object/AR
  viewing and does not need custom scene logic, picking, agent-controlled object
  IDs or stateful editing.
- Stack alternatives matter: React Three Fiber for React, TresJS for Vue/Nuxt,
  Threlte for Svelte, PixiJS for high-performance 2D effects, and PlayCanvas or
  Babylon.js when an engine/editor/UI system is a better fit than a thin Three.js
  layer.

## Agent design implications

- Child-agent contracts should record whether 3D is a full scene, a simple model
  viewer, a decorative canvas layer, a DOM-synchronized WebGL page, a scroll
  narrative, a product/model inspector, a dashboard, an avatar or a 2D WebGL
  effect.
- Pritha should default to no 3D layer unless the workflow needs spatial
  inspection, simulation, model review, visual explanation or creative artifact
  authoring.
- The frontend framework should drive wrapper choice: do not add R3F to Vue or
  Svelte projects just because it is the best-known Three.js wrapper.
- Rich WebGL UI must have a non-3D or text fallback, mobile/performance budget
  and screenshot/canvas verification before handoff.

## Candidate rules

- Prefer `<model-viewer>`-style embedding for simple 3D object display before
  building a custom Three.js scene.
- Prefer one WebGL context for multi-card or multi-section 3D UI.
- Prefer DOM for text, controls and forms unless they must be spatially embedded
  in the 3D world.
- Do not choose continuous rendering without a reason and a power/performance
  budget.
- Do not add Draco compression without measuring model-size savings, decoder
  cost and decode latency.
- Do not accept a canvas/WebGL UI as accessible unless meaningful content and
  controls have DOM, ARIA or equivalent fallback coverage.
- Use framework-native Three.js wrappers only when the host app framework
  matches.

## Noise removed

- Secondary tutorial branding and marketing claims were not promoted.
- Course resources are treated as learning material, not authoritative standards.
- Engine alternatives are comparison references, not replacements for the
  existing Three.js/R3F default guidance.

## Verification required

- Verify concrete implementation against current official docs before scaffold.
- For Three.js/R3F scenes, run viewport and canvas-pixel/screenshot checks.
- For model assets, inspect file size, compression, texture dimensions and
  license.
- For canvas UI, verify keyboard path, screen-reader fallback or a documented
  non-3D alternative.
