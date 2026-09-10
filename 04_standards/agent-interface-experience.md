---
id: agent-interface-experience
type: standard
status: draft
created: 2026-06-02
updated: 2026-06-21
last_reviewed: 2026-06-21
owner: Pritha
topics:
  - agentic-ui
  - user-facing-agents
  - interface-design
  - generative-ui
  - service-design
  - agent-factory
  - webgl
  - 3d-interface
  - canvas-accessibility
  - model-loading
  - raster-ui-assets
  - image-generation
tools:
  - Pritha
  - Codex
  - AG-UI
  - MCP Apps
  - OpenAI Apps SDK
  - A2UI
  - Vercel AI SDK
  - AI SDK UI
  - Three.js
  - React Three Fiber
  - WebGLRenderer
  - WebGPURenderer
  - TSL
  - Drei
  - GLTFLoader
  - DRACOLoader
  - gltfjsx
  - model-viewer
  - PlayCanvas
  - Babylon.js
  - TresJS
  - Threlte
  - PixiJS
  - Codex App Server
  - imagegen
  - OpenAI image_generation
sources:
  - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
  - 03_reviews/2026-06-02-js-ts-agent-ui-framework-source-batch-review.md
  - 03_reviews/2026-06-02-threejs-3d-agent-interface-source-batch-review.md
  - 03_reviews/2026-06-16-webgl-3d-interface-resource-batch-review.md
  - 03_reviews/2026-06-02-codex-app-server-rate-limit-telemetry-review.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-mcp-connector-lifecycle.md
  - 04_standards/realtime-voice-control-ui.md
  - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  - 04_standards/raster-ui-assets-for-child-agents.md
related:
  reviews:
    - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
    - 03_reviews/2026-06-02-js-ts-agent-ui-framework-source-batch-review.md
    - 03_reviews/2026-06-02-threejs-3d-agent-interface-source-batch-review.md
    - 03_reviews/2026-06-16-webgl-3d-interface-resource-batch-review.md
    - 03_reviews/2026-06-02-codex-app-server-rate-limit-telemetry-review.md
    - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/raster-ui-assets-for-child-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2021-12-09..2026-06-21
source_updated: 2026-06-21
source_version: Pritha agent interface experience v6 + WebGL 3D interface resource batch + raster UI asset protocol
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Pritha-created child-agent interface selection and scaffolding
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-interface-experience
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: Agent Interface Experience

## Rule

Pritha treats the interface as part of the agent harness. A child agent gets the
minimum interface that makes its workflow visible, controllable and trustworthy.
Rich UI is selected by contract, not copied into every scaffold.

Chat-only is acceptable when the task is simple, low-risk and does not require
state editing, visual comparison, progress monitoring or multi-step approval.
Agentic UI is required when the agent works over time, manipulates shared state,
performs side effects, compares rich options, or needs the user to inspect and
approve intermediate decisions.

## Defaults

- Interface experience: `chat-or-codex-thread`
- Rich UI: `disabled`
- Generated UI: `candidate-only`
- Widget side effects: `approval-required`
- Host rendering boundary: `host-owned`
- Fallback: `text-summary-required`

## Interface Profiles

Use these profiles as a contract vocabulary:

| Profile | Use when | Initial scaffold |
| --- | --- | --- |
| `chat-or-codex-thread` | one-off analysis, coding tasks, operator commands | `AGENTS.md`, README, scripts |
| `operator-console` | agent needs status, logs, pause/cancel/retry, approvals | status command or minimal local UI |
| `workflow-ui` | user edits forms, choices, plans or generated artifacts | web/API placeholder with state contract |
| `embedded-chat-app` | app should appear inside a chat host such as ChatGPT | Apps SDK/MCP Apps candidate notes |
| `event-stream-ui` | frontend needs live messages, tool progress and state deltas | AG-UI-style event manifest |
| `mcp-app-ui` | MCP server should return an interactive widget/resource | MCP Apps manifest and sandbox notes |
| `declarative-generated-ui` | agent proposes UI from trusted component catalog | A2UI-style component catalog notes |
| `realtime-voice-ui` | voice is a primary control surface | apply `realtime-voice-control-ui` |

