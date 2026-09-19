import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, lstatSync, openSync, readSync, readlinkSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

async function fileDigest(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function sqliteFile(file) {
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) return false;
  const fd = openSync(file, "r"), header = Buffer.alloc(16);
  try { return readSync(fd, header, 0, 16, 0) === 16 && header.toString() === "SQLite format 3\0"; }
  finally { closeSync(fd); }
}

function sqliteDigest(file) {
  const db = new DatabaseSync(file, { readOnly: true }), hash = createHash("sha256");
  try {
    db.exec("PRAGMA busy_timeout=5000; BEGIN");
    const encode = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? { sqliteInteger: String(item) } : item);
    hash.update(encode([db.prepare("PRAGMA user_version").get(), db.prepare("PRAGMA application_id").get()]));
    const schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' OR name='sqlite_sequence' ORDER BY type,name").all();
    hash.update(encode(schema));
    const quote = name => `"${name.replaceAll('"', '""')}"`;
    for (const table of schema.filter(row => row.type === "table" && !/^CREATE VIRTUAL TABLE/i.test(row.sql || ""))) {
      const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(row => quote(row.name));
      if (!columns.length) continue;
      const statement = db.prepare(`SELECT * FROM ${quote(table.name)} ORDER BY ${columns.join(",")}`);
      statement.setReadBigInts(true);
      hash.update(encode(table.name));
      for (const row of statement.iterate()) hash.update(encode(row));
    }
    return hash.digest("hex");
  } finally { try { db.exec("ROLLBACK"); } catch { /* no open transaction */ } db.close(); }
}

// Compare durable SQLite schema/rows in one read transaction, including committed
// WAL data. Only verified auxiliary files may be omitted; names alone are unsafe.
export async function directoryFingerprint(directory, excludedDirectories = new Set(), { sqliteContents = false } = {}) {
  const root = path.resolve(directory), entries = [], excluded = new Set();
  async function visit(current, relative = "") {
    if (!existsSync(current)) return;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      entries.push({ path: relative || ".", type: "symlink", target: readlinkSync(current) });
      return;
    }
    if (stat.isFile()) {
      if (path.basename(current) === ".DS_Store") return;
      if (sqliteContents && /-(?:wal|shm|journal)$/.test(current) && sqliteFile(current.replace(/-(?:wal|shm|journal)$/, ""))) {
        excluded.add(relative); return;
      }
      if (sqliteContents && sqliteFile(current)) {
        entries.push({ path: relative || ".", type: "sqlite", sha256: sqliteDigest(current) });
        return;
      }
      entries.push({ path: relative || ".", type: "file", bytes: stat.size, sha256: await fileDigest(current) });
      return;
    }
    if (!stat.isDirectory()) return;
    for (const name of readdirSync(current).sort((a, b) => a.localeCompare(b))) {
      const childRelative = relative ? `${relative}/${name}` : name;
      const child = path.join(current, name), childStat = lstatSync(child);
      if (childStat.isDirectory() && !childStat.isSymbolicLink() && excludedDirectories.has(name)) {
        excluded.add(childRelative);
        continue;
      }
      await visit(child, childRelative);
    }
  }
  await visit(root);
  return { sha256: createHash("sha256").update(entries.map(entry => JSON.stringify(entry)).join("\n")).digest("hex"),
    entries: entries.length, excluded: [...excluded].sort((a, b) => a.localeCompare(b)) };
}
