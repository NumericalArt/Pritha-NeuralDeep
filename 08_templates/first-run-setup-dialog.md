---
id: template-first-run-setup-dialog
type: template
status: draft
created: 2026-05-28
updated: 2026-05-28
template_for: first-run-setup
topics:
  - setup
  - onboarding
  - agents
tools:
  - Codex
  - Node.js
sources:
  - 07_workflows/first-run-setup.md
related:
  workflows:
    - 07_workflows/first-run-setup.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-12-first-run-setup
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: descendant agent setup dialogs
temporal_status: current
---

# First-Run Setup Dialog Template

Use this as a starting point when Pritha creates a descendant agent that needs a
safe bootstrap flow.

## Opening

I will configure the project in the safest useful mode first. I will not enable
background services, external publication, launchd, scheduled jobs or paid
connectors without explicit approval.

## Minimal Questions

- Which interface should be enabled now?
- Does this agent need secrets or external APIs in v1?
- Should voice/realtime be enabled now, push-to-talk, or skipped?
- Should web/mobile access be local only, Tailscale-only, or not configured yet?
- Should we create the first task/seed now or stop after setup?

## State Contract

Persist non-secret state in a gitignored setup JSON file:

```json
{
  "schema": "agent-setup-state-v1",
  "version": 1,
  "status": "completed",
  "sections": {}
}
```

Store secrets only in `.env.local` or the descendant's documented secret
boundary. Mask secret values in all reports.

## Completion

End with a short status:

- configured sections;
- skipped sections;
- warnings;
- one next command or action.
