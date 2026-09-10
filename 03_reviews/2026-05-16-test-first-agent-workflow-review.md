---
id: 2026-05-16-test-first-agent-workflow-review
type: review
status: draft
created: 2026-05-16
updated: 2026-05-16
topics: [coding-agents, agent-evals, test-first-development, harness-engineering, acceptance-criteria, dx, security]
tools: [codex, superpowers, markdown, npm, lint, ci]
sources:
  - 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
  - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
  - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  - 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
  - anonymous incoming telegram source (purged)
  - https://openai.com/index/harness-engineering/
related:
  signals:
    - 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
  intakes:
    - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
  briefs:
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  standards:
    - 04_standards/signal-extraction.md
    - 04_standards/expert-information-assessment.md
  workflows:
    - 07_workflows/codex-assisted-signal-extraction.md
    - 07_workflows/media-intake-processing.md
recommendation: experiment
---

# Review: test-first-agent-workflow

Date: 2026-05-16
Status: draft
Recommendation: experiment

## Question

Should Techscope adopt a default workflow where coding agents receive spec, acceptance criteria and machine-checkable tests/evals before implementation?

## Context

Telegram signal proposes a practical loop:

```text
Spec -> external tests/evals -> Codex plan -> failing tests -> implementation -> passing tests -> verification
```

The useful part is not the exact tool name or whether `/using superpowers` becomes a permanent mechanism. The transferable idea is stronger: agent work improves when verification is defined before code generation and stored as repository-local artifacts.

This aligns with the existing harness engineering brief: prompts, tests, lints, docs, CI and reviewer agents are not side details; they are the harness that shapes coding-agent behavior.

Коротко по-русски: для нетривиальной задачи coding agent должен сначала получить понятную спецификацию, acceptance criteria, тесты/evals или хотя бы список команд проверки, и только потом писать код. Главная польза - агент реализует решение против заранее заданного контракта, а не сам придумывает проверку после факта.

## Options

- Keep current ad hoc workflow: ask Codex to implement, then ask it to test.
- Adopt spec-first workflow: define scope and acceptance criteria first, then implement.
- Adopt test/eval-first workflow: create or import failing checks before implementation.
- Use independent review lens before coding: QA/product/security/eval pass creates test ideas and edge cases, then Codex implements against them.

## Comparison

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Ad hoc implementation first | Fast for tiny edits; low ceremony | Agent may invent weak checks after the fact; hidden acceptance criteria; higher review burden | Use only for trivial changes |
| Spec-first | Clarifies intent, scope and constraints | Still may leave verification vague | Good default minimum |
| Test/eval-first | Converts expectations into executable feedback; supports red-green loop | Costs more upfront; not every task has obvious tests | Best default for non-trivial coding work |
| Independent review lens before coding | Finds edge cases, bad inputs, UX and security risks early | Adds a planning pass; can overfit if done mechanically | Use for agent-facing, user-facing or risky work |

## Expert notes

### Architecture

Test/eval-first workflow improves system boundaries because it forces the agent to name inputs, outputs, modules and verification commands before touching code. For larger systems, acceptance criteria should become durable repo artifacts, not chat-only text.

### Security

Security and prompt-injection cases should be included before implementation for agent-facing features. If checks are added only after the agent writes code, the agent can unconsciously validate its own assumptions.

### Developer Experience

The workflow should be lightweight:

- tiny change: spec plus one verification command;
- normal change: `acceptance.md` or issue checklist plus tests/lint;
- risky change: fixtures, smoke checks, eval examples and security cases.

Artifacts should live where future agents can find them: `tests/`, `fixtures/`, `docs/evals/`, `acceptance.md` or project-specific workflow docs.

### Product Pragmatist

Do not require a heavy ceremony for every edit. The default should be progressive: raise the harness only when blast radius, ambiguity or user-facing risk increases.

### Research Scout

Evidence is promising but incomplete. The Telegram post is a practical heuristic; OpenAI harness engineering is stronger primary support for the broader principle. Before standardizing, verify whether `Superpowers` has stable official behavior or should be treated as a local prompt/workflow pattern rather than a dependency.

### Standards Editor

Candidate standard should avoid saying "always write tests first." Better rule: "Before implementation, define the verification contract appropriate to risk." Tests/evals are the preferred contract for non-trivial coding-agent tasks.

## Candidate Rule

For non-trivial coding-agent work, Codex should establish a verification contract before implementation:

- spec or issue summary;
- scope and non-goals;
- acceptance criteria;
- expected commands;
- tests/evals/fixtures when practical;
- security and bad-input cases for agent-facing features.

Implementation should then proceed against that contract, and the final response should report actual commands run and results.

## Recommended Experiment

Run this on the next real feature in Techscope:

1. Create `acceptance.md` or a review checklist before edits.
2. Add or identify at least one failing test/eval/smoke check.
3. Ask Codex to plan from the spec and checks.
4. Implement until checks pass.
5. Record whether the workflow reduced ambiguity, rework and review effort.

## Risks and Caveats

- Over-testing small tasks can slow work down.
- Bad tests can anchor the agent to the wrong behavior.
- Chat-only acceptance criteria disappear from the repo memory; important checks should become files.
- External QA/model assistance is optional for Techscope; the independent review lens can be performed by Codex in-thread or by configured subagent roles.
- `Superpowers` needs verification before becoming a named dependency in standards.

## Recommendation

Adopt as an experiment, not yet as an active standard.

If the next 2-3 coding tasks show better reliability, create a standard candidate:

```text
04_standards/test-first-agent-workflow.md
```

with progressive levels:

- Level 0: command-only verification for trivial edits.
- Level 1: spec + acceptance criteria for normal tasks.
- Level 2: failing tests/evals before implementation for non-trivial tasks.
- Level 3: independent QA/security/product lens before implementation for risky or user-facing tasks.
