---
id: 2026-07-02-pritha-good-state-baseline-voice-ducking-control-centers
type: agent-operations-report
status: accepted
created: 2026-07-02
updated: 2026-07-02
topics:
  - pritha
  - good-state-baseline
  - voice-control
  - music-ducking
  - control-center
  - tailscale
  - agents
  - a2a
  - child-agents
tools:
  - Pritha
  - Control Center
  - Realtime Voice
  - Web Audio
  - Next.js
  - Tailscale
  - A2A Protocol
  - Git
  - GitHub
  - screen
sources:
  - source-pritha-good-state-confirmation-2026-07-02
  - 07_workflows/pritha-good-state-baseline.md
related:
  workflows:
    - 07_workflows/pritha-good-state-baseline.md
    - 07_workflows/agent-a2a-communication-selection.md
  standards:
    - 04_standards/pritha-self-model.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-a2a-interoperability.md
  decisions:
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
  reports:
    - 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-02
source_updated: 2026-07-02
source_version: pritha-good-state-2026-07-02-voice-ducking-control-centers
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Accepted Pritha local clone state after A2A memory update, agent routing fixes, smooth music ducking and three Control Center rebuilds
temporal_status: version-bound
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
  - agent-building-knowledge
subject:
  kind: good-state-baseline
  id: pritha-voice-ducking-control-centers
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Good State Baseline: Voice Ducking And Control Centers

Date: 2026-07-02
Status: accepted

## Accepted Scope

This baseline captures the accepted state of the three local Pritha Control
Centers after recent work on:

- A2A child-agent communication knowledge;
- Agents page runtime/Tailscale visibility and start/stop behavior;
- smooth voice music ducking;
- rebuilding and restarting the three Control Centers.

The accepted live Control Center local ports are:

| Instance | Local port | Runtime note |
| --- | --- | --- |
| Pritha JKL | `3420` | Rebuilt production `next start`, detached `screen` session. |
| Pritha Dasha | `4420` | Rebuilt production `next start`, detached `screen` session. |
| Pritha Sasha | `5420` | Rebuilt production `next start`, detached `screen` session. |

Trusted private-access URLs are intentionally not recorded in this tracked
report. Use local setup state and `scripts/tailscale-setup.mjs status --json`
from the relevant checkout when operational access must be inspected.

## Operator Acceptance Signal

The operator confirmed that the current behavior works and that this is a state
worth preserving as a reference: "Сейчас всё работает" and the good-state
baseline protocol should be used whenever the operator says the result is the
desired Pritha or the desired change.

## Git Anchor

- Branch: `fix/agent-start-pipeline-control-center`.
- Baseline tag: `pritha-good-state-2026-07-02-voice-ducking-control-centers`.
- Code anchor before this baseline report: `51c642e Smooth voice music ducking envelope`.
- Related recent commits:
  - `639f678 Add A2A child-agent communication standard`;
  - `51d8f03 Fix A2A source privacy routing`;
  - `51c642e Smooth voice music ducking envelope`.
- The baseline tag should point to the commit containing this report and
  `07_workflows/pritha-good-state-baseline.md`.

## Recent Work Cycle

### A2A knowledge update

Pritha gained a curated A2A interoperability layer for child agents:

- A2A is optional and contract-selected, not enabled by default for every child
  agent.
- Child-agent contracts now have an explicit A2A decision surface: role,
  discovery mode, Agent Card visibility, auth, per-skill authorization, trust
  registry, task/memory policies and readiness checks.
- A2A and MCP remain separate: MCP is the tool/resource boundary; A2A is the
  peer-agent boundary.
- Remote Agent Cards, messages, artifacts and task states are treated as
  untrusted input.
- The source-note/signal privacy routing was corrected so tracked `01_sources`
  artifacts use neutral source IDs instead of raw URLs.

### Agents and Tailscale behavior

Recent Control Center work restored confidence that agents can be managed and
inspected without losing local/private routing clarity:

- Control Center distinguishes local URLs and private-access URLs.
- Agent start/stop plans are explicit and readiness-driven.
- Tailscale/private access is treated as local operational state, not as public
  Markdown content.

### Voice music ducking

Music ducking now feels accepted because the speech detection path remains
connected while the volume envelope is no longer perceived as hard off/on:

- user speech still comes from Realtime `input_audio_buffer.speech_started` and
  `input_audio_buffer.speech_stopped`;
- assistant speech is still measured from the remote audio stream RMS;
- ducking depth changed from near-mute to a softer background level:
  `MUSIC_DUCK_DB = -32`;
