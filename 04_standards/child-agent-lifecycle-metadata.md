---
id: child-agent-lifecycle-metadata
type: standard
status: draft
created: 2026-06-04
updated: 2026-06-08
last_reviewed: 2026-06-08
owner: Techscope/user
topics:
  - child-agents
  - lifecycle-metadata
  - snapshots
  - rollback
  - pritha-control-center
tools:
  - Pritha
  - Markdown
  - JSON
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - 11_agents/profiles/
  - .snapshots/child-agents/
  - .snapshots/audit/
  - interfaces/control-center/
portability: codex-native
sources:
  - docs/ui-design/2026-06-04-pritha-control-center-contract-v0.4-full.txt
  - docs/ui-design/2026-06-04-control-center-appendix-a-unimplemented-surfaces.txt
  - 04_standards/memory-domains.md
  - 08_templates/child-agent-profile.md
related:
  standards:
    - 04_standards/memory-domains.md
  templates:
    - 08_templates/child-agent-profile.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-04
source_updated: 2026-06-08
source_version: Pritha Control Center lifecycle metadata contract v6
retrieved: 2026-06-04
verified: 2026-06-05
valid_for: Pritha Control Center read-only lifecycle metadata and future restore/rollback workflows
temporal_status: current
memory_domain: governance
memory_domains:
  - governance
  - child-agents
  - agent-building-knowledge
subject:
  kind: standard
  id: child-agent-lifecycle-metadata
privacy: public
retention: durable
review_status: draft
confidence: medium
---

# Standard: child-agent-lifecycle-metadata

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-08

## Rule

Pritha Control Center must read child-agent lifecycle state from authored
metadata before falling back to inferred reports.

The canonical authored layer is:

- `11_agents/profiles/<agent-id>.md` for the current child-agent profile;
- `.snapshots/child-agents/<agent-id>/<snapshot-id>/snapshot.json` for
  rollback/restore snapshot metadata, when snapshots exist.

Reports and contracts remain evidence. Profiles summarize current state.
Snapshot metadata describes a restorable point. The UI must not present
start, stop, restore, rollback or update actions as executable until a backend
action endpoint and confirmation gate exist.

## Runtime Taxonomy And Truthful Controls

Control Center must classify each child agent before choosing a primary card
action. The supported runtime classes are:

- `web_service`: local app/service with a local upstream or health endpoint.
- `scheduled_job`: no always-on app, but a schedule, queue watcher or run job
  exists.
- `codex_project`: project folder or harness that runs through Codex App/CLI
  rather than a managed service.
- `cli_worker`: long-running or run-once local worker without a web surface.
- `interface_adapter`: Telegram, voice, email or other adapter surface.
- `tool_server`: MCP/tool server surface.
- `external_service`: runtime is outside the local Control Center boundary.
- `scaffold`: contract/profile exists but runtime folder is absent or not built.
- `unknown`: insufficient metadata.

Card actions must be truthful:

- `web_service` actions are `Start Plan` or `Stop Plan` until a deterministic
  executor exists.
- `scheduled_job` actions are `Run Now`, `Pause Schedule` or `Resume Schedule`,
  not generic `Start`/`Stop`.
- `codex_project` actions are `Run Check`, `Open in Codex` or Codex task
  planning, not generic `Start`/`Stop`.
- `scaffold` and missing-folder agents use `Restore Plan`, not `Restore`.
- unknown or unmanaged agents use diagnostics such as `Run Check`.

Legacy `start_command` and `stop_command` string fields in
`operations/manifest.json` are descriptive planning evidence only. They are not
executable authority. Strings containing human instructions such as `Ctrl-C`,
`terminate`, `manual` or free-form alternatives such as `or` must be classified
as `human_instruction`. Other strings are `legacy_declared`. Only a future
structured command object with explicit Control Center ownership can become
`structured_executable`.

Codex is a planner, diagnostician and remediation helper for lifecycle actions.
It must not be treated as a universal direct executor for `Start`/`Stop`.
Codex-generated execution plans require the same deterministic backend,
confirmation gate and audit trail as human-authored operations.

## Future Runtime Execution Gate

Real `Start`, `Stop`, `Restore`, schedule mutation or adapter mutation requires
a separate executor milestone. The executor must require all of:

- structured manifest command object, not legacy string fields;
- explicit `control_center_managed: true`;
- confirmation phrase such as `STOP fespa26`;
- audit entry before and after execution;
- owned process record, service label or equivalent runtime boundary;
- health re-check after action;
- no arbitrary port killing;
- no Codex-generated shell execution as the direct backend.

## Child-Agent Profile Contract

Each profile should use `type: child-agent-profile` and include:

```yaml
agent_id: funny-teacher
agent_name: Funny Teacher
assigned_version: v1
lifecycle_status: active
folder_name: FunnyTeacher
snapshot_retention: 2
snapshot_store: .snapshots/child-agents/funny-teacher
restore_strategy: contract-and-reports
rollback_status: unavailable
```