## Required Contract Fields

For any selected interface beyond `chat-or-codex-thread`, record:

- interface experience profile;
- user journey: goal, start, progress, approval, completion and recovery;
- visibility needs: plan, current action, logs, tool calls, state diff;
- control needs: approve, reject, cancel, pause, retry, edit, reset;
- state model: ephemeral, thread-scoped, task-scoped or durable;
- side-effect policy for UI actions;
- rendering boundary: host-owned, iframe-sandboxed, native component catalog or custom;
- UI framework or existing frontend stack;
- AI UI layer, if any;
- component/widget source and trust level;
- raster visual asset layer, if any;
- raster asset purpose, generation path, format/size policy, alt/fallback and
  readiness check, if selected;
- 3D visual layer, if any;
- 3D renderer/framework choice, if any;
- account/rate-limit telemetry source, if any;
- accessibility and mobile/device needs;
- privacy and permission prompts;
- fallback behavior when rich UI is unsupported;
- readiness check.

## UX Requirements

- Show what the agent is doing when work spans multiple steps or tool calls.
- Make approvals explicit before side effects, purchases, messages, writes,
  deployments or external account actions.
- Provide cancellation or pause for long-running tasks.
- Preserve user-editable state when the agent and user co-work on an artifact.
- Do not hide important state inside raw logs. Raw events belong in a developer
  details view, not the primary user interface.
- Use compact visual controls for choices, filters, comparisons and forms
  instead of forcing long text back-and-forth.
- Make sticky context obvious and provide reset when user-selected context can
  carry across turns.
- Always provide a text fallback or summary for unsupported rich UI clients.

## Security Requirements

- Do not execute arbitrary UI code generated by an LLM unless it is sandboxed
  and explicitly selected by the contract.
- Prefer host-owned rendering from a trusted component catalog when the host
  app has a design system or accessibility requirements.
- Treat remote UI resources, widget manifests and generated component trees as
  untrusted input until validated.
- A widget may express user intent, but durable side effects must flow through
  the agent's tool/MCP approval policy.
- Record the permission prompt and privacy boundary for any app that exchanges
  user data with an external service.
- Keep secrets on the server/control-plane side. Browser widgets and generated
  UI must not receive API keys or broad credentials.

## Codex App-Server Account Telemetry

Do not assume a normal project running inside a Codex workspace can read the
user's remaining ChatGPT/Codex subscription quota from environment variables,
public files or workspace state.

When a child agent explicitly integrates with Codex through `codex app-server`,
Pritha may offer account/rate-limit telemetry as an optional UI module. The
documented app-server auth/account surface supports:

- `account/read` for current account and plan details;
- `account/updated` for auth and plan changes;
- `account/rateLimits/read` for ChatGPT rate limits;
- `account/rateLimits/updated` for rate-limit updates.

Use this only for operator consoles, app-server-backed UI shells, voice/Codex
deep-task transports or long-running Codex workflows where quota visibility
helps the user decide whether to start, pause or postpone work.

For Codex account telemetry, record:

- telemetry mode: none, app-server-read, app-server-subscribe, external or
  unknown;
- selected bucket or `limitId`, if known;
- displayed fields: used percent, remaining window estimate, reset time,
  plan type, credits, reached-limit state;
- unavailable-data behavior;
- privacy boundary for account data;
- transport/auth boundary for app-server.

UI guidance:

- Initial read: call `account/rateLimits/read`.
- Live updates: listen for `account/rateLimits/updated`.
- Remaining headroom may be displayed as `100 - usedPercent`, but label it as
  quota-window headroom, not exact subscription balance.
- Treat missing `planType`, `credits`, secondary buckets or
  `rateLimitsByLimitId` as unavailable.
