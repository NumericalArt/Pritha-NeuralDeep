---
id: 2026-05-28-techscope-quality-phase-12-first-run-setup-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - pritha
  - setup
  - onboarding
  - phase-12
tools:
  - Codex
  - Pritha
  - Node.js
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 07_workflows/first-run-setup.md
  - scripts/setup.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/first-run-setup.md
    - 07_workflows/techscope-quality-audit-log.md
  decisions:
    - 05_decisions/2026-05-28-realtime-default-mode.md
  contracts:
    - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-12-first-run-setup
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 first-run setup
temporal_status: current
---

# Techscope Quality Phase 12 Report: First-Run Setup Wizard

## Summary

Phase 12 adds a Codex-native first-run setup workflow plus a headless CLI
fallback. A fresh checkout can now be bootstrapped by saying `запусти проект`
in Codex or by running `node scripts/setup.mjs`.

## Changes made

Created:

- `07_workflows/first-run-setup.md`
- `08_templates/first-run-setup-dialog.md`
- `scripts/setup.mjs`
- `scripts/setup-status.mjs`
- `setup/manifest.schema.json`
- `tests/setup-state.test.mjs`
- `tests/setup-cli.test.mjs`
- `tests/trigger-phrases.test.mjs`
- `05_decisions/2026-05-28-realtime-default-mode.md`
- `11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md`

Updated:

- `AGENTS.md`
  - Added trigger phrase routing for setup, self-test and Pritha interview.
  - Added completed-with-warnings follow-up rule.
- `docs/getting-started.md`
  - Added 10-second Codex start.
- `.env.example`
  - Added optional Realtime/setup variables.
- `11_agents/registry.md`
  - Rebuilt via `node scripts/pritha.mjs lineage`.

## Behavior

- Minimal setup defaults to Codex-only.
- Optional Web, Telegram, Realtime, Obsidian and Tailscale remain opt-in/manual.
- Setup writes secrets/config to `.env.local` with private file mode.
- Setup writes non-secret state to `.techscope-setup.json`.
- If quality-gate fails, setup records `completed-with-warnings` and exits 0.
- No background service, launchd, Tailscale, Realtime session or Telegram polling
  is started by setup.

## Verification results

Phase-specific checks:

- `node --test tests/setup-state.test.mjs tests/setup-cli.test.mjs tests/trigger-phrases.test.mjs` -> pass.
- `node scripts/validate-memory.mjs` -> pass for 417 Markdown files.
- `node scripts/pritha.mjs validate 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md` -> pass.
- `node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json --state /tmp/.../.techscope-setup.json --env /tmp/.../.env.local --json` -> `completed`.
- `node scripts/setup-status.mjs --state /tmp/.../.techscope-setup.json --json` -> reads the same completed state.

Current memory stats before final embedding rebuild:

Final gate:

- `node scripts/quality-gate.mjs` -> pass.
- `npm test --silent` -> golden checks pass + 36 tests pass.
- `node scripts/golden-checks.mjs --with-embeddings` -> pass.

Final memory stats after the last `quality-gate` rebuild:

- documents: 418
- chunks: 4022
- entities: 994
- relations: 10739
- embeddings: 0

`node scripts/golden-checks.mjs --with-embeddings` separately rebuilt embeddings
and passed semantic-search sanity.

## Safety notes

- `.techscope-setup.json`, `.env.local`, `.env.local.bak` and temp files are gitignored.
- Realtime is disabled by default and requires cost/privacy confirmation.
- Claude Code adapter is explicitly a future placeholder contract, not a Phase 12 implementation.

## Rollback instructions

After the Phase 12 commit is created:

```sh
git revert <phase-12-commit>
```

## AM-CANDIDATE patterns

- `first-run-setup-workflow`: Codex-dialog bootstrap with CLI fallback.
- `trigger-phrase-routing`: deterministic mapping from user phrases to workflows.
- `completed-with-warnings-status`: first-run setup does not dead-end on noncritical checks.
- `secrets-collector-pattern`: private local env write with masked status.
- `minimal-default-config`: Codex-only setup as the safest starting point.

## Open questions

- Should a future Phase 14 pattern review promote this setup wizard into the default Pritha descendant scaffold?
- Should first-run setup optionally create the first descendant contract, or remain strictly environment/bootstrap only?
