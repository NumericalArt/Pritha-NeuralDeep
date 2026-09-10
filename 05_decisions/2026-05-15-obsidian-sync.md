---
id: 2026-05-15-obsidian-sync
type: decision
status: accepted
created: 2026-05-15
updated: 2026-05-15
topics: [obsidian, sync, macbook, iphone, knowledge-base]
tools: [obsidian, obsidian-sync]
sources:
  - 07_workflows/obsidian-sync.md
  - https://obsidian.md/help/sync/setup
  - https://obsidian.md/help/sync/settings
related:
  workflows:
    - 07_workflows/obsidian-sync.md
  decisions:
    - 05_decisions/2026-05-15-obsidian-web-access.md
---

# Decision: obsidian sync

## Context

Techscope Web already provides read-only browser access through Tailscale. We also want to use Obsidian on MacBook and iPhone as a native editing and graph interface.

## Decision

Use Obsidian Sync for Markdown vault synchronization across Mac mini, MacBook and iPhone.

Mac mini remains the primary operational host:

```text
<TECHSCOPE_ROOT>
```

Obsidian Sync remote vault:

```text
Techscope
```

Exclude `01_sources/raw` from sync and keep `Sync all other types` disabled.

## Consequences

Плюсы:

- MacBook and iPhone get local editable Obsidian vaults.
- Markdown remains source of truth.
- Techscope Web continues to run from Mac mini.
- Large raw artifacts stay local to Mac mini.

Минусы:

- Sync settings must be configured per device.
- Obsidian Sync is not a backup.
- Runtime artifacts such as SQLite, logs and raw transcripts should not be treated as synced notes.

## Review date

2026-06-15