`assigned_version` is the Pritha lifecycle version. It is not automatically
the package version, app version, schema version or operations manifest
version.

If no lifecycle version has been assigned, omit `assigned_version` and use a
body note or custom field such as `assigned_version_status: unassigned`.
Consumers must not coerce arbitrary words into versions.

## Snapshot Metadata Contract

Snapshot metadata lives outside the profiles:

```text
.snapshots/child-agents/<agent-id>/<snapshot-id>/snapshot.json
```

Minimum JSON fields:

```json
{
  "schema_version": "pritha_child_agent_snapshot_v1",
  "snapshot_id": "2026-06-04T22-00-00Z",
  "agent_id": "funny-teacher",
  "agent_name": "Funny Teacher",
  "created_at": "2026-06-04T22:00:00Z",
  "source_profile": "11_agents/profiles/funny-teacher.md",
  "source_contract": "11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md",
  "agent_folder": "../FunnyTeacher",
  "restore": {
    "mode": "metadata-only",
    "requires_confirmation": true,
    "target": "../FunnyTeacher",
    "overwrite_existing_folder": false
  },
  "privacy": {
    "secrets_included": false,
    "private_memory_included": false,
    "runtime_queues_included": false,
    "logs_included": false
  }
}
```

Recommended fields:

- `description`: short reason for the snapshot.
- `created_by`: `manual`, `codex`, or `pritha`.
- `agent_version`: Pritha lifecycle version at snapshot time.
- `contents.includes`: durable files or archive references covered by the
  snapshot.
- `contents.excludes`: `.env`, secrets, private memory, logs, queues and
  cache folders excluded by policy.
- `checks`: read-only checks run before or after snapshot creation.
- `git.techscope_commit` and `git.agent_commit` when git history exists.

Snapshot metadata is not a permission to restore. Restore and rollback require
a separate plan endpoint, explicit user confirmation and a write-capable
backend that honors the snapshot privacy fields.

## Read-Only Planner And Validator

Control Center may expose read-only lifecycle endpoints:

- `GET /api/agents/:id/snapshot-plan`
- `GET /api/agents/:id/snapshot-validation`

`snapshot-plan` may return a draft `snapshot.json` object, a target metadata
path and preflight checks. It must not create `.snapshots`, write files, copy
agent folders, start services or mutate memory.

`snapshot-validation` may inspect existing snapshot metadata files and report
schema/privacy/restore-gate errors. If the metadata store is absent, the
result is `unavailable`, not a project failure.

Both endpoints must return `actionEnabled: false` until a future write-capable
snapshot/restore backend and explicit user confirmation flow are implemented.

## Confirmation-Gated Snapshot Write

The first write-capable snapshot endpoint is:

- `POST /api/agents/:id/snapshot`

It must default to dry-run:

```json
{}
```

or:

```json
{ "dryRun": true }
```

Dry-run returns the same target and metadata draft shape as `snapshot-plan`,
plus confirmation instructions, and must not write files.

Real metadata writing requires all of:

```json
{
  "dryRun": false,
  "confirmationPhrase": "CREATE SNAPSHOT funny-teacher"
}
```

The exact phrase is `CREATE SNAPSHOT <agent-id>`.

The write action may create only:

```text
.snapshots/child-agents/<agent-id>/<snapshot-id>/snapshot.json
```

It must use no-overwrite behavior, must not copy child-agent folders, must not
copy secrets/private memory/logs/queues/runtime caches and must leave
`actionEnabled: false` in the response so the current UI cannot accidentally
trigger it. A successful write must also append an operator audit entry to the
snapshot audit JSONL log.

Metadata-only snapshots do not make rollback ready. Rollback requires a later
restore-capable snapshot mode and a separate confirmation-gated rollback
endpoint.

## Operator UI Requirements

If Control Center exposes snapshot execution in the UI, it must be placed on
the Developer surface or another operator-only surface. The UI must:

- show the selected agent, snapshot target path and preflight checks;
- run dry-run without requiring a confirmation phrase;
- require exact typed confirmation for metadata writes;
- disable the write button until the phrase matches;
- show validation immediately after writes or refreshes;
- keep rollback controls absent or disabled for metadata-only snapshots.

The UI must not hide endpoint state. If the snapshot store is absent, the UI
should show that as an operator-readable warning, not as a generic failure.

## Snapshot List, Retention, Audit And Compare

Control Center may expose:

- `GET /api/agents/:id/snapshots`
- `GET /api/agents/:id/snapshot-compare`
- `GET /api/agents/:id/snapshot-retention`
- `POST /api/agents/:id/snapshot-retention`
- `GET /api/agents/:id/snapshot-audit`

