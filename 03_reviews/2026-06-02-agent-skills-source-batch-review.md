---
id: 2026-06-02-agent-skills-source-batch-review
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
topics:
  - agent-skills
  - procedural-memory
  - progressive-disclosure
  - skill-evals
  - prompt-injection
  - supply-chain-security
  - pritha
tools:
  - Agent Skills
  - Codex
  - Claude
  - GitHub Copilot
  - GitHub CLI
  - LangChain
  - MCP
sources:
  - https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
  - https://agentskills.io/specification
  - https://arxiv.org/abs/2510.26328
  - https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/
  - https://developers.openai.com/codex/skills
  - https://developers.openai.com/blog/eval-skills
  - https://devblogs.microsoft.com/foundry/dotnet-ai-skills-executor-azure-openai-mcp/
  - https://arxiv.org/abs/2602.16653
  - https://www.langchain.com/blog/langchain-skills
  - https://developers.openai.com/blog/skills-agents-sdk
  - https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/
  - https://github.com/anthropics/skills
  - https://github.com/openai/skills
  - https://github.com/github/awesome-copilot
  - https://github.com/langchain-ai/langchain-skills
  - https://github.com/google/skills
related:
  signals:
    - 01_sources/signals/2026-06-02-agent-skills-source-batch-signal.md
  standards:
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
  workflows:
    - 07_workflows/agent-skill-pack-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-10-16 to 2026-04-16
source_updated: mixed
source_version: official/vendor/arXiv source batch verified 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha skill pack selection, vendoring and audit policy
temporal_status: current
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-agent-skills-batch-2026-06-02
recommendation: standard
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-skill-pack-lifecycle
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Review: Agent Skills Source Batch

Date: 2026-06-02
Status: draft
Recommendation: standard

## One-Paragraph Read

This batch should be integrated into Pritha's skill lifecycle, but not as
automatic skill installation. The material confirms that skills are now a
portable, cross-host procedural-memory format with strong context benefits.
It also confirms that skills are an attack and supply-chain surface: they carry
instructions, scripts, references, assets, dependencies and sometimes network
behavior. The practical Pritha doctrine is therefore: discover broadly,
recommend cautiously, approve explicitly, vendor/pin narrowly, evaluate
behavior, and audit drift.

## Source Verdicts

| Date | Source | Verdict | Pritha fit |
| --- | --- | --- | --- |
| 2025-10-16 | Anthropic Agent Skills | baseline/adopt | Defines folder + `SKILL.md` shape, progressive disclosure and trusted-source warning. |
| 2025-10-30 | arXiv prompt-injection paper | adopt for security | Shows skills can hide prompt injections in long files and scripts. |
| 2025-12-18 | GitHub Copilot changelog | ecosystem evidence | Confirms skills as a GitHub Copilot customization surface. |
| 2025-12-19 | Codex skills docs/manual | adopt | Confirms Codex skills as reusable workflows with explicit or implicit invocation. |
| 2026-01-22 | OpenAI skill evals | adopt | Turns skill quality into trace/artifact/check/score rather than taste. |
| 2026-02-06 | Microsoft .NET skills executor | watch/adopt as pattern | Useful architecture example for Skills + MCP + enterprise stack; explicitly not production-complete. |
| 2026-02-18 | arXiv small-model skill framework | adopt as caveat | Skills can help SLMs, but tiny models struggle with reliable skill selection. |
| 2026-03-04 | LangChain Skills | ecosystem evidence | Demonstrates framework-specific skills and eval-backed performance gain claims. |
| 2026-03-09 | OpenAI OSS maintenance | adopt | Strong practical case for repo-local skills + `AGENTS.md` + CI/GitHub Actions. |
| 2026-04-16 | GitHub CLI `gh skill` | adopt for lifecycle | Supports discovery/install/update/pinning but warns skills are not verified by GitHub. |

## Consolidated Patterns

### Skill Shape

A useful skill is a focused bundle:

- `SKILL.md` with name, description and procedural instructions;
- optional references for detailed domain knowledge;
- optional scripts for deterministic work;
- optional assets/templates;
- optional platform metadata and dependencies.

The description is not decorative. It is the routing signal used for implicit
selection, so it must be concise, scoped and clear about when not to trigger.

### Security And Supply Chain

Treat an external skill like a dependency plus a prompt. Before activation,
review:

- source owner and repository;
- license and provenance;
- tag, commit or tree SHA;
- `SKILL.md` body and frontmatter;
- scripts and dependency manifests;
- network calls;
- filesystem writes;
- secret requirements;
- hidden instructions in references/assets;
- install/update mechanism;
- runtime host compatibility.

Catalogs and official repositories reduce search cost but do not create a
trust decision by themselves.

### Evaluation

Skill promotion requires more than "looks useful". A candidate skill should
have or receive eval cases for:

- positive trigger: the skill is selected when it should be;
- negative trigger: the skill stays inactive for adjacent tasks;
- required steps;
- expected commands/tool calls;
- output artifacts and formats;
- side effects and cleanup;
- regression score over time.

### Skills With MCP

Skills and MCP are complementary. Skills define repeatable procedure; MCP
connects the agent to external systems and tool boundaries. When a skill
requires MCP, the child-agent contract must record the selected MCP connector,
auth, tool allowlist and readiness state.

## Techscope Adoption Check

- Techscope/Agents Mother fit: adopt.
- Implementation cost: low for standards/templates, medium for audit tooling,
  high for automated marketplace/review workflows.
- Operational complexity: medium because skills can include scripts and
  external dependencies.
- Current architecture impact: strengthens the existing `agent-skill-pack`
  layer rather than adding a new subsystem.
- Freshness/technology timing: current as of 2026-06-02; the ecosystem is
  moving fast and CLI/install behavior should be rechecked before runtime use.
- Decision: update skill lifecycle standard, selection workflow, contract
  template and creation harness. Do not enable automatic external skill install.

## Promotion Guidance

Promote as Pritha doctrine:

- skills are contract-selected modules;
- external skills are candidate-only before approval;
- official catalogs are discovery, not trust;
- pin source and record hashes;
- inspect scripts/resources/dependencies;
- evaluate trigger behavior and side effects;
- disable agent-created skill mutation until curator/audit workflows exist.

Do not promote as defaults:

- installing public skills silently;
- trusting a skill because it appears in a catalog;
- allowing skill scripts/network without contract fields;
- assuming local/small models will pick the right skill without evals;
- letting skills mutate themselves in child-agent scaffolds.