- Do not scrape `CODEX_HOME`, local auth files or env vars for this data.

## Protocol Selection

Do not choose a protocol before the interface job is clear:

- Use AG-UI-like event streaming when shared mutable state, lifecycle events,
  tool progress and cancellation are the central problem.
- Use MCP Apps/MCP UI when an MCP server should provide an interactive widget
  or app resource along with tool results.
- Use OpenAI Apps SDK when the intended host is ChatGPT Apps and current
  platform permissions/review constraints are acceptable.
- Use A2UI-like declarative generated UI when remote agents should send
  component-layout data while the host retains native rendering and styling.
- Use ordinary web UI or CLI status commands when a custom protocol would add
  more complexity than value.

## UI Framework Selection

Choose the UI framework separately from the agent backend framework.

- Prefer the child project's existing frontend framework when it already has
  product UI, styling, routing, accessibility and mobile conventions.
- Use React/Next.js or another TypeScript web stack when the child agent needs
  a new web/workflow UI and the contract selects a web surface.
- Use Vercel AI SDK UI or a similar AI UI layer when the frontend needs
  streaming chat state, structured object streaming, typed tool rendering,
  status/error states, attachments, stop/regenerate/resume behavior or
  approval controls.
- Use custom UI components when the workflow is domain-specific and a generic
  chat component would hide important state.
- Use CLI/status-only when a web UI would not improve user control or task
  completion.

Do not confuse backend agent frameworks with UI frameworks. LangChain.js,
LangGraph.js, Google ADK TypeScript, OpenAI Agents SDK TypeScript and Mastra
are runtime/harness candidates unless the contract explicitly selects their
frontend integration. They may shape message schemas, tool events and API
routes, but they should not determine the child agent's UI by themselves.

For TypeScript/web UI, record:

- UI framework: existing, React, Next.js, Svelte, Vue, Angular, Solid, Flutter,
  native/mobile, none or unknown;
- AI UI layer: none, Vercel AI SDK UI, AG-UI, MCP Apps, A2UI, OpenAI Apps SDK,
  custom or unknown;
- message/state contract;
- typed tool component plan;
- approval control plan;
- cancel/regenerate/resume plan;
- mobile/accessibility verification.

## Raster Visual Asset Layer Selection

Raster image generation is an optional UI asset module, not a default child-agent
interface layer. Apply `04_standards/raster-ui-assets-for-child-agents.md` when
a web, workflow or operator UI might benefit from generated or edited bitmap
assets.

Select raster assets only when they support a concrete user workflow:

- previewing or comparing generated visual artifacts;
- showing media/product/lesson content;
- explaining a workflow state or consequence;
- supplying textures, sprites, thumbnails, illustrations or empty/error states
  that carry useful meaning.

Do not use raster generation for ordinary controls, app chrome, simple icons,
logos, charts or text that should be DOM, SVG, canvas or design-system native.
Meaningful text, warnings, status and controls must remain accessible outside
the image.

For any selected raster visual asset layer, record:

- raster visual asset layer: none, generated, reference-based, existing-assets,
  mixed or unknown;
- asset purpose and target component;
- generation path: Codex `imagegen`, OpenAI hosted `image_generation`,
  existing design tool, manual or unknown;
- prompt/spec, reference image roles and privacy boundary;
- rendering boundary between real UI and bitmap content;
- output format, sizes, responsive variants and compression target;
- alt/fallback policy;
- user review controls: accept, reject, regenerate, edit or none;
- readiness check: mobile crop/readability, file size, responsive behavior,
  accessibility, privacy and real-control coverage.

## 3D Visual Layer Selection

Three.js, React Three Fiber and related WebGL/WebGPU tooling are optional
visual/interface modules, not agent backend frameworks.

Select a 3D visual layer only when the user-facing workflow benefits from one:

- inspecting or manipulating 3D objects, products, spaces, CAD-like scenes or
  spatial data;
