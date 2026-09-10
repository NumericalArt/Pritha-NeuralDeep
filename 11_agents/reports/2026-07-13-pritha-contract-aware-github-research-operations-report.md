---
id: 2026-07-13-pritha-contract-aware-github-research-operations-report
type: agent-operations-report
status: complete
created: 2026-07-13
updated: 2026-07-13
topics:
  - agent-engineering
  - github-research
  - privacy
  - supply-chain
tools:
  - GitHub API
  - Node.js
  - SQLite
sources:
  - scripts/agents-mother/github-research.mjs
  - scripts/lib/github-repository-radar.mjs
  - scripts/agents-mother/external-research.mjs
  - scripts/agents-mother/research-gate.mjs
related:
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: pritha
  id: contract-aware-github-research
privacy: project
retention: durable
review_status: accepted
confidence: high
---

# Pritha Contract-Aware GitHub Research Operations Report

Date: 2026-07-13
Status: complete

## Outcome

Pritha now performs contract-aware, registry-first GitHub repository research as
part of new-agent research whenever the contract or selected pattern pack creates
a repository-relevant choice. The research path is read-only and advisory: it
does not clone, install, execute, vendor, link, activate or automatically register
repository code.

Repository discovery, architecture reference and module adoption are separate
gates. A completed shortlist cannot authorize a dependency.

## Implemented pipeline

1. Validate repository policy, adoption mode, selected repositories, repository
   scope sentinels and the hard maximum of ten before network access. Unknown or
   mixed sentinel scopes fail closed without being echoed into errors.
2. Derive only allowlisted capability scopes from structured contract and pattern
   data; raw mission text, secrets and arbitrary topics do not become GitHub
   queries.
3. Search the curated repository registry first, then optionally run bounded
   public GitHub API discovery with request, response, total-time and candidate
   limits.
4. Preserve every explicit reference within the hard limit, including an explicit
   reference to an archived or registry-rejected repository so that its rejection
   remains visible, normalize canonical public repository URLs, consolidate
   duplicate registry rows before applying the shortlist limit and keep the
   registry unchanged. Conflicting registry statuses and curated rejection remain
   blocking even when fresh GitHub metadata exists.
5. Require separately current, exact `github-repository-review` evidence for every
   `reference-only` repository; freshness from one review cannot authorize another.
6. For `selected-module` v1, verify exactly one directory module as a Git tree at
   the immutable pin and bind a module-local LICENSE or supported manifest by
   GitHub blob URL, Git blob SHA, content SHA-256, detected SPDX and module-local
   scope.
7. Require the same repository/module/pin/license/permissions/eval/user-approval
   tuple in the contract, repository payload and external evidence before the
   scaffold gate can pass. Duplicate or stale exact reviews fail closed.
8. Emit selected-module provenance with an exact content SHA-256 and research lock;
   generated health and smoke checks verify the bounded regular file, containment,
   content identity and full tuple before reporting readiness.

## Trust and privacy boundaries

- GitHub metadata, README text, repository files and all external narrative are
  treated as untrusted input.
- Secret-like values, credentials and private endpoints are rejected or redacted
  before they can enter rendered reports, logs or error messages.
- An authorizing evidence source is accepted only when its final sanitized value
  reparses as a bounded public HTTPS URL. A redaction placeholder, truncated URL,
  nested scheme-relative private endpoint or encoded sensitive path fails closed.
- Prompt-injection-like external narrative or metadata is quarantined and cannot
  satisfy evidence coverage or memory synthesis. The scanner also examines
  one through four bounded percent-decoding rounds and nested URL paths; malformed
  escapes and encoding deeper than the decode budget fail closed.
- Retrieval time alone does not prove freshness. Evidence needs recent source
  publication/update time or substantive version context and temporal
  compatibility. Version-based fallback requires locked
  `temporal_compatibility_status: compatible`; `incompatible`, `unknown` and any
  invalid supplied value cannot authorize freshness.
- Repository payload, rendered GitHub section, external evidence, synthesis,
  pattern pack and full research document have deterministic content locks.
- Fixture input is deterministic test data and can never grant module adoption.
- Research reports, fixtures, catalogs, pattern packs and generated child skill
  manifests are read with size, structure, regular-file and containment checks.
- GitHub Radar status/register reject a symlinked or out-of-root registry, and its
  deterministic fixture reader rejects symlinks and over-deep or oversized JSON.
- Scaffold targets and every generated parent path are checked against symlinks,
  real paths and the canonical target root; files are created exclusively.
- The default child target resolves through `PRITHA_AGENT_PARENT`; explicit output
  paths remain supported and generated voice-kit instructions use the actual
  resolved target rather than a hard-coded checkout path.
- Vendored local skills bind name, version, source, trust, review, risk,
  required toolsets, source paths and content hash across manifest, lock and
  `SKILL.md`. A shared scanner must pass before child instructions may read a skill.

## Child-agent module readiness

| Module | Status | Notes |
| --- | --- | --- |
| Harness | ready | Contract validation, research orchestration and scaffold gate integrated |
| Memory | ready | Markdown remains canonical; SQLite/FTS/embeddings rebuild from authored artifacts |
| Data | ready | Bounded JSON, canonical payloads and exact content identities |
| GitHub research | ready | Registry-first, optional bounded online discovery, hard maximum ten |
| Reference-only evidence | ready | Exact current evidence required for every selected repository |
| Selected repository module | ready | Directory/tree, module-local pin-bound license, content identity and research lock required |
| Skills | ready-local-only | Audited and fully tuple-bound local single-file skills may be vendored; external bundles remain candidate-only |
| MCP | skipped | Not selected by this implementation change |
| Interfaces | unchanged | Existing CLI/Codex surfaces preserved |
| Operations | ready | Manual checks only; no background service or schedule enabled |
| External connectors | pending-auth when applicable | Public GitHub works unauthenticated within API limits; optional token remains user-local |

## Verification

- Modified JavaScript syntax checks: pass.
- Focused repository, research, privacy, skill and scaffold suite: 169/169 pass.
- Full unit suite: 374/374 pass.
- `npm test`: pass, including golden checks and full unit suite.
- Strict privacy audit: pass.
- Quality gate: pass on final run.
- Self-test: pass; 664 memory documents, no failed queue jobs. Two pre-existing
  stale queue items were reported but not mutated.
- GitHub knowledge radar: ready; 13 curated candidates.
- SQLite memory validation and rebuild: pass.
- Semantic embeddings rebuild: pass. The local Python runtime emitted the known
  non-fatal LibreSSL warning documented by the accepted Good State Baseline.

One earlier parallel quality-gate run reported a non-reproducible failure in the
unrelated Control Center music test file. That file passed in isolation, the full
serial suite passed, and the complete quality gate passed on immediate rerun; no
music behavior was changed.

## Deliberate limitations

- Selected-module v1 supports a directory module with module-local license
  evidence. A file/blob module or root-only license remains blocked.
- Current GitHub HEAD license metadata is advisory and never substitutes for
  exact-pin module evidence.
- No repository code is automatically adopted, installed or executed.
- Online discovery depends on GitHub availability and rate limits; failure leaves
  research explicitly pending.
- External or self-asserted skill bundles remain candidate-only until a dedicated
  pinned-bundle verification and approval workflow exists. Approval text alone is
  insufficient.
- No deployment, background service, commit or push was performed. The tracked
  registry table was migrated to an explicit License column, but no runtime
  registration command added, removed or activated a repository entry.
