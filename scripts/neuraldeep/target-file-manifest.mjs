import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

export const TARGET_FILE_MANIFEST_SCHEMA = "pritha-target-file-manifest-v1";
const DEFAULT_LIMITS = { maxFiles: 5_000, maxEntries: 20_000, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024, maxDurationMs: 1_000 };
const EXCLUDED_DIRECTORIES = new Set([
  "node_modules", "dist", "build", "coverage", "vendor", "tmp", "temp", "logs", "data", "exports", "backups", "secrets", "credentials",
]);
const EXCLUDED_FILE = /(?:^\.env(?:\.|$)|(?:^|[._-])(?:secret|secrets|credential|credentials|token|tokens|keychain|auth|authentication|api[-_]?key|private[-_]?key)(?:[._-]|$)|^id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:pem|key|p12|pfx|keystore|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|log|tsbuildinfo)$)/i;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const inside = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

function canonicalMissingPath(input) {
  const absolute = path.resolve(input);
  try { return realpathSync(absolute); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(canonicalMissingPath(parent), path.basename(absolute));
  }
}

/**
 * Read a bounded manifest of one child target, including untracked source files.
 * Returns hashes/metadata only, never contents. Hidden paths, generated data,
 * credential-like filenames and every symlink are omitted. A partial manifest
 * must never be presented as proof that no files changed.
 */
export function captureTargetFileManifest(targetRoot, options = {}) {
  if (typeof targetRoot !== "string" || !path.isAbsolute(targetRoot)) throw new Error("target_manifest_absolute_root_required");
  const limits = Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, value]) => {
    const requested = options[key] ?? value;
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > value) throw new Error(`target_manifest_invalid_${key}`);
    return [key, requested];
  }));
  const root = canonicalMissingPath(targetRoot);
  const allowedParent = options.allowedParent ? realpathSync(options.allowedParent) : path.dirname(root);
  if (!inside(allowedParent, root)) throw new Error("target_manifest_outside_parent");
  const manifest = { schema: TARGET_FILE_MANIFEST_SCHEMA, targetRoot: root, targetKey: digest(root), capturedAt: new Date().toISOString(),
    exists: false, complete: true, files: [], excludedEntries: 0, issues: [], hashedBytes: 0 };
  const issues = new Set(), started = performance.now();
  let entries = 0, stop = false;
  const incomplete = (code) => { manifest.complete = false; issues.add(code); };
  const checkTime = () => {
    if (performance.now() - started >= limits.maxDurationMs) { incomplete("duration_limit"); stop = true; }
    return !stop;
  };
  let rootStat;
  try { rootStat = lstatSync(targetRoot); } catch (error) {
    if (error.code !== "ENOENT") { incomplete("root_unreadable"); manifest.issues = [...issues]; }
    return manifest;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("target_manifest_root_must_be_real_directory");
  manifest.exists = true;
  function visit(directory) {
    let handle;
    try { handle = opendirSync(directory); } catch { incomplete("directory_unreadable"); return; }
    try { for (let entry; (entry = handle.readSync());) {
      if (!checkTime()) break;
      if (++entries > limits.maxEntries) { incomplete("entry_limit"); stop = true; break; }
      const name = entry.name;
      if (name.startsWith(".") || EXCLUDED_FILE.test(name) || /[\x00-\x1f\x7f]/.test(name)) { manifest.excludedEntries++; continue; }
      const absolute = path.join(directory, name);
      let stat;
      try { stat = lstatSync(absolute); } catch { incomplete("entry_changed_or_unreadable"); continue; }
      if (stat.isSymbolicLink()) { manifest.excludedEntries++; continue; }
      if (stat.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(name.toLowerCase())) { manifest.excludedEntries++; continue; }
        try { if (realpathSync(absolute) !== absolute || !inside(root, absolute)) { incomplete("directory_identity_changed"); continue; } }
        catch { incomplete("directory_identity_changed"); continue; }
        visit(absolute); continue;
      }
      if (!stat.isFile()) { manifest.excludedEntries++; continue; }
      if (manifest.files.length >= limits.maxFiles) { incomplete("file_limit"); stop = true; break; }
      if (stat.size > limits.maxFileBytes) { incomplete("file_size_limit"); continue; }
      if (manifest.hashedBytes + stat.size > limits.maxTotalBytes) { incomplete("total_size_limit"); stop = true; break; }
      let fd;
      try {
        if (realpathSync(absolute) !== absolute || !inside(root, absolute)) { incomplete("file_identity_changed"); continue; }
        fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
        const initial = fstatSync(fd);
        if (!initial.isFile() || initial.ino !== stat.ino || initial.dev !== stat.dev || initial.size !== stat.size) { incomplete("file_identity_changed"); continue; }
        const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
        let size = 0, bytes;
        while ((bytes = readSync(fd, buffer, 0, Math.min(buffer.length, Math.max(1, initial.size - size + 1)), null)) > 0) {
          size += bytes;
          manifest.hashedBytes += bytes;
          if (size > initial.size || manifest.hashedBytes > limits.maxTotalBytes || !checkTime()) { incomplete("file_changed_while_reading"); break; }
          hash.update(buffer.subarray(0, bytes));
        }
        const final = fstatSync(fd);
        if (size !== initial.size || final.size !== initial.size || final.mtimeMs !== initial.mtimeMs || final.ctimeMs !== initial.ctimeMs
          || realpathSync(absolute) !== absolute || lstatSync(absolute).ino !== initial.ino) { incomplete("file_changed_while_reading"); continue; }
        if (stop) continue;
        manifest.files.push({ path: path.relative(root, absolute).split(path.sep).join("/"), size, sha256: hash.digest("hex"), executable: Boolean(final.mode & 0o111) });
      } catch { incomplete("file_changed_or_unreadable"); }
      finally { if (fd !== undefined) closeSync(fd); }
    } } catch { incomplete("directory_changed_or_unreadable"); }
    finally { handle.closeSync(); }
  }
  visit(root);
  try {
    const currentRoot = lstatSync(root);
    if (!currentRoot.isDirectory() || currentRoot.ino !== rootStat.ino || currentRoot.dev !== rootStat.dev
      || realpathSync(root) !== root) incomplete("root_identity_changed");
  } catch { incomplete("root_identity_changed"); }
  manifest.issues = [...issues].sort();
  manifest.files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  return manifest;
}

/** A partial scan reports observed changes but never invents deletions. */
export function diffTargetFileManifests(before, after) {
  if (before?.schema !== TARGET_FILE_MANIFEST_SCHEMA || after?.schema !== TARGET_FILE_MANIFEST_SCHEMA
    || before.targetKey !== after.targetKey || before.targetRoot !== after.targetRoot) throw new Error("target_manifest_identity_mismatch");
  const oldFiles = new Map(before.files.map((file) => [file.path, file]));
  const nextFiles = new Map(after.files.map((file) => [file.path, file]));
  const added = [], modified = [], deleted = [];
  for (const [name, file] of nextFiles) {
    const prior = oldFiles.get(name);
    if (!prior) { if (before.complete) added.push(name); }
    else if (prior.sha256 !== file.sha256 || prior.size !== file.size || prior.executable !== file.executable) modified.push(name);
  }
  if (after.complete) for (const name of oldFiles.keys()) if (!nextFiles.has(name)) deleted.push(name);
  return { schema: "pritha-target-file-diff-v1", targetKey: after.targetKey, complete: before.complete && after.complete,
    added, modified, deleted, issues: [...new Set([...before.issues, ...after.issues])].sort() };
}
