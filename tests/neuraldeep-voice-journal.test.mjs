import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NeuralDeepCoordinationStore,
  coordinationHash,
} from '../scripts/neuraldeep/coordination-store.mjs';
import { NeuralDeepCoordinationStore as V3 } from './fixtures/neuraldeep/admission-v3.mjs';
import {
  NeuralDeepVoiceJournal,
  voiceRequestHash,
  voiceOperationId,
} from '../scripts/neuraldeep/voice-journal.mjs';
function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'voice-journal-')),
    databasePath = path.join(directory, 'db.sqlite');
  const a = new NeuralDeepCoordinationStore({ databasePath }),
    b = new NeuralDeepCoordinationStore({ databasePath });
  t.after(() => {
    a.close();
    b.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    a,
    b,
    j: new NeuralDeepVoiceJournal(a),
    other: new NeuralDeepVoiceJournal(b),
    databasePath,
  };
}
test('retry after lost task acknowledgement returns one durable task identity', (t) => {
  const { j, other } = fixture(t),
    input = {
      id: voiceOperationId('session', 'turn', 0, 0),
      sessionId: 'session',
      turnId: 'turn',
      name: 'run_codex_task',
      args: { task: 'fixture' },
    };
  const first = j.reserveOperation(input);
  assert.equal(first.dispatch, true);
  assert.ok(first.task_id);
  const duplicate = other.reserveOperation(input);
  assert.equal(duplicate.dispatch, false);
  assert.equal(duplicate.task_id, first.task_id);
  j.finishOperation(input.id, { ok: true, task_id: first.task_id });
  assert.deepEqual(other.reserveOperation(input).result, {
    ok: true,
    task_id: first.task_id,
  });
  assert.throws(
    () => other.reserveOperation({ ...input, args: { task: 'different' } }),
    /conflict/,
  );
  assert.throws(
    () => other.finishOperation(input.id, { ok: true, task_id: 'other' }),
    /conflict/,
  );
});
test('same turn cannot execute twice and conflicting audio/text is rejected', (t) => {
  const { j, other } = fixture(t),
    hash = voiceRequestHash({ text: 'test' });
  assert.equal(j.reserveTurn('session', 'turn', hash).dispatch, true);
  assert.equal(other.reserveTurn('session', 'turn', hash).dispatch, false);
  assert.throws(
    () =>
      other.reserveTurn('session', 'turn', voiceRequestHash({ text: 'new' })),
    /conflict/,
  );
  j.finishTurn('session', 'turn', 'interrupted');
  j.finishTurn('session', 'turn', 'completed');
  assert.equal(j.turn('session', 'turn').status, 'interrupted');
});
test('provider dispatch is journaled once and an unknown result is not retried', (t) => {
  const { j, other } = fixture(t),
    input = {
      id: 'request',
      sessionId: 'session',
      turnId: 'turn',
      kind: 'llm',
      requestHash: voiceRequestHash('fixture'),
    };
  j.claimRequest(input);
  assert.throws(() => other.claimRequest(input), /replay_blocked/);
  j.finishRequest('request', 'interrupted', { usageKnown: false }, true);
  assert.equal(j.pendingAccounting().length, 1);
  j.accounted('request');
  assert.equal(j.pendingAccounting().length, 0);
  assert.equal(j.request('request').status, 'interrupted');
});
test('voice dialogue uses capacity without a native owner, barrier or resource lock', (t) => {
  const { a } = fixture(t),
    scope = coordinationHash('conversation');
  a.enqueue({
    attemptId: 'dialogue',
    workloadId: 'turn',
    surface: 'voice_dialogue',
    coordinationKeyHash: scope,
    queuedAt: new Date().toISOString(),
  });
  const lease = a.claim('dialogue', 1);
  assert.ok(lease);
  assert.equal(a.logicalOwner(scope), null);
  assert.equal(
    a.db.prepare('SELECT count(*) AS n FROM runtime_owners').get().n,
    0,
  );
  a.finish('dialogue', lease.ownerToken, 'completed');
});
test('schema v4 preserves v3 owners and rejects a rollback writer unaware of voice receipts', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'voice-migrate-')),
    databasePath = path.join(dir, 'db.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const old = new V3({ databasePath }),
    scope = coordinationHash('existing');
  old.holdLogicalOwner(scope, 'task');
  const owner = old.logicalOwner(scope);
  old.close();
  const next = new NeuralDeepCoordinationStore({ databasePath });
  assert.deepEqual(next.logicalOwner(scope), owner);
  next.close();
  assert.throws(
    () => new V3({ databasePath }),
    /schema_unsupported|database is not open/,
  ); // Frozen v3 masks its rejection with a double-close; neither error permits writes.
});

test('dead HTTP workers release capacity without fabricating a CLI owner or replaying their requests', (t) => {
  const {a,j}=fixture(t),scope=coordinationHash('http');
  a.enqueue({attemptId:'http_request',workloadId:'turn',surface:'voice_dialogue',coordinationKeyHash:scope,queuedAt:new Date().toISOString()});
  a.claim('http_request',1);
  j.claimRequest({id:'http_request',sessionId:'session',turnId:'turn',kind:'llm',requestHash:voiceRequestHash('fixture'),metadata:{workerPid:2147483647}});
  j.reserveTurn('session','turn',voiceRequestHash('fixture'));
  j.reserveOperation({id:'op',sessionId:'session',turnId:'turn',name:'run_codex_task',args:{task:'synthetic'}});
  a.db.prepare('UPDATE attempts SET worker_pid=?').run(2147483647);
  a.db.prepare('UPDATE voice_turns SET worker_pid=?').run(2147483647);
  a.db.prepare('UPDATE voice_operations SET worker_pid=?').run(2147483647);
  a.reconcileDeadWorkers();
  assert.equal(a.get('http_request').status,'cancelled');
  assert.equal(j.request('http_request').status,'interrupted');
  assert.equal(j.operation('op').status,'recovery_required');
  assert.equal(j.turn('session','turn').status,'interrupted');
  assert.equal(a.db.prepare('SELECT count(*) n FROM paused_scopes').get().n,0);
  assert.equal(a.db.prepare('SELECT count(*) n FROM runtime_owners').get().n,0);
  assert.throws(()=>j.claimRequest({id:'http_request',sessionId:'session',turnId:'turn',kind:'llm',requestHash:voiceRequestHash('fixture')}),/replay_blocked/);
});

test('dialogue admission cannot claim a native session or bypass a paused topic', (t) => {
  const {a}=fixture(t),scope=coordinationHash('scope');
  const input={attemptId:'dialogue',workloadId:'turn',surface:'voice_dialogue',coordinationKeyHash:scope,queuedAt:new Date().toISOString()};
  for(const extra of [{sessionKeyHash:scope},{resumePausedKey:true},{predecessorPriority:true}])assert.throws(()=>a.enqueue({...input,...extra}),/dialogue_scope_invalid/);
  a.enqueue(input);const lease=a.claim('dialogue',1);
  assert.throws(()=>a.bindSession('dialogue',lease.ownerToken,scope),/dialogue_scope_invalid/);
});
