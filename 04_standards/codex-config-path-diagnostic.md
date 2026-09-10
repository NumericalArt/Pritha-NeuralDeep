---
id: standard-codex-config-diagnostic
type: standard
status: active
created: 2026-08-31
updated: 2026-08-31
last_reviewed: 2026-08-31
owner: Pritha
topics:
  - codex-cli
  - configuration
  - model-provisioning
  - diagnostics
tools: []
sources:
  - source-instance-diagnostic-2026-08-31
related:
  workflows: []
  standards: []
decisions: []
memory_domain: platform-config
subject:
  kind: standard
  id: codex-config-path-diagnostic
privacy: local
retention: indefinite
review_status: accepted
confidence: high
---

# Standard: Codex Config Path Diagnostic

## Purpose

A rule for any agent or diagnostic tool that needs to report the active model, provider, or configuration of a Codex CLI session.

## Rule

**Always read the active (instance-local) config first, before the global config.**

1. Check `$CODEX_HOME/config.toml` (or `$PRITHA_STATE_ROOT/codex-home/config.toml`).
2. Only if absent, fall back to `~/.codex/config.toml` (global default).

## Rationale

`$CODEX_HOME` can be overridden to point to a completely isolated configuration directory. The global `~/.codex/config.toml` may contain a different model, provider, or authentication setup that is not active for the current session.

Reading the global config as the primary source leads to incorrect diagnostics — reporting the wrong model, provider, or API endpoint.

## Examples

### Incorrect

```sh
cat ~/.codex/config.toml
```

This always reads the global config, ignoring `$CODEX_HOME`.

### Correct

```sh
# 1. Read the active config
cat "$CODEX_HOME/config.toml"

# 2. Check provenance if available
cat "$CODEX_HOME/../logs/neuraldeep-runtime.jsonl" 2>/dev/null | tail -3

# 3. Check env variables
env | grep -iE 'PRITHA|CODEX.*MODEL|CODEX_HOME|OPENAI'
```

## Scope

Applies to any diagnostic, self-report, or model-identification task within any Codex CLI session, including Pritha instances and child agents.
