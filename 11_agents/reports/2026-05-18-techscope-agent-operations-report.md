---
id: 2026-05-18-techscope-agent-operations-report
type: agent-operations-report
status: partial
created: 2026-05-18
updated: 2026-05-18
topics:
  - agent-engineering
  - operations
  - service-readiness
  - techscope
tools:
  - Codex
  - AGENTS.md
  - operations
  - launchd
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - operations/manifest.json
  - scripts
portability: codex-native
sources:
  - <TECHSCOPE_ROOT>
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: operations inspection 2026-05-18
retrieved: 2026-05-18
verified: 2026-05-18
valid_for: current local project state
temporal_status: current
---

# Agent Operations Report: Techscope

Date: 2026-05-18
Status: partial

## Summary

- Project path: <TECHSCOPE_ROOT>
- Classification: agent-project
- Deployment target: Mac mini
- Deployment profile: mac-mini-service
- Service mode: launchd
- Autostart: launchd-on-approval
- Proactive mode: queue-watcher
- Autostart policy: Techscope Web and Telegram bot are allowed to run as launchd services from <TECHSCOPE_ROOT>. New agents must not inherit this automatically.
- Result: partial

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| Operations manifest | pass | operations/manifest.json found. |
| Deployment target | pass | Mac mini |
| Deployment profile | pass | mac-mini-service |
| Service mode | pass | launchd |
| Autostart mode | pass | launchd-on-approval; Techscope Web and Telegram bot are allowed to run as launchd services from <TECHSCOPE_ROOT>. New agents must not inherit this automatically. |
| Start command | pass | launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.techscope.web.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.techscope.telegram-bot.plist |
| Stop command | pass | launchctl bootout gui/$(id -u)/com.techscope.web; launchctl bootout gui/$(id -u)/com.techscope.telegram-bot |
| Healthcheck command | pass | curl -fsS http://127.0.0.1:3000/ >/dev/null && node scripts/telegram-bot.mjs poll-once --dry-run >/dev/null |
| Log path | pass | .logs/ |
| Proactive mode | pass | queue-watcher |
| launchd template | pass | launchd/com.techscope.web.plist |
| Operations status | missing | No scripts/operations-status.mjs command found. |
| Deployment plan | missing | No scripts/deploy-service.mjs command found. |
| Smoke healthcheck | warning | No smoke test found; document a service-safe healthcheck before deployment. |

## Service Commands

- Start: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.techscope.web.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.techscope.telegram-bot.plist`
- Stop: `launchctl bootout gui/$(id -u)/com.techscope.web; launchctl bootout gui/$(id -u)/com.techscope.telegram-bot`
- Healthcheck: `curl -fsS http://127.0.0.1:3000/ >/dev/null && node scripts/telegram-bot.mjs poll-once --dry-run >/dev/null`
- Logs: `.logs/`

## Proactivity

- Mode: `queue-watcher`
- Trigger sources: Telegram getUpdates polling, manual Codex thread work, local scripts
- Schedule: none
- Heartbeat interval: Telegram long polling timeout 30s
- Idle behavior: Stay resident as launchd service; process queued intake only when messages arrive.

## Autostart Decision

- Current mode: `launchd-on-approval`
- Autostart is configurable, but scaffold and operations inspection do not install it.
- If launchd is selected, review the plist template and get explicit user approval before copying it to `~/Library/LaunchAgents/` or calling `launchctl`.

## Next Steps

- Fix any failed or missing checks before treating this agent as a service.
- Run `node scripts/agents-mother.mjs test "<TECHSCOPE_ROOT>"` after operations changes.
- Create or update the agent contract if service mode or autostart policy changes.
