---
id: 2026-06-23-fas-tailscale-voice-memory-note
type: review
status: active
created: 2026-06-23
updated: 2026-06-23
topics:
  - pritha-control-center
  - child-agent-launch
  - fas
  - tailscale
  - memory
  - realtime-voice-control
tools:
  - Codex
  - Pritha Control Center
  - Tailscale
  - Node.js
  - inspect_codex_task
  - run_codex_task
agent_platforms:
  - Pritha Control Center
  - Codex App
  - Codex CLI fallback
model_context:
  - realtime voice operator task
runtime_environment:
  - local macOS workspace
  - Pritha repository
  - sibling child-agent runtime
config_surfaces:
  - interfaces/control-center
  - scripts/tailscale-setup.mjs
  - 11_agents/profiles/fas.md
  - 11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md
portability: environment-specific
sources:
  - task:2026-06-23T02-36-27-592Z-0b2c7da6
  - task-report:PRITHA_CODEX_APP_TASK_REPORT:2026-06-23T02:40:00.241Z
  - voice-control:deep_pritha_memory
  - 03_reviews/2026-06-23-voice-1782180572998-5c5b5edd7a52e-voice-session-memory.md
  - 11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md
  - 11_agents/reports/2026-06-22-fas-control-center-integration-report.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  profiles:
    - 11_agents/profiles/fas.md
  reports:
    - 11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md
    - 11_agents/reports/2026-06-22-fas-control-center-integration-report.md
  reviews:
    - 03_reviews/2026-06-23-tailscale-fas.md
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
supersedes:
  - 03_reviews/2026-06-23-tailscale-fas.md
superseded_by: []
freshness_status: current
source_published: 2026-06-23
source_updated: 2026-06-23
source_version: Pritha Control Center voice task 2026-06-23T02-36-27-592Z-0b2c7da6
retrieved: 2026-06-23
verified: pending
valid_for: Pritha Control Center child-agent launch handling as of 2026-06-23
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: FAS
privacy: internal
retention: durable
review_status: draft
confidence: medium
---

# Review: FAS Launch Via Tailscale Link

Date: 2026-06-23
Status: active review draft

## Question

Which Pritha Control Center behavior must be corrected so a Tailscale link can
create or open the FAS child-agent context without regressing neighboring child
agents?

## Symptom

The Tailscale link path does not create or open the new FAS agent context.
Neighboring child agents still launch, so the failure appears scoped to the FAS
link creation/opening path or to the way the FAS runtime metadata is resolved
from the Tailscale-facing Control Center entrypoint.

## Observations

- The previous Codex task completed without applying real file changes, leaving
  no confirmed behavioral fix.
- The current follow-up task stalled at `Inspect context` after a planning
  timeout and fallback plan, so the launcher defect still lacks a verified code
  correction.
- Existing Pritha FAS artifacts say FAS is a Control Center managed manual web
  service, with local runtime source-of-truth metadata in the sibling FAS
  `operations/manifest.json`.
- The failure report is operational evidence from the Pritha voice operator, not
  a direct browser/network reproduction. The next implementation task must
  inspect the actual link handling path before changing behavior.

## Correction Requirements

- Identify the exact place where the Tailscale-facing link is parsed, routed and
  mapped to a child-agent action or URL.
- Verify whether the broken path is in Control Center routing, child-agent
  registry/profile metadata, FAS runtime metadata, Tailscale URL generation or
  the Codex App task launcher.
- Fix the smallest responsible logic so the FAS link creates or opens the FAS
  agent context through the same supported boundary as neighboring agents.
- Add a behavioral check that exercises the FAS link path and at least one
  neighboring child-agent path.
- Confirm the implementation actually changes files or runtime state; do not
  report success from an inspection-only or timed-out Codex task.
- Keep Tailscale private-access rules intact: no public Funnel exposure, no
  committed tailnet hostnames, no auth keys, and no service/autostart change
  without a separate approval gate.

## Acceptance Criteria

- Opening the approved Tailscale link from a trusted peer reaches Pritha Control
  Center and creates or opens the FAS child-agent context.
- The FAS card/action resolves to the currently declared FAS managed URL and
  health URL without requiring hard-coded user-specific secrets.
- Neighboring child-agent launch paths continue to work.
- A targeted automated or scripted check covers the FAS link/action behavior and
  one neighboring agent regression case.
