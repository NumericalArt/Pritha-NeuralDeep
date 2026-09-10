import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, openSync, readSync, closeSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import { timeoutPolicy } from "../lib/timeout-policy.mjs";

const DEFAULT_EXCLUDES = new Set([".git", ".next", ".cache", ".logs", ".private", ".queue", ".snapshots", "node_modules"]);

function digestText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function git(projectRoot, args) {
  return execFileSync("git", ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutPolicy("workspaceRead"),
    killSignal: "SIGKILL",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

function isGitWorkspace(projectRoot) {
  try {
    return git(projectRoot, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

function hasGitHead(projectRoot) {
  try {
    return Boolean(git(projectRoot, ["rev-parse", "--verify", "HEAD"]).trim());
  } catch {
    return false;
  }
}

function hashRegularFile(hash, filePath, maxBytes) {
  const descriptor = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let total = 0;
  try {
    while (total < maxBytes) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, maxBytes - total), null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      total += count;
    }
  } finally {
    closeSync(descriptor);
  }
  return total;
}

function hashPath(hash, root, relPath, options = {}) {
  const fullPath = path.join(root, relPath);
  const stat = lstatSync(fullPath);
  hash.update(`path\0${relPath.replaceAll(path.sep, "/")}\0mode\0${stat.mode}\0size\0${stat.size}\0`);
  if (stat.isSymbolicLink()) {
    hash.update(`symlink\0${readlinkSync(fullPath)}\0`);
    return;
  }
  if (stat.isFile()) {
    const maxFileBytes = Number.isFinite(options.maxFileBytes) ? options.maxFileBytes : 128 * 1024 * 1024;
    if (options.requireComplete && stat.size > maxFileBytes) throw new Error("Workspace revision exceeds complete file coverage");
    const read = hashRegularFile(hash, fullPath, maxFileBytes);
    if (read < stat.size) hash.update(`truncated\0${stat.size - read}\0`);
  }
}

function untrackedPaths(status) {
  const entries = status.split("\0").filter(Boolean);
  return entries
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3))
    .filter((entry) => entry && !path.isAbsolute(entry) && !entry.split("/").includes(".."))
    .sort();
}

function gitWorkspaceRevision(projectRoot, options = {}) {
  if (options.requireComplete) {
    const flags = git(projectRoot, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean);
    if (flags.some(entry => /^[a-zS] /.test(entry))) throw new Error("Workspace index hides file changes");
  }
  const head = git(projectRoot, ["rev-parse", "HEAD"]).trim();
  const status = git(projectRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const unstaged = git(projectRoot, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "HEAD", "--", "."]);
  const staged = git(projectRoot, ["diff", "--binary", "--cached", "--no-ext-diff", "--no-textconv", "HEAD", "--", "."]);
  const hash = createHash("sha256");
  hash.update(`head\0${head}\0status\0${status}\0unstaged\0${unstaged}\0staged\0${staged}\0`);
  const untracked = untrackedPaths(status);
  const maxUntracked = Number.isSafeInteger(options.maxUntracked) ? options.maxUntracked : 2000;
  if (options.requireComplete && untracked.length > maxUntracked) throw new Error("Workspace revision exceeds complete untracked coverage");
  for (const relPath of untracked.slice(0, maxUntracked)) {
    const fullPath = path.join(projectRoot, relPath);
    if (existsSync(fullPath)) hashPath(hash, projectRoot, relPath, options);
  }
  if (untracked.length > maxUntracked) hash.update(`untracked-truncated\0${untracked.length - maxUntracked}\0`);
  const stateHash = hash.digest("hex");
  return {
    kind: "git",
    token: `git:${head}:${stateHash}`,
    head,
    state_hash: `sha256:${stateHash}`,
    dirty: Boolean(status),
    changed_entries: status.split("\0").filter(Boolean).length,
    untracked_entries: untracked.length,
  };
}

function directoryEntries(root, options = {}) {
  const excludes = new Set([...(options.excludes || []), ...DEFAULT_EXCLUDES]);
  const result = [];
  function visit(relativeDir) {
    const fullDir = path.join(root, relativeDir);
    const entries = readdirSync(fullDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!relativeDir && excludes.has(entry.name)) continue;
      const relPath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      result.push(relPath);
      if (options.requireComplete && result.length > (options.maxEntries ?? 20_000)) throw new Error("Workspace revision exceeds complete directory coverage");
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(relPath);
    }
  }
  visit("");
  return result;
}

function directoryWorkspaceRevision(projectRoot, options = {}) {
  const hash = createHash("sha256");
  const entries = directoryEntries(projectRoot, options);
  const maxEntries = Number.isSafeInteger(options.maxEntries) ? options.maxEntries : 20_000;
  for (const relPath of entries.slice(0, maxEntries)) hashPath(hash, projectRoot, relPath, options);
  if (entries.length > maxEntries) hash.update(`entries-truncated\0${entries.length - maxEntries}\0`);
  const stateHash = hash.digest("hex");
  return {
    kind: "directory",
    token: `directory:${stateHash}`,
    head: null,
    state_hash: `sha256:${stateHash}`,
    dirty: null,
    changed_entries: entries.length,
    untracked_entries: null,
  };
}

export function workspaceRevision(projectPath, options = {}) {
  timeoutPolicy("workspaceRead"); // reject invalid policy before falling back from a Git probe
  const requested = path.resolve(projectPath);
  if (!existsSync(requested)) throw new Error("Workspace does not exist");
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Workspace must be a regular directory, not a symlink");
  const projectRoot = realpathSync(requested);
  return isGitWorkspace(projectRoot) && hasGitHead(projectRoot)
    ? gitWorkspaceRevision(projectRoot, options)
    : directoryWorkspaceRevision(projectRoot, options);
}

export function workspaceRevisionMatches(expected, current) {
  return Boolean(expected?.token && current?.token && expected.token === current.token);
}

export function workspaceRevisionDigest(value) {
  return `sha256:${digestText(JSON.stringify(value || null))}`;
}