- duck attack changed from `0.04s` to `0.35s`;
- release delay changed from `1800ms` to `650ms`;
- release time changed from `2.5s` to `1.8s`.

## Accepted Behavior

- Voice Control remains usable after the change and the music no longer feels
  like it simply switches off and on during speech.
- Background music stays present but lower while the operator or Pritha speaks.
- Manual music volume remains separate from automatic ducking.
- The three Control Centers run as production `next start` instances on their
  expected local ports.
- `/voice`, `/agents` and `/settings` load and reference valid JavaScript
  chunks on all three instances.
- The A2A knowledge layer is searchable and linked to standards, workflow,
  decision, review, source note, signal and reusable skill.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| Root focused music test | pass | `node --test tests/control-center-music.test.mjs`, 14/14. |
| Root Control Center typecheck | pass | `npm --prefix interfaces/control-center run typecheck`. |
| Root full explicit test set | pass | `node --test --test-concurrency=1 $(rg --files tests \| rg '\.test\.mjs$')`, 226/226. |
| Root `npm test` | pass | Golden checks and configured unit tests pass. |
| Root Control Center build | pass | Production build passed with known Turbopack NFT warning. |
| Dasha focused music test | pass | 14/14. |
| Dasha Control Center typecheck | pass | `tsc --noEmit`. |
| Dasha Control Center build | pass | Production build passed with known Turbopack NFT warning. |
| Sasha focused music test | pass | 14/14. |
| Sasha Control Center typecheck | pass | `tsc --noEmit`. |
| Sasha Control Center build | pass | Production build passed with known Turbopack NFT warning. |
| Pritha JKL live health | pass | `node scripts/control-center-health.mjs --port 3420`. |
| Pritha Dasha live health | pass | `node scripts/control-center-health.mjs --port 4420`. |
| Pritha Sasha live health | pass | `node scripts/control-center-health.mjs --port 5420`. |
| A2A memory search | pass | `node scripts/query-memory.mjs by-topic a2a` returned the A2A skill, decision, review, signal, source note, standard and workflow in all three clones. |
| A2A source privacy | pass | Strict privacy audit passed after replacing raw `01_sources` URLs with neutral source IDs. |

## Known Acceptable Warnings

- Next/Turbopack production builds report an NFT trace warning involving
  `next.config.mjs`, `src/lib/control-center/server.ts` and
  `api/agents/actions/manual-audit`. This warning is not new and does not block
  the accepted state.
- Python embeddings may emit a non-fatal urllib3/LibreSSL warning on this
  machine. It did not prevent embeddings from being written during the A2A
  memory update.

## Private And Runtime Exclusions

The following are explicitly outside this baseline and should not be committed
as part of a good-state capture:

- `.env` or `.env.local` contents;
- API keys, auth keys, private credentials or user memory;
- raw Tailscale URLs, tailnet names or device identifiers;
- `.private/`, `.memory-private/`, `.queue/`, `.logs/`, `.snapshots/`;
- generated SQLite/embedding state;
- local `screen` socket paths and PIDs;
- local voice-session scratch artifacts unless separately curated.

Local runtime state at the time of capture included expected dirty/private
files in the JKL and Dasha checkouts; they are intentionally not part of this
tracked baseline.

## Regression Signals

Treat future changes as suspicious if any of these return:

- voice music ducking again sounds like hard mute/unmute;
- `/voice`, `/agents` or `/settings` shows a blank page or missing JavaScript
  chunks;
- Control Center build or typecheck fails;
- the three known local ports no longer map to the expected clones without an
  explicit migration note;
- Agents cards lose local/private URL clarity;
- start/stop actions do not expose a clear plan, readiness or final state;
- tracked `01_sources` artifacts contain raw source/provenance URLs again;
- A2A is silently added to child agents without an explicit contract decision;
- private URLs, credentials or runtime logs appear in tracked Markdown.

## Recovery Notes

To recover or compare against this accepted state:

1. Search Pritha memory for `good-state-baseline voice ducking control centers`.
2. Inspect this report and the tag
   `pritha-good-state-2026-07-02-voice-ducking-control-centers`.
3. Compare current code against the tagged version, especially:
   - `interfaces/control-center/src/components/voice/useVoiceMusic.ts`;
   - `interfaces/control-center/src/lib/music/volume.ts`;
   - `tests/control-center-music.test.mjs`;
   - A2A artifacts in `04_standards/`, `05_decisions/`, `07_workflows/` and
     `11_agents/skills/`.
4. Rerun the focused checks in this report before reverting broad code.
5. If only one behavior regressed, prefer a narrow fix over full checkout
   rollback.
