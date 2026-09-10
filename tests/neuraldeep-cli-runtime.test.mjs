import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

import * as searchIntentModule from '../scripts/search/intent.mjs';
const require = createRequire(import.meta.url);
const available = { ok: true, state: 'available' };
const denied = { ok: false, state: 'auth_required', statusCode: 401 };

function fixture() {
  const calls = [];
  let now = 100_000;
  class Clock extends Date { static now() { return now; } }
  const spawn = (_command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdout.setEncoding = child.stderr.setEncoding = () => {};
    child.kill = () => { child.emit('close', null, 'SIGKILL'); return true; };
    const call = { kind: args[1], finish(payload, code = 0) {
      child.stdout.emit('data', JSON.stringify(payload)); child.emit('close', code, null);
    }, fail() { child.emit('error', new Error('fixture spawn failure')); } };
    calls.push(call);
    return child;
  };
  const dependencies = {
    '../../../../../scripts/search/intent.mjs': searchIntentModule,
    'node:child_process': { spawn },
    '@/lib/pritha-paths': { resolveTechscopeRoot: () => '/fixture', resolvePrithaStateRoot: () => '/fixture-state' },
    '@/lib/settings/codex-model-catalog-server': { getCodexModelCatalog: async () => ({ models: ['one', 'two'].map(id => ({
      id, label: id, supportedReasoningEfforts: [], defaultReasoningEffort: null,
    })) }) },
    '../../../../../scripts/neuraldeep/runtime-identity.mjs': { neuralDeepRuntimeIdentity: () => ({ stateIdentityHash: 'fixture' }) },
  };
  const source = readFileSync('interfaces/control-center/src/lib/codex-chat/cli-runtime.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'Date', compiled)(id => dependencies[id] || require(id), module, module.exports, Clock);
  return { runtime: new module.exports.NeuralDeepCliRuntime(), calls, advance: ms => { now += ms; } };
}

test('overlapping normal and forced provider checks use one live helper', async () => {
  const f = fixture();
  const first = f.runtime.probe(), second = f.runtime.probe(true), third = f.runtime.probe();
  assert.equal(f.calls.length, 1);
  f.calls[0].finish(available);
  const values = await Promise.all([first, second, third]);
  assert.ok(values.every(value => value.ok && value.state === 'available'));
  assert.equal((await f.runtime.probe()).ok, true);
  assert.equal(f.calls.length, 1);
  const forced = f.runtime.probe(true);
  assert.equal(f.calls.length, 2, 'a completed cache never replaces a forced check');
  f.calls[1].finish(denied, 1);
  assert.equal((await forced).state, 'auth_required');
});

test('a normal reader waits for the current refresh instead of returning an older cached success', async () => {
  const f = fixture(); const initial = f.runtime.probe(); f.calls[0].finish(available); await initial;
  const refresh = f.runtime.probe(true), reader = f.runtime.probe();
  f.calls[1].finish(denied, 1);
  assert.equal((await refresh).state, 'auth_required');
  assert.equal((await reader).state, 'auth_required');
  assert.equal(f.calls.length, 2);
});

test('invalidation starts a new check and a late old result cannot overwrite it', async () => {
  const f = fixture(); const old = f.runtime.probe();
  f.runtime.invalidateProbe(); const fresh = f.runtime.probe(true);
  assert.equal(f.calls.length, 2);
  f.calls[1].finish(denied, 1); assert.equal((await fresh).state, 'auth_required');
  f.calls[0].finish(available); await old;
  assert.equal((await f.runtime.probe()).state, 'auth_required');
  assert.equal(f.calls.length, 2);
});

test('an old completion cannot clear the replacement check while it is still running', async () => {
  const f = fixture(); const old = f.runtime.probe();
  f.runtime.invalidateProbe(); const fresh = f.runtime.probe();
  f.calls[0].finish(available); await old;
  const joined = f.runtime.probe(true);
  assert.equal(f.calls.length, 2);
  f.calls[1].finish(denied, 1);
  assert.equal((await fresh).state, 'auth_required');
  assert.equal((await joined).state, 'auth_required');
});

test('provider cache still expires after fifteen seconds and failures permit a fresh forced check', async () => {
  const f = fixture(); const first = f.runtime.probe(); f.calls[0].finish(available); await first;
  f.advance(14_999); await f.runtime.probe(); assert.equal(f.calls.length, 1);
  f.advance(1); const expired = f.runtime.probe(); assert.equal(f.calls.length, 2);
  f.calls[1].fail(); assert.equal((await expired).state, 'unavailable');
  const retry = f.runtime.probe(true); assert.equal(f.calls.length, 3);
  f.calls[2].finish(available); assert.equal((await retry).ok, true);
});

test('overlapping runtime views share helpers, preserve each model selection, and recheck local status next time', async () => {
  const f = fixture();
  const first = f.runtime.status({ model: 'one', effort: 'low' });
  const second = f.runtime.status({ model: 'two', effort: 'medium' });
  assert.deepEqual(f.calls.map(call => call.kind).sort(), ['probe', 'status']);
  f.calls.find(call => call.kind === 'probe').finish(available);
  f.calls.find(call => call.kind === 'status').finish({ ok: true, codexVersion: 'fixture' });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.selected.modelId, 'one'); assert.equal(b.selected.modelId, 'two');
  assert.equal(a.availability, 'ready'); assert.equal(b.availability, 'ready');
  const next = f.runtime.status({ model: 'one', effort: 'low' });
  assert.equal(f.calls.length, 3); assert.equal(f.calls[2].kind, 'status');
  f.calls[2].fail(); assert.equal((await next).availability, 'unavailable');
  const recovered = f.runtime.status({ model: 'one', effort: 'low' });
  assert.equal(f.calls.length, 4);
  f.calls[3].finish({ ok: true }); assert.equal((await recovered).availability, 'ready');
});

test('separate runtime instances never share checks or cached account observations', async () => {
  const a = fixture(), b = fixture(); const pa = a.runtime.probe(), pb = b.runtime.probe();
  a.calls[0].finish(available); b.calls[0].finish(denied, 1);
  assert.equal((await pa).state, 'available'); assert.equal((await pb).state, 'auth_required');
});
