import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { NeuralDeepCoordinationStore, coordinationHash } from "../scripts/neuraldeep/coordination-store.mjs";
const execute = promisify(execFile);
const moduleUrl = pathToFileURL(path.resolve("scripts/neuraldeep/coordination-store.mjs")).href;
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "nd-coordination-"));
  const databasePath = path.join(root, "coordination.sqlite");
  const stores = [];
  t.after(() => { for (const store of stores) store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, databasePath, store: options => { const store = new NeuralDeepCoordinationStore({ databasePath, ...options }); stores.push(store); return store; } };
}
const intent = (id, scope = id, workload = id) => ({ attemptId: id, surface: "task_chat", workloadId: workload,
  coordinationKeyHash: coordinationHash(scope), queuedAt: new Date().toISOString(), payload: { message: `synthetic ${id}` } });

test("two stores share capacity, FIFO, durable idempotency and immutable intent", t => {
  const f = fixture(t); const a = f.store(); const b = f.store();
  a.enqueue(intent("a", "shared")); b.enqueue(intent("b", "shared"));
  const lease = a.claim("a", 2);
  assert.ok(lease.ownerToken); assert.equal(b.claim("b", 2), null);
  assert.equal(b.enqueue(intent("a", "shared")).duplicate, true);
  assert.throws(() => b.enqueue({ ...intent("a", "shared"), payload: { message: "changed" } }), /conflict/);
  assert.equal(b.finish("a", "stale-owner"), false);
  assert.equal(a.finish("a", lease.ownerToken), true);
  assert.ok(b.claim("b", 1));
  assert.equal(a.claim("a", 2), null, "completed attempt cannot be dispatched again");
});

test("two Node processes cannot both claim a one-slot provider account", async t => {
  const f = fixture(t); const store = f.store();
  const code = `import { NeuralDeepCoordinationStore, coordinationHash } from ${JSON.stringify(moduleUrl)};
    const [databasePath,id] = process.argv.slice(1);
    const store = new NeuralDeepCoordinationStore({databasePath});
    store.enqueue({attemptId:id,surface:'voice',workloadId:id,coordinationKeyHash:coordinationHash(id),queuedAt:new Date().toISOString()});
    const lease=store.claim(id,1); console.log(JSON.stringify({claimed:Boolean(lease),id})); store.close();`;
  const results = await Promise.all(["worker_a", "worker_b"].map(id => execute(process.execPath,
    ["--input-type=module", "-e", code, f.databasePath, id], { timeout: 10_000, killSignal: "SIGKILL" })));
  assert.equal(results.map(r => JSON.parse(r.stdout)).filter(r => r.claimed).length, 1);
  assert.equal(store.snapshot().active.length, 1, "process exit does not discard the unfinished attempt");
  assert.equal(store.snapshot().queued.length, 1);
});

test("corrupt legacy data remains intact and never becomes an empty usable ledger", t => {
  const f = fixture(t); const legacyPath = path.join(f.root, "legacy.json");
  const original = '{"version":1,"attempts":[';
  writeFileSync(legacyPath, original);
  for (let n = 0; n < 2; n++) assert.throws(() => new NeuralDeepCoordinationStore({ databasePath: f.databasePath, legacyPath }), /admission_registry_invalid/);
  assert.equal(readFileSync(legacyPath, "utf8"), original);
});

test("legacy migration retains every unfinished receipt beyond the former 500-record window", t => {
  const f = fixture(t); const legacyPath = path.join(f.root, "legacy.json");
  const attempts = Array.from({ length: 602 }, (_, n) => ({ ...intent(`legacy_${n}`), status: n === 0 ? "active" : n === 601 ? "queued" : "completed", admittedAt: null, finishedAt: null }));
  writeFileSync(legacyPath, JSON.stringify({ version: 1, attempts }));
  const store = f.store({ legacyPath });
  assert.equal(store.get("legacy_0").status, "resume_confirmation_required");
  assert.equal(store.get("legacy_601").status, "resume_confirmation_required");
  assert.equal(store.get("legacy_1").status, "completed");
  store.enqueue(intent("new")); assert.equal(store.claim("new", 1), null);
  assert.throws(() => store.reconcileWorkload("legacy_0"), /exit_unconfirmed/);
  assert.throws(() => store.reconcileWorkload("legacy_601"), /exit_unconfirmed/);
  assert.equal(store.claim("new",1),null,"legacy unknown work cannot be discarded by a caller-supplied boolean");
});

test("permanent idempotency survives journal projection compaction", t => {
  const f = fixture(t); const store = f.store();
  for (let i = 0; i < 510; i++) {
    const id = `done_${i}`; store.enqueue(intent(id)); const lease = store.claim(id, 1); store.finish(id, lease.ownerToken);
  }
  assert.equal(store.journal().attempts.length, 500);
  assert.equal(store.enqueue(intent("done_0")).duplicate, true);
  assert.equal(store.claim("done_0", 1), null);
});

