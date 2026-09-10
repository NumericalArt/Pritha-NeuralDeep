---
id: historical-engineering-b392943fecb4
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [agent-engineering, reusable-patterns]
tools: [Node.js, Codex]
sources: [reviewed-historical-engineering-evidence]
related: {}
memory_domain: agent-building-knowledge
privacy: public
---

# Historical engineering lessons

De-identified engineering notes retained from earlier agent work. These are
historical observations, not installed agents or current verification claims.

## Useful Scaffold Patterns

- Start with a deterministic, no-network fixture harness before adding hosted Realtime or model calls.
- Keep raw `fixtures/user_import` material separate from curated memory.
- Make safety filtering and realtime event normalization independently testable.
- Record skipped modules explicitly in manifests instead of leaving them implicit.
- For voice-sidecar tasks, keep logs concise and prefer result summaries over full diffs.


## Failed Assumptions

- The first reference-agent scaffold-prep task assumed sibling write access was unavailable; a later writable session created the project.
- A later sidecar task created the scaffold and reports but hit timeout before writing `result.md`; the practical failure was excessive logged diff/output, not harness failure.
- The generated test report did not infer Techscope lineage from the external sibling path, so the report needed a metadata correction.


## Reusable Standard Candidates

- No promotion to standard yet. The staged `scaffold -> verify/report -> registry/result` pattern is useful, but needs more repeated evidence before changing `04_standards/`.


## Outdated Or Risky Patterns

- Logging full scaffold diffs in realtime sidecar tasks is risky because it can consume the task timeout and prevent handoff.
- Treating raw joke imports as memory is unsafe; imports must stay quarantine-like until validation and safety checks pass.

