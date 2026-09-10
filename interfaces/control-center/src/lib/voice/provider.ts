import { assertNeuralDeepDispatchAllowed } from '../../../../../scripts/neuraldeep/release-maintenance.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { getNeuralDeepAdmissionCoordinator } from '@/lib/codex-chat/admission-coordinator';
import { resolvePrithaStateRoot } from '@/lib/pritha-paths';
import {
  voiceRuntimeCredentials,
  recordVoiceUsage,
} from '../../../../../scripts/neuraldeep/voice-runtime-config.mjs';
import {
  voiceHttp,
  VoiceProviderError,
  parseVoiceSSE,
  readBoundedBody,
} from '../../../../../scripts/neuraldeep/voice-provider.mjs';
import { voiceRequestHash } from '../../../../../scripts/neuraldeep/voice-journal.mjs';
import type { ChainedVoiceSettings } from './settings';
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};
type Identity = { sessionId: string; turnId: string; signal: AbortSignal };
const root = () => resolvePrithaStateRoot();
function flushAccounting() {
  const journal = getNeuralDeepAdmissionCoordinator().voiceJournal();
  for (const receipt of journal.pendingAccounting()) {
    if (receipt.kind !== 'llm') {
      journal.accounted(receipt.id);
      continue;
    }
    try {
      recordVoiceUsage(root(), receipt);
      journal.accounted(receipt.id);
    } catch {
      /* Durable receipt remains pending; never replay inference. */
    }
  }
}
async function request<T>(
  identity: Identity,
  kind: 'llm' | 'stt' | 'tts',
  body: unknown,
  consume: (r: Response, metadata: Record<string, unknown>) => Promise<T>,
  metadata: Record<string, unknown> = {},
) {
  assertNeuralDeepDispatchAllowed(root());
  const config = voiceRuntimeCredentials();
  if (!config.key) throw new VoiceProviderError('provider_not_configured');
  const coordinator = getNeuralDeepAdmissionCoordinator(),
    journal = coordinator.voiceJournal(),
    id = `voice_http_${randomUUID()}`;
  flushAccounting();
  const lease =
    kind === 'llm'
      ? await coordinator.acquire({
          attemptId: id,
          surface: 'voice_dialogue',
          workloadId: identity.turnId,
          coordinationKey: id,
          signal: identity.signal,
        })
      : null;
  let dispatched = false,
    successful = false;
  try {
    identity.signal.throwIfAborted();
    assertNeuralDeepDispatchAllowed(root());
    const observation = {
      ...metadata,
      workerPid: process.pid,
      usageKnown: false,
    };
    journal.claimRequest({
      id,
      sessionId: identity.sessionId,
      turnId: identity.turnId,
      kind,
      requestHash: voiceRequestHash(body instanceof FormData ? metadata : body),
      metadata: observation,
    });
    dispatched = true;
    const response = await voiceHttp({
      ...config,
      endpoint: `/v1/${kind === 'llm' ? 'chat/completions' : kind === 'stt' ? 'audio/transcriptions' : 'audio/speech'}`,
      body,
      signal: identity.signal,
      timeoutMs: kind === 'llm' ? 45000 : 30000,
    });
    const result = await consume(response, observation);
    identity.signal.throwIfAborted();
    journal.finishRequest(id, 'completed', observation, kind === 'llm');
    successful = true;
    return result;
  } catch (error) {
    if (dispatched)
      journal.finishRequest(
        id,
        identity.signal.aborted ? 'interrupted' : 'failed',
        { usageKnown: false },
        kind === 'llm',
      );
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new VoiceProviderError('provider_timeout');
    throw error;
  } finally {
    // This lease covers HTTP only. Tool execution and TTS cannot retain it.
    await lease?.release(successful ? 'completed' : 'cancelled');
    flushAccounting();
  }
}
export async function voiceCompletion(
  identity: Identity,
  settings: ChainedVoiceSettings,
  messages: ChatMessage[],
  tools: unknown[],
  final = false,
  onText?: (text: string) => void,
) {
  const body = {
    model: settings.model,
    user: identity.sessionId,
    messages,
    tools,
    tool_choice: final ? 'none' : 'auto',
    parallel_tool_calls: false,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 1200,
    temperature: 0.2,
  };
  return request(
    identity,
    'llm',
    body,
    async (response, metadata) => {
      if (!response.headers.get('content-type')?.includes('text/event-stream'))
        throw new VoiceProviderError('provider_content_type');
      let text = '',
        finish = '';
      const calls = new Map<number, ToolCall>();
      for await (const event of parseVoiceSSE(response)) {
        if (event.usage) {
          metadata.usage = event.usage;
          metadata.usageKnown =
            Number.isSafeInteger(event.usage.prompt_tokens) &&
            Number.isSafeInteger(event.usage.completion_tokens);
        }
        const choice = event.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finish = choice.finish_reason;
        if (typeof choice.delta?.content === 'string') {
          text += choice.delta.content;
          if (text.length > 16000)
            throw new VoiceProviderError('voice_output_limit');
          if (final) onText?.(choice.delta.content);
        }
        for (const delta of choice.delta?.tool_calls || []) {
          if (
            !Number.isInteger(delta.index) ||
            delta.index < 0 ||
            delta.index > 7
          )
            throw new VoiceProviderError('voice_tool_limit');
          const call = calls.get(delta.index) || {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
          if (delta.id) call.id += delta.id;
          if (delta.function?.name) call.function.name += delta.function.name;
          if (delta.function?.arguments)
            call.function.arguments += delta.function.arguments;
          if (
            call.function.arguments.length > 32768 ||
            call.function.name.length > 100 ||
            call.id.length > 160
          )
            throw new VoiceProviderError('voice_tool_limit');
          calls.set(delta.index, call);
        }
      }
      if (
        !['stop', 'tool_calls'].includes(finish) ||
        (final && calls.size) ||
        (calls.size && finish !== 'tool_calls')
      )
        throw new VoiceProviderError('provider_response_incomplete');
      const toolCalls = [...calls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, call]) => call);
      if (
        toolCalls.some((c) => !c.id || !c.function.name) ||
        new Set(toolCalls.map((c) => c.id)).size !== toolCalls.length
      )
        throw new VoiceProviderError('provider_tool_identity');
      return { text, calls: toolCalls };
    },
    { model: settings.model },
  );
}
export async function voiceTranscribe(
  identity: Identity,
  settings: ChainedVoiceSettings,
  audio: Uint8Array,
) {
  const body = new FormData();
  body.set('model', settings.sttModel);
  body.set(
    'file',
    new Blob([new Uint8Array(audio)], { type: 'audio/wav' }),
    'speech.wav',
  );
  body.set('response_format', 'json');
  if (settings.language !== 'auto') body.set('language', settings.language);
  return request(
    identity,
    'stt',
    body,
    async (r) => {
      if (!r.headers.get('content-type')?.includes('application/json'))
        throw new VoiceProviderError('provider_content_type');
      const data = JSON.parse((await readBoundedBody(r, 64000)).toString());
      if (typeof data.text !== 'string' || data.text.length > 16000)
        throw new VoiceProviderError('provider_transcript_invalid');
      return data.text.trim();
    },
    {
      model: settings.sttModel,
      bytes: audio.byteLength,
      audioHash: createHash('sha256').update(audio).digest('hex'),
    },
  );
}
export async function voiceSynthesize(
  identity: Identity,
  settings: ChainedVoiceSettings,
  text: string,
) {
  const language =
    settings.language === 'ru'
      ? 'Russian'
      : settings.language === 'en'
        ? 'English'
        : /[А-Яа-яЁё]/.test(text)
          ? 'Russian'
          : 'English';
  return request(
    identity,
    'tts',
    { input: text, voice: settings.voice, language },
    async (r, metadata) => {
      if (
        !/audio\/(?:wav|x-wav|wave)/i.test(r.headers.get('content-type') || '')
      )
        throw new VoiceProviderError('provider_content_type');
      metadata.engine =
        r.headers.get('x-tts-engine')?.slice(0, 32) || 'unknown';
      return readBoundedBody(r, 4 * 1024 * 1024);
    },
    { model: 'neuraldeep-tts', characters: [...text].length },
  );
}
