import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const terminal = new Set(["completed", "failed", "cancelled"]);
export function inspectNeuralDeepReleaseState({ stateRoot, codeRoot }) {
  const root = path.resolve(stateRoot) === path.resolve(codeRoot) ? path.join(codeRoot, ".private/codex-chat") : path.join(stateRoot, "codex-chat");
  const file = path.join(root, "admission.sqlite"), legacy = path.join(root, "admission-registry.json");
  let db;
  try {
    if (!existsSync(file)) {
      if (!existsSync(legacy)) return { ready: true, storage: "absent", unresolved: 0, hostControls: 0 };
      const value = JSON.parse(readFileSync(legacy, "utf8"));
      if (value.version !== 1 || !Array.isArray(value.attempts)) throw new Error("Legacy admission cannot be reconciled");
      const unresolved = value.attempts.filter(row => !terminal.has(row.status)).length;
      return { ready: unresolved === 0, storage: "legacy-v1", unresolved, hostControls: 0, attempts: value.attempts.length };
    }
    db = new DatabaseSync(file, { readOnly: true }); db.exec("PRAGMA busy_timeout=1000");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (![3,4].includes(version)) throw new Error("Coordination requires its matching reconciliation reader");
    const attempts = db.prepare("SELECT status FROM attempts").all();
    const runs = db.prepare("SELECT receipt FROM runtime_receipts").all().map(row => JSON.parse(row.receipt));
    const voiceUnresolved = version >= 4 ? db.prepare("SELECT (SELECT count(*) FROM voice_http_requests WHERE status='dispatching') + (SELECT count(*) FROM voice_operations WHERE status='accepted') + (SELECT count(*) FROM voice_turns WHERE status='accepted') n").get().n : 0;
    const unresolved = voiceUnresolved + attempts.filter(row => !terminal.has(row.status)).length
      + runs.filter(row => row.dispatch_authorized && !(row.process_tree_exited === true && row.adapter_closed === true)).length;
    // Same read-only contract as heldHostControls(), without constructing a migrating store.
    const hostControls = db.prepare("SELECT count(*) n FROM session_controls WHERE EXISTS (SELECT 1 FROM resource_claims WHERE surface='host' AND workload=session_controls.owner AND held=1)").get().n;
    const heldClaims = db.prepare("SELECT count(*) n FROM resource_claims WHERE held=1").get().n;
    return { ready: unresolved === 0 && hostControls === 0 && heldClaims === 0, storage: `sqlite-v${version}`, unresolved, hostControls, heldClaims, attempts: attempts.length };
  } catch {
    return { ready: false, storage: "unreadable-or-unreconciled", unresolved: null, hostControls: null };
  } finally { db?.close(); }
}

// The caller first verifies the instance manager's stop and owned process drain.
// Never restore this snapshot over newer receipts, usage or user work after rollout.
export async function backupNeuralDeepReleaseState({ stateRoot, codeRoot, codexHome, destination, owner }) {
  const lock = JSON.parse(readFileSync(path.join(stateRoot, "setup/neuraldeep-release-lock.json"), "utf8"));
  if (lock.schema !== "neuraldeep-release-lock-v1" || lock.owner !== owner) throw new Error("Matching release maintenance lock required");
  const before = inspectNeuralDeepReleaseState({ stateRoot, codeRoot });
  if (!before.ready) throw new Error("Unresolved executions or host effects prevent a consistent backup");
  const relative = path.relative(path.join(path.resolve(stateRoot), "releases"), path.resolve(destination));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || existsSync(destination)) throw new Error("A new private instance release snapshot directory is required");
  let parent = path.resolve(stateRoot);
  for (const segment of path.relative(parent, path.resolve(destination)).split(path.sep)) {
    parent = path.join(parent, segment);
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error("Snapshot destination must remain inside the instance");
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const files = [], exclusions = ["releases", "cache", "memory"];
  async function copy(source, target, label) {
    if (label.startsWith("state/") && path.resolve(source) === path.resolve(codexHome)) return;
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) { symlinkSync(readlinkSync(source), target); files.push({ path: label, kind: "symlink" }); return; }
    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true, mode: 0o700 });
      for (const name of readdirSync(source).sort()) {
        if (label === "state" && exclusions.includes(name)) continue;
        if (/-(?:wal|shm|journal)$/.test(name) && existsSync(path.join(source, name.replace(/-(?:wal|shm|journal)$/, "")))) continue;
        await copy(path.join(source, name), path.join(target, name), `${label}/${name}`);
      }
      return;
    }
    if (!stat.isFile()) throw new Error("Snapshot encountered an unsupported filesystem entry");
    const sqlite = /\.(?:sqlite[0-9]*|db)$/.test(source) && readFileSync(source).subarray(0,16).toString() === "SQLite format 3\0";
    if (sqlite) {
      const db = new DatabaseSync(source, { readOnly: true });
      try { await backup(db, target); } finally { db.close(); }
      const check = new DatabaseSync(target, { readOnly: true });
      try { if (check.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("SQLite snapshot integrity failed"); } finally { check.close(); }
    } else copyFileSync(source, target);
    chmodSync(target, 0o600);
    files.push({ path: label, kind: sqlite ? "sqlite-consistent-backup" : "file", sha256: createHash("sha256").update(readFileSync(target)).digest("hex") });
  }
  await copy(stateRoot, path.join(destination, "state"), "state");
  const native = path.join(destination, "native-history"); mkdirSync(native, { mode: 0o700 });
  for (const name of readdirSync(codexHome)) {
    if (["sessions", "archived_sessions", "history.jsonl", "session_index.jsonl"].includes(name) || /^state_\d+\.sqlite$/.test(name)) {
      await copy(path.join(codexHome, name), path.join(native, name), `native-history/${name}`);
    }
  }
  const after = inspectNeuralDeepReleaseState({ stateRoot, codeRoot });
  if (!after.ready || JSON.stringify(after) !== JSON.stringify(before)) throw new Error("Execution state changed during the release snapshot");
  const receipt = { schema: "neuraldeep-release-snapshot-v1", createdAt: new Date().toISOString(), before, after, exclusions, nativeExclusions: "credentials, configuration, caches, tools and unrelated homes", files };
  writeFileSync(path.join(destination, "snapshot.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  return { directory: destination, files: files.length, sqlite: files.filter(file => file.kind === "sqlite-consistent-backup").length, ready: true };
}
