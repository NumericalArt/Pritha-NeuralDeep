/** Bounded direct HTTP voice requests. No automatic replay or Responses adapter. */
export class VoiceProviderError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export async function readBoundedBody(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceProviderError('provider_empty_body');
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new VoiceProviderError('provider_body_limit');
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts, size);
}
export async function* parseVoiceSSE(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceProviderError('provider_empty_body');
  const decoder = new TextDecoder();
  let pending = '',
    total = 0,
    complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 2 * 1024 * 1024)
        throw new VoiceProviderError('provider_body_limit');
      pending += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        const frame = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        if (data === '[DONE]') {
          complete = true;
          return;
        }
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          throw new VoiceProviderError('provider_invalid_sse');
        }
        if (event.error) throw new VoiceProviderError('provider_stream_error');
        yield event;
      }
      if (pending.length > 256 * 1024)
        throw new VoiceProviderError('provider_frame_limit');
    }
    if (!complete) throw new VoiceProviderError('provider_stream_incomplete');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function validateVoiceWav(
  bytes,
  { sampleRate = 16000, maxSeconds = 120, maxBytes = 4 * 1024 * 1024 } = {},
) {
  const b = Buffer.from(bytes);
  if (
    b.length < 44 ||
    b.length > maxBytes ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE' ||
    b.readUInt32LE(4) + 8 !== b.length
  )
    throw new VoiceProviderError('invalid_voice_audio');
  let fmt = null,
    data = null;
  for (let offset = 12; offset + 8 <= b.length;) {
    const id = b.toString('ascii', offset, offset + 4),
      length = b.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + length > b.length)
      throw new VoiceProviderError('invalid_voice_audio');
    if (id === 'fmt ') {
      if (fmt || length < 16)
        throw new VoiceProviderError('invalid_voice_audio');
      fmt = b.subarray(start, start + length);
    }
    if (id === 'data') {
      if (data) throw new VoiceProviderError('invalid_voice_audio');
      data = b.subarray(start, start + length);
    }
    offset = start + length + (length % 2);
  }
  if (
    !fmt ||
    !data ||
    fmt.readUInt16LE(0) !== 1 ||
    fmt.readUInt16LE(2) !== 1 ||
    fmt.readUInt32LE(4) !== sampleRate ||
    fmt.readUInt16LE(14) !== 16 ||
    fmt.readUInt16LE(12) !== 2 ||
    fmt.readUInt32LE(8) !== sampleRate * 2 ||
    data.length % 2 ||
    data.length < sampleRate * 2 * 0.096 ||
    data.length > maxSeconds * sampleRate * 2
  )
    throw new VoiceProviderError('invalid_voice_audio');
  let energy = 0;
  for (let i = 0; i < data.length; i += 2)
    energy += (data.readInt16LE(i) / 32768) ** 2;
  return {
    seconds: data.length / (sampleRate * 2),
    rms: Math.sqrt(energy / (data.length / 2)),
  };
}
export async function voiceHttp({
  origin,
  key,
  endpoint,
  body,
  signal,
  timeoutMs = 30000,
  fetcher = fetch,
}) {
  const url = new URL(endpoint, origin);
  if (url.origin !== new URL(origin).origin)
    throw new VoiceProviderError('provider_origin_invalid');
  const timeout = AbortSignal.timeout(timeoutMs),
    combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: combined,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new VoiceProviderError(
        response.status === 401 || response.status === 403
          ? 'provider_auth'
          : response.status === 429
            ? 'provider_capacity'
            : 'provider_unavailable',
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof VoiceProviderError) throw error;
    throw new VoiceProviderError(
      signal?.aborted
        ? 'voice_interrupted'
        : timeout.aborted
          ? 'provider_timeout'
          : 'provider_unavailable',
    );
  }
}

/** Only completed public prose reaches speech; never tool arguments or reasoning. */
export function speechPhrases(text) {
  const prose = String(text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\[{][\s\S]*$/, '')
    .replace(/[*#_~]/g, '')
    .trim();
  if (!prose || /^[\[{]/.test(prose)) return [];
  const words = prose.split(/\s+/),
    parts = [];
  let chunk = '';
  for (const word of words) {
    const max = parts.length ? 220 : 140;
    if (
      chunk &&
      (chunk.length + word.length > max ||
        (chunk.length >= 40 && /[.!?…]$/.test(chunk)))
    ) {
      parts.push(chunk);
      chunk = '';
    }
    chunk += (chunk ? ' ' : '') + word;
    if (chunk.length > 400) {
      parts.push(chunk.slice(0, 400));
      chunk = '';
    }
  }
  if (chunk) parts.push(chunk);
  return parts;
}
