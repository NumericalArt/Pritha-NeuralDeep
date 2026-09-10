import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runSyncProbe } from "../scripts/lib/sync-probe.mjs";

function fixture(t) {
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "nd-memory-paths-")));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const roots = ["code-a", "code-b"].map(name => path.join(tmp, name));
  const states = ["state-a", "state-b"].map(name => path.join(tmp, name));
  for (const [index, root] of roots.entries()) {
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    mkdirSync(path.join(states[index], "config"), { recursive: true });
    mkdirSync(path.join(states[index], "memory"));
    for (const script of ["pritha_python_compat.py", "semantic-search.py", "embed-memory.py"]) copyFileSync(`scripts/${script}`, path.join(root, "scripts", script));
    writeFileSync(path.join(root, ".env.local"), `PRITHA_STATE_ROOT=${states[index]}\nUNRELATED_SECRET=fixture-secret\n`);
    writeFileSync(path.join(states[index], "config", "runtime.env"), `PRITHA_STATE_ROOT=${states[1-index]}\nUNRELATED_SECRET=runtime-secret\n`);
    writeFileSync(path.join(root, "scripts", "sentence_transformers.py"), 'raise RuntimeError("unexpected_ML_import")\n');
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(TECHSCOPE_|PRITHA_|UNRELATED_SECRET)/.test(key)) delete env[key];
  const run = (args, patch = {}) => runSyncProbe("python3", args, { cwd: tmp, env: { ...env, ...patch }, encoding: "utf8", timeout: 10000 });
  return { tmp, roots, states, env, run };
}

test("Python resolves two instance paths before importing ML and never loads non-path secrets", t => {
  const f = fixture(t);
  for (const [index, root] of f.roots.entries()) {
    const code = `import sys,os,json;sys.path.insert(0,${JSON.stringify(path.join(root, "scripts"))});from pritha_python_compat import load_pritha_runtime_env; r,s=load_pritha_runtime_env();print(json.dumps([str(r),str(s),os.getenv('UNRELATED_SECRET'),any(x in sys.modules for x in ['torch','sentence_transformers','urllib3'])]))`;
    let result = f.run(["-c", code]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [root, f.states[index], null, false]);
    result = f.run(["-c", code], { TECHSCOPE_ROOT: f.roots[1-index], PRITHA_STATE_ROOT: f.states[1-index] });
    assert.deepEqual(JSON.parse(result.stdout), [f.roots[1-index], f.states[1-index], null, false]);
    writeFileSync(path.join(root, ".env"), `PRITHA_STATE_ROOT=${f.states[1-index]}\n`);
    result = f.run(["-c", code]);
    assert.equal(JSON.parse(result.stdout)[1], f.states[1-index], ".env has existing first-file precedence");
  }
});

test("missing indexes fail before ML import or creating an empty database", t => {
  const f = fixture(t);
  for (const name of ["embed-memory.py", "semantic-search.py"]) {
    const result = f.run([path.join(f.roots[0], "scripts", name), "fixture"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Memory index missing/);
    assert.doesNotMatch(result.stderr, /unexpected_ML_import/);
  }
  assert.equal(existsSync(path.join(f.states[0], "memory", "techscope.sqlite")), false);
  const query = runSyncProbe(process.execPath, [path.resolve("scripts/query-memory.mjs"), "stats"], {
    cwd: f.tmp, env: { ...f.env, TECHSCOPE_ROOT: f.roots[0] }, encoding: "utf8", timeout: 10000,
  });
  assert.match(query.stderr, /Memory index missing/);
  assert.equal(existsSync(path.join(f.states[0], "memory", "techscope.sqlite")), false);
});

test("incremental Python indexing preserves valid local and NeuralDeep vectors and active provider", t => {
  const f = fixture(t);
  const database = path.join(f.states[0], "memory", "techscope.sqlite");
  const db = new DatabaseSync(database); t.after(() => db.close());
  db.exec(`CREATE TABLE documents(id TEXT PRIMARY KEY,type TEXT,path TEXT,title TEXT,status TEXT);
    CREATE TABLE chunks(id TEXT PRIMARY KEY,document_id TEXT,ordinal INTEGER,text TEXT,hash TEXT,heading TEXT);
    CREATE TABLE embeddings(id TEXT PRIMARY KEY,owner_type TEXT,owner_id TEXT,provider TEXT,model TEXT,dimensions INTEGER,content_hash TEXT,vector BLOB,vector_json TEXT,created_at TEXT,UNIQUE(owner_type,owner_id,provider,model));
    INSERT INTO documents VALUES('d','standard','fixture.md','Fixture','accepted');
    INSERT INTO chunks VALUES('a','d',0,'unchanged','ha',''),('b','d',1,'changed','hb','');`);
  const local = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
  const vector = JSON.stringify(Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0));
  const insert = db.prepare("INSERT INTO embeddings VALUES(?,?,?,?,?,?,?,NULL,?,?)");
  for (const id of ["a", "b"]) insert.run(`local-${id}`, "chunk", id, "sentence-transformers", local, 384, `h${id}`, vector, "original-time");
  insert.run("nd-a", "chunk", "a", "neuraldeep", "fixture-embed", 3, "ha", "[1,0,0]", "original-time");
  const config = path.join(f.states[0], "config", "embeddings.json");
  writeFileSync(config, JSON.stringify({ activeProvider: "neuraldeep", neuraldeep: { model: "fixture-embed" } }));
  const before = db.prepare("SELECT * FROM embeddings ORDER BY id").all();
  const runIndexer = () => f.run([path.join(f.roots[0], "scripts", "embed-memory.py")]);
  let result = runIndexer(); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No missing local embeddings/);
  assert.deepEqual(db.prepare("SELECT * FROM embeddings ORDER BY id").all(), before);
  const semantic = f.run(["-c", `import sys,runpy;sys.path.insert(0,${JSON.stringify(path.join(f.roots[0], "scripts"))});m=runpy.run_path(${JSON.stringify(path.join(f.roots[0], "scripts", "semantic-search.py"))});m['main'].__globals__['neuraldeep_query_vector']=lambda query,model:[1,0,0];sys.argv=['semantic-search','fixture'];m['main']()`]);
  assert.equal(semantic.status, 0, semantic.stderr);
  assert.match(semantic.stdout, /Provider: neuraldeep/);
  db.exec("UPDATE chunks SET hash='hb-new',text='new-b' WHERE id='b'");
  writeFileSync(path.join(f.roots[0], "scripts", "sentence_transformers.py"), `class SentenceTransformer:\n def __init__(self, model): pass\n def encode(self,texts,**kwargs):\n  assert texts == ['new-b'], texts\n  return [[1.0]+[0.0]*383]\n`);
  result = runIndexer(); assert.equal(result.status, 0, result.stderr);
  assert.equal(db.prepare("SELECT content_hash FROM embeddings WHERE owner_id='b'").get().content_hash, "hb-new");
  for (const row of before.filter(row => row.owner_id === "a")) assert.deepEqual(db.prepare("SELECT * FROM embeddings WHERE id=?").get(row.id), row);
  assert.equal(JSON.parse(readFileSync(config, "utf8")).activeProvider, "neuraldeep");
});
