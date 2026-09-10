---
id: template-agent-scaffold-report
type: template
status: draft
created: 2026-05-18
updated: 2026-07-13
template_for: scaffold-report
topics: []
tools: []
agent_platforms: []
model_context: []
runtime_environment: []
config_surfaces: []
portability: codex-native | portable | adapter-needed | environment-specific | unknown
sources: []
related:
  agent_contracts: []
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current | changed | outdated | uncertain
source_published: YYYY-MM-DD | unknown
source_updated: YYYY-MM-DD | unknown
source_version: version | release | commit | spec-date | unknown
retrieved: YYYY-MM-DD
verified: YYYY-MM-DD | pending
valid_for: version/date range | unknown
temporal_status: current | version-bound | stale | unknown
research_gate_status: complete | pending | not-applicable | failed
memory_research_status: complete | pending | not-applicable | failed
external_research_status: complete | pending | not-applicable | failed
synthesis_status: complete | pending | not-applicable | failed
repository_research_required: true | false
repository_research_policy: auto | required | registry-only | not-applicable
repository_research_mode: auto | online | registry-only | skip
repository_research_status: complete | pending | not-applicable | failed
repository_research_completed_at: ISO-8601 | pending
repository_research_online_status: complete | fixture | failed | registry-only | skipped | not-applicable
repository_research_lock: sha256:... | pending | not-applicable
repository_candidate_count: 0
repository_adoption_status: none | reference-only | pending-review | selected-module
repository_research_scopes:
  - agent-harness | agent-memory | agent-evals | mcp-tools | agent-skills | agent-interface | agent-voice | agent-operations | not-applicable
external_evidence_count: 0
external_evidence_topics: []
external_research_lock: sha256:... | pending
synthesis_lock: sha256:... | pending
research_content_lock: sha256:... | pending
---

# Agent Scaffold Report: agent-name

Date: YYYY-MM-DD
Status: draft | complete | failed | superseded

## Summary

- Agent name:
- Target folder:
- Contract:
- Runtime family:
- Interfaces:
- Telegram mode:
- Research report:
- Repository research policy/mode:
- Repository shortlist:
- Repository adoption mode:
- Selected repository/module/pin:
- External verification:
- Result:

## Generated structure

-

## Environment setup

- Required secrets:
- `.env.example` created: yes | no
- Dependencies installed:
- Services configured:

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Structure validation | pending |  |
| Smoke test | pending |  |
| Healthcheck | pending |  |
| Telegram adapter test | not-applicable |  |
| Pritha memory research | pending | Link to `11_agents/research/...` or explain why not applicable |
| Research gate | pending | Must match machine-readable report frontmatter |
| External verification | pending | Current primary docs checked for volatile choices or marked not-applicable |
| GitHub repository research | pending | Registry-first, bounded and advisory-only; include report path and scopes |
| Repository discovery safety | pending | No clone, install, execute, vendor, link, activation or registry mutation |
| Selected repository exact pin | not-applicable | GitHub-verified commit SHA or tree SHA; tags are descriptive only |
| Selected repository module tree | not-applicable | Safe directory path, verified tree SHA and exact pin-bound GitHub tree URL; file/blob modules unsupported in v1 |
| Selected repository license | not-applicable | Module-local LICENSE/manifest source URL, Git blob SHA, content SHA-256, detected SPDX, `module-local` scope and compatible decision |
| Selected repository security/permissions | not-applicable | Scripts, dependencies, references, assets and required privileges reviewed |
| Selected repository eval/user approval | not-applicable | Contract-specific eval passed and explicit approval recorded |
| Selected repository evidence/synthesis | not-applicable | Valid `github-repository-review` evidence topic and completed memory synthesis |
| Documentation review | pending |  |

## Research and repository gate

- Research report:
- Contract fingerprint:
- Memory research status:
- External research status:
- External evidence count/topics:
- External research lock:
- Synthesis status/lock:
- Full research content lock:
- Memory relationship: confirms | refines | contradicts | makes-outdated
- Repository research required:
- Repository policy/mode/scopes:
- Repository research/online status:
- Repository research lock:
- Candidate count and shortlist:
- Repository adoption status:
- Selected repository/module:
- Exact immutable pin:
- Verified module tree SHA/source URL:
- License decision:
- Pin-bound module-local license source URL:
- License Git blob SHA / content SHA-256:
- Detected SPDX / license scope:
- Security and permissions decision:
- Eval result:
- `github-repository-review` evidence:
- Evidence-to-memory synthesis:
- Locked repository adoption recommendation: proceed | hold | reject | not-applicable
- User approval:

Candidate and `accepted-for-review` rows are advisory evidence only. If adoption
mode is `selected-module`, any missing or pending pin/license/security/
permissions/eval/evidence/synthesis/approval field keeps production scaffold
blocked. Reference-only sources may inform the recommendation but are not
included in the runtime.

For selected-module scaffolds, use `pending-review` while the scaffold is
experimental or any production gate is incomplete. Use `selected-module` only in
a complete production scaffold report after the exact module gate has passed.

Reference-only evidence must cover every exact canonical repository. Retrieval
time alone is insufficient freshness; record source published/updated time or
substantive version context plus temporal compatibility. Quarantined external
instructions cannot satisfy evidence or synthesis, and every declared lock must
verify against the visible document.
Version-based freshness additionally requires
`temporal_compatibility_status: compatible`; `incompatible` and `unknown` do not
authorize scaffold.

## Handoff

- How to run:
- How to test:
- How to stop:
- How to inspect logs:
- First user exercise:

## Open issues

-

## Next steps

-
