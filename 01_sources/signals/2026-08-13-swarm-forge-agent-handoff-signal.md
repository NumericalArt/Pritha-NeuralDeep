---
id: 2026-08-13-swarm-forge-agent-handoff-signal
type: signal
status: refined
created: 2026-08-13
updated: 2026-08-13
topics:
  - multi-agent-orchestration
  - durable-handoffs
  - agent-teams
  - git-worktrees
tools:
  - Pritha
  - SwarmForge
  - Git
sources:
  - 00_inbox/links/2026-08-13-swarm-forge-repository-intake.md
related:
  assessments:
    - 03_reviews/2026-08-13-swarm-forge-repository-assessment.md
  standards:
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-harness-evaluation.md
generated_from:
  - 00_inbox/links/2026-08-13-swarm-forge-repository-intake.md
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
supersedes: []
superseded_by: []
memory_domain: source-material
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: pattern
  id: durable-agent-handoff
privacy: internal
retention: durable
review_status: refined
confidence: high
verified: 2026-08-13
---

# Signal: Durable Agent Handoff

## Signal

В multi-agent runtime транспорт задачи и уведомление о новой работе должны быть
разными механизмами:

- durable queue хранит authoritative task state;
- wake-up notification только ускоряет обнаружение новой работы;
- receiver lifecycle атомарно переводит элемент через `new`, `in_process` и
  `completed`;
- reconciliation обнаруживает потерянное уведомление и повторяет wake-up;
- task payload связан с immutable artifact revision и проверяется до delivery.

SwarmForge хорошо демонстрирует первые четыре части durable file handoff, но
его текущий daemon не реализует reconciliation входящей очереди. Открытый
production report показывает, что одно потерянное tmux-уведомление может
остановить весь pipeline, хотя task file уже надежно лежит в inbox.

## Transferable Patterns

- отдельный Git worktree и branch ownership для каждой пишущей роли;
- узкий typed handoff вместо свободного межагентного чата;
- atomic outbox publication через temporary file and rename;
- commit identity validation before queueing;
- exactly one current task or explicit batch per worker;
- durable lifecycle timestamps and completed/failed audit directories;
- escalating two-role, four-role and six-role topologies selected by task risk,
  not by enthusiasm for more agents;
- presentation/terminal adapters separated from runtime coordination.

## Boundary

SwarmForge is reference-only. Its code is not eligible for adoption because the
checked repository has no detected license. Its runtime also uses unpinned
downloads, permits permission-bypass CLI arguments and relies on worktrees/tmux
without process, network or credential isolation.

Pritha should absorb the protocol invariants, not the implementation or fixed
role prompts.
