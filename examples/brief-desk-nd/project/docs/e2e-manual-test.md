# Ручной end-to-end тест brief-desk-nd

## Предусловия

```bash
screen -ls   # должен быть briefdesk (Detached)
# Или запустить: screen -dmS briefdesk bash .data/run-with-env.sh
```

## Шаг 1. Health
```bash
curl -s http://127.0.0.1:3434/health
# → {"ok":true,"agent":"brief-desk-nd"}
```

## Шаг 2. Добавить тему
```bash
curl -s -X POST http://127.0.0.1:3434/api/topic \
  -H "Content-Type: application/json" \
  -d '{"topic":"NeuralDeep AI platform"}'
# → topics включает "NeuralDeep AI platform"
```

## Шаг 3. Собрать бриф
```bash
curl -s -X POST http://127.0.0.1:3434/api/brief \
  -H "Content-Type: application/json" \
  -d '{"topic":"NeuralDeep AI platform"}'
# → {"ok":true,"draftId":"...","status":"searching"}
```

## Шаг 4. Дождаться `ready`
```bash
# В UI: статус обновляется автопарсом каждые 5 сек
# Или вручную:
curl -s http://127.0.0.1:3434/api/status
# → status: ready, draftId: "..."
```

## Шаг 5. Проверить черновик
```bash
python3 -c "import json; s=json.load(open('.data/state.json')); \
  d=list(s['drafts'].values())[-1]; \
  print('Title:', d['title']); \
  print('Bullets:', len(d['bullets'])); \
  print('Sources:', d['sources'])"
```

## Шаг 6. Approve & Publish
```bash
curl -s -X POST http://127.0.0.1:3434/api/approve \
  -H "Content-Type: application/json" \
  -d '{"draftId":"ID_ИЗ_ПРЕДЫДУЩЕГО_ШАГА"}'
# → {"ok":true,"entry":{"id":"...","sentToTelegram":true}}
```

## Шаг 7. Проверить канал
Проверь Telegram канал `@prithabrief` — бриф должен быть там.

## Ожидаемое время
- Полный цикл: 60–90 секунд
- Search: ~1-2 сек
- Fetch/crawl: ~5-20 сек на URL
- LLM drafting: ~30-60 сек

## Fallback
Если `draft_unavailable` — проверить `tail -50 .data/server.log | grep "error"`
