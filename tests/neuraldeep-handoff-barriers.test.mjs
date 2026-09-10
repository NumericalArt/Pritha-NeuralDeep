import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { NeuralDeepCoordinationStore, coordinationHash } from "../scripts/neuraldeep/coordination-store.mjs";
import { NeuralDeepCoordinationStore as OldWriter } from "./fixtures/neuraldeep/admission-v1.mjs";
import { NeuralDeepCoordinationStore as BarrierWriter } from "./fixtures/neuraldeep/admission-v2.mjs";

const topic = coordinationHash("voice-topic"), session = coordinationHash("native-session"), now = "2026-09-08T00:00:00.000Z";
function fixture(t) {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(),"nd-handoff-"))), databasePath = path.join(directory,"admission.sqlite");
  const a = new NeuralDeepCoordinationStore({databasePath,workerId:"worker-a"}), b = new NeuralDeepCoordinationStore({databasePath,workerId:"worker-b"});
  t.after(()=>{a.close();b.close();rmSync(directory,{recursive:true,force:true});});
  const q = (id,surface="voice",extra={}) => a.enqueue({attemptId:id,workloadId:id,surface,coordinationKeyHash:topic,sessionKeyHash:session,queuedAt:now,...extra});
  const input = {id:"handoff-typed",owner:"typed",topicScope:topic,sessionScope:session,predecessors:["voice-a","voice-b"],context:{chatId:"chat_voice",topicGeneration:1,payloadHash:"a".repeat(64)}};
  return {a,b,q,input,directory,databasePath};
}

test("captured Voice workflows finish before typed handoff, and future Voice priority cannot overtake it",t=>{
  const f=fixture(t);f.q("voice-a");const first=f.a.claim("voice-a",3);assert.ok(first);
  const barrier=f.b.handoffs.reserve(f.input);
  f.q("typed","task_chat");f.q("voice-future","voice",{predecessorPriority:true});f.q("voice-b");
  assert.equal(f.a.claim("typed",3),null);assert.equal(f.a.claim("voice-future",3),null);assert.equal(f.a.claim("voice-b",3),null);
  assert.equal(f.b.acquireSessionControl(session,"host-card"),false);
  assert.equal(f.a.finish("voice-a",first.ownerToken,"waiting_for_operator"),true);
  assert.throws(()=>f.b.handoffs.ready(barrier.id,barrier.requestHash),/predecessor_unconfirmed/);
  f.q("voice-a-answer","voice",{workloadId:"voice-a",resumePausedKey:true,predecessorPriority:true});
  const answer=f.a.claim("voice-a-answer",3);assert.ok(answer);assert.equal(f.a.finish("voice-a",first.ownerToken,"completed"),false);
  f.a.finish(answer.attemptId,answer.ownerToken,"completed");
  const second=f.a.claim("voice-b",3);assert.ok(second,"Captured workflow may enter admission after the typed intent");
  f.a.finish(second.attemptId,second.ownerToken,"completed");
  assert.equal(f.a.claim("typed",3),null,"History/topic boundary still needs confirmation");
  assert.equal(f.b.handoffs.ready(barrier.id,barrier.requestHash).state,"ready");
  const generation=f.a.logicalOwner(session).generation;
  f.a.handoffs.ready(barrier.id,barrier.requestHash);assert.equal(f.a.logicalOwner(session).generation,generation);
  const typed=f.a.claim("typed",3);assert.ok(typed);assert.equal(f.a.claim("voice-future",3),null);
  assert.throws(()=>f.b.handoffs.cancel(barrier.id,barrier.requestHash),/execution_unconfirmed/);
  f.a.finish(typed.attemptId,typed.ownerToken,"completed");
  assert.equal(f.b.handoffs.get(barrier.id).state,"finished");assert.ok(f.a.claim("voice-future",3));
});

