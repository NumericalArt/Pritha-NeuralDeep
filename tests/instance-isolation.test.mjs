import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { directoryFingerprint } from "../scripts/lib/instance-isolation.mjs";

const fingerprint = root => directoryFingerprint(root, new Set(), { sqliteContents: true });
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-isolation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "history.sqlite"), db = new DatabaseSync(file);
  t.after(() => db.close());
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE history(id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT); INSERT INTO history(body) VALUES('preserve original history');");
  return { root, file, db };
}

test("release isolation survives SQLite checkpoint and reader SHM churn with identical data", async t => {
  const {root,file,db} = fixture(t), before = await fingerprint(root), disk = readFileSync(file);
  const reader = new DatabaseSync(file, { readOnly: true });
  reader.exec("BEGIN"); assert.equal(reader.prepare("SELECT count(*) n FROM history").get().n, 1); reader.exec("ROLLBACK"); reader.close();
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  assert.notDeepEqual(readFileSync(file), disk, "the fixture must actually checkpoint WAL into the database");
  assert.equal((await fingerprint(root)).sha256, before.sha256);
});

test("an uncheckpointed SQLite history edit changes isolation even when main file is unchanged", async t => {
  const {root,file,db} = fixture(t); db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const before = await fingerprint(root), disk = readFileSync(file);
  db.exec("UPDATE history SET body='new user work' WHERE id=1");
  assert.deepEqual(readFileSync(file), disk);
  assert.notEqual((await fingerprint(root)).sha256, before.sha256);
});

test("Finder view metadata does not mask real authored configuration changes", async t => {
  const {root} = fixture(t), finder = path.join(root, ".DS_Store"), config = path.join(root, "config.json");
  writeFileSync(config, '{"mode":"original"}');
  const before = await fingerprint(root); writeFileSync(finder, "old Finder layout");
  assert.deepEqual(await fingerprint(root), before);
  writeFileSync(finder, "new Finder layout");
  assert.deepEqual(await fingerprint(root), before);
  rmSync(finder); assert.deepEqual(await fingerprint(root), before);
  writeFileSync(config, '{"mode":"changed"}');
  assert.notEqual((await fingerprint(root)).sha256, before.sha256);
});

test("sidecar-like names without a regular SQLite database remain protected", async t => {
  const {root,file} = fixture(t), orphan = path.join(root, "orphan.sqlite-wal");
  writeFileSync(orphan, "original"); const before = await fingerprint(root); writeFileSync(orphan, "changed");
  assert.notEqual((await fingerprint(root)).sha256, before.sha256);
  const fake = path.join(root, "plain.db"); writeFileSync(fake, "not SQLite"); writeFileSync(fake+"-shm", "original");
  const plain = await fingerprint(root); writeFileSync(fake+"-shm", "changed");
  assert.notEqual((await fingerprint(root)).sha256, plain.sha256);
  const link = path.join(root, "linked.sqlite"); symlinkSync(file, link); writeFileSync(link+"-wal", "original");
  const linked = await fingerprint(root); writeFileSync(link+"-wal", "changed");
  assert.notEqual((await fingerprint(root)).sha256, linked.sha256);
});

test("SQLite schema, metadata, and corrupt databases cannot pass as unchanged", async t => {
  const {root,db} = fixture(t); let prior = await fingerprint(root);
  for (const sql of ["PRAGMA user_version=42", "PRAGMA application_id=17", "CREATE TABLE more_data(value BLOB)", "INSERT INTO more_data VALUES(x'00ff')"]){
    db.exec(sql);const next = await fingerprint(root);assert.notEqual(next.sha256,prior.sha256);prior=next;
  }
  writeFileSync(path.join(root,"broken.sqlite"),Buffer.concat([Buffer.from("SQLite format 3\0"),Buffer.alloc(128)]));
  await assert.rejects(fingerprint(root));
});
