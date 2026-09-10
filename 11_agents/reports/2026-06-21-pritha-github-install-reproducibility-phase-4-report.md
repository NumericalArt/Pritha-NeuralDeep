---
id: 2026-06-21-pritha-github-install-reproducibility-phase-4-report
type: agent-operations-report
status: complete
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - github-install
  - documentation
  - bootstrap
  - english-surface
  - control-center
tools:
  - Node.js
  - npm
  - Markdown
  - Next.js
sources:
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - README.md
  - docs/getting-started.md
  - docs/prerequisites.md
  - docs/troubleshooting.md
  - interfaces/control-center/README.md
related:
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
    - 07_workflows/first-run-setup.md
  reports:
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-3-report.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - governance
subject:
  kind: roadmap-phase
  id: pritha-github-install-reproducibility-phase-4
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Pritha GitHub Install Reproducibility - Phase 4 Report

Date: 2026-06-21
Roadmap phase: Phase 4 - First-Run Documentation And English Product Surface
Status: complete

## Scope Completed

- Replaced the README fresh-clone path with bootstrap-based setup.
- Updated product language: Pritha is now described as a universal, trainable
  agent for creating and evolving child agents.
- Documented Pritha's two primary functions:
  - improve its own knowledge base, tools and agent-creation capabilities;
  - create new child agents and improve existing child agents.
- Synchronized `docs/getting-started.md`, `docs/prerequisites.md`,
  `docs/troubleshooting.md`, `docs/github-publish-and-push.md`,
  `interfaces/control-center/README.md` and `07_workflows/first-run-setup.md`
  with the Phase 3 bootstrap flow.
- Clarified what works after clone without secrets and what still needs
  optional credentials or operator approval.
- Updated CLI/help and generated child-agent surfaces from legacy
  TechScope/Agents Mother wording to Pritha-first English wording.
- Removed visible Cyrillic text from README/docs/Control Center/source paths
  covered by the Phase 4 scan. Hidden compatibility matchers now use unicode
  escapes or language-neutral regexes where needed.
- Added `tests/public-install-docs.test.mjs` to prevent the public install
  docs from drifting back to manual `.env` copying or setup-only flow.

## Commands Verified

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs test . --no-report
rg -n "[А-Яа-яЁё]" README.md docs interfaces/control-center/src scripts/agents-mother --glob '!node_modules/**' || true
node --test tests/public-install-docs.test.mjs tests/trigger-phrases.test.mjs tests/scaffold-snapshot.test.mjs tests/agents-mother-command-modules.test.mjs tests/agents-mother-test-module.test.mjs tests/control-center-voice-settings.test.mjs
npm --prefix interfaces/control-center run typecheck
node scripts/quality-gate.mjs
node scripts/self-test.mjs
node scripts/pre-push-audit.mjs --strict
node scripts/bootstrap.mjs verify --profile control-center --json
```

## Result

- Public install documentation now has one primary entrypoint:

  ```sh
  node scripts/bootstrap.mjs --profile local --start control-center
  ```

- Fresh clone docs no longer require copying `.env.example` to `.env`.
- The first-run workflow points to bootstrap for normal setup and reserves
  `setup.mjs` for lower-level setup-state debugging.
- The Phase 4 Cyrillic scan over README/docs/Control Center/source generator
  surface returns no matches.
- Full quality gate, self-test, strict pre-push audit and Control Center
  bootstrap verification pass after the Phase 4 changes.

## Safety Notes

- No service installation, launchd enablement, cron, Tailscale configuration,
  credential write or publication action was performed.
- The compatibility `agents-mother` command remains available, but Pritha is
  the public-facing command and generated-agent identity.
