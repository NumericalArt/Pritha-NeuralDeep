---
id: review-2026-06-02-threejs-3d-agent-interface-source-batch
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
topics:
  - threejs
  - react-three-fiber
  - 3d-interface
  - agentic-ui
  - mcp
tools:
  - Three.js
  - React Three Fiber
  - WebGLRenderer
  - WebGPURenderer
  - TSL
  - MCP
sources:
  - https://threejs.org/docs/llms.txt
  - https://threejs.org/docs/llms-full.txt
  - https://threejs.org/manual/#en/webgpurenderer
  - https://playbooks.com/skills/anthemflynn/ccmp/react-three-fiber
  - https://mcp-marketplace.io/server/io-github-dmitriygolub-threejs-devtools
  - https://discourse.threejs.org/t/hello3dmcp-ai-driven-3d-interactive-app/89133
  - https://meditations.metavert.io/p/when-ai-learns-to-paint-threejs-and
related:
  signals:
    - 01_sources/signals/2026-06-02-threejs-3d-agent-interface-source-batch-signal.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-mcp-connector-lifecycle.md
supersedes: []
superseded_by: []
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
processed_at: 2026-06-02
retention_status: source-purged
usefulness: high
evidence_quality: high
recommendation: standard-update
---

# Review: Three.js 3D Agent Interface Source Batch

## One-Paragraph Read

This batch is useful for Pritha after one hard filter: Three.js is not an agent
logic framework. It is a rich interface/rendering layer for child agents that
need 3D scenes, simulations, visual explanations, dashboards, model inspection
or animated state. The most reliable guidance comes from official Three.js
LLM/docs material: use modern module/import-map patterns, treat `WebGLRenderer`
as the compatibility-first default, and select `WebGPURenderer` plus TSL only
when the feature need and browser/runtime support justify it. R3F is useful
when the surrounding UI is React/Next.js. Three.js MCP tools are promising for
debugging and live scene inspection, but they remain optional connector
candidates that need the same source, trust, scope and approval review as other
MCP servers.

## Source Verdicts

| Source | Verdict | Use |
| --- | --- | --- |
| Three.js `llms.txt` and `llms-full.txt` | adopt | Official generation guidance and renderer/TSL policy. |
| Three.js WebGPURenderer docs | adopt | Renderer choice and WebGPU fallback context. |
| React Three Fiber skill | candidate | Good prompt/checklist material; verify against official R3F APIs before promotion. |
| threejs-devtools-mcp | experiment | Useful debug/inspection MCP candidate for live scenes; do not install by default. |
| Hello3DMCP | watch/example | Small proof of natural-language 3D control through MCP/WebSocket. |
| Threelab article | watch/example | Useful concept for agent-authored/mutated 3D artifacts; secondary evidence. |

## UI Principles To Keep

- Choose 3D only when it improves a real user task: inspection, comparison,
  simulation, spatial explanation, product/model review, state visualization or
  creative artifact authoring.
- Keep the agent backend separate from the rendering layer.
- Treat scene mutations as side effects when they alter saved assets, exported
  artifacts, user-facing state or downstream decisions.
- Name scene objects and expose stable IDs if an agent or MCP tool will inspect
  or modify them.
- Verify rendering with screenshots or pixel/canvas checks, not just unit tests.
- Include a non-3D fallback for unsupported clients, low-end devices or
  accessibility needs.

## Promotion Guidance

Promote to `04_standards/agent-interface-experience.md`:

- 3D visual layer is optional and contract-selected;
- renderer/framework choice must be explicit;
- WebGL is the compatibility default;
- WebGPU/TSL requires feature need and fallback/testing;
- R3F fits React/Next.js UI surfaces;
- Three.js MCP/devtools is optional debug connector, not default runtime.

Do not promote:

- Three.js as agent backend;
- community skills as authoritative API docs;
- MCP scene-control examples as universal architecture;
- WebGPU as default without compatibility checks.