test("logical ownership survives slot release and stale generations cannot release its successor", t => {
  const f = fixture(t); const store = f.store(); const scope = coordinationHash("voice-topic");
  const first = store.holdLogicalOwner(scope, "voice-workflow");
  store.enqueue(intent("voice_step", "voice-topic", "voice-workflow"));
  const lease = store.claim("voice_step", 2); store.finish("voice_step", lease.ownerToken);
  store.enqueue(intent("typed", "voice-topic", "typed-workflow"));
  assert.equal(store.claim("typed", 2), null);
  assert.equal(store.releaseLogicalOwner(scope, "voice-workflow", first.generation), true);
  const second = store.holdLogicalOwner(scope, "voice-workflow");
  assert.ok(second.generation > first.generation);
  assert.equal(store.releaseLogicalOwner(scope, "voice-workflow", first.generation), false);
  assert.equal(store.claim("typed", 2), null);
});

test("different bindings cannot own the same native session simultaneously", t => {
  const f = fixture(t); const a = f.store(); const b = f.store();
  a.enqueue(intent("alias_a")); b.enqueue(intent("alias_b"));
  const la = a.claim("alias_a", 2); const lb = b.claim("alias_b", 2);
  a.bindSession("alias_a", la.ownerToken, coordinationHash("profile:session"));
  assert.throws(() => b.bindSession("alias_b", lb.ownerToken, coordinationHash("profile:session")), /session_conflict/);
  assert.doesNotThrow(() => b.bindSession("alias_b", lb.ownerToken, coordinationHash("other-profile:session")));
});

test("symlinked database cannot redirect private coordination writes", t => {
  const f = fixture(t); const target = path.join(f.root, "target"); writeFileSync(target, "preserve");
  symlinkSync(target, f.databasePath);
  assert.throws(() => new NeuralDeepCoordinationStore({ databasePath: f.databasePath }), /storage_identity/);
  assert.equal(readFileSync(target, "utf8"), "preserve");
});

test("only the live owner can requeue an unstarted provider wait; runtime dispatch and operator pause forbid it", t => {
  const f=fixture(t),store=f.store(),other=f.store();
  store.enqueue(intent("wait","shared"));const first=store.claim("wait",2);store.finish("wait",first.ownerToken,"waiting_for_provider");
  assert.throws(()=>other.requeueUnstarted("wait",first.ownerToken),/conflict/);
  store.pause(first.coordinationKeyHash,"waiting_for_operator");assert.throws(()=>store.requeueUnstarted("wait",first.ownerToken),/conflict/);
  store.resume(first.coordinationKeyHash);store.requeueUnstarted("wait",first.ownerToken);const resumed=store.claim("wait",2);
  store.beginRuntimeRun({runId:"fixture-runtime",requestHash:"a".repeat(64),receipt:{worker_pid:process.pid}});
  store.attachRuntime("wait",resumed.ownerToken,"fixture-runtime");
  assert.throws(()=>store.finish("wait",resumed.ownerToken,"waiting_for_provider"),/wait_after_runtime_dispatch/);
  assert.equal(store.get("wait").status,"active");assert.equal(store.cancelUnstarted("wait",resumed.ownerToken),false);
});

test("known session aliases wait before claiming a compute slot and preserve profile isolation", t => {
  const f=fixture(t),a=f.store(),b=f.store(),sessionKeyHash=coordinationHash("profile:shared-session");
  a.enqueue({...intent("known_a"),sessionKeyHash});b.enqueue({...intent("known_b"),sessionKeyHash});
  const first=a.claim("known_a",3);assert.ok(first);assert.equal(b.claim("known_b",3),null);
  b.enqueue({...intent("other_profile"),sessionKeyHash:coordinationHash("other-profile:shared-session")});
  const other=b.claim("other_profile",3);assert.ok(other);assert.equal(a.snapshot().active.length,2);
  a.finish("known_a",first.ownerToken);assert.ok(b.claim("known_b",3));
  assert.throws(()=>b.bindSession("known_b",b.get("known_b").ownerToken,coordinationHash("changed-session")),/identity_changed/);
});

test("Voice logical owner spans questions and native aliases; explicit continuation advances its generation", t => {
  const f=fixture(t),store=f.store(),sessionKeyHash=coordinationHash("voice-native"),topic=coordinationHash("topic");
  const voice=id=>({...intent(id,"topic","voice_task"),surface:"voice",sessionKeyHash});
  store.enqueue(voice("voice_first"));const first=store.claim("voice_first",3);assert.ok(first);
  store.finish("voice_first",first.ownerToken,"waiting_for_operator");
  store.enqueue({...intent("typed_alias"),sessionKeyHash});assert.equal(store.claim("typed_alias",3),null);
  store.enqueue({...intent("later_voice","topic","another_task"),surface:"voice",sessionKeyHash});
  assert.throws(()=>store.enqueue({...intent("steal_resume","topic","another_task"),surface:"voice",sessionKeyHash,resumePausedKey:true}),/owner_conflict/);
  const old=store.holdLogicalOwner(topic,"voice_task");
  store.enqueue({...voice("voice_answer"),resumePausedKey:true});const answer=store.claim("voice_answer",3);assert.ok(answer);
  assert.equal(store.releaseLogicalOwner(topic,"voice_task",old.generation),false);
  assert.equal(store.claim("typed_alias",3),null);assert.equal(store.finish("voice_first",first.ownerToken),false);
  store.finish("voice_answer",answer.ownerToken,"completed");assert.ok(store.claim("typed_alias",3));
});

