---
id: workflow-expert-information-assessment
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-27
topics: [assessment, research, agents, programming, llm-agents, coding-agents]
tools: [codex, markdown]
sources:
  - 04_standards/expert-information-assessment.md
related:
  standards:
    - 04_standards/expert-information-assessment.md
  templates:
    - 08_templates/assessment.md
freshness_status: current
source_published: 2026-05-15
source_updated: 2026-05-27
source_version: techscope-assessment-workflow-v3
retrieved: 2026-05-27
verified: 2026-05-27
valid_for: Techscope intake and assessment workflow from 2026-05-27 onward
temporal_status: current
---

# Workflow: expert information assessment

## Goal

Оценить новую порцию информации и решить, что из нее стоит сохранить, проверить, внедрить или превратить в стандарт.

## Trigger

Запускать, когда пользователь дает:

- текст;
- ссылку на статью, сайт, репозиторий, видео или канал;
- transcript;
- идею;
- наблюдение из практики;
- инструмент или технологический трюк.

## Steps

1. Сохранить материал как intake в `00_inbox/`.
2. Определить тип материала: article, video, repo, docs, tool, idea, transcript, note.
3. Зафиксировать temporal metadata: дату публикации или выхода, дату обновления, версию технологии/софт/модели/API/spec, дату получения и дату проверки.
4. Коротко описать, о чем материал.
5. Извлечь технические утверждения и потенциально полезные паттерны.
6. Найти уже сохраненные материалы по тем же `topics`, `tools` и близким semantic-запросам.
7. Проверить первоисточники и свежесть, если тема могла измениться.
8. Сравнить дату, версию и утверждения новой информации со старой:
   - `confirms`: подтверждает;
   - `refines`: уточняет;
   - `contradicts`: противоречит;
   - `supersedes`: заменяет;
   - `uncertain`: данных недостаточно.
9. Если старые артефакты стали неактуальны, пометить их `status: outdated` или `status: superseded`, добавить `superseded_by`.
10. В новом артефакте указать `supersedes`, если он заменяет старый вывод.
11. Оценить по dimensions из `04_standards/expert-information-assessment.md`.
12. Выполнить Techscope adoption check:
   - стоит ли применять идею к самой Agents Mother/Techscope;
   - какой статус выбрать: `adopt`, `experiment`, `watch` или `skip`;
   - если не применять, явно указать почему: избыточно, слишком сложно, неактуально, рискованно, слабо подтверждено или не соответствует миссии.
13. Применить expert lenses:
   - Programming;
   - Agent Engineering;
   - DX;
   - Security;
   - Evidence;
   - Product Pragmatism.
14. Дать итоговую рекомендацию:
   - `ignore`;
   - `archive`;
   - `brief`;
   - `review`;
   - `experiment`;
   - `decision`;
   - `standard`.
15. Создать assessment в `03_reviews/` или brief в `02_briefs/`, если материал полезен.
16. Если материал может стать правилом, связать его с `04_standards/`.
17. Если Techscope adoption status равен `adopt` или `experiment`, создать или обновить соответствующий workflow, standard, template, CLI-команду или decision record.

## Scoring interpretation

- `0-10`: слабый материал, обычно `ignore` или `archive`.
- `11-20`: есть контекстная польза, обычно `brief`.
- `21-28`: сильный кандидат на `review` или `experiment`.
- `29-35`: высокий приоритет, возможны `decision` или `standard`.

Risk считается отдельно: высокий risk не всегда снижает интерес, но требует проверки перед внедрением.

## Output discipline

Не путать:

- `interesting`: любопытно, но пока непонятно зачем;
- `useful`: может помочь в разработке или агентных workflow;
- `actionable`: можно применить или проверить уже сейчас;
- `standardizable`: стоит повторять в будущих проектах.
- `techscope-adoptable`: стоит внедрить или проверить именно в Agents Mother/Techscope.

## Freshness discipline

Для быстро меняющихся технологий нельзя считать старые brief/review/standard актуальными по умолчанию. Новый материал должен явно ответить:

- какие старые артефакты найдены;
- к каким датам и версиям относятся новые и старые источники;
- какие из них все еще актуальны;
- какие нужно уточнить;
- какие нужно пометить устаревшими;
- какие источники использованы для проверки свежести.

Если проверка невозможна, писать `freshness_status: uncertain` и не повышать материал до стандарта без дополнительной проверки.

## Command phrase

Пользователь может сказать:

```text
Техноскоп, оцени эту порцию информации экспертно для программирования и LLM-агентов.
```

Expected output: assessment по шаблону `08_templates/assessment.md`.
