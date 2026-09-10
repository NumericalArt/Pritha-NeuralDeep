---
id: 2026-08-02-interface-review-skill-pack-signal
type: signal
status: refined
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
  - GitHub
sources:
  - source-cdf458bf-bb69-44c6-9320-6d16502c8788
related:
  intakes:
    - 00_inbox/links/2026-08-02-interface-design-skill-pack-intake.md
  assessments:
    - 03_reviews/2026-08-02-interface-design-skill-pack-assessment.md
  reviews:
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-untrusted-input-security.md
generated_from:
  - source-cdf458bf-bb69-44c6-9320-6d16502c8788
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - source-material
  - governance
subject:
  kind: signal
  id: interface-review-skill-pack
privacy: public
retention: durable
review_status: processed
confidence: high
---

# Signal: Interface Review Skill Pack

Date: 2026-08-02
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- The strongest reusable contribution is a holistic review protocol: resolve
  scope, inspect the real stack, separate source and visual evidence, mark
  coverage gaps, consolidate repeated root causes, verify claims and keep a
  review read-only unless implementation was requested.
- The accessibility, writing and layout modules contain high-value principles,
  but should be curated selectively and checked against primary standards.
- Typography, color and visual-polish modules are useful references, not
  universal policy: they mix stable engineering advice with exact aesthetic
  recipes and version-sensitive browser guidance.
- The pack is low in executable risk because it contains no runtime scripts,
  but remains an external instruction bundle with supply-chain, context and
  routing risk.
- The correct Pritha disposition is `reference + selective curation + local
  eval`, not floating installation or immediate activation.

## Technical details

- Seven skills share explicit domain ownership; one coordinator delegates to
  the other six and is explicit-invocation only.
- Five domain skills use multiple supporting Markdown references. The complete
  pack therefore exceeds Pritha's current single-file local skill scaffold.
- The repository has no tags, releases, CI, tests or skill-selection evals.
- Skill frontmatter satisfies the minimal Agent Skills format but omits Pritha's
  lifecycle metadata: version, source, review status, trust, required toolsets
  and risk level.
- Accessibility statements are mostly directionally sound, but the repository
  provides almost no primary citations. APCA is proposed as the default color
  contrast method even though WCAG 2 remains the current conformance standard
  and WCAG 3 is still an incomplete draft.

## Agent design implications

- Add holistic interface-review orchestration as a candidate Pritha skill
  pattern, separate from the existing interface architecture standard.
- Keep compliance rules, browser observations and design heuristics visibly
  distinct in any curated derivative.
- Prefer selecting one to three relevant domain skills for a contract instead
  of globally activating all six broad implicit triggers.
- A real interface review needs scoped source access plus rendered browser and
  interaction checks; the skill itself does not supply those capabilities.

## Candidate rules

- A UI review must state scope, inspected states, evidence and unverified gaps.
- Review requests are read-only unless the user also asks for implementation.
- Normative accessibility findings cite the applicable primary standard and
  version; experimental metrics cannot silently replace conformance criteria.
- Exact animation, spacing, radius, shadow and typography values are defaults or
  heuristics unless a project design system accepts them.
- External multi-file skills remain candidate-only until the complete bundle is
  pinned, scanned, hashed, metadata-complete and covered by positive/negative
  trigger and side-effect evals.

## Noise removed

- Popularity and installation convenience are discovery signals, not evidence
  of maturity or trust.
- Opinionated design constants are not promoted as general Pritha standards.
- Claude Code plugin packaging is not treated as proof of Codex/Pritha lifecycle
  compatibility.

## Verification required

- Run a later pinned local evaluation against a disposable representative UI.
- Check accessibility findings against current W3C/WAI guidance and actual
  browser/assistive-technology behavior.
- Recheck repository HEAD, license and bundle tree before any adoption step.
