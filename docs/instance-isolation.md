---
id: pritha-instance-isolation-and-fleet-rollout
type: workflow
status: accepted
created: 2026-07-13
updated: 2026-07-13
topics:
  - pritha
  - instance-isolation
  - local-state
  - fleet-rollout
tools:
  - Git
  - GitHub
  - Node.js
sources:
  - operator-approved-pritha-unification-plan-2026-07-13
related:
  standards:
    - 04_standards/memory-domains.md
  workflows:
    - 07_workflows/pritha-good-state-baseline.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: pritha-instance-isolation
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Pritha Instance Isolation And Fleet Rollout

GitHub `main` is the canonical code and shared authored-knowledge source. Every
local Pritha uses the same commit but owns a separate runtime state and sibling
agent boundary.

## Required instance configuration

Store real values only in `<state-root>/config/runtime.env` with mode `0600`:

```dotenv
TECHSCOPE_ROOT=<git-checkout>
PRITHA_INSTANCE_ID=<stable-instance-id>
PRITHA_INSTANCE_ROLE=primary|replica|developer
PRITHA_STATE_ROOT=<external-state-directory>
PRITHA_AGENT_PARENT=<directory-containing-this-instance-child-agents>
PRITHA_CONTROL_CENTER_PORT=<local-port>
PRITHA_SEARXNG_URL=<local-instance-url>
PRITHA_CONTROL_CENTER_ENV_FILE=<state-root>/config/runtime.env
```

`TECHSCOPE_ROOT` resolves code. `PRITHA_STATE_ROOT` resolves generated/private
state. `PRITHA_AGENT_PARENT` is the only sibling tree visible to the Control
Center and Realtime file tools.

## State layout

```text
config/runtime.env
setup/setup.json
memory/techscope.sqlite
memory/last-self-test.json
private/
queue/
logs/
audit/
snapshots/
voice-drafts/
agents/contracts/
agents/profiles/
agents/reports/
agents/research/
agents/registry.md
releases/
```

Tracked `11_agents/` is historical shared knowledge, not a live registry. A
local artifact can enter shared knowledge only through explicit review and
`node scripts/pritha-promote.mjs plan` followed by an approved apply.

If instance configuration is temporarily unavailable, live child-agent
artifacts fall back to gitignored `.private/agents/`, never to tracked
`11_agents/`. The Pritha CLI loads `.env` and `.env.local` before initializing
Agents Mother so a checkout-local instance pointer is honored consistently.

## Migration

```sh
node scripts/pritha-instance.mjs migrate --plan --json
node scripts/pritha-instance.mjs migrate --apply --yes --json
node scripts/pritha-instance.mjs status --json
```

Migration copies data and writes checksums; it does not delete legacy sources.
Keep the protected migration backup for at least 30 days.

## Update and rollback

An instance update requires a clean `main`, fetches `origin/main`, allows only
fast-forward, saves the previous `.next`, builds into an isolated staging
directory while the old process keeps its unchanged `.next`, stops only the
configured port, atomically swaps the completed build, and verifies health after
restart. A failed build leaves the old process running. A failed swap or
healthcheck restores the previous `.next` and restarts it.

```sh
node scripts/pritha-instance.mjs update --plan --json
node scripts/pritha-instance.mjs update --apply --yes --json
```

The fleet manifest stays outside Git and contains no secrets. Put the canary
first; rollout stops on the first failure:

```json
{
  "instances": [
    {
      "id": "canary",
      "role": "replica",
      "checkout": "<checkout>",
      "state_root": "<state-root>",
      "agent_parent": "<agent-parent>",
      "port": 5420
    }
  ]
}
```

```sh
node scripts/pritha-fleet.mjs status --manifest <fleet.json>
node scripts/pritha-fleet.mjs rollout --manifest <fleet.json>
node scripts/pritha-fleet.mjs rollout --apply --yes --manifest <fleet.json>
```

No automatic cron, launchd or background updater is part of this workflow.
