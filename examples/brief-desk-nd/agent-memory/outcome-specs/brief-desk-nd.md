---
id: brief-desk-nd-outcome
type: agent-outcome-spec
status: draft
contract_path: {{CONTRACT_PATH}}
contract_fingerprint: bundled-source-review-required
agent_slug: brief-desk-nd
interaction_mode: interactive
outcome_semantic_lock: pending-local-review
outcome_document_lock: pending-local-review
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

# Brief Desk ND — expected result

Open the local UI, inspect the offline demo, connect NeuralDeep and create a new
brief. Edit its title and points. Connect a Telegram bot and destination, verify
access, and approve one publication. No message is sent before confirmation.

## Acceptance examples

- No keys: UI and demo work; real generation explains missing credentials.
- NeuralDeep only: generation and editing work; publication asks for Telegram.
- Telegram configured: one approved draft produces one acknowledged message.
- Unknown delivery result: no automatic replay; inspect the destination first.

The packaged Outcome is descriptive and awaits local acceptance; no delivery
run or successful Trial is fabricated by installation.
