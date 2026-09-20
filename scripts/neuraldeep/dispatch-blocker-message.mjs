const budgetMessages = {
  provider_token_budget: 'Шаг остановлен до следующего запроса: остатка бюджета недостаточно. Квитанции и документы сохранены.',
  provider_usage_unconfirmed: 'Расход предыдущего запроса пока не подтверждён. Новые платные запросы остановлены; квитанции и документы сохранены.',
  provider_budget_input_unbounded: 'Формат входных данных или инструментов не поддерживает ограниченный бюджет. Запрос остановлен до отправки провайдеру; требуется проверка совместимости Pritha.',
  provider_budget_endpoint: 'Этот адрес API не поддерживает ограниченный бюджет. Запрос остановлен до отправки провайдеру.',
  provider_budget_owner_changed: 'Текущий шаг создания больше не владеет исполнением. Запрос остановлен; обновите состояние задачи.',
  provider_budget_invalid: 'Не удалось проверить параметры бюджета. Запрос остановлен до отправки провайдеру; требуется проверка Pritha.',
};

export function dispatchBlockerMessage(code) {
  return budgetMessages[code] || 'Attachment validation stopped this request. Check the model and original format before continuing. Originals and previous activity have been kept.';
}
