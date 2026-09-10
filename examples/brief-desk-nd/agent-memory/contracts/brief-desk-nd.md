---
id: brief-desk-nd-contract
type: agent-contract
status: accepted
contract_schema_version: 2
agent_kind: service
created: 2026-09-10
updated: 2026-09-10
topics: [briefing, neuraldeep, telegram]
tools: [Node.js, NeuralDeep, Telegram]
sources: [bundled-brief-desk-source]
related: {}
assigned_version: 0.2.0
agent_id: brief-desk-nd
instance_key: '{{INSTANCE_KEY}}'
project_path: {{PROJECT_PATH}}
subject:
  kind: child-agent
  id: brief-desk-nd
privacy: local-private
---

# Agent Contract: Brief Desk ND

- Agent name: Brief Desk ND
- Primary mission: Research a user-entered topic, review and edit a short brief, then explicitly approve Telegram publication.
- Target folder: {{PROJECT_PATH}}
- Runtime family: api
- Primary interface: web
- Service mode: process
- Autostart: disabled
- Proactive mode: manual
- Runtime isolation: process-only; trusted single-user local host.

## Boundaries

No automatic posting, incoming bot commands, background schedules or public network listener.
NeuralDeep edits bounded, untrusted source text; only deterministic server code publishes.
Settings supports a parent credential reference or an own key and Telegram configuration.
A new installation starts empty. The synthetic demo requires no credentials.
Historical verification is not imported: run the bundled tests on this installation.
