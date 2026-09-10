---
id: test-snapshot-agent-contract
type: agent-contract
status: accepted
created: 2026-05-28
updated: 2026-05-28
topics: [agent-engineering, tests]
tools: [Codex, Agents Mother]
sources: [tests]
related: {}
supersedes: []
superseded_by: []
---

# Agent Project Contract: Snapshot Agent

Date: 2026-05-28
Status: accepted

## Purpose

- Agent name: Snapshot Agent
- Primary mission: provide a stable minimal fixture for Agents Mother scaffold tests.
- Target user: Techscope test runner.
- Success criteria: scaffold produces the expected harness files and passes its smoke test.
- Out of scope: production deployment, external integrations, background services.

## Functional scope

### V1 core functions

- Expose a local CLI status command.
- Keep Markdown-first notes.
- Run a smoke test.

### Deferred functions

- Telegram adapter.
- Web UI.

### Critical user workflows

- Run the scaffolded status command.
- Run the scaffolded smoke test.

## Runtime and interface

- Runtime family: codex-native
- Primary interface: Codex project
- Secondary interfaces: CLI
- Telegram mode: none
- Expected hosting: local Mac

## Runtime placement

- Runtime placement profile: deterministic-first
- Multi-model routing requested: no
- Local inference required: no

## Operations and service

- Deployment target: local Mac
- Deployment profile: local-development
- Service mode: none
- Autostart: disabled
- Start command: node scripts/agent-cli.mjs status
- Stop command: not-applicable
- Healthcheck command: node scripts/smoke-test.mjs
- Log path: logs/
- Restart policy: manual

## Proactivity

- Proactive mode: none
- Trigger sources: manual user request
- Schedule: not-applicable
- Heartbeat interval: not-applicable
- Idle behavior: sleep until trigger
- User interruption policy: not-applicable

## Harness inventory

- Information boundaries: keep task state, source notes and outputs separated.
- Runtime placement: deterministic scripts first.
- Tool system: local CLI scripts only.
- Execution orchestration: simple status and smoke commands.
- Memory and state: Markdown-first minimal memory.
- Evaluation and observability: smoke test and status commands.
- Constraints, validation and recovery: no secrets, no autostart.
- Human approval gates: required before any deployment.
- Completion criteria: smoke test passes.

## Repository research and adoption

- Repository research policy: not-applicable
- Repository research topics: none
- Repository research waiver reason: deterministic local fixture has no external repository dependency.
- Selected GitHub repositories: none
- Repository adoption mode: none
- Selected repository module: not-applicable
- Repository pin: not-applicable
- Repository license decision: not-applicable
- Repository security review: not-applicable
- Repository permissions: not-applicable
- Repository eval status: not-applicable
- Repository user approval: not-applicable

## Data, memory and sources

- Input data types: Markdown notes.
- Stored data: curated Markdown.
- Sensitive data: none.
- Memory model: Markdown-first.
- Indexing/search needs: none for v1.
- External verification needs: none for fixture.
- Source freshness requirements: not-applicable.

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Status | CLI/script | local only |

## Security and permissions

- Secrets required: none.
- `.env.example` variables: none.
- Allowed network access: none.
- Allowed filesystem access: project folder only.
- User authorization model: local operator.
- Runtime isolation profile: project-folder.
- Network policy tier: deny-by-default.
- Credential storage boundary: host-only.
- Risk notes: fixture only.

## Scaffold requirements

- Target folder: ../SnapshotAgent
- Files to generate: standard codex-native scaffold.
- Dependencies: none.
- Setup commands: none.
- Run commands: node scripts/agent-cli.mjs status
- Tests/healthchecks: node scripts/smoke-test.mjs
- User training guide: docs/user-training-guide.md

## Research basis

- Related TechScope artifacts: 07_workflows/agents-mother.md
- Current primary sources checked: tests only.
- Trusted secondary sources checked: none.
- Alternatives considered: hand-written fixture.
- Decision rationale: deterministic scaffold regression coverage.

## Acceptance checklist

- [x] Contract reviewed with user.
- [x] Runtime family selected.
- [x] Runtime isolation profile selected or explicitly marked unnecessary.
- [x] Runtime placement selected per task class.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
