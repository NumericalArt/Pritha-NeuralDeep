import path from "node:path";
import { spawnSupervisedCli } from "../neuraldeep/process-supervisor.mjs";
import { SearchService } from "./service.mjs";
const workers = new Map();
export async function ensureResearchWorker(options) {
  const { stateRoot, codeRoot, instance } = options,
    key = path.resolve(stateRoot);
  if (workers.has(key)) return workers.get(key);
  const ready = spawnSupervisedCli(
    process.execPath,
    [path.join(codeRoot, "scripts/search/research-worker.mjs")],
    {
      cwd: codeRoot,
      env: {
        ...process.env,
        PRITHA_STATE_ROOT: stateRoot,
        TECHSCOPE_ROOT: codeRoot,
        PRITHA_INSTANCE_ID: instance || "pritha",
      },
    },
  );
  workers.set(key, ready);
  try {
    const owned = await ready;
    owned.child.stdout.resume();
    owned.child.stderr.resume();
    void owned.completion.then(
      (result) => {
        workers.delete(key);
        if (result.code !== 0 || !result.processTreeExited) return;
        const service = new SearchService({ stateRoot, codeRoot, instance });
        let queued;
        try {
          queued = Boolean(
            service.store.db
              .prepare("SELECT id FROM jobs WHERE state='queued'")
              .get(),
          );
        } finally {
          service.store.close();
        }
        if (queued) void ensureResearchWorker(options).catch(() => {});
      },
      () => workers.delete(key),
    );
  } catch (e) {
    workers.delete(key);
    throw e;
  }
}
export async function wakeResearchHost() {
  const port = Number(process.env.PRITHA_CONTROL_CENTER_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("research_host_unavailable");
  const r = await fetch(`http://127.0.0.1:${port}/api/search/research/wake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instance: process.env.PRITHA_INSTANCE_ID }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("research_host_unavailable");
}
