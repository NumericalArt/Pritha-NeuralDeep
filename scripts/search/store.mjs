import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  lstatSync,
  existsSync,
  realpathSync,
  chmodSync,
} from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { defaults, SettingsSchema, fail } from "./contracts.mjs";
import { searxngUrl } from "./policy.mjs";
export const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function searchDirectory(stateRoot, codeRoot) {
  return path.join(
    path.resolve(stateRoot),
    path.resolve(stateRoot) === path.resolve(codeRoot) ? ".private" : "private",
    "search",
  );
}
export function privateDirectory(directory) {
  for (
    let p = path.resolve(directory);
    p !== path.dirname(p);
    p = path.dirname(p)
  ) {
    if (!existsSync(p)) continue;
    const s = lstatSync(p);
    const alias =
      process.platform === "darwin" &&
      ["/tmp", "/var"].includes(p) &&
      s.isSymbolicLink() &&
      realpathSync(p) === `/private${p}`;
    if (!alias && (s.isSymbolicLink() || !s.isDirectory()))
      fail("storage_invalid");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}
export class SearchStore {
  constructor({
    stateRoot,
    codeRoot,
    environment = process.env,
    databasePath,
  } = {}) {
    this.directory =
      databasePath === ":memory:" ? null : searchDirectory(stateRoot, codeRoot);
    const file = databasePath || path.join(this.directory, "search.sqlite");
    if (file !== ":memory:") {
      privateDirectory(this.directory);
      for (const f of [file, `${file}-wal`, `${file}-shm`])
        if (
          existsSync(f) &&
          (!lstatSync(f).isFile() || lstatSync(f).isSymbolicLink())
        )
          fail("storage_invalid");
    }
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;");
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (![0, 1].includes(version)) {
      this.db.close();
      fail("schema_unsupported");
    }
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.transaction(() => {
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS budgets(scope TEXT PRIMARY KEY,search INTEGER NOT NULL DEFAULT 0,read INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,scope TEXT NOT NULL,owner TEXT NOT NULL,kind TEXT NOT NULL,provider TEXT NOT NULL,started INTEGER NOT NULL,lease INTEGER NOT NULL,status TEXT NOT NULL,elapsed INTEGER,error TEXT);
   CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,owner TEXT NOT NULL,scope TEXT NOT NULL,value TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,state TEXT NOT NULL,value TEXT NOT NULL,updated INTEGER NOT NULL,UNIQUE(owner,request_key));
   PRAGMA user_version=1;`);
      if (!this.db.prepare("SELECT id FROM config WHERE id=1").get()) {
        const initial = structuredClone(defaults);
        if (
          existsSync(
            path.join(
              path.dirname(this.directory || ""),
              "interface-lab",
              "pritha-control-center",
              "realtime",
              "runtime-settings.json",
            ),
          ) ||
          environment.PRITHA_WEB_SEARCH_BACKEND === "searxng" ||
          environment.PRITHA_SEARXNG_URL ||
          environment.SEARXNG_URL
        ) {
          initial.enabled = true;
          initial.provider = "searxng";
          initial.mode = "auto";
          initial.surfaces = {
            ...initial.surfaces,
            task_chat: false,
            voice: true,
          };
          initial.searxngUrl = searxngUrl(
            environment.PRITHA_SEARXNG_URL ||
              environment.SEARXNG_URL ||
              initial.searxngUrl,
          );
        }
        this.db
          .prepare("INSERT INTO config VALUES(1,1,?)")
          .run(JSON.stringify(initial));
      }
    });
    if (file !== ":memory:")
      for (const f of [file, `${file}-wal`, `${file}-shm`])
        if (existsSync(f)) chmodSync(f, 0o600);
    this.cleanup();
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const v = fn();
      this.db.exec("COMMIT");
      return v;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  settings() {
    const row = this.db.prepare("SELECT * FROM config WHERE id=1").get();
    return { ...JSON.parse(row.value), revision: row.revision };
  }
  configure(patch, expectedRevision) {
    return this.transaction(() => {
      const prior = this.settings();
      if (prior.revision !== expectedRevision) fail("revision_conflict");
      const { revision, ...old } = prior;
      const parsed = SettingsSchema.safeParse({ ...old, ...patch });
      if (!parsed.success) fail("invalid_request");
      searxngUrl(parsed.data.searxngUrl);
      this.db
        .prepare("UPDATE config SET revision=?,value=? WHERE id=1")
        .run(revision + 1, JSON.stringify(parsed.data));
      return this.settings();
    });
  }
  meta(key, value) {
    if (arguments.length === 2)
      this.db
        .prepare("INSERT OR REPLACE INTO metadata VALUES(?,?)")
        .run(key, JSON.stringify(value));
    return JSON.parse(
      this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key)
        ?.value || "null",
    );
  }
  scope(c) {
    return hash([c.instance, c.owner, c.turn, c.surface]);
  }
  reserve(c, kind, provider, limit, deadline, fallback = false) {
    return this.transaction(() => {
      const now = Date.now(),
        scope = this.scope(c);
      this.db
        .prepare("INSERT OR IGNORE INTO budgets(scope,expires) VALUES(?,?)")
        .run(scope, now + 30 * 86400000);
      const used = this.db
        .prepare(`SELECT ${kind} AS n FROM budgets WHERE scope=?`)
        .get(scope).n;
      if (!fallback && used >= limit) fail("budget_exceeded");
      if (
        fallback &&
        !this.db
          .prepare(
            "SELECT id FROM operations WHERE scope=? AND provider='neuraldeep' AND status='failed' AND started>?",
          )
          .get(scope, now - deadline)
      )
        fail("permission_denied");
      const count = this.db
        .prepare(
          "SELECT count(*) AS n FROM operations WHERE kind=? AND status='running' AND lease>?",
        )
        .get(kind, now).n;
      if (count >= (kind === "search" ? 2 : 1))
        fail("provider_unavailable", { retryAfter: 1 });
      const id = `search_${randomUUID()}`;
      if (!fallback)
        this.db
          .prepare(`UPDATE budgets SET ${kind}=${kind}+1 WHERE scope=?`)
          .run(scope);
      this.db
        .prepare(
          "INSERT INTO operations(id,scope,owner,kind,provider,started,lease,status) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          scope,
          c.owner,
          kind,
          provider,
          now,
          now + deadline + 5000,
          "running",
        );
      return id;
    });
  }
  finish(id, status, error = null) {
    this.db
      .prepare(
        "UPDATE operations SET status=?,elapsed=?-started,error=?,lease=0 WHERE id=?",
      )
      .run(status, Date.now(), error, id);
  }
  counts(c) {
    return (
      this.db
        .prepare("SELECT search,read FROM budgets WHERE scope=?")
        .get(this.scope(c)) || { search: 0, read: 0 }
    );
  }
  source(c, value, ttl = 1800000) {
    const id = `src_${randomUUID()}`;
    this.db
      .prepare("INSERT INTO sources VALUES(?,?,?,?,?)")
      .run(
        id,
        c.owner,
        this.scope(c),
        JSON.stringify({ ...value, id }),
        Date.now() + ttl,
      );
    return { ...value, id };
  }
  getSource(c, id) {
    this.cleanup();
    const r = this.db
      .prepare("SELECT value FROM sources WHERE id=? AND owner=? AND expires>?")
      .get(id, c.owner, Date.now());
    if (!r) fail("permission_denied");
    return JSON.parse(r.value);
  }
  getCache(key) {
    this.cleanup();
    const r = this.db
      .prepare("SELECT value FROM cache WHERE key=? AND expires>?")
      .get(key, Date.now());
    return r ? JSON.parse(r.value) : null;
  }
  cache(key, value, ttl) {
    if (ttl)
      this.db
        .prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)")
        .run(key, JSON.stringify(value), Date.now() + ttl);
  }
  history(owner) {
    this.cleanup();
    if (owner === null)
      return this.db
        .prepare(
          "SELECT id,kind,provider,started,status,elapsed,error FROM operations ORDER BY started DESC LIMIT 30",
        )
        .all();
    return this.db
      .prepare(
        "SELECT id,kind,provider,started,status,elapsed,error FROM operations WHERE owner=? ORDER BY started DESC LIMIT 30",
      )
      .all(owner);
  }
  cleanup() {
    const now = Date.now();
    this.db.prepare("DELETE FROM cache WHERE expires<=?").run(now);
    this.db.prepare("DELETE FROM sources WHERE expires<=?").run(now);
    this.db
      .prepare("DELETE FROM operations WHERE started<?")
      .run(now - 7 * 86400000);
    this.db.prepare("DELETE FROM budgets WHERE expires<?").run(now);
    this.db
      .prepare(
        "DELETE FROM jobs WHERE updated<? AND state NOT IN ('running','queued','cancelling')",
      )
      .run(now - 30 * 86400000);
  }
  close() {
    this.db.close();
  }
}
