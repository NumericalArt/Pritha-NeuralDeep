#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";

import path from "node:path";
import { atomicWriteFile } from "./lib/atomic-file.mjs";

if (!process.env.PRITHA_MIGRATION_SOURCE || !process.env.PRITHA_STATE_ROOT) throw new Error("Set explicit PRITHA_MIGRATION_SOURCE and PRITHA_STATE_ROOT before migration.");
const sourceRoot = path.resolve(process.env.PRITHA_MIGRATION_SOURCE);
const targetRoot = path.resolve(process.env.PRITHA_STATE_ROOT);
const allowedDirectories = [
  "agents",
  "private/user-memory",
  "private/voice-research",
  "voice-drafts",
];
const excludedRoots = [
  "queue",
  "codex-chat",
  "audit",
  "builds",
  "releases",
  "snapshots",
  "logs",
  "setup",
  "private/interface-lab",
  "config",
];
const argv = process.argv.slice(2);
const command = argv[0] || "plan";
const confirmed = argv.includes("--yes");

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function regularTree(root, relative = "") {
  const absolute = path.join(root, relative);
  if (!inside(root, absolute)) throw new Error("migration_path_escape");
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`migration_symlink_forbidden:${relative}`);
  if (stat.isFile()) {
    const content = readFileSync(absolute);
    return [{ path: relative.replaceAll(path.sep, "/"), bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") }];
  }
  if (!stat.isDirectory()) throw new Error(`migration_special_file_forbidden:${relative}`);
  return readdirSync(absolute).sort().flatMap((entry) => regularTree(root, path.join(relative, entry)));
}

function copyAllowedDirectory(relative) {
  const source = path.join(sourceRoot, relative);
  const target = path.join(targetRoot, relative);
  if (!existsSync(source)) return { relative, sourceFiles: [], targetFiles: [], skipped: true };
  regularTree(sourceRoot, relative);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  cpSync(source, target, { recursive: true, force: true, preserveTimestamps: true });
  const sourceFiles = regularTree(sourceRoot, relative);
  const targetFiles = regularTree(targetRoot, relative);
  const sourceProjection = sourceFiles.map(({ path: filePath, bytes, sha256 }) => ({ path: filePath.slice(relative.length + 1), bytes, sha256 }));
  const targetProjection = targetFiles.map(({ path: filePath, bytes, sha256 }) => ({ path: filePath.slice(relative.length + 1), bytes, sha256 }));
  if (JSON.stringify(sourceProjection) !== JSON.stringify(targetProjection)) throw new Error(`migration_verification_failed:${relative}`);
  return { relative, sourceFiles: sourceProjection, targetFiles: targetProjection, skipped: false };
}

function backupDatabase() {
  const relative = "memory/techscope.sqlite";
  const source = path.join(sourceRoot, relative);
  const target = path.join(targetRoot, relative);
  if (!existsSync(source)) throw new Error("source_memory_database_missing");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const backup = runSyncProbe("sqlite3", [source, `.backup '${target.replaceAll("'", "''")}'`], { encoding: "utf8", timeout: 120_000 });
  if (backup.status !== 0) throw new Error(`sqlite_backup_failed:${String(backup.stderr || "").slice(0, 500)}`);
  const integrity = runSyncProbe("sqlite3", [target, "PRAGMA integrity_check;"], { encoding: "utf8", timeout: 30_000 });
  if (integrity.status !== 0 || integrity.stdout.trim() !== "ok") throw new Error("target_sqlite_integrity_failed");
  const counts = runSyncProbe("sqlite3", [target, "SELECT 'documents',count(*) FROM documents UNION ALL SELECT 'chunks',count(*) FROM chunks UNION ALL SELECT 'embeddings',count(*) FROM embeddings;"], { encoding: "utf8", timeout: 30_000 });
  if (counts.status !== 0) throw new Error("target_sqlite_counts_failed");
  return {
    relative,
    source: regularTree(sourceRoot, relative)[0],
    target: regularTree(targetRoot, relative)[0],
    integrity: "ok",
    counts: Object.fromEntries(counts.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [key, value] = line.split("|");
      return [key, Number(value)];
    })),
  };
}

function migrationManifestPath() {
  return path.join(targetRoot, "migration", "memory-migration-manifest.json");
}