- simulating state, motion, layout, robotics, games, environments or agent
  behavior;
- visualizing agent status, plans or multi-step workflows spatially;
- explaining technical concepts where 3D interaction materially improves
  understanding;
- creating, mutating, reviewing or exporting 3D artifacts.

Use React Three Fiber when the child agent already has a React/Next.js UI and
the scene should participate in React state, props, routing or component
lifecycle. Use vanilla Three.js when the 3D scene is standalone,
framework-neutral, performance-sensitive or mostly independent from React UI
state.

Renderer policy:

- Use `WebGLRenderer` as the compatibility-first default.
- Use `WebGPURenderer` only when the project needs WebGPU-specific features,
  compute shaders, advanced node materials or TSL-based custom materials.
- When `WebGPURenderer` or custom materials are selected, prefer Three.js TSL
  and node materials over raw GLSL strings or legacy shader patching.
- Record fallback behavior for browsers/devices that cannot render the chosen
  scene.

Implementation policy:

- Let CSS own the displayed canvas size. Resize the renderer drawing buffer from
  the displayed size, update camera projection only when the display size
  changes, and cap DPR or total pixel count when high-density screens would
  create excessive GPU cost.
- Use continuous rendering only for animation, simulation, games, live visual
  dashboards or always-moving effects. Use on-demand rendering for product
  viewers, catalogs, editors, static diagrams and other scenes that change only
  after model load, controls, resize, data updates or user input.
- For pages with several 3D cards, diagrams or sections, prefer one
  renderer/canvas with virtual views or scissor rectangles. In React/R3F, use a
  helper such as Drei `View` before creating many independent WebGL contexts.
- Keep ordinary text, forms, labels and primary controls in DOM whenever
  possible. Project 3D positions into CSS coordinates for labels, handle
  occlusion/frustum visibility/z-order, and use Drei `Html` for R3F scene-linked
  DOM content.
- Use raycasting or framework pointer events for normal hover/click picking.
  Assign stable object IDs/names for objects an agent can inspect or mutate.
  Reserve GPU picking for cases where ordinary raycasting is inadequate and the
  extra complexity is justified.
- Keep scroll narratives DOM-first: HTML sections own the readable content, and
  the scene or camera follows scroll state. Respect reduced-motion needs and
  provide a non-3D summary.

Model and asset policy:

- Use glTF/GLB as the default real-model format for browser 3D. Use
  `GLTFLoader` for Three.js and `useGLTF`/`gltfjsx` for React Three Fiber.
- Add `DRACOLoader` only when compressed geometry meaningfully reduces payload
  size after accounting for decoder size, decode latency and worker contention.
  Reuse decoder instances and configure decoder paths explicitly.
- Treat textures as part of the performance budget: choose appropriate
  dimensions, mipmaps and compressed formats, and dispose bitmaps/textures,
  geometries and materials when they are no longer needed.
- Record asset license, source, optimization steps, expected payload size and
  fallback if a model fails to load.

Performance and accessibility policy:

- Record target FPS, DPR/pixel cap, draw-call budget, model and texture size,
  VRAM budget, mobile constraints and profiling tools.
- Prefer batching, instancing, shared materials/geometries and visibility toggles
  over frequent allocation, mount/unmount or duplicate model parsing.
- In React Three Fiber, avoid `setState` inside `useFrame` and hot pointer
  events. Use refs, deltas, cached loaders and immutable generated model
  components for hot paths.
- If the canvas is decorative, keep essential information outside it and mark or
  describe the layer accordingly. If the canvas is informational or interactive,
  provide accessible names, fallback content, keyboard-operable DOM controls,
  screen-reader summaries or a non-3D alternative.
- Use Babylon.js accessibility-tree ideas as a reference pattern for DOM
  mirroring, not as proof that a canvas UI is accessible without verification.

Library selection policy:

