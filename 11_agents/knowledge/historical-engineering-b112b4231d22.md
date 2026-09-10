---
id: historical-engineering-b112b4231d22
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [agent-engineering, reusable-patterns]
tools: [Node.js, Codex]
sources: [reviewed-historical-engineering-evidence]
related: {}
memory_domain: agent-building-knowledge
privacy: public
---

# Historical engineering lessons

De-identified engineering notes retained from earlier agent work. These are
historical observations, not installed agents or current verification claims.

## Selected Patterns

### pattern-01: reference-agent Contract Raster And 3D Boundary

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: contract
- Confidence: high
- Path: `historical engineering evidence`
- Applicability: reference-agent explicitly selects a local raster stage background, a
  Three.js avatar scene, local generated assets and manual fallback controls.
- Guidance: keep the task inside the existing local web interface and generated
  asset layer. Do not add network dependencies, deployment, services, secrets
  or new command behavior.

### pattern-02: reference-agent Scaffold And Harness Boundaries

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: lifecycle-evidence
- Confidence: high
- Paths:
  - `historical engineering evidence`
  - `<USER_HOME>/reference-agent/AGENTS.md`
- Applicability: Confirms the implementation areas and verification commands:
  `src/animation-controller.js`, generated/public assets, `scripts/healthcheck.mjs`,
  `scripts/smoke-test.mjs`, `npm run syntax`, `npm run healthcheck` and
  `npm run smoke`.
- Guidance: implementation should be narrow: background assets, backdrop loading
  behavior and directly related checks only.

### pattern-03: reference-agent Child-Agent Profile

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: profile
- Confidence: high
- Path: `historical engineering evidence`
- Applicability: reference-agent is a manual local web service with no proactivity and no
  autostart.
- Guidance: do not touch Control Center routing, Tailscale, launchd, service
  install/uninstall, credentials or runtime queue behavior.

### pattern-04: Raster UI Asset Size And Responsive Policy

- Source kind: keyword/domain/semantic
- Memory domain: agent-building-knowledge
- Pattern kind: raster-asset-standard
- Confidence: high
- Path: `04_standards/raster-ui-assets-for-child-agents.md`
- Applicability: The task is specifically about generated raster UI assets:
  smaller output variants, mobile crop, file size and responsive behavior.
- Guidance: optimize for the intended viewport slots instead of retaining one
  oversized asset. Record dimensions/byte deltas and verify mobile crop, file
  size and layout behavior before readiness.

### pattern-05: WebGL Responsive Canvas Contract

- Source kind: keyword/semantic
- Memory domain: agent-building-knowledge
- Pattern kind: WebGL interface pattern
- Confidence: high
- Paths:
  - `01_sources/signals/2026-06-16-webgl-3d-interface-resource-batch-signal.md`
  - `03_reviews/2026-06-16-webgl-3d-interface-resource-batch-review.md`
- Applicability: reference-agent uses a full-window Three.js canvas, responsive camera
  framing and a background plane.
- Guidance: preserve the pattern where CSS owns the displayed canvas size,
  renderer size and camera projection are updated from the displayed viewport,
  and desktop/mobile screenshots or pixel checks confirm the scene is nonblank
  and framed.

### pattern-06: Agent Interface Experience Readiness

- Source kind: keyword/domain/semantic
- Memory domain: agent-building-knowledge
- Pattern kind: interface-standard
- Confidence: high
- Path: `04_standards/agent-interface-experience.md`
- Applicability: The reference-agent backdrop is both a raster visual asset and part of a
  Three.js visual layer.
- Guidance: keep text and controls in DOM, keep fallback behavior explicit, and
  verify raster file size, responsive behavior, mobile crop and desktop/mobile
  3D render state before calling the interface ready.

### pattern-07: Agent Development Research Gate

- Source kind: domain
- Memory domain: agent-building-knowledge
- Pattern kind: workflow/standard
- Confidence: high
- Paths:
  - `07_workflows/agents-mother.md`
  - `04_standards/agent-creation-harness.md`
- Applicability: Existing child-agent improvements need a development task
  brief, pattern pack, memory search and semantic-search attempt before
  implementation.
- Guidance: this pattern pack satisfies the local research gate. Implementation
  may proceed without external research because no volatile external dependency
  or source asset is being selected.

### pattern-08: Control Center Mobile And Visual QA

- Source kind: semantic/domain
- Memory domain: pritha-self
- Pattern kind: visual-QA-pattern
- Confidence: medium
- Path: `07_workflows/2026-06-12-control-center-voice-page-roadmap.md`
- Applicability: The operator explicitly asked to verify mobile and desktop UI
  behavior and avoid unrelated interface regressions.
- Guidance: future verification should include desktop and mobile viewport
  checks, canvas nonblank/framing checks, and confirmation that controls remain
  reachable and unaffected.