function planMigration() {
  if (!existsSync(sourceRoot) || !lstatSync(sourceRoot).isDirectory()) throw new Error("migration_source_missing");
  const copied = allowedDirectories.map((relative) => ({
    path: relative,
    files: existsSync(path.join(sourceRoot, relative)) ? regularTree(sourceRoot, relative).length : 0,
  }));
  console.log(JSON.stringify({
    ok: true,
    status: "planned",
    sourceRoot,
    targetRoot,
    copied,
    database: "memory/techscope.sqlite",
    requires: "apply --yes",
  }));
}

function verifyMigration() {
  const manifestPath = migrationManifestPath();
  if (!existsSync(manifestPath)) throw new Error("migration_manifest_missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== "pritha-neuraldeep-memory-migration-v1") throw new Error("migration_manifest_schema_invalid");
  for (const entry of manifest.copied || []) {
    for (const expected of entry.sourceFiles || []) {
      const relative = path.join(entry.relative, expected.path);
      const source = regularTree(sourceRoot, relative)[0];
      const target = regularTree(targetRoot, relative)[0];
      for (const actual of [source, target]) {
        if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
          throw new Error(`migration_checksum_mismatch:${relative}`);
        }
      }
    }
  }
  const sourceDatabase = regularTree(sourceRoot, "memory/techscope.sqlite")[0];
  if (sourceDatabase.bytes !== manifest.database?.source?.bytes || sourceDatabase.sha256 !== manifest.database?.source?.sha256) {
    throw new Error("migration_source_database_changed");
  }
  const targetDatabase = path.join(targetRoot, "memory", "techscope.sqlite");
  const integrity = runSyncProbe("sqlite3", [targetDatabase, "PRAGMA integrity_check;"], { encoding: "utf8", timeout: 30_000 });
  if (integrity.status !== 0 || integrity.stdout.trim() !== "ok") throw new Error("target_sqlite_integrity_failed");
  console.log(JSON.stringify({
    ok: true,
    status: "verified",
    manifestPath,
    baselineFiles: (manifest.copied || []).reduce((count, entry) => count + (entry.sourceFiles || []).length, 0),
    sourceReadOnlyBaseline: true,
    targetDatabaseIntegrity: "ok",
    postMigrationTargetFilesAllowed: true,
  }));
}

function applyMigration() {
  if (!confirmed) throw new Error("migration_apply_requires_--yes");
  if (!existsSync(sourceRoot) || !lstatSync(sourceRoot).isDirectory()) throw new Error("migration_source_missing");
  mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
  if (realpathSync(sourceRoot) === realpathSync(targetRoot)) throw new Error("migration_source_equals_target");
  if (existsSync(migrationManifestPath())) throw new Error("migration_manifest_exists");
  const copied = allowedDirectories.map(copyAllowedDirectory);
  const database = backupDatabase();
  const forbiddenPresent = excludedRoots.filter((relative) => existsSync(path.join(targetRoot, relative)) && !["logs", "config"].includes(relative));
  if (forbiddenPresent.length) throw new Error(`excluded_state_present:${forbiddenPresent.join(",")}`);
  const manifest = {
    schema: "pritha-neuraldeep-memory-migration-v1",
    createdAt: new Date().toISOString(),
    sourceRoot,
    targetRoot,
    mode: "allowlist-copy-source-read-only",
    allowedDirectories,
    excludedRoots,
    copied,
    database,
    exclusionsVerified: true,
  };
  const manifestPath = migrationManifestPath();
  mkdirSync(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
  atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, manifestPath, counts: database.counts, copied: copied.map((entry) => ({ path: entry.relative, files: entry.sourceFiles.length })) }));
}

function printHelp() {
  console.log([
    "Usage: node scripts/migrate-neuraldeep-state.mjs [plan|verify|apply --yes]",
    "  plan          Read-only migration preview (default).",
    "  verify        Verify the immutable source baseline and migrated checksums; target may contain newer runtime artifacts.",
    "  apply --yes   Perform the one-time allowlist copy and SQLite backup.",
  ].join("\n"));
}

try {
  if (command === "help" || command === "--help" || command === "-h") printHelp();
  else if (command === "plan") planMigration();
  else if (command === "verify") verifyMigration();
  else if (command === "apply") applyMigration();
  else throw new Error(`unknown_migration_command:${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