- Use a model-viewer web component before custom Three.js when the need is only
  embedded product/object/AR viewing with camera controls, poster/loading
  behavior and responsive layout.
- Use React Three Fiber for React/Next.js, TresJS for Vue/Nuxt and Threlte for
  Svelte when the host framework should own component lifecycle and state.
- Use PixiJS when the requirement is high-performance 2D WebGL/WebGPU graphics,
  effects, interface animation or visualization rather than 3D.
- Consider PlayCanvas or Babylon.js only when their engine/editor/UI,
  web-component or accessibility model is a better fit than a thin Three.js
  scene.

If an MCP/devtools bridge is proposed for the scene, treat it as an optional
debug or scene-inspection connector. It must go through MCP connector selection,
scope narrowing and approval. Do not expose broad scene mutation tools by
default.

For 3D interfaces, record:

- 3D visual layer: none, Three.js, React Three Fiber, custom or unknown;
- 3D renderer: WebGLRenderer, WebGPURenderer, mixed or unknown;
- 3D purpose: inspect, simulate, explain, dashboard, avatar, creative-artifact
  or other;
- scene state contract and object naming/ID policy;
- asset source and licensing policy;
- texture/model loading policy;
- performance target: FPS, memory, asset size and mobile constraints;
- canvas layout and DPR policy;
- render loop policy: continuous, on-demand or mixed;
- DOM/WebGL synchronization plan for labels, text and controls;
- 3D MCP/debug connector: none, candidate, selected or blocked;
- accessibility/fallback plan for canvas and 3D content;
- screenshot/canvas verification plan;
- non-3D fallback.

## Failure Rules

Block or downgrade rich UI when:

- no user-facing workflow requires it;
- side-effect policy is unclear;
- the rendering trust boundary is undefined;
- the component/widget source is unreviewed;
- the UI needs secrets in the browser;
- there is no fallback for unsupported clients;
- mobile/accessibility needs are important but untested;
- the selected protocol is volatile and current docs have not been verified.
- a backend agent framework is being treated as a UI framework without an
  explicit frontend adapter and user-facing reason.
- a 3D layer is selected without a concrete user task, performance budget,
  fallback and rendering verification plan.
- a full custom Three.js/R3F scene is selected when a simple model-viewer
  component would satisfy the workflow.
- a page creates many WebGL contexts for repeated cards/sections instead of a
  single-context multi-view pattern.
- meaningful UI text or controls exist only as canvas pixels without accessible
  DOM/fallback coverage.
- a raster visual asset is selected without workflow purpose, target component,
  format/size policy, alt/fallback, responsive check and privacy boundary.
- generated bitmap text, warnings, status or controls are the only accessible
  representation of important UI state.
- a static scene renders continuously without a power/performance reason.
- account/rate-limit telemetry is selected without an app-server-backed
  integration or with a plan to read undocumented local auth/workspace state.

## Verification

Selected UI modules must have at least one readiness check:

- chat/thread: instructions and commands are discoverable;
- operator console: status command works;
- web/workflow UI: local route opens and shows non-overlapping controls;
- event-stream UI: mock stream renders messages, tool progress and state deltas;
- MCP App/UI resource: widget/resource can render in sandbox or documented host;
- declarative UI: component schema validates against the allowed catalog;
- voice UI: apply `realtime-voice-control-ui` verification.
- raster visual asset layer: asset communicates the intended workflow state,
  final files live in the workspace, dimensions/variants are stable, alt or
  fallback is correct, mobile crop/readability passes, file size is acceptable
  and no real control/status exists only inside pixels.
- 3D visual layer: scene renders nonblank, fits desktop/mobile viewports,
  expected objects/assets load, interactions work and canvas/pixel or
  screenshot checks confirm the visual state.
- Codex account telemetry: mock or live app-server client handles
  `account/rateLimits/read`, `account/rateLimits/updated`, missing optional
  fields and unavailable telemetry without leaking tokens or account payloads.
