'use client';
import { useEffect, useState } from 'react';
import type { AgentProviderPanelResponse } from '@/lib/control-center/agent-provider';

const labels: Record<string,string> = {
  disconnected: 'Подключение отключено', ready: 'Подключение настроено', restart_required: 'Запустите или перезапустите агента для подключения',
  provider_not_configured: 'Настройте NeuralDeep в Settings', model_unavailable: 'Выбранная модель недоступна; выберите модель явно',
  reconciliation_required: 'Предыдущий запрос требует проверки расхода; повтор заблокирован',
};
export function ProviderBindingPanel({ agentId }: { agentId: string }) {
  const [data, setData] = useState<AgentProviderPanelResponse | null>(null);
  const [mode, setMode] = useState<'none' | 'instance-neuraldeep'>('none');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(signal?: AbortSignal) {
    const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/provider-binding`, { cache: 'no-store', signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.code || 'provider_binding_unavailable');
    setData(result); setMode(result.binding.mode); setModel(result.binding.model || '');
  }
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
    // agentId is the identity of the open panel; no polling changes a selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);
  async function save() {
    if (!data) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/provider-binding`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, ...(mode === 'none' ? {} : { model }), expectedRevision: data.binding.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.code || 'provider_binding_unavailable');
      setData(result); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'provider_binding_unavailable'); }
    finally { setBusy(false); }
  }
  return <section className="operator-action-section" data-testid="agent-provider-binding">
    <h3>NeuralDeep для агента</h3>
    <p>Агент использует подключение этого экземпляра Pritha. Ключ хранится в Pritha и не передаётся в браузер или файлы агента.</p>
    {error ? <p role="alert" className="operator-action-message error">{error}</p> : null}
    {data ? <>
      <p role="status">{labels[data.binding.state] || data.binding.state}</p>
      <label>Подключение <select aria-label="Подключение NeuralDeep" value={mode} disabled={busy} onChange={event => setMode(event.target.value as typeof mode)}>
        <option value="none">Отключено</option><option value="instance-neuraldeep">NeuralDeep этого экземпляра</option>
      </select></label>
      {mode !== 'none' ? <label>Модель <select aria-label="Модель NeuralDeep агента" value={model} disabled={busy} onChange={event => setModel(event.target.value)}>
        <option value="">Выберите модель</option>
        {model && !data.models.includes(model) ? <option value={model}>{model} (недоступна)</option> : null}
        {data.models.map(id => <option key={id} value={id}>{id}</option>)}
      </select></label> : null}
      <button type="button" className="outline-button compact" disabled={busy || mode !== 'none' && !data.models.includes(model)} onClick={() => void save()}>{busy ? 'Сохранение…' : 'Сохранить подключение'}</button>
    </> : <p>Загрузка подключения…</p>}
  </section>;
}
