---
id: telegram-intake-bot
type: workflow
status: active
created: 2026-05-15
updated: 2026-06-01
topics:
  - telegram
  - intake
  - automation
  - knowledge-capture
  - queue
  - media-intake
tools:
  - telegram-bot
  - node
  - markdown
  - process-intake
  - extract-signal
  - codex
  - launchd
sources:
  - source-2de02999-643d-4b05-a13a-35493ec64e35
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.450Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-2de02999-643d-4b05-a13a-35493ec64e35
---

# Artifact: source-2de02999-643d-4b05-a13a-35493ec64e35

Date: 2026-05-15
Status: active
Source class: telegram
Retention: source-purged

## Goal

Принимать forwarded Telegram posts/messages от разрешенного пользователя, создавать neutral intake artifacts, ставить обработку в queue и создавать первичный assessment для экспертной оценки Techscope без сохранения raw Telegram payload/provenance в tracked memory.

## Command

```sh
node scripts/telegram-bot.mjs poll
```

Diagnostic:

```sh
node scripts/telegram-bot.mjs getme
node scripts/telegram-bot.mjs queue-status
node scripts/telegram-bot.mjs full-status
node scripts/telegram-bot.mjs worker
node scripts/telegram-bot.mjs enqueue-existing
node scripts/telegram-bot.mjs codex-review-status
node scripts/telegram-bot.mjs codex-review-report
node scripts/telegram-bot.mjs codex-review-done <job-id>
```

Launchd service:

```sh
launchctl bootstrap gui/$(id -u) launchd/com.techscope.telegram-bot.plist
launchctl kickstart -k gui/$(id -u)/com.techscope.telegram-bot
launchctl print gui/$(id -u)/com.techscope.telegram-bot
```

## Configuration

Use local environment variables:

```sh
TECHSCOPE_TELEGRAM_BOT_TOKEN=...
TECHSCOPE_TELEGRAM_ALLOWED_USER_IDS=telegram-user
```

Keep secrets in `.env.local`. Do not commit bot tokens into Markdown, scripts or launchd plists.

## Output

Incoming messages are saved to:

```text
00_inbox/telegram/YYYY-MM-DD-telegram-<opaque-id>.md
```

The Markdown intake is queued in:

```text
.queue/telegram-intake/pending/
.queue/telegram-intake/processing/
.queue/telegram-intake/awaiting_codex/
.queue/telegram-intake/complete/
.queue/telegram-intake/done/      # legacy: old auto-stage completion
.queue/telegram-intake/failed/
```

The worker processes queued Markdown intakes sequentially with:

```sh
node scripts/process-intake.mjs <intake-path> --transcribe-media --reindex
```

For batches with multiple queued intakes, the worker processes every intake first and then runs one shared validation/rebuild/embedding pass.

This automatic pass creates a heuristic signal draft and an assessment draft. It also marks the signal as `needs-codex-refinement`; useful Telegram material must then be refined in the Techscope Codex thread before it influences briefs, reviews, standards or decisions.

`complete` means the required pipeline is closed for that intake. If the intake has media that requires Codex-assisted interpretation, the job must stay in `awaiting_codex` until that review is marked done. The bot must not call such material "fully processed" while `awaiting_codex` or `.queue/codex-media-review/pending/` contains the job.

If Telegram media contains images, screenshots, video, audio, documents or other artifacts that need interpretation beyond link extraction, the bot may create a Codex media-review job with transient, untracked pointers only:

```text
.queue/codex-media-review/pending/
```

Codex uses this queue to bring media-review results into the current Techscope thread.

## Bot commands

- `/help`: show short usage.
- `/queue`: show queue status.
- `/reindex`: run memory validation, SQLite rebuild and local embeddings from Telegram.

## Telegram replies

Replies must be short and human-readable:

- acknowledge that the material was accepted and queued;
- say what will be done in plain language;
- after processing, summarize substance: processed ideas, media transcription status, signals and assessment;
- distinguish clearly between `auto stage finished` and `fully processed`;
- mention when media has been queued for Codex review in the current Techscope thread;
- avoid raw command output unless there is an error that requires action.

## Safety rules

- Accept messages only from `TECHSCOPE_TELEGRAM_ALLOWED_USER_IDS`.
- Process messages through persistent queue states: `pending`, `processing`, `awaiting_codex`, `complete`, `failed`.
- Automatically create assessment draft for each saved message.
- Automatically create signal draft for each saved message.
- Do not download Telegram media to tracked paths. If download is needed, use untracked temp/quarantine storage and purge after processed knowledge is created.
- Queue media that needs interpretation for Codex-assisted review in the current Techscope thread.
- Treat Telegram signal drafts as incomplete until Codex-assisted refinement is done in the Techscope thread.
- Treat media intakes as incomplete until Codex-assisted media review is done and the queue job is closed.
- Do not automatically promote Telegram content to brief, review, decision or standard.
- Use expert council assessment before adopting any claim.
- For external posts, prefer primary sources before turning the content into a standard.
- `node scripts/privacy-audit.mjs --strict` must pass after Telegram intake processing.
