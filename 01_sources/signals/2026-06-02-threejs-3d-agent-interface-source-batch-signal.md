---
id: signal-2026-06-02-threejs-3d-agent-interface-source-batch
type: signal
status: refined
created: 2026-06-02
updated: 2026-06-11
topics:
  - threejs
  - react-three-fiber
  - 3d-interface
  - agentic-ui
  - mcp
  - webgl
  - webgpu
tools:
  - Three.js
  - React Three Fiber
  - WebGLRenderer
  - WebGPURenderer
  - TSL
  - MCP
sources:
  - source-threejs-3d-agent-interface-batch-2026-06-02
related:
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-mcp-connector-lifecycle.md
  reviews:
    - 03_reviews/2026-06-02-threejs-3d-agent-interface-source-batch-review.md
supersedes: []
superseded_by: []
generated_from:
  - source-threejs-3d-agent-interface-batch-2026-06-02
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
freshness_status: current
source_published: 2025-10-24..2026-05-19
source_updated: 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: 3D visual/interface layer decisions for Pritha child agents
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: pattern
  id: agent-interface-experience
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_class: mixed
source_type: article
ingested_at: 2026-06-02
processed_at: 2026-06-02
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-threejs-3d-agent-interface-batch-2026-06-02
---

# Signal: Three.js 3D Agent Interface Source Batch

Date: 2026-06-02
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core Signal

Three.js belongs in Pritha as a 3D visual/interface layer, not as an AI-agent
logic framework. It is relevant when a child agent needs scenes, spatial
visualization, product/model inspection, simulated environments, animated agent
states, 3D dashboards, avatars, educational simulations or live 3D debugging.

For child-agent contracts, the useful pattern is:

```text
agent backend/harness
-> message/state/tool events
-> web UI layer
-> optional Three.js/R3F scene
-> optional MCP/devtools bridge for inspection or editing
```

The 3D layer should not decide the agent's backend runtime. It should be chosen
only when it improves user inspection, control, explanation, simulation or
artifact quality.

## Useful Delta For Pritha

- Add `3d-visual-layer` as an optional interface module.
- Record whether the child agent uses vanilla Three.js, React Three Fiber or no
  3D layer.
- Prefer React Three Fiber when the child UI is already React/Next.js and the
  scene needs React state/lifecycle integration.
- Prefer vanilla Three.js when the scene is standalone, performance-critical,
  framework-neutral or mostly outside React state.
- Use `WebGLRenderer` as the compatibility-first default.
- Use `WebGPURenderer` only when the project needs WebGPU features, compute,
  node materials or TSL-driven custom materials, and has fallback/testing.
- When using WebGPU/custom materials, prefer Three.js TSL and node materials
  over raw GLSL string manipulation or legacy `onBeforeCompile` hacks.
- Consider a Three.js MCP/devtools connector only as an explicit debugging,
  inspection or scene-editing tool boundary. Do not expose broad scene mutation
  tools by default.

## Agent Harness Implications

Three.js scenes need the same interface discipline as other rich UI:

- a stable message/state contract between agent and scene;
- explicit object IDs/names for objects the agent can inspect or modify;
- a clear side-effect policy for scene edits, exported files and generated
  assets;
- performance checks for FPS, memory, asset loading and mobile viewport;
- text fallback or static summary when 3D rendering is unavailable;
- no secrets or broad credentials in browser-side scene code.

MCP is useful for live scene inspection when the agent needs visual feedback
about scene state, materials, objects, shaders or performance. It is not a
reason to install an external MCP server silently.

## Noise Removed

- Do not promote Three.js into a general agent backend framework.
- Do not promote community "AI skill" snippets into standards without checking
  official Three.js/R3F APIs.
- Do not assume WebGPU is the default production renderer just because it is
  newer.
- Do not use MCP scene-control demos as evidence that all 3D child agents need
  MCP.

## Recommended Promotion

Update `agent-interface-experience` with a dedicated 3D visual layer selection
section and add contract fields for:

- 3D visual layer;
- 3D renderer;
- 3D framework;
- asset/source policy;
- scene state contract;
- 3D MCP/debug connector;
- performance/mobile verification.
