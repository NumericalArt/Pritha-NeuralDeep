---
id: 2026-08-02-interface-design-skill-pack-assessment
type: assessment
status: processed
created: 2026-08-02
updated: 2026-08-02
topics:
  - agent-skills
  - interface-design
  - ui-review
  - accessibility
  - skill-supply-chain
tools:
  - Agent Skills
  - Codex
  - Claude Code
  - GitHub
  - WCAG 2.2
  - APCA
  - OKLCH
agent_platforms:
  - Codex
  - Claude Code
  - Agent Skills hosts
model_context:
  - frontier coding agents with workspace access
runtime_environment:
  - local web project
  - rendered browser surface
config_surfaces:
  - SKILL.md
  - skill references
  - agents/openai.yaml
  - Claude Code plugin manifest
portability: adapter-needed
sources:
  - source-cdf458bf-bb69-44c6-9320-6d16502c8788
  - https://github.com/jakubkrehel/skills/tree/a67333399dabbc71d7778962cb9c4fb9b86a00d0
  - https://github.com/jakubkrehel/skills/blob/a67333399dabbc71d7778962cb9c4fb9b86a00d0/README.md
  - https://github.com/jakubkrehel/skills/blob/a67333399dabbc71d7778962cb9c4fb9b86a00d0/LICENSE
  - https://github.com/jakubkrehel/skills/blob/a67333399dabbc71d7778962cb9c4fb9b86a00d0/skills/better-interface/SKILL.md
  - https://github.com/jakubkrehel/skills/blob/a67333399dabbc71d7778962cb9c4fb9b86a00d0/skills/better-colors/accessibility-contrast.md
  - https://agentskills.io/specification
  - https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/
  - https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
  - https://www.w3.org/TR/WCAG22/
related:
  intakes:
    - 00_inbox/links/2026-08-02-interface-design-skill-pack-intake.md
  signals:
    - 01_sources/signals/2026-08-02-interface-review-skill-pack-signal.md
  assessments:
    - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
    - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
  reviews:
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
    - 03_reviews/2026-06-28-open-source-agent-building-repos-review.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-minimal-core-extension-surface.md
  workflows:
    - 07_workflows/agent-skill-pack-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-10
source_updated: 2026-07-29
source_version: repository commit a67333399dabbc71d7778962cb9c4fb9b86a00d0; plugin manifest 1.0.0 without release tag
retrieved: 2026-08-02
verified: 2026-08-02
valid_for: repository snapshot and Pritha skill lifecycle as of 2026-08-02
temporal_status: version-bound
source_type: github-repository
source_class: public-github
ingested_at: 2026-08-02T07:08:07Z
processed_at: 2026-08-02T07:08:07Z
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-cdf458bf-bb69-44c6-9320-6d16502c8788
recommendation: experiment
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: tool
  id: interface-design-skill-pack
privacy: public
retention: durable
review_status: processed
confidence: high
---

# Assessment: Interface Design Skill Pack

Date: 2026-08-02
Status: processed
Recommendation: preserve as a high-value reference and run a selective pinned
pilot later; do not install or activate the pack now.

## One-paragraph read

The repository is a thoughtfully structured seven-skill pack for holistic
interface review, accessibility, layout, UX writing, typography, color and UI
polish. It is highly useful to Pritha as a review-protocol and design-knowledge
source, especially because the coordinator demands explicit scope, evidence,
coverage gaps, verification and read-only behavior. It is not ready as an
active dependency: the project is only weeks old, has no tags, releases, tests,
CI or evals, contains a large multi-file instruction bundle, lacks Pritha's
trust metadata and gives several uncited or overly absolute design rules. The
right adoption shape is selective curation plus a pinned local evaluation, not
`npx` installation or global activation.

## Source snapshot

- Repository created: 2026-07-10.
- Inspected HEAD: `a67333399dabbc71d7778962cb9c4fb9b86a00d0`,
  committed 2026-07-29 and verified by GitHub.
- `skills/` tree: `7df1e390d2b525831bcda8d032b54f620f78bf87`.
- License: MIT.
- Snapshot on 2026-08-02: 2,632 stars, 78 forks and 2 open issues/PRs.
  These are volatile discovery signals, not adoption evidence.
- Seven `SKILL.md` entry points, 23 supporting Markdown references and seven
  small `agents/openai.yaml` files; no executable scripts or runtime package
  manifests.
- No tags or GitHub releases. The Claude plugin manifest says `1.0.0`, but that
  version is not bound to an immutable release tag.
- The root instructions explicitly describe the repository as
  documentation-only with no build, lint or test tooling.

## What is genuinely strong

1. **Review orchestration.** `better-interface` separates scope resolution,
   reconnaissance, domain ownership, evidence, severity, deduplication,
   verification and verdict. Missing coverage is reported as `Not reviewed`
   rather than silently inferred.
2. **Read-only default.** A request to review does not authorize source edits.
   This aligns with Pritha/Codex task semantics.
3. **Domain boundaries.** Accessibility, layout, writing, typography, color and
   polish each own a defined concern, reducing duplicate or contradictory
   findings.
4. **Project adaptation.** Most modules say to preserve the project's component
   library, tokens, styling system, density and voice before proposing changes.
5. **Progressive disclosure.** Detailed material is split into references,
   consistent with the Agent Skills format, rather than loaded into every
   activation.
6. **Low executable surface.** The inspected tree contains no bundled scripts,
   binaries, package dependencies or credential requirements.

## Per-skill disposition

