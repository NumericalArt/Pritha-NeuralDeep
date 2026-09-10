---
id: 2026-06-16-pritha-current-state-snapshot
type: review
status: complete
created: 2026-06-16
updated: 2026-06-16
topics:
  - pritha
  - control-center
  - realtime-voice
  - codex-sidecar
  - child-agents
  - memory
  - lifecycle
  - operations
tools:
  - Pritha Control Center
  - OpenAI Realtime API
  - Codex App
  - Codex CLI
  - Next.js
  - SQLite
sources:
  - runtime-status:control-center-2026-06-16
  - git-status:pritha-lifecycle-voice-permissions
  - interfaces/control-center/src/lib/realtime/voice-settings.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts
  - interfaces/control-center/src/components/settings/VoiceSettingsSection.tsx
  - tests/control-center-voice-settings.test.mjs
  - 04_standards/pritha-self-model.md
  - docs/pritha.md
  - docs/realtime.md
related:
  standards:
    - 04_standards/pritha-self-model.md
    - 04_standards/agent-creation-harness.md
  workflows:
    - 07_workflows/agents-mother.md
  profiles:
    - 11_agents/profiles/stupidjoke.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - operations
subject:
  kind: system
  id: pritha
privacy: internal
retention: durable
review_status: reviewed
confidence: high
---

# Pritha Current State Snapshot

Date: 2026-06-16
Status: complete

## Current Identity

Pritha is the public checkout and repository identity for the project. Historical
`Techscope` names remain as compatibility names in scripts, environment
variables, memory artifacts and older reports until a separate migration removes
them. New user-facing documentation and operator language should prefer Pritha.

## Runtime State

- Active local checkout: Pritha.
- GitHub remote target: `NumericalArt/Pritha`.
- Control Center is served locally on port `3420`.
- Observed runtime status on 2026-06-16: Realtime model `gpt-realtime-2`,
  voice `shimmer`, behavior profile `expert`.
- Code defaults/fallbacks: voice `marin`, behavior profile `advanced`.
- Voice behavior profiles exposed in Settings: `beginner`, `advanced`, `expert`.
- Feminine Pritha voice options exposed in Settings: `marin`, `coral`, `shimmer`.
- Runtime settings persist under `.private/interface-lab/pritha-control-center/realtime/runtime-settings.json` and are surfaced through `/api/realtime/runtime-settings` and `/api/realtime/status`.
- OpenAI server key is configured locally and is not exposed to the browser.
- Current realtime tool surface:
  - `search_pritha_memory`;
  - `deep_pritha_memory`;
  - `inspect_pritha_files`;
  - `inspect_codex_task`;
  - `run_codex_task`.

## Memory State

Current portable memory snapshot is healthy and non-empty:

- documents: 531;
- chunks: 4728;
- entities: 1577;
- relations: 12444;
- embeddings: 4554.

Markdown remains the canonical authored source of truth. `.memory/techscope.sqlite`,
FTS, relations, embeddings, rebuild SQL and self-test baselines are committed as
a portability/cache layer and must remain rebuildable from Markdown.

## Control Center Capabilities

- Voice Control supports realtime conversation, pasted text commands, sticky
  context, reset confirmation, microphone input level control and the Pritha
  animated star scene.
- Settings exposes Voice Runtime controls for behavior depth, Pritha voice,
  Codex deep-task transport, sandbox policy, network access and task timeout.
- Settings must not render editable Voice Runtime defaults before persisted
  runtime settings load; it shows a loading row first, then the saved values.
- Voice Control shows Codex task state, result excerpts, task phase, stale
  warnings, operator brief and progress timeline.
- Codex tasks can be approved or rejected from the UI when a risky action is
  held behind a decision gate.
- Agents page includes manual start/stop planning and execution surfaces with
  exact-phrase confirmation.
- Child-agent credentials are entered through controlled UI surfaces rather than
  voice/model context.

## Codex Task Routing

- `run_codex_task` remains one public realtime tool.
- Internal routing defaults to Codex App and can fall back to Codex CLI.
- `Codex App ready/unavailable` and `Codex CLI ready/unavailable` in Settings
  report whether the Control Center server process can access those transports
  from its current environment. They are not phone/browser capability checks.
- Session-contract transport is reserved as a future extension point.
- Codex App JSON parsing is hardened for mixed assistant output.
- Stale `running` task statuses are repaired during readback so UI does not show
  dead tasks as active forever.
- `inspect_codex_task` gives realtime a fast readback path for task status,
  progress, result excerpts and failure briefs without exposing raw private logs.

## Voice Behavior Runtime

Pritha Voice Control now has operator-selectable spoken behavior depth:

- `beginner`: translate technical implementation details into plain human
  language and avoid programmer terms unless the user asks for them.
- `advanced`: balance practical technical context with plain operational
  language.
- `expert`: allow senior-engineer terminology and implementation detail.

The profile is a default behavior, not a hard restriction. In any live session,
the operator may ask Pritha to speak simpler or go deeper.

Realtime instructions also tell Pritha to present herself in feminine
grammatical gender, use the configured feminine voice, and avoid reading long
file paths, commands or code aloud unless the user explicitly needs the exact
text. Long technical artifacts should be summarized verbally and left visible
in UI/Codex task output.

## Child-Agent Lifecycle

Pritha must not scaffold production child agents directly from a vague idea.
The normal lifecycle is:

1. collect a full specification;
2. create an `agent-contract`;
3. perform Pritha memory research against relevant standards, workflows,
   decisions, reports and profiles;
4. verify volatile external choices against current primary documentation when
   needed;
5. accept the contract;
6. scaffold a sibling child-agent folder;
7. run health/smoke/tests;
8. create reports and rebuild Pritha memory.

Experimental scaffold from `draft` requires explicit override and must not be
presented as production readiness.

## Approval-Gated Actions

Voice Control and Codex thread should expose equivalent development capability.
Voice is not inherently read-only. Instead, risky actions are paused as
`decision_required` until the operator approves in UI:

- service install/uninstall;
- scheduler, cron, launchd, heartbeat or queue-watcher enablement;
- deployment, publish, release or GitHub push;
- deletion or destructive migration;
- credential or secret writes;
- danger-full-access sandbox.

Rejecting such a task records a terminal rejected state.

## Child-Agent Snapshot

StupidJoke is the current active child-agent example for a local safe joke agent.
Its profile records a local web console, in-process scheduler, JSONL runtime
memory, allowlisted source adapter and optional browser Realtime voice bridge.

## Known Compatibility Notes

- Some durable filenames and memory tables still use `techscope` for historical
  compatibility.
- `TECHSCOPE_ROOT` remains a supported environment variable and should resolve
  only when the path exists.
- Any future full rename of internal schemas, environment variables or legacy
  report language needs a separate migration decision.
