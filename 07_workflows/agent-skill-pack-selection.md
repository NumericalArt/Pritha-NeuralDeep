---
id: agent-skill-pack-selection
type: workflow
status: draft
created: 2026-05-30
updated: 2026-07-13
topics: [agent-skills, pritha, scaffold, procedural-memory]
tools: [Pritha, Codex, Agent Skills]
sources:
  - 04_standards/agent-skill-pack-lifecycle.md
  - 04_standards/agent-tool-integration-selection.md
  - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
related:
  standards:
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
  reviews:
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-30
source_updated: 2026-07-13
source_version: workflow v3 + fail-closed local catalog implementation
retrieved: 2026-05-30
verified: 2026-07-13
valid_for: Pritha contract, research and scaffold flow
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: workflow
  id: agent-skill-pack-selection
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Workflow: Agent Skill Pack Selection

## Steps

1. Capture skill policy in the agent contract: needs, allowed sources, install mode, mutation policy, script policy, network policy, source pinning and eval policy.
2. During research, search local Techscope memory and the local Pritha skill catalog before external catalogs.
3. For external discovery, prefer official or vendor repositories and catalogs only as candidate sources. Do not treat discovery as approval.
4. Inspect each candidate's `SKILL.md`, references, scripts, dependency manifests, assets, network calls, filesystem writes and required secrets. Current scaffold accepts only a single-file local `SKILL.md` bundle; any extra file remains blocked until complete bundle hashing and review exist.
5. Pin any external candidate to a tag, commit or tree SHA before vendoring or linking.
6. Score candidates for task, interface, memory, tool, security, evidence, eval readiness and maintenance fit.
7. Block generated-only, unknown, unpinned, dangerous, secret-dependent, network-policy-incompatible or policy-incompatible skills.
8. Show recommended, optional, candidate and blocked skills in the research report with trust, risk, source pinning and eval status.
9. During scaffold, create `skills/manifest.json`, `skills/candidates.json`,
   `skills/lock.json`, `skills/README.md`, the shared scanner module and
   `scripts/skills-status.mjs`. Lock the full security tuple, not only the hash.
10. Vendor only reviewed local catalog skills when the contract selects `Skill install mode: vendor`; `Skill needs: selected` also requires exact known skill names.
11. Keep every external or self-asserted trusted skill candidate-only. Approval text alone is insufficient until a dedicated pinned-bundle verification workflow implements source identity, complete bundle inspection, pinning, lock reconciliation and eval gates.

## Interview Fields

Ask or derive:

- Does this agent need skills at all?
- Are external skill sources allowed, or local-only?
- May skill scripts run, or are skills instruction-only?
- May a skill use network access or MCP?
- Should skills be recommended, vendored, linked or installed by runtime?
- What approval is required before enabling a candidate?
- What source pinning policy is required?
- What eval or smoke test proves the skill works?
- If the runtime uses a local/small model, how will skill selection be tested?

## Verification

- `node scripts/pritha.mjs skills status`
- `node scripts/pritha.mjs skills select <contract-path>`
- In a child scaffold: `node scripts/skills-status.mjs`
- Run that child audit before reading an installed `SKILL.md`; metadata, hash or
  scanner drift fails closed.
- Full Pritha regression: `npm test --silent`
- Privacy/supply-chain gate: `node scripts/privacy-audit.mjs --strict`