- The implementation report lists concrete changed files and verification
  commands.

## Options

- Fix the Control Center link resolver if it drops or misroutes the FAS agent
  identifier when accessed through a Tailscale origin.
- Fix the FAS profile or runtime metadata if Control Center receives the correct
  agent identifier but resolves stale or missing FAS launch data.
- Fix the Codex task launcher only if the URL opens Control Center correctly but
  the subsequent create/open action is delegated to Codex and lost there.

## Comparison

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Control Center link resolver | Addresses origin/routing mismatch at the shared boundary and can protect all child agents. | Higher regression risk for existing launch links. | Best first suspect if the failure appears only through the Tailscale URL. |
| FAS profile/runtime metadata | Narrowest FAS-specific fix; aligns with existing source-of-truth reports. | Does not explain why the Tailscale link itself fails unless metadata is only missing for FAS. | Good if local Control Center routing is correct but FAS data is stale. |
| Codex task launcher | Handles the observed failed/stalled Codex follow-up path. | May be downstream of the actual launch-link problem. | Use only after URL routing and FAS metadata are ruled out. |

## Agent Environment Profile

- Agent platforms: Pritha Control Center, Codex App control thread, Codex CLI
  fallback, sibling FAS child-agent runtime.
- Model context: realtime voice task from the Pritha operator.
- Runtime environment: local macOS Pritha workspace with sibling child agents
  under `<USER_HOME>`.
- Config surfaces: Control Center agent registry/actions, FAS profile, FAS
  operations manifest, Tailscale private-access setup scripts and docs.
- Portability: environment-specific because Tailscale peer access and local
  child-agent URLs are operator-machine state.
- Codex adaptation: implementation tasks must return structured changed-file
  and verification evidence, not only a narrative result.
- Environment-specific caveats: do not record real Tailscale URLs, tailnet names,
  device names, auth keys, `.env` values, runtime queues or raw logs in tracked
  memory.

## Existing Knowledge And Temporal Context

- Related existing artifacts:
  - `11_agents/contracts/2026-06-22-fas-agent-contract.md`
  - `11_agents/reports/2026-06-22-fas-control-center-integration-report.md`
  - `11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md`
  - `04_standards/tailscale-private-device-access-for-local-agents.md`
  - `04_standards/realtime-voice-control-for-codex-agents.md`
- Relationship to existing knowledge: refines the FAS Control Center integration
  reports by recording a post-integration launch defect that still needs a code
  fix.
- Source published: 2026-06-23 task report and operator payload.
- Source updated: 2026-06-23.
- Source version: Pritha Control Center realtime voice task
  `2026-06-23T02-36-27-592Z-0b2c7da6`.
- Retrieved: 2026-06-23.
- Verified: pending; this note records the defect and correction specification,
  not a runtime reproduction.
- Valid for: Pritha Control Center child-agent launch and Tailscale private
  access behavior as of 2026-06-23.
- Freshness status: current.
- Temporal status: current.
- Artifacts to mark outdated or superseded:
  `03_reviews/2026-06-23-tailscale-fas.md` is a duplicate evidence note and is
  superseded by this canonical review.

## Expert Notes

### Architecture

Keep the launch contract origin-independent. Tailscale should expose the same
Control Center action semantics as localhost; it should not require a separate
FAS-specific launch path.

### Security

Tailscale private access must remain private tailnet access. Do not enable
Funnel, store auth keys, persist real tailnet/device names or copy secrets into
tracked memory.

### Developer Experience

The implementation should include a small regression check with a clear fixture
or mocked request so future changes can distinguish FAS metadata failures from
general child-agent launch failures.

### Product Pragmatist

Prioritize the operator path: trusted peer opens Tailscale link, Control Center
opens FAS, neighboring agents still launch. Avoid broader Control Center
redesign unless the resolver is structurally wrong.

### Research Scout

No current internet research is required for this step because the defect is in
local Pritha/FAS behavior. Re-check official Tailscale docs only if the fix
changes Serve/Funnel setup, auth, or CLI behavior.

## Recommendation

Treat this as an active FAS launch defect and start the implementation from
Control Center link handling and FAS registry/profile resolution. The canonical
fix must include a targeted behavior check and an implementation report with
actual changed files and verification evidence.
