import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
const url = (file) => pathToFileURL(path.resolve(file)).href;
async function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'voice-session-'));
  writeFileSync(
    path.join(dir, 'fixture.mjs'),
    `
 import {NeuralDeepCoordinationStore} from ${JSON.stringify(url('scripts/neuraldeep/coordination-store.mjs'))};
 export const store=new NeuralDeepCoordinationStore({databasePath:${JSON.stringify(path.join(dir, 'db.sqlite'))}});
 export const state={effects:[],requests:[],completions:[],tts:[],gate:null};
 export const getNeuralDeepAdmissionCoordinator=()=>({voiceJournal:()=>store.voiceJournal});
 export const resolvePrithaStateRoot=()=>${JSON.stringify(dir)};
 export const voiceRuntimeCredentials=()=>({instanceId:'fixture'});
 export const buildRealtimeInstructions=()=>"Use existing operator approvals. Fixture instructions.";
 export const getPrithaRuntimeSettings=()=>({neuraldeepVoice:{model:'qwen3.6-35b-a3b-noreason',sttModel:'whisper-1',voice:'serena',language:'auto'}});
 export const buildPrithaRealtimeTools=({musicControlEnabled=false}={})=>['run_codex_task','answer_codex_task','inspect_pritha_files',...(musicControlEnabled?['music_control']:[])].map(name=>({type:'function',name,description:name,parameters:{type:'object',properties:{task:{type:'string'}},required:['task']}}));
 export async function handlePrithaRealtimeTool(name,args,host){state.effects.push({name,args,host});if(state.gate)await state.gate;return {ok:true,task_id:host?.reservedTaskId||'existing-task',status:'queued'};}
 export async function voiceCompletion(identity,settings,messages,tools,final){state.requests.push({messages:structuredClone(messages),tools,final});identity.signal.throwIfAborted();return state.completions.shift()||{text:'Готово. Done.',calls:[]};}
 export async function voiceTranscribe(){return 'fixture transcription';}
 export async function voiceSynthesize(identity,settings,text){identity.signal.throwIfAborted();state.tts.push(text);const b=Buffer.alloc(44+9600);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(9600,40);return b;}
 `,
  );
  for (const name of ['tool-service', 'sessions']) {
    let source = ts.transpileModule(
      readFileSync(
        `interfaces/control-center/src/lib/voice/${name}.ts`,
        'utf8',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    source = source
      .replace(
        /(['"])ajv\1/g,
        JSON.stringify(
          url('interfaces/control-center/node_modules/ajv/dist/ajv.js'),
        ),
      )
      .replace(
        /(['"])@\/lib\/(?:realtime\/pritha-runtime|codex-chat\/admission-coordinator|pritha-paths)\1/g,
        "'./fixture.mjs'",
      )
      .replace(
        /(['"])\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/scripts\/neuraldeep\/voice-runtime-config.mjs\1/g,
        "'./fixture.mjs'",
      )
      .replace(
        /(['"])\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/scripts\/neuraldeep\/([^'"]+)\1/g,
        (_, q, file) => JSON.stringify(url(`scripts/neuraldeep/${file}`)),
      )
      .replace(/(['"])\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/scripts\/search\/([^'"]+)\1/g, (_, q, file) => JSON.stringify(url(`scripts/search/${file}`)))
      .replace(/(['"])\.\/tool-service\1/g, "'./tool-service.mjs'")
      .replace(/(['"])\.\/provider\1/g, "'./fixture.mjs'");
    writeFileSync(path.join(dir, `${name}.mjs`), source);
  }
  const f = await import(pathToFileURL(path.join(dir, 'fixture.mjs')).href),
    sessions = await import(pathToFileURL(path.join(dir, 'sessions.mjs')).href),
    s = sessions.createVoiceSession('owner');
  t.after(() => {
    sessions.closeVoiceSession(s);
    f.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { ...f, ...sessions, s };
}
function terminal(s) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('turn did not finish')),
      3000,
    );
    const listener = (e) => {
      if (['turn.completed', 'turn.error'].includes(e.type)) {
        clearTimeout(timer);
        s.listeners.delete(listener);
        resolve(e);
      }
    };
    s.listeners.add(listener);
  });
}
const call = (name = 'run_codex_task', args = { task: 'synthetic task' }) => ({
  id: 'call_1',
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
test('pure conversation uses one completion, does not invoke tools and preserves session context', async (t) => {
  const f = await fixture(t);
  f.updateVoiceContext(f.s, { text: 'Sticky: synthetic context' });
  const done = terminal(f.s);
  f.acceptVoiceTurn(f.s, { clientTurnId: 'turn', text: 'Hello' });
  assert.equal((await done).type, 'turn.completed');
  assert.equal(f.state.requests.length, 1);
  assert.equal(f.state.effects.length, 0);
  assert.ok(f.state.tts.length);
  assert.match(JSON.stringify(f.state.requests[0].messages), /Sticky/);
  assert.equal(
    f.acceptVoiceTurn(f.s, { clientTurnId: 'turn', text: 'Hello' }).duplicate,
    true,
  );
  assert.equal(f.state.requests.length, 1);
  assert.throws(
    () => f.acceptVoiceTurn(f.s, { clientTurnId: 'turn', text: 'Changed' }),
    /conflict/,
  );
});
test('server tools reserve task identity before effects and common result reaches cards once', async (t) => {
  const f = await fixture(t);
  f.state.completions.push({ text: 'provisional claim', calls: [call()] });
  const done = terminal(f.s);
  f.acceptVoiceTurn(f.s, {
    clientTurnId: 'turn',
    text: 'Create synthetic task',
  });
  await done;
  assert.equal(f.state.effects.length, 1);
  assert.ok(f.state.effects[0].host.reservedTaskId);
  assert.equal(f.s.events.filter((e) => e.type === 'tool.result').length, 1);
  assert.doesNotMatch(f.state.tts.join(' '), /provisional claim/);
  assert.equal(f.state.requests.length, 2);
  const receipt = f.store.db.prepare('SELECT * FROM voice_operations').get();
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.task_id, f.state.effects[0].host.reservedTaskId);
});
test('invalid later tool arguments reject the whole batch before any mutation', async (t) => {
  const f = await fixture(t);
  f.state.completions.push({
    text: '',
    calls: [
      call(),
      {
        ...call('answer_codex_task'),
        id: 'call_2',
        function: { name: 'answer_codex_task', arguments: '{broken' },
      },
    ],
  });
  const done = terminal(f.s);
  f.acceptVoiceTurn(f.s, { clientTurnId: 'turn', text: 'fixture' });
  assert.equal((await done).type, 'turn.error');
  assert.equal(f.state.effects.length, 0);
  assert.equal(f.state.tts.length, 0);
});

test('a model repeating the same task in a later planning step gets its original receipt', async (t) => {
  const f = await fixture(t);
  f.state.completions.push({text:'',calls:[call()]},{text:'',calls:[call()]});
  const done=terminal(f.s);
  f.acceptVoiceTurn(f.s,{clientTurnId:'turn',text:'Create one synthetic task'});
  await done;
  assert.equal(f.state.effects.length,1);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM voice_operations').get().n,1);
  const ids=f.s.events.filter(e=>e.type==='tool.result').map(e=>e.operationId);
  assert.equal(new Set(ids).size,1);
});
test('barge-in cancels speech generation while an already accepted task completes its receipt', async (t) => {
  const f = await fixture(t);
  let release;
  f.state.gate = new Promise((resolve) => (release = resolve));
  f.state.completions.push({ text: '', calls: [call()] });
  f.acceptVoiceTurn(f.s, { clientTurnId: 'turn', text: 'fixture' });
  while (!f.state.effects.length) await new Promise((r) => setImmediate(r));
  f.interruptVoiceSession(f.s);
  release();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.equal(f.state.effects.length, 1);
  assert.equal(f.state.tts.length, 0);
  assert.equal(f.s.events.filter((e) => e.type === 'tool.result').length, 1);
  assert.equal(f.store.voiceJournal.turn(f.s.id, 'turn').status, 'interrupted');
  assert.equal(
    f.store.db.prepare('SELECT status FROM voice_operations').get().status,
    'completed',
  );
});
test('browser tool result is correlated and persisted before the model continues', async (t) => {
  const f = await fixture(t);
  f.updateVoiceContext(f.s, { musicControlEnabled: true });
  f.state.completions.push({ text: '', calls: [call('music_control')] });
  f.s.listeners.add((e) => {
    if (e.type === 'tool.browser_request')
      f.completeBrowserTool(f.s, e.operationId, { ok: true });
  });
  const done = terminal(f.s);
  f.acceptVoiceTurn(f.s, { clientTurnId: 'turn', text: 'fixture' });
  await done;
  assert.equal(f.state.effects.length, 0);
  assert.equal(
    f.store.db.prepare('SELECT status FROM voice_operations').get().status,
    'completed',
  );
  assert.throws(
    () => f.completeBrowserTool(f.s, 'wrong-operation', { ok: true }),
    /stale/,
  );
});
test('session ownership, bounded replay and context reset keep other clients isolated', async (t) => {
  const f = await fixture(t);
  assert.throws(
    () => f.getVoiceSession(f.s.id, 'another-owner'),
    /unavailable/,
  );
  for (let i = 0; i < 600; i++) f.emit(f.s, 'fixture', { index: i });
  assert.equal(f.s.events.length, 512);
  f.updateVoiceContext(f.s, { text: 'Private fixture' });
  f.updateVoiceContext(f.s, { reset: true });
  assert.deepEqual(f.s.context, []);
  assert.throws(
    () => f.updateVoiceContext(f.s, { text: 'x'.repeat(3501) }),
    /limit/,
  );
});