test("barrier receipts survive another store, failed predecessors, cancellation and idempotent replay",t=>{
  const f=fixture(t);f.q("voice-a");const first=f.a.claim("voice-a",3);
  const barrier=f.a.handoffs.reserve(f.input);
  assert.deepEqual(f.b.handoffs.reserve(f.input),barrier);
  assert.throws(()=>f.b.handoffs.reserve({...f.input,context:{changed:true}}),/idempotency_conflict/);
  assert.throws(()=>f.b.handoffs.reserve({...f.input,id:"other-handoff"}),/scope_busy/);
  assert.equal(f.b.handoffs.get("other-handoff"),null);
  f.q("typed","task_chat");f.q("voice-future","voice",{predecessorPriority:true});
  f.a.finish(first.attemptId,first.ownerToken,"failed");
  assert.throws(()=>f.b.handoffs.ready(barrier.id,barrier.requestHash),/predecessor_unconfirmed/);
  assert.equal(f.a.claim("voice-future",3),null);
  assert.equal(f.a.cancelQueued("typed"),true);
  assert.equal(f.b.handoffs.get(barrier.id).state,"cancelled");
  assert.equal(f.b.handoffs.reserve(f.input).state,"cancelled","The old consent cannot be reactivated");
  assert.equal(f.a.claim("voice-future",3),null,"Cancelling typed input does not resolve a failed Voice predecessor");
});

test("a later native session event binds all aliases to the same handoff",t=>{
  const f=fixture(t);f.q("voice-a","voice",{sessionKeyHash:null});const voice=f.a.claim("voice-a",3);
  const input={...f.input,sessionScope:null,predecessors:["voice-a"]},barrier=f.a.handoffs.reserve(input);
  f.a.bindSession(voice.attemptId,voice.ownerToken,session);
  assert.equal(f.b.handoffs.get(barrier.id).sessionScope,session);
  f.q("alias","task_chat",{coordinationKeyHash:coordinationHash("alias")});
  assert.equal(f.a.claim("alias",3),null);
  assert.throws(()=>f.b.handoffs.reserve({...f.input,id:"alias-handoff",topicScope:coordinationHash("alias")}),/scope_busy/);
  assert.throws(()=>f.a.bindSession(voice.attemptId,voice.ownerToken,coordinationHash("other-session")),/identity_changed/);
  f.a.finish(voice.attemptId,voice.ownerToken,"completed");
  f.b.handoffs.ready(barrier.id,barrier.requestHash);f.q("typed","task_chat");
  const typed=f.a.claim("typed",3);assert.ok(typed);f.a.finish(typed.attemptId,typed.ownerToken,"failed");
  assert.equal(f.b.handoffs.get(barrier.id).state,"ready");assert.equal(f.a.claim("alias",3),null);
  f.a.reconcileWorkload("typed","cancelled");assert.equal(f.b.handoffs.get(barrier.id).state,"cancelled");
});

test("two Node processes reserve one topic exactly once",async t=>{
  const f=fixture(t),worker=path.join(f.directory,"worker.mjs");
  writeFileSync(worker,`import {NeuralDeepCoordinationStore} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/coordination-store.mjs")).href)};
const s=new NeuralDeepCoordinationStore({databasePath:process.argv[2]});try {s.handoffs.reserve({...JSON.parse(process.argv[3]),id:process.argv[4],owner:process.argv[4]});process.stdout.write("reserved");}catch(e){process.stdout.write(e.message);}finally{s.close();}`);
  const results=await Promise.all(["race-a","race-b"].map(id=>promisify(execFile)(process.execPath,[worker,f.databasePath,JSON.stringify(f.input),id],{timeout:10000,killSignal:"SIGKILL",maxBuffer:4096})));
  assert.deepEqual(results.map(r=>r.stdout).sort(),["handoff_scope_busy","reserved"]);
});

test("coordination v4 migrates v1 and a pre-barrier writer refuses the new schema",async t=>{
  const f=fixture(t);f.a.db.exec("PRAGMA user_version=1");
  const migrated=new NeuralDeepCoordinationStore({databasePath:f.databasePath});
  assert.equal(migrated.db.prepare("PRAGMA user_version").get().user_version,4);migrated.close();
  assert.throws(()=>new OldWriter({databasePath:f.databasePath}),/schema_unsupported/);
  assert.equal(f.a.db.prepare("PRAGMA user_version").get().user_version,4);
});

test("v2 barrier receipts survive v4 migration and a host-unaware v2 writer refuses the result",t=>{
  const f=fixture(t),databasePath=path.join(f.directory,'previous-v2.sqlite');
  const old=new BarrierWriter({databasePath});const barrier=old.handoffs.reserve(f.input);old.close();
  const migrated=new NeuralDeepCoordinationStore({databasePath});
  assert.deepEqual(migrated.handoffs.get(barrier.id),barrier);assert.equal(migrated.db.prepare('PRAGMA user_version').get().user_version,4);migrated.close();
  assert.throws(()=>new BarrierWriter({databasePath}),/schema_unsupported/);
});
