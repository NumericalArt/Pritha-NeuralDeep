---
id: github-source-registry-entry-template
type: template
status: active
template_for: github-source-registry-entry
created: 2026-06-26
updated: 2026-07-13
topics:
  - agent-building-knowledge
  - github-research
tools:
  - github
sources: []
related: {}
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: template
  id: github-source-registry-entry
privacy: project
retention: durable
review_status: active
confidence: medium
---

# GitHub Source Registry Entry Template

Use this shape when converting a GitHub Knowledge Radar candidate into a
curated source note or brief. Online discovery must not write or promote an
entry automatically; registry changes require a separate review.

## Source

- Repository: `OWNER/REPO`
- Canonical URL: `https://github.com/OWNER/REPO`
- Topic fit: `agent-harness | agent-memory | agent-evals | mcp-tools | agent-skills | agent-interface | agent-voice | agent-operations | other`
- Default branch:
- Current HEAD or reviewed immutable commit:
- Version context: `tag, release, commit, and checked date`
- License:
- Maintainer/source authority:
- Repository status: `active | low-activity | archived | unknown`
- Evidence checked at:

## Review Gates

- Repository identity and canonical URL checked:
- Primary-source evidence checked:
- Security/supply-chain risks:
- Maintenance signal:
- Relevance to Pritha agent-building knowledge:
- Decision: `candidate | accepted-for-review | rejected | archived`

`candidate` and `accepted-for-review` are advisory research states. They do not
authorize cloning, installation, execution, vendoring, linking, activation,
dependency changes or use in a child-agent scaffold.

## Contract Fit

- Contract capability scopes: `agent-harness | agent-memory | agent-evals | mcp-tools | agent-skills | agent-interface | agent-voice | agent-operations`
- Applicable agent contracts or contract pattern:
- Candidate module or pattern:
- Fit limitations:
- Alternatives compared:

## Selected-Module Adoption Gates

Complete this section only when an accepted `agent-contract` explicitly chooses
`Repository adoption mode: selected-module`.

- Selected repository and module:
- Immutable pin: `commit:<40-hex-SHA> | tree-sha:<40-hex-SHA>`; release tags and
  artifact digests are descriptive metadata only and are not supported adoption
  pins in selected-module v1
- Verified module type: `tree` (file/blob modules are unsupported in v1)
- Verified module tree SHA:
- Exact pin-bound module tree URL:
- License decision:
- Module-local license path:
- Exact pin-bound license blob URL:
- License Git blob SHA:
- License content SHA-256:
- Detected SPDX / license scope: `<SPDX> | module-local`
- Security review:
- Required permissions and network/file/process boundary:
- Eval result against contract acceptance cases:
- `github-repository-review` external evidence:
- Evidence-to-memory synthesis:
- Explicit user approval:
- Adoption decision: `approved | rejected | pending`

Until every selected-module gate is complete, the repository remains evidence
only and scaffold adoption is blocked.
