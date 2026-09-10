import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireNeuralDeepReleaseLock } from "../scripts/neuraldeep/release-maintenance.mjs";
import { backupNeuralDeepReleaseState, inspectNeuralDeepReleaseState } from "../scripts/neuraldeep/release-state.mjs";
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "../scripts/neuraldeep/coordination-store.mjs";
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "nd-release-state-")); t.after(() => rmSync(root,{recursive:true,force:true}));
  const stateRoot = path.join(root,"state"), codeRoot = path.join(root,"code"), codexHome = path.join(stateRoot,"home");
  mkdirSync(codexHome,{recursive:true}); const owner=randomUUID(); acquireNeuralDeepReleaseLock(stateRoot,owner);
  return {stateRoot,codeRoot,codexHome,owner,destination:path.join(stateRoot,"releases/snapshot")};
}
test("consistent release snapshot includes committed WAL data and native history without credentials", async t => {
  const f=fixture(t), store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(f.stateRoot,f.codeRoot));t.after(()=>store.close());
  const db=new DatabaseSync(path.join(f.stateRoot,"usage.sqlite"));t.after(()=>db.close());
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE usage(n); INSERT INTO usage VALUES(42)");
  mkdirSync(path.join(f.codexHome,"sessions"));writeFileSync(path.join(f.codexHome,"sessions/history.jsonl"),"synthetic history\n");writeFileSync(path.join(f.codexHome,"auth.json"),"synthetic credential excluded");
  const result=await backupNeuralDeepReleaseState(f);assert.equal(result.ready,true);assert.equal(result.sqlite,2);
  const copy=new DatabaseSync(path.join(f.destination,"state/usage.sqlite"),{readOnly:true});assert.equal(copy.prepare("select n from usage").get().n,42);copy.close();
  assert.equal(readFileSync(path.join(f.destination,"native-history/sessions/history.jsonl"),"utf8"),"synthetic history\n");
  assert.equal(existsSync(path.join(f.destination,"state/home/auth.json")),false);assert.equal(existsSync(path.join(f.destination,"native-history/auth.json")),false);
});
test("release drain includes host effects even after the operator process disappears", async t => {
  const f=fixture(t), store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(f.stateRoot,f.codeRoot));t.after(()=>store.close());
  store.db.prepare("INSERT INTO session_controls(scope,owner,worker_pid) VALUES(?,?,?)").run("scope","owner",99999999);
  store.db.prepare("INSERT INTO resource_claims VALUES(?,?,?,?,?,?,1)").run("host_owner","host","owner","host","execution-effects","exclusive");
  const result=inspectNeuralDeepReleaseState(f);assert.equal(result.ready,false);assert.equal(result.hostControls,1);
  await assert.rejects(backupNeuralDeepReleaseState(f),/Unresolved/);
});
test("corrupt legacy admission is retained and cannot be interpreted as idle", t => {
  const f=fixture(t), dir=path.join(f.stateRoot,"codex-chat");mkdirSync(dir);const file=path.join(dir,"admission-registry.json");writeFileSync(file,"{broken");
  assert.equal(inspectNeuralDeepReleaseState(f).ready,false);assert.equal(readFileSync(file,"utf8"),"{broken");assert.equal(existsSync(path.join(dir,"admission.sqlite")),false);
});
