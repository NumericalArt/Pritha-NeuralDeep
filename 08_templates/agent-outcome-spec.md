---
id: template-agent-outcome-spec
type: template
status: draft
created: 2026-08-16
updated: 2026-08-16
template_for: agent-outcome-spec
topics:
  - agent-engineering
  - outcome-spec
tools:
  - Pritha
  - Codex
sources:
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  workflows:
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
supersedes: []
superseded_by: []
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: agent-name
privacy: public
retention: durable
review_status: draft
confidence: medium
contract_path: 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
contract_fingerprint: sha256:pending
agent_slug: agent-name
interaction_mode: interface
automated_trial_waiver: none
outcome_spec_status: draft
outcome_semantic_lock: pending
outcome_document_lock: pending
approved_by: pending
approved_at: pending
---

# Agent Outcome Spec: agent-name

## Shape

- One-liner: What the finished agent does for its user.
- Done when: What must be observably true before the result is shown as ready.
- Interaction mode: interface

## User-facing outcome

- Entry point: Codex project
- User journey goal: The user states the desired result.
- User journey start: The agent confirms the task and begins.
- User journey progress: The user can see meaningful progress and blockers.
- User journey approval: Consequential actions wait for explicit approval.
- User journey completion: The agent returns the requested result and evidence.
- User journey recovery: The agent explains the failure and offers bounded next actions.

### Surfaces

| Surface | Purpose | Primary action |
| --- | --- | --- |
| Codex project | Main user interaction | Request and review work |

### Example sessions

#### Session: main-flow

```transcript
user: Complete the main task.
agent: I will complete it, verify the result, and show any decision that genuinely needs you.
```

## Headless outcome

- Trigger: not-applicable
- Input contract: not-applicable
- Output artifacts: not-applicable
- Observability: not-applicable
- Failure visibility: not-applicable

## Deliverables

- Working implementation of the approved V1 core functions.
- Runnable project with a user guide and verification evidence.

## Non-goals v1

- Features explicitly deferred by the agent contract.

## Trials

### Trial: harness-smoke

- Statement: The generated project passes its deterministic smoke test.
- Kind: automated
- Covers: deliverable:02-runnable-project-with-a-user-guide-and-verification-evidence
- Isolation: none
- When argv: ["node", "scripts/smoke-test.mjs"]
- When cwd: .
- Then exit code: 0
- Timeout ms: 120000

### Trial: main-outcome

- Statement: The user can complete the main V1 workflow and receive the promised result.
- Kind: operator-judged
- Covers: core:01-main-outcome
- Covers: deliverable:01-working-implementation-of-the-approved-v1-core-functions
- Pass criteria: The demonstrated workflow matches the approved example and requires no undocumented manual implementation step.

## Demo script

1. Open the primary interface.
2. Run the main example session.
3. Inspect the result and its verification evidence.
4. Exercise one failure or recovery path.
