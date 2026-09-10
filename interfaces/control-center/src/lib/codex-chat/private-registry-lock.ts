import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_MS = 2 * 60_000;
const RETRY_MIN_MS = 12;
const RETRY_SPREAD_MS = 28;

type LockRecord = {
  version: 1;
  token: string;
  pid: number;
  hostname: string;
  createdAt: string;
  resource: string;
};

function inside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function safeResource(value: string) {
  const normalized = String(value || "task-chat-voice").trim().replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  return normalized || "task-chat-voice";
}

function processAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseLockRecord(text: string): LockRecord | null {
  try {
    const value = JSON.parse(text) as Partial<LockRecord>;
    if (value.version !== 1 || typeof value.token !== "string" || !value.token) return null;
    if (!Number.isSafeInteger(value.pid) || Number(value.pid) <= 0) return null;
    if (typeof value.hostname !== "string" || !value.hostname) return null;
    if (!Number.isFinite(Date.parse(String(value.createdAt || "")))) return null;
    return {
      version: 1,
      token: value.token,
      pid: Number(value.pid),
      hostname: value.hostname,
      createdAt: new Date(String(value.createdAt)).toISOString(),
      resource: safeResource(String(value.resource || "task-chat-voice")),
    };
  } catch {
    return null;
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class PrivateRegistryLockTimeoutError extends Error {
  readonly code = "private_registry_lock_timeout";
  constructor() {
    super("The private Task Chat registry is busy. Try again shortly.");
  }
}

async function moveStaleEvidence(params: {
  stateRoot: string;
  lockPath: string;
  staleRoot: string;
  record: LockRecord | null;
}) {
  await mkdir(params.staleRoot, { recursive: true, mode: 0o700 });
  const fingerprint = createHash("sha256")
    .update(params.record?.token || `${params.lockPath}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidencePath = path.join(params.staleRoot, `${path.basename(params.lockPath)}.${timestamp}.${fingerprint}.json`);
  if (!inside(params.stateRoot, evidencePath)) throw new Error("private_registry_lock_outside_state_root");
  try {
    await rename(params.lockPath, evidencePath);
    return true;
  } catch (error) {
    if (["ENOENT", "EEXIST"].includes(String((error as NodeJS.ErrnoException).code || ""))) return false;
    throw error;
  }
}

async function recoverIfStale(params: {
  stateRoot: string;
  lockPath: string;
  staleRoot: string;
  staleMs: number;
}) {
  let text = "";
  let modifiedAt = 0;
  try {
    [text, modifiedAt] = await Promise.all([
      readFile(params.lockPath, "utf8"),
      stat(params.lockPath).then((value) => value.mtimeMs),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  const record = parseLockRecord(text);
  const ageMs = Date.now() - (record ? Date.parse(record.createdAt) : modifiedAt);
  if (!record && ageMs < 1_000) return false;
  if (record?.hostname === hostname() && processAlive(record.pid)) return false;
  if (record?.hostname !== hostname() && ageMs < params.staleMs) return false;
  if (!record && ageMs < params.staleMs) return false;
  return moveStaleEvidence({
    stateRoot: params.stateRoot,
    lockPath: params.lockPath,
    staleRoot: params.staleRoot,
    record,
  });
}

async function releaseOwnedLock(lockPath: string, token: string) {
  let record: LockRecord | null = null;
  try {
    record = parseLockRecord(await readFile(lockPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (record?.token !== token) return;
  try {
    await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function withPrivateRegistryLock<T>(options: {
  stateRoot: string;
  lockDirectory?: string;
  resource?: string;
  timeoutMs?: number;
  staleMs?: number;
}, operation: () => Promise<T>) {
  const stateRoot = path.resolve(/* turbopackIgnore: true */ options.stateRoot);
  const resource = safeResource(options.resource || "task-chat-voice");
  const lockRoot = path.resolve(/* turbopackIgnore: true */ options.lockDirectory || path.join(stateRoot, "locks"));
  const staleRoot = path.join(lockRoot, "stale-evidence");
  const lockPath = path.join(lockRoot, `${resource}.lock`);
  if (!inside(stateRoot, lockRoot) || !inside(stateRoot, lockPath)) throw new Error("private_registry_lock_outside_state_root");
  await mkdir(lockRoot, { recursive: true, mode: 0o700 });

  const timeoutMs = Math.max(100, Math.min(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 60_000));
  const staleMs = Math.max(5_000, Math.min(Number(options.staleMs) || DEFAULT_STALE_MS, 24 * 60 * 60_000));
  const deadline = Date.now() + timeoutMs;
  const token = randomUUID();
  const record: LockRecord = {
    version: 1,
    token,
    pid: process.pid,
    hostname: hostname(),
    createdAt: new Date().toISOString(),
    resource,
  };

  while (true) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await recoverIfStale({ stateRoot, lockPath, staleRoot, staleMs });
      if (Date.now() >= deadline) throw new PrivateRegistryLockTimeoutError();
      await wait(RETRY_MIN_MS + Math.floor(Math.random() * RETRY_SPREAD_MS));
    }
  }

  try {
    return await operation();
  } finally {
    await releaseOwnedLock(lockPath, token);
  }
}
