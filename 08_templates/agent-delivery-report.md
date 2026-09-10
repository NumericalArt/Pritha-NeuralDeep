---
id: template-agent-delivery-report
type: template
status: active
created: 2026-08-16
updated: 2026-08-16
template_for: agent-delivery-report
topics:
  - agent-engineering
  - outcome-delivery
  - verification
tools:
  - Pritha
  - Codex App Server
sources:
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
related:
  templates:
    - 08_templates/agent-outcome-spec.md
    - 08_templates/agent-project-contract.md
  workflows:
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - child-agents
subject:
  kind: pritha-subsystem
  id: agents-mother-delivery
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Delivery Report: agent-name

## Run

- Run id:
- Status: blocked | verified | awaiting_acceptance | accepted | failed | abandoned | cancelled
- Phase:
- Iterations used / budget:
- Delivery branch:
- Base revision:
- Verified checkpoint:
- Push, merge and deployment: not performed | separately authorized evidence

## Approved outcome binding

- Outcome Spec id:
- Semantic lock:
- Document lock:
- Contract fingerprint:
- Host approval evidence id:

## Verification evidence

- Trial result status:
- Trial result evidence lock:
- Workspace revision:
- Automated coverage:
- Operator-judged coverage:
- Protected Trial inputs unchanged: yes | no

## Typed blockers

For each blocker record exactly one actionable question, 2–5 stable answer
options and bounded evidence references. Do not use a vague failure paragraph as
a blocker.

## Lifecycle meaning

State explicitly whether the result is machine-verified, awaiting human
judgment, explicitly accepted, merge-ready or deployment-ready. These meanings
must not be collapsed.
