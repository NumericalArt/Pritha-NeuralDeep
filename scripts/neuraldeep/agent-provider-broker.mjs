import { createHash, randomUUID } from 'node:crypto';
import { AgentProviderError } from './agent-provider-binding.mjs';
import { assertNeuralDeepDispatchAllowed } from './release-maintenance.mjs';
import { voiceHttp } from './voice-provider.mjs';
import { recordNeuralDeepRun } from './usage-ledger.mjs';

const LIMIT = 256 * 1024;
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
async function readBody(source, signal) {
  const reader = source.body?.getReader();
  if (!reader) throw new AgentProviderError('provider_empty_body', 400);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const parts = []; let bytes = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read(); signal.throwIfAborted();
      if (done) break;
      bytes += value.length;
      if (bytes > LIMIT) throw new AgentProviderError('provider_body_too_large', 413);
      parts.push(value);
    }
    return Buffer.concat(parts, bytes);
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function validatedBody(input, model) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['model','messages','stream','max_tokens','temperature'].includes(key))
    || input.model !== model || input.stream !== false
    || !Number.isSafeInteger(input.max_tokens) || input.max_tokens < 1 || input.max_tokens > 4096
    || input.temperature !== undefined && (typeof input.temperature !== 'number' || input.temperature < 0 || input.temperature > 2)
    || !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 64
    || input.messages.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['role','content'].includes(key))
      || !['system','user','assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 100000)
    || input.messages.reduce((sum,item) => sum + item.content.length, 0) > 200000) throw new AgentProviderError('provider_request_invalid', 400);
  return { model, messages: input.messages, stream: false, max_tokens: input.max_tokens, ...(input.temperature === undefined ? {} : { temperature: input.temperature }) };
}
export function flushAgentProviderAccounting(bindings, stateRoot, recorder = recordNeuralDeepRun) {
  for (const row of bindings.pendingAccounting()) {
    recorder({ stateRoot, runId: row.id, source: 'child-agent', workloadId: row.agent_id,
      model: row.model, status: row.status, startedAt: row.started_at, finishedAt: row.finished_at,
      providerRequests: 1, usage: row.usage, usageKnown: row.usage_known === 1 });
    bindings.accounted(row.id);
  }
}

/** One bounded local text request. No generic proxy, tools, streaming or replay. */
export async function handleAgentProviderRequest(request, agentId, options) {
  const { bindings, stateRoot, acquire, credentials, fetcher = fetch, recorder = recordNeuralDeepRun } = options;
  let requestId = null, lease = null, usage, completed = false, timer = null;
  const timeout = AbortSignal.timeout(Math.min(Math.max(options.timeoutMs || 60000, 10), 60000));
  const revoked = new AbortController();
  const signal = AbortSignal.any([request.signal, timeout, revoked.signal]);
  try {
    const address = new URL(request.url);
    if (request.method !== 'POST' || !['127.0.0.1','localhost','[::1]'].includes(address.hostname)
      || request.headers.has('origin') || request.headers.has('sec-fetch-site')
      || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AgentProviderError('provider_broker_server_only', 403);
    const token = request.headers.get('authorization')?.match(/^Bearer (pritha_child_[A-Za-z0-9_-]{43})$/)?.[1] || '';
    const auth = bindings.authorize(agentId, token);
    const length = request.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > LIMIT)) throw new AgentProviderError('provider_request_too_large', 413);
    let body;
    try { body = validatedBody(JSON.parse((await readBody(request, signal)).toString('utf8')), auth.model); }
    catch (error) { if (error instanceof AgentProviderError) throw error; throw new AgentProviderError('provider_request_invalid', 400); }
    const config = await credentials();
    if (!config.key) throw new AgentProviderError('provider_not_configured', 503);
    const origin = new URL(config.origin);
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new AgentProviderError('provider_configuration_invalid', 503);
    flushAgentProviderAccounting(bindings, stateRoot, recorder);
    assertNeuralDeepDispatchAllowed(stateRoot);
    signal.throwIfAborted();
    const supplied = request.headers.get('x-pritha-request-id');
    if (supplied && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/.test(supplied)) throw new AgentProviderError('provider_request_invalid', 400);
    const id = supplied ? `child_${createHash('sha256').update(`${agentId}\n${supplied}`).digest('hex')}` : `child_${randomUUID()}`;
    const reservation = bindings.reserve(agentId, token, id, createHash('sha256').update(JSON.stringify(body)).digest('hex'));
    requestId = id;
    timer = setInterval(() => {
      try { bindings.current(agentId, token, reservation.revision); }
      catch { revoked.abort(); }
    }, 500);
    timer.unref?.();
    lease = await acquire({ attemptId: id, surface: 'child_agent', workloadId: agentId,
      coordinationKey: `child-provider:${agentId}`, signal });
    assertNeuralDeepDispatchAllowed(stateRoot);
    signal.throwIfAborted();
    bindings.dispatched(id, agentId, token);
    const response = await voiceHttp({ origin: origin.origin, key: config.key, endpoint: '/v1/chat/completions',
      body, signal, timeoutMs: Math.min(options.timeoutMs || 60000, 60000), fetcher });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new AgentProviderError('provider_response_invalid', 502);
    let payload;
    try { payload = JSON.parse((await readBody(response, signal)).toString('utf8')); }
    catch { throw new AgentProviderError('provider_response_invalid', 502); }
    usage = payload?.usage;
    const choice = payload?.choices?.[0];
    if (!choice || payload.choices.length !== 1 || choice.finish_reason !== 'stop'
      || choice.message?.role !== 'assistant' || typeof choice.message.content !== 'string'
      || !choice.message.content.trim() || choice.message.content.length > 64000
      || choice.message.tool_calls?.length || choice.message.function_call) throw new AgentProviderError('provider_response_invalid', 502);
    // Even an upstream response arriving after disconnect cannot bypass revocation.
    signal.throwIfAborted();
    bindings.current(agentId, token, reservation.revision);
    completed = true;
    return json({ id, object: 'chat.completion', model: auth.model,
      choices: [{ index: 0, message: { role: 'assistant', content: choice.message.content }, finish_reason: 'stop' }] });
  } catch (error) {
    const code = error instanceof AgentProviderError ? error.code
      : revoked.signal.aborted ? 'provider_binding_changed'
        : timeout.aborted ? 'provider_timeout'
          : request.signal.aborted ? 'provider_request_interrupted'
            : ['provider_auth','provider_capacity','provider_unavailable','provider_timeout','neuraldeep_release_maintenance'].includes(error?.code) ? error.code : 'provider_unavailable';
    const status = error instanceof AgentProviderError ? error.status : code === 'provider_capacity' ? 429 : code === 'provider_timeout' ? 504 : 503;
    return json({ ok: false, error: { code }, ...(requestId ? { requestId } : {}) }, status);
  } finally {
    if (timer) clearInterval(timer);
    if (requestId) {
      bindings.finish(requestId, { status: completed ? 'completed' : 'failed', usage });
      // Receipt is durable before the lease is released. Unknown usage remains a
      // blocker across restart and UI binding changes; a paid request is never replayed.
      try { flushAgentProviderAccounting(bindings, stateRoot, recorder); } catch { /* Keep accounting pending. */ }
    }
    // The HTTP lease is over even if product validation failed. Unknown usage is
    // blocked by the durable request row, not a permanently paused admission key.
    await lease?.release(completed ? 'completed' : 'cancelled');
  }
}