The snapshot list reads existing metadata files and reports count, latest
snapshot, store path and profile-defined retention.

Retention enforcement must default to dry-run. A real prune action requires:

```json
{
  "dryRun": false,
  "confirmationPhrase": "PRUNE SNAPSHOTS funny-teacher"
}
```

The exact phrase is `PRUNE SNAPSHOTS <agent-id>`.

Retention pruning may remove only old `metadata-only` snapshot metadata that
exceeds the profile retention window. It must not remove restore-capable
snapshots, unknown restore modes, child-agent folders, secrets, private memory,
queues, logs or runtime caches. The implementation must verify that each prune
target is inside the configured snapshot metadata store before mutation.

Write actions append an operator audit entry to:

```text
.snapshots/audit/child-agent-snapshot-actions.jsonl
```

If old snapshot metadata exists before the audit log was introduced, Control
Center may show derived audit entries from snapshot metadata, but it must mark
them as derived rather than explicit operator audit evidence.

The compare endpoint may compare the latest metadata snapshot with the current
draft metadata, ignoring volatile fields:

- `snapshot_id`
- `id`
- `created_at`
- `created`
- `created_by`
- `description`
- `checks`

Compare is a drift signal only. It must not mutate snapshots and must not imply
rollback safety.

## Pre-Restore Contract

Before a snapshot can be treated as restore-capable, Control Center must expose
a read-only pre-restore contract:

- `GET /api/agents/:id/pre-restore-contract`

The contract must return `actionEnabled: false` and `restoreEnabled: false`
until all restore prerequisites are implemented and verified. For
metadata-only snapshots, the contract must explicitly report blockers such as:

- snapshot restore mode is `metadata-only`;
- no byte-level content manifest or hashes are available;
- no restore executor exists;
- only derived or missing audit evidence is available;
- restore confirmation gates are future/planned.

The future restore confirmation phrases are separate from snapshot creation
and retention:

- `PREPARE RESTORE <agent-id>`
- `RESTORE <agent-id> FROM <snapshot-id>`

These phrases are documented as future gates only until a write-capable restore
endpoint exists.

## Operator Action Planning

Control Center may expose action plans for card-level operator actions:

- `GET /api/agents/:id/actions/start/plan`
- `GET /api/agents/:id/actions/stop/plan`
- `GET /api/agents/:id/actions/check/plan`
- `GET /api/agents/:id/actions/restore/plan`

Action plans are allowed for all visible card actions, but they must separate
planning from execution. A plan must show preflight checks, blockers, target
kind, mutation flags and warnings. It must not start processes, stop
processes, create folders, restore snapshots, install services, schedule jobs
or mutate memory.

The first executable card-level action is manual check:

- `POST /api/agents/:id/actions/check`
- `POST /api/agents/actions/manual-audit`
- `GET /api/operator-activity`

Manual check may read profiles, contracts and operations manifests, probe a
configured local health endpoint, return structured diagnostics and append an
operator audit entry. Fleet manual audit applies the same check contract to all
child agents and writes one operator audit entry per child agent. Both forms
must not start, stop, restore, install, uninstall, enable launchd, create
scheduled jobs or modify child-agent runtime state.

Manual check audit entries live at:

```text
.snapshots/audit/child-agent-operator-actions.jsonl
```

The activity feed may read this JSONL file and show recent operator actions in
Control Center. Corrupt audit lines must not break the dashboard; they should
be ignored or surfaced as warnings.

`start`, `stop` and `restore` remain plan-only until each has its own
confirmation-gated backend and separate safety contract.

## Use When

- Control Center needs stable versions, lifecycle status, restore planning or
  rollback availability.
- Pritha creates, tests, restores or hands off a child agent.
- A child agent changes enough that the registry summary is no longer enough.

## Avoid When

- Storing private user memory or secrets.
- Capturing runtime logs, queues, `.env`, API keys or raw uploads without an
  explicit retention decision.
- Treating generated wiki pages as authoritative lifecycle evidence.

## Required Practices

- Profiles summarize evidence; they do not replace contracts, reports or
  tests.
- Snapshot stores may be absent. In that case rollback is `unavailable`, not
  `planned` or `ready`.
- Empty snapshot stores are `ready` as a metadata store but have zero rollback
  points.
- Restore from contracts/reports is a guided rebuild path, not a byte-for-byte
  filesystem backup.
- Consumers should read profiles first, then reports/contracts as fallback
  evidence.

## Temporal Validity

- Source published: 2026-06-04.
- Source updated: 2026-06-05.
- Source version: Pritha Control Center lifecycle metadata contract v5.
- Retrieved: 2026-06-04.
- Verified: 2026-06-05.
- Valid for: current local Pritha Control Center experiment.
- Freshness status: current.
- Temporal status: current.
- Recheck when: snapshot creation, restore, rollback or update-apply backends
  become write-capable.
