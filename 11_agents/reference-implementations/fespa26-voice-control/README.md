---
id: fespa26-voice-control-reference-readme
type: agent-operations-report
status: active
created: 2026-05-30
updated: 2026-05-30
topics: [voice-control, realtime, codex-sidecar, pritha, reference-implementation]
tools: [OpenAI Realtime API, Codex App, Codex CLI, Next.js, WebRTC]
sources:
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/openai/realtime-tools.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/realtime/instructions.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/hooks/use-realtime-call.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/app/api/realtime/tool/route.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/service.ts
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
  workflows:
    - 07_workflows/realtime-voice-control-kit.md
  reports:
    - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
supersedes: []
superseded_by: []
---

# FESPA26 Voice Control Reference

This directory preserves the reusable implementation pattern from FESPA26:
browser Realtime voice, server-issued ephemeral credentials, narrow server
tools, Codex App/CLI deep-task transport and durable state behind review gates.

It is a reference implementation, not a drop-in universal module. A descendant
agent must replace FESPA-specific tool names, repositories, feed/card concepts,
environment variable prefixes and publication rules.

## Quick Commands

```sh
node scripts/voice-control-kit.mjs plan
node scripts/voice-control-kit.mjs list
node scripts/voice-control-kit.mjs copy --target ../child-agent
```

The copy command places this pack under:

```text
<child-agent>/interfaces/realtime-voice/fespa26-reference/
```

## Pattern

1. Browser owns microphone capture, remote audio playback, WebRTC and data
   channel event handling.
2. Server route creates ephemeral Realtime client secrets; the OpenAI API key
   never reaches the browser.
3. Realtime instructions act as a dispatcher contract, not a broad prompt.
4. Realtime tools are narrow intent routers.
5. Server tools validate arguments, perform deterministic state changes or
   queue deep work.
6. Codex transport handles high-context work through Codex App, Codex CLI,
   session-contract handoff or HTTP thread adapter.
7. Public/destructive actions require explicit confirmation and remain
   server-gated.

## Source Snapshot

The `source/` tree contains the inspected FESPA26 files needed to rebuild the
pattern:

- Realtime session creation and call routes.
- Browser call hook and function-call output bridge.
- Realtime instructions and tool schemas.
- Tool route with deterministic handlers and Codex delegation.
- Codex task service, result validation, adapters and voice thread registry.
- Unit tests for prompt/config/chunking/task-service behavior.

## Adaptation Checklist

- Define the descendant's voice mission and language behavior.
- Define domain tools in `realtime-tools.ts`.
- Replace FESPA repositories with descendant repositories/services.
- Replace `FESPA_*` env names with project-specific names.
- Decide deep-task transport: `codex-app-server`, `codex-auto`,
  `codex-session` or `codex-app-http`.
- Add readiness checks for Realtime credentials, memory, Codex transport and
  selected tools.
- Keep voice enabled only after explicit cost/privacy approval.
