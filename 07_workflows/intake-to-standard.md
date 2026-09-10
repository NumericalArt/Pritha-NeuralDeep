---
id: intake-to-standard
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-15
topics: [intake, workflow, standards, knowledge-processing]
tools: [markdown, codex]
sources:
  - AGENTS.md
related:
  standards:
    - 04_standards/memory-structure.md
  workflows:
    - 07_workflows/memory-indexing.md
---

# Workflow: intake to standard

## Цель

Преобразовать новый материал в один из устойчивых артефактов проекта: brief, review, decision или standard.

## Шаги

1. Прочитать intake-файл из `00_inbox/`.
2. Определить тип материала: идея, инструмент, архитектурный подход, библиотека, процесс, статья, видео, документация.
3. Извлечь ключевые утверждения.
4. Проверить даты, первоисточники и свежесть, если тема могла измениться.
5. Сравнить с текущими файлами в `04_standards/` и `05_decisions/`.
6. Провести экспертный разбор по ролям из `06_subagents/`.
7. Сформировать итог:
   - brief: материал полезен, но пока не требует решения;
   - review: нужно сравнение нескольких вариантов;
   - decision: принято конкретное решение;
   - standard: правило применимо повторно;
   - archive: материал не подходит или устарел.
8. Переместить или отметить исходный intake как обработанный.

## Критерии стандарта

Стандарт должен быть конкретным, проверяемым и применимым более чем к одному проекту.