| Skill | Fit | Pritha disposition | Reason |
| --- | --- | --- | --- |
| `better-interface` | High | Adapt orchestration pattern; later explicit-only pilot | Excellent scope/evidence/coverage protocol, but it fans out to six other skills and assumes source plus rendered-browser checks. |
| `better-accessibility` | High | Curate selectively; verify against W3C/WAI | Native-first, focus, keyboard, forms, ARIA, zoom and reduced-motion guidance is valuable. Normative claims need primary citations and versioned browser/AT checks. |
| `better-writing` | High | Curate selectively | Clear action labels, errors, empty states and terminology rules are stable and low-risk; apply within existing voice/localization conventions. |
| `better-layout` | High | Adopt principles, not constants | Logical properties, RTL, localization growth and content-driven breakpoints fit. Spacing ratios and pixel recipes remain heuristics. |
| `better-typography` | Medium-high | Reference-only initially | Rich web-typography reference, but broad, browser-sensitive and partly taste-driven. |
| `better-colors` | Medium | Reference-only; reject APCA as compliance default | OKLCH, semantic tokens and gamut checks are useful. APCA may be an additional experimental metric, while WCAG 2 remains the current conformance basis and WCAG 3 remains incomplete. |
| `better-ui` | Medium | Reference-only design profile | Good motion/performance reminders, but fixed scale, blur, spring, outline, radius and shadow prescriptions are authorial style, not universal standards. |

## Existing knowledge check

- `agent-skill-pack-lifecycle` already says external skills are candidate-only,
  require full-bundle inspection, immutable pinning, trust metadata, hashes,
  evals and explicit approval. This repository confirms that rule.
- `agent-interface-experience` treats UI as part of the agent harness and covers
  interface profile, state, approvals, privacy, fallback and readiness. This
  material refines it with a craft-review layer; it does not supersede it.
- `agent-untrusted-input-security` already treats repository instructions and
  assets as hostile until curated. The documentation-only format reduces code
  execution risk but not instruction or supply-chain risk.
- `agent-minimal-core-extension-surface` argues against global capability
  sprawl. Six broad implicit domain triggers strengthen the case for selecting
  only the skills a contract needs.
- Relationship to existing knowledge: **confirms and refines**. No existing
  artifact becomes outdated or superseded.

## Standards verification

- The Agent Skills specification requires only `name` and `description`, so the
  pack is format-valid at the basic level. Pritha intentionally requires more:
  version, source, review/trust/risk metadata, required toolsets, bundle identity
  and lock reconciliation.
- The inspected accessibility material correctly identifies WCAG 2.2 target
  size as 24 by 24 CSS pixels with defined exceptions; W3C's current explanation
  also gives the 20px target plus 4px spacing example.
- W3C describes WCAG 3 as an incomplete draft whose requirements may change
  substantially. Therefore APCA guidance cannot silently replace WCAG 2.x when
  Pritha or a child agent makes a conformance claim.
- The repository provides almost no links to W3C/WAI, ARIA APG, browser docs or
  other primary sources. Its numerical and normative statements must remain
  assertions until individually checked.

## Security and operational review

- Direct runtime risk: low. No scripts, binaries, runtime dependencies or
  secrets are present in the inspected bundle.
- Instruction risk: medium. `SKILL.md`, references and root agent instructions
  can steer model behavior; broad implicit triggers may load overlapping advice.
- Workspace/privacy risk during use: medium. A holistic review may inspect more
  code, screenshots, private endpoints or customer copy than needed unless paths
  and rendered states are scoped explicitly.
- Tool risk during use: medium. Credible verification can involve browser
  inspection, project commands and screen-reader testing. Those permissions
  belong in the user request or child-agent contract, not in the skill alone.
- Supply-chain risk: medium. The documented `npx skills add` and Claude
  marketplace paths are floating network mutations with no repository release
  pin.

## Pritha compatibility

- Current scaffold accepts one regular local `SKILL.md` and fails closed on
  supporting files. Every inspected skill includes `agents/openai.yaml`; five
  also include references. Direct vendoring is therefore unsupported today.
- Frontmatter omits Pritha-required lifecycle fields.
- A global install would add roughly 181 KB of instruction/reference material
  and six broad implicit discovery surfaces. Selective contract-bound adoption
  is better than an all-pack default.
- The pack supplies knowledge and procedure, not browser, code-reading or
  assistive-technology capabilities. A pilot needs those surfaces separately.

## Scores

| Dimension | Score | Read |
| --- | ---: | --- |
| Agent engineering relevance | 5/5 | Strong example of domain-owned procedural memory and orchestration. |
| Interface knowledge value | 4/5 | Broad and practical, with useful gaps in Pritha's current craft-review layer. |
| Evidence quality | 3/5 | Primary repository was inspected exactly, but the repository's own rules are mostly uncited. |
| Practicality as reference | 5/5 | Immediately useful for review vocabulary and candidate rules. |
| Practicality as active pack | 2/5 | Blocked by lifecycle, bundle, pinning and eval gaps. |
| Security risk | 2/5 direct, 3/5 in use | Static content lowers direct risk; application still opens workspace/browser/tool scope. |
| Maintenance maturity | 2/5 | Very new, one dominant maintainer, no releases, CI or evals. |

## Decision

1. Register the repository as `accepted-for-review`, not installed or trusted.
2. Preserve `better-interface` orchestration, selective accessibility/writing/
   layout principles and the compliance-versus-heuristic distinction in Pritha
   memory.
3. Do not run `npx skills add`, install the Claude plugin or vendor any bundle.
4. Do not update a standard yet. Existing lifecycle and interface standards are
   correct; this source refines their future review/eval backlog.
5. If a concrete interface project needs it, run a later pinned pilot with:
   scoped workspace paths, explicit browser/tool permissions, positive and
   negative trigger cases, a known-issues fixture, evidence accuracy scoring,
   context-use measurement and W3C-backed accessibility adjudication.

## Next artifact

experiment
