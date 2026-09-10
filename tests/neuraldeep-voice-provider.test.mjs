import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVoiceSSE,
  voiceHttp,
  readBoundedBody,
  validateVoiceWav,
  speechPhrases,
} from '../scripts/neuraldeep/voice-provider.mjs';
import {
  normalizeNeuralDeepUsage,
  neuralDeepUsageKnown,
} from '../scripts/neuraldeep/usage-ledger.mjs';
function response(chunks) {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
        c.close();
      },
    }),
  );
}
test('fragmented CRLF SSE preserves RU/EN content and usage, ignoring comments', async () => {
  const frames = [
    ': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"Привет / hello"}}]}\r',
    '\n\r\ndata: {"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
  ];
  const data = [];
  for await (const e of parseVoiceSSE(response(frames))) data.push(e);
  assert.equal(data[0].choices[0].delta.content, 'Привет / hello');
  assert.equal(data[1].usage.completion_tokens, 2);
});
test('lost completion and malformed provider frames fail closed', async () => {
  for (const frames of [
    ['data: {}\n\n'],
    ['data: broken\n\n'],
    ['data: {"error":{"message":"private upstream text"}}\n\n'],
  ])
    await assert.rejects(async () => {
      for await (const e of parseVoiceSSE(response(frames))) void e;
    }, /provider_/);
});
test('provider failures neither retry nor expose response bodies or credentials', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      voiceHttp({
        origin: 'https://fixture.invalid',
        key: 'secret',
        endpoint: '/v1/chat/completions',
        body: {},
        fetcher: async () => {
          calls++;
          return new Response('private diagnostic', { status: 429 });
        },
      }),
    (e) => e.message === 'provider_capacity' && e.status === 429,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      voiceHttp({
        origin: 'https://fixture.invalid',
        key: 'secret',
        endpoint: 'https://other.invalid/v1',
        body: {},
        fetcher: async () => {
          calls++;
        },
      }),
    /origin_invalid/,
  );
  assert.equal(calls, 1);
});
test('body limits stop reading excessive provider data', async () => {
  await assert.rejects(
    () => readBoundedBody(response(['123', '456']), 5),
    /body_limit/,
  );
});
function wav({ rate = 16000, seconds = 0.2, amplitude = 0.2 } = {}) {
  const b = Buffer.alloc(44 + Math.floor(rate * seconds) * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 44; i < b.length; i += 2)
    b.writeInt16LE(amplitude * 32767 * Math.sin(i), i);
  return b;
}
test('audio validates container, duration, mono PCM rate and silence without trusting MIME', () => {
  assert.ok(validateVoiceWav(wav()).rms > 0.1);
  assert.equal(validateVoiceWav(wav({ amplitude: 0 })).rms, 0);
  assert.throws(
    () => validateVoiceWav(wav({ rate: 44100 })),
    /invalid_voice_audio/,
  );
  assert.throws(
    () => validateVoiceWav(wav({ seconds: 0.04 })),
    /invalid_voice_audio/,
  );
  const corrupt = wav();
  corrupt.writeUInt32LE(0xffffffff, 40);
  assert.throws(() => validateVoiceWav(corrupt), /invalid_voice_audio/);
  assert.throws(
    () => validateVoiceWav(Buffer.from('not audio')),
    /invalid_voice_audio/,
  );
});
test('speech segmentation drops code, reasoning, URLs and JSON instead of reading them aloud', () => {
  const phrases = speechPhrases(
    '<think>private reasoning</think>Готово. ```js\ndeleteAll()\n``` [Ссылка](https://fixture.invalid). ' +
      'Long sentence with several words. '.repeat(30),
  );
  assert.ok(phrases.length > 3);
  assert.ok(phrases.every((p) => p.length <= 400));
  assert.doesNotMatch(phrases.join(' '), /private|deleteAll|https/);
  assert.deepEqual(speechPhrases('{"tool":"run"}'), []);
});
test('chat completion usage includes cached and completion tokens without counting reasoning twice', () => {
  const usage = {
    prompt_tokens: 100,
    prompt_tokens_details: { cached_tokens: 40 },
    completion_tokens: 20,
    completion_tokens_details: { reasoning_tokens: 5 },
    total_tokens: 120,
  };
  assert.equal(neuralDeepUsageKnown(usage), true);
  assert.deepEqual(normalizeNeuralDeepUsage(usage), {
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 20,
    reasoningTokens: 5,
    totalTokens: 120,
  });
  assert.equal(neuralDeepUsageKnown({ prompt_tokens: 100 }), false);
});
