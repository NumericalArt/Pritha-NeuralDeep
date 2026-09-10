import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { voiceEvalCases } from '../../tests/fixtures/neuraldeep/voice-eval-cases.mjs';
import { voiceRuntimeCredentials } from './voice-runtime-config.mjs';
import { voiceHttp, parseVoiceSSE } from './voice-provider.mjs';
import { recordNeuralDeepRun } from './usage-ledger.mjs';
import { randomUUID } from 'node:crypto';
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (
  !process.argv.includes('--live') ||
  !process.argv.includes('--base-url') ||
  !process.argv.includes('--output') ||
  !process.env.PRITHA_STATE_ROOT
)
  throw new Error(
    'Use --live --base-url <isolated loopback candidate> --output <report.json> and an isolated PRITHA_STATE_ROOT.',
  );
const base = new URL(arg('--base-url'));
if (
  !['127.0.0.1', 'localhost'].includes(base.hostname) ||
  !base.port ||
  base.port === '3420'
)
  throw new Error('An isolated loopback candidate is required.');
const configResponse = await fetch(
    new URL('/api/realtime/session-config', base),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base.origin },
      body: '{}',
    },
  ),
  config = await configResponse.json();
if (!configResponse.ok || !config.ok)
  throw new Error('Candidate tools are unavailable');
const credentials = voiceRuntimeCredentials();
if (!credentials.key) throw new Error('NeuralDeep is not configured');
const model = 'qwen3.6-35b-a3b-noreason',
  results = [],
  startedAt = new Date().toISOString(),
  user = `voice_eval_${randomUUID()}`;
let inputTokens = 0,
  outputTokens = 0;
for (const fixture of voiceEvalCases) {
  if (inputTokens > 3_500_000 || outputTokens > 95000)
    throw new Error('Evaluation token cap reached');
  const before = performance.now();
  let names = [],
    content = '',
    usage = null,
    error = null;
  try {
    const response = await voiceHttp({
      ...credentials,
      endpoint: '/v1/chat/completions',
      timeoutMs: 45000,
      body: {
        model,
        user,
        messages: [
          { role: 'system', content: config.instructions },
          { role: 'user', content: fixture.prompt },
        ],
        tools: config.tools.map(({ type, name, description, parameters }) => ({
          type,
          function: { name, description, parameters },
        })),
        tool_choice: 'auto',
        parallel_tool_calls: false,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 600,
        temperature: 0,
      },
    });
    for await (const event of parseVoiceSSE(response)) {
      if (event.usage) usage = event.usage;
      const delta = event.choices?.[0]?.delta;
      if (delta?.content) content += delta.content;
      for (const call of delta?.tool_calls || [])
        if (call.function?.name) names.push(call.function.name);
    }
  } catch (e) {
    error = e.code || 'provider_error';
  }
  inputTokens += usage?.prompt_tokens || 0;
  outputTokens += usage?.completion_tokens || 0;
  const passed =
      !error &&
      (fixture.expected
        ? names.includes(fixture.expected)
        : names.length === 0),
    criticalPassed =
      !fixture.critical ||
      !names.some((name) =>
        [
          'run_codex_task',
          'answer_codex_task',
          'record_good_state_signal',
          'confirm_voice_intake',
          'music_control',
        ].includes(name),
      );
  results.push({
    id: fixture.id,
    language: fixture.language,
    expected: fixture.expected,
    calls: names,
    passed,
    critical: fixture.critical,
    criticalPassed,
    error,
    elapsedMs: Math.round(performance.now() - before),
  });
  recordNeuralDeepRun({
    stateRoot: process.env.PRITHA_STATE_ROOT,
    runId: `${user}_${fixture.id}`,
    source: 'voice-dialogue',
    model,
    sessionId: user,
    status: error ? 'failed' : 'completed',
    providerRequests: 1,
    usage,
    usageKnown: Boolean(usage),
  });
  if (results.length % 10 === 0)
    console.log(
      JSON.stringify({
        completed: results.length,
        passed: results.filter((r) => r.passed).length,
        criticalFailures: results.filter((r) => !r.criticalPassed).length,
        inputTokens,
        outputTokens,
      }),
    );
}
const report = {
  schema: 'pritha-voice-semantic-eval-v1',
  startedAt,
  finishedAt: new Date().toISOString(),
  model,
  synthetic: true,
  toolsExecuted: false,
  total: results.length,
  passed: results.filter((r) => r.passed).length,
  criticalTotal: results.filter((r) => r.critical).length,
  criticalFailures: results.filter((r) => !r.criticalPassed).length,
  inputTokens,
  outputTokens,
  results,
};
const output = path.resolve(arg('--output'));
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(
  JSON.stringify({
    total: report.total,
    passed: report.passed,
    criticalFailures: report.criticalFailures,
    inputTokens,
    outputTokens,
  }),
);
if (report.passed < 95 || report.criticalFailures) process.exitCode = 1;
