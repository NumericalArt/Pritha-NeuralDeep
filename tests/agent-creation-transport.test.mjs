import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as intent from '../scripts/search/intent.mjs';
import * as jsonl from '../scripts/neuraldeep/jsonl-reader.mjs';
import { sanitizedCodexEnvironment } from '../scripts/neuraldeep-codex.mjs';

const require = createRequire(import.meta.url);
function load(file, dependencies) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => dependencies[id] || require(id), module, module.exports);
  return module.exports;
}

test('creation authoring and pinned code roots survive runner, runtime spawn and environment sanitization', async () => {
  let invocation;
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => true;
  const runtimeModule = load('interfaces/control-center/src/lib/codex-chat/cli-runtime.ts', {
    'node:child_process': { spawn: (command, args, options) => { invocation = { command, args, options }; return child; } },
    '../../../../../scripts/search/intent.mjs': intent,
    '../../../../../scripts/neuraldeep/runtime-identity.mjs': { neuralDeepRuntimeIdentity: () => ({ stateIdentityHash: 'fixture' }) },
    '@/lib/pritha-paths': { resolveTechscopeRoot: () => '/fixture-code', resolvePrithaStateRoot: () => '/fixture-state' },
    '@/lib/settings/codex-model-catalog-server': {},
  });
  const runnerModule = load('interfaces/control-center/src/lib/codex-chat/neuraldeep-cli-runner.ts', {
    '../../../../../scripts/neuraldeep/jsonl-reader.mjs': jsonl,
    '@/lib/private-json': { appendPrivateText: async () => {} }, './cli-runtime': runtimeModule,
  });
  const authoring = '/fixture-state/creation-drafts/creation_aaaaaaaaaaaaaaaaaaaaaaaa', codeRoot = '/fixture-state/execution-workspaces/source';
  const runner = new runnerModule.NeuralDeepCliRunner(new runtimeModule.NeuralDeepCliRuntime());
  const run = await runner.start({ cwd: authoring, executionCodeRoot: codeRoot, creationAuthoringRoot: authoring, additionalWritableDirs: [authoring],
    model: 'fixture-model', effort: 'high', sandbox: 'workspace-write', resume: null, network: false, prompt: 'Prepare only a proposal.', workloadId: 'fixture-turn',
    admission: { attemptId: 'fixture-attempt', ownerToken: 'fixture-owner' } });
  assert.equal(invocation.args[invocation.args.indexOf('--cwd') + 1], authoring);
  assert.equal(invocation.args[invocation.args.indexOf('--execution-code-root') + 1], codeRoot);
  assert.equal(invocation.options.env.PRITHA_AGENT_AUTHORING_ROOT, authoring);
  const childEnvironment = sanitizedCodexEnvironment({ projectRoot: '/fixture-code', stateRoot: '/fixture-state', codexHome: '/fixture-state/codex', instanceId: 'fixture' }, invocation.options.env, codeRoot);
  assert.equal(childEnvironment.PRITHA_AGENT_AUTHORING_ROOT, authoring);
  assert.equal(childEnvironment.TECHSCOPE_ROOT, codeRoot);
  assert.equal(childEnvironment.PRITHA_NEURALDEEP_ADMISSION_RECEIPT, undefined);
  child.stdout.end(`${JSON.stringify({ type: 'thread.started', thread_id: 'fixture-session' })}\n${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })}\n`);
  child.stderr.end(); child.emit('close', 0, null);
  assert.equal((await run.completion).completedEvent, true);
});
