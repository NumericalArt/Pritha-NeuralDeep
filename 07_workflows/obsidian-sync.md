---
id: obsidian-sync
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-15
topics: [obsidian, sync, macbook, iphone, knowledge-base]
tools: [obsidian, obsidian-sync]
sources:
  - https://obsidian.md/help/sync/setup
  - https://obsidian.md/help/sync/settings
  - https://obsidian.md/help/Obsidian%20Sync/Local%20and%20remote%20vaults
related:
  decisions:
    - 05_decisions/2026-05-15-obsidian-web-access.md
---

# Workflow: obsidian sync

## Goal

Подключить `<TECHSCOPE_ROOT>` как Obsidian vault и синхронизировать Markdown-базу на MacBook и iPhone через Obsidian Sync.

## Primary device

Primary vault:

```text
<TECHSCOPE_ROOT>
```

Primary device:

```text
Ivan's Mac mini
```

## Important exclusions

Before starting Sync, exclude:

```text
01_sources/raw
```

Do not enable:

```text
Sync all other types
```

Reason:

- `01_sources/raw` contains videos, audio, JSON transcripts and full raw transcripts.
- `.memory`, `.logs`, `.tools` are hidden folders and should not sync.
- Scripts and launchd files are runtime infrastructure, not mobile Obsidian notes.

## Mac mini setup

1. Open Obsidian.
2. Choose `Open folder as vault`.
3. Select:

```text
<TECHSCOPE_ROOT>
```

4. Log in to Obsidian account.
5. Enable the Sync core plugin.
6. Create a remote vault named:

```text
Techscope
```

7. Connect the local vault to the remote vault.
8. Do not start syncing immediately.
9. Open `Settings -> Sync`.
10. Set device name:

```text
Mac mini
```

11. Exclude folder:

```text
01_sources/raw
```

12. Keep `Sync all other types` disabled.
13. Start syncing.
14. Wait for status `Fully Synced`.

## MacBook setup

1. Install/open Obsidian on MacBook.
2. Choose `Open vault from Obsidian Sync`.
3. Log in.
4. Connect to remote vault:

```text
Techscope
```

5. Create local vault path, recommended:

```text
~/Techscope
```

6. Before syncing fully, open `Settings -> Sync`.
7. Set device name:

```text
MacBook
```

8. Exclude folder:

```text
01_sources/raw
```

9. Keep `Sync all other types` disabled.
10. Start/resume syncing.

## iPhone setup

1. Install/open Obsidian on iPhone.
2. Tap `Setup Obsidian Sync`.
3. Log in.
4. Connect to remote vault:

```text
Techscope
```

5. Before syncing fully, open Sync settings.
6. Set device name:

```text
iPhone
```

7. Exclude folder:

```text
01_sources/raw
```

8. Keep large media disabled.
9. Start/resume syncing.

## Validation

After setup:

- Create a small test note on MacBook:

```text
00_inbox/texts/YYYY-MM-DD-sync-test.md
```

- Confirm it appears on Mac mini.
- Confirm Techscope Web sees it after:

```sh
cd <TECHSCOPE_ROOT>
node scripts/rebuild-memory.mjs
python3 scripts/embed-memory.py
```

## Notes

Obsidian Sync is sync, not backup. Keep separate backups later.

