---
id: template-agent-skill
type: template
status: draft
created: 2026-05-30
updated: 2026-05-30
template_for: agent-skill
topics:
  - agent-skills
tools:
  - Pritha
sources:
  - 04_standards/agent-skill-pack-lifecycle.md
related:
  standards:
    - 04_standards/agent-skill-pack-lifecycle.md
name: skill-name
description: One sentence describing when this procedural skill helps an agent.
version: 0.1.0
source: pritha-memory | local | trusted-source
source_paths:
  - path/to/source.md
review_status: reviewed | accepted | candidate
trust_level: local | local-reviewed | trusted | community | unknown
requires_toolsets:
  - filesystem
risk_level: low | medium | high
tags:
  - topic
---

# Skill Name

## When to Use

Describe the trigger conditions for loading this skill.

## Procedure

1. Follow the smallest reliable workflow.
2. Keep source material, decisions and generated outputs separate.
3. Record unresolved uncertainty as open questions.

## Pitfalls

- Do not use candidate skills as active instructions.
- Do not require secrets or network access unless the contract allows them.

## Verification

- State the checks that prove the skill was applied correctly.