test("Voice first-session binding holds native ownership across a released compute slot", t=>{
  const f=fixture(t),store=f.store(),sessionKeyHash=coordinationHash("discovered-session");
  store.enqueue({...intent("voice_new","topic","voice_task"),surface:"voice"});const lease=store.claim("voice_new",2);
  store.bindSession("voice_new",lease.ownerToken,sessionKeyHash);store.finish("voice_new",lease.ownerToken,"waiting_for_operator");
  store.enqueue({...intent("alias_later"),sessionKeyHash});store.resume(sessionKeyHash);
  assert.equal(store.claim("alias_later",2),null,"clearing an incidental pause does not release Voice ownership");
});

test("recovery refuses an attached runtime without confirmed exit and keeps unknown usage", t=>{
  const f=fixture(t),store=f.store();store.enqueue(intent("unknown_runtime"));const lease=store.claim("unknown_runtime",2);
  store.beginRuntimeRun({runId:"unknown_run",requestHash:"c".repeat(64),receipt:{worker_pid:process.pid,usage_status:"unknown"}});
  store.attachRuntime("unknown_runtime",lease.ownerToken,"unknown_run");
  assert.throws(()=>store.finish("unknown_runtime",lease.ownerToken,"failed"),/exit_unconfirmed/);
  assert.equal(store.get("unknown_runtime").status,"resume_confirmation_required");
  assert.throws(()=>store.reconcileWorkload("unknown_runtime"),/exit_unconfirmed/);
  assert.equal(store.runtimeRun("unknown_run").usage_status,"unknown");
  store.updateRuntimeRun("unknown_run",{process_exited:true,status:"failed"});
  assert.equal(store.reconcileWorkload("unknown_runtime"),1);assert.equal(store.runtimeRun("unknown_run").usage_status,"unknown");
});

test("cancelling a stopped Voice question releases only its logical owner and associated pauses",t=>{
  const f=fixture(t),store=f.store(),sessionKeyHash=coordinationHash("question-native");
  store.enqueue({...intent("question","topic","voice_question"),surface:"voice",sessionKeyHash});const lease=store.claim("question",2);
  store.finish("question",lease.ownerToken,"waiting_for_operator");store.enqueue({...intent("next_voice","topic","next_task"),surface:"voice",sessionKeyHash});
  store.pause(coordinationHash("unrelated"),"waiting_for_operator");assert.equal(store.claim("next_voice",2),null);
  store.reconcileWorkload("voice_question","cancelled");assert.ok(store.claim("next_voice",2));
  assert.ok(store.snapshot().pausedCoordinationKeyHashes.includes(coordinationHash("unrelated")));
});

test('stopped direct chat frees workspace and capacity for a new message without replay', t => {
  const store=fixture(t).store();
  const resources=[{kind:'path',key:'/tmp/brief-workspace',mode:'write'}];
  store.enqueue({...intent('stopped','chat','old-turn'),resources});
  const lease=store.claim('stopped',1);
  store.beginRuntimeRun({runId:'stopped_run',requestHash:'a'.repeat(64),receipt:{process_protocol:1,process_exited:true,process_tree_exited:true,adapter_closed:true}});
  store.attachRuntime('stopped',lease.ownerToken,'stopped_run');
  store.finish('stopped',lease.ownerToken,'failed');
  store.enqueue({...intent('next','chat','next-turn'),resources});
  assert.equal(store.claim('next',1),null);
  assert.equal(store.reconcileStoppedTaskChats(),1);
  assert.equal(store.resourceWaitReason('next'),null);
  assert.ok(store.claim('next',1));
  assert.equal(store.claim('stopped',1),null);
  assert.equal(store.runtimeRun('stopped_run').usage_status,'unknown');
  assert.equal(store.reconcileStoppedTaskChats(),0);
});

test('cleanup keeps unconfirmed process trees, operator holds, voice and missing receipts',t=>{
  const store=fixture(t).store();
  for(const id of ['unknown','operator','voice','missing']) {
    store.enqueue({...intent(id),surface:id==='voice'?'voice':'task_chat'});
    const lease=store.claim(id,64);
    if(id!=='missing') {
      store.beginRuntimeRun({runId:`run_${id}`,requestHash:'b'.repeat(64),receipt:{process_protocol:1,process_exited:true,process_tree_exited:id!=='unknown',adapter_closed:true}});
      store.attachRuntime(id,lease.ownerToken,`run_${id}`);
    }
    if(id==='unknown') assert.throws(()=>store.finish(id,lease.ownerToken,'failed'),/exit_unconfirmed/);
    else store.finish(id,lease.ownerToken,'failed');
    if(id==='operator')store.pause(coordinationHash(id),'waiting_for_approval');
  }
  assert.equal(store.reconcileStoppedTaskChats(),0);
  assert.equal(store.get('unknown').status,'resume_confirmation_required');
  assert.equal(store.get('voice').status,'failed');
});
