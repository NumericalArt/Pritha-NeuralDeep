import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, open, readdir, realpath, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

const resourceQueues = new Map<string, Promise<void>>();
const TEMP_MAX_AGE_MS = 24 * 60 * 60_000;

function inside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function assertPrivateTarget(stateRoot: string, filePath: string) {
  const root = path.resolve(stateRoot);
  const target = path.resolve(filePath);
  if (!inside(root, target)) throw new Error("private_json_outside_state_root");
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const [realRoot, realParent] = await Promise.all([realpath(root), realpath(path.dirname(target))]);
  if (!inside(realRoot, realParent)) throw new Error("private_json_symlink_escape");
  return target;
}

async function cleanupOwnedTemporaryFiles(directory: string, baseName: string) {
  const prefix = `.${baseName}.pritha-`;
  const now = Date.now();
  let entries: string[] = [];
  try { entries = await readdir(directory); } catch { return; }
  await Promise.all(entries.filter((entry) => entry.startsWith(prefix) && entry.endsWith(".tmp")).map(async (entry) => {
    const candidate = path.join(directory, entry);
    try {
      const info = await stat(candidate);
      if (now - info.mtimeMs > TEMP_MAX_AGE_MS) await unlink(candidate);
    } catch { /* another writer may already have removed its own stale file */ }
  }));
}

function enqueue(resourceKey: string, operation: () => Promise<void>) {
  const prior = resourceQueues.get(resourceKey) || Promise.resolve();
  const current = prior.catch(() => undefined).then(operation);
  resourceQueues.set(resourceKey, current);
  return current.finally(() => {
    if (resourceQueues.get(resourceKey) === current) resourceQueues.delete(resourceKey);
  });
}

export async function atomicWritePrivateJson(options: {
  stateRoot: string;
  filePath: string;
  resourceKey?: string;
  value: unknown;
}) {
  const filePath = path.resolve(options.filePath);
  const key = `${path.resolve(options.stateRoot)}:${options.resourceKey || filePath}`;
  return enqueue(key, async () => {
    const target = await assertPrivateTarget(options.stateRoot, filePath);
    const directory = path.dirname(target);
    const temporary = path.join(directory, `.${path.basename(target)}.pritha-${randomUUID()}.tmp`);
    await cleanupOwnedTemporaryFiles(directory, path.basename(target));
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(options.value, null, 2)}\n`, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    await chmod(target, 0o600);
  });
}

export async function appendPrivateAuditEvent(options: {
  stateRoot: string;
  filePath: string;
  event: Record<string, unknown>;
}) {
  const key = `${path.resolve(options.stateRoot)}:audit:${path.resolve(options.filePath)}`;
  return enqueue(key, async () => {
    const target = await assertPrivateTarget(options.stateRoot, options.filePath);
    await appendFile(target, `${JSON.stringify(options.event)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(target, 0o600);
  });
}

export async function appendPrivateText(options: {
  stateRoot: string;
  filePath: string;
  resourceKey?: string;
  text: string | Uint8Array;
}) {
  const filePath = path.resolve(options.filePath);
  const key = `${path.resolve(options.stateRoot)}:append:${options.resourceKey || filePath}`;
  return enqueue(key, async () => {
    const target = await assertPrivateTarget(options.stateRoot, filePath);
    await appendFile(target, options.text, { encoding: "utf8", mode: 0o600 });
    await chmod(target, 0o600);
  });
}

export function pendingPrivateJsonWrites() {
  return resourceQueues.size;
}
