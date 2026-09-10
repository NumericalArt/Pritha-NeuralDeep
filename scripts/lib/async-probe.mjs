import { LocalExecBackend } from '../agents-mother/execution-backends.mjs';
import { timeoutPolicy } from './timeout-policy.mjs';

const unavailable = code => ({ status: null, stdout: '', stderr: '', error: { code } });

export function createAsyncProbeRunner(backend = new LocalExecBackend({ killGraceMs: 100 })) {
  const queue = [];
  let active = 0;
  function drain() {
    while (active < 4 && queue.length) {
      const job = queue.shift();
      const remaining = job.deadline - Date.now();
      if (remaining <= 0) { job.resolve(unavailable('ETIMEDOUT')); continue; }
      active++;
      backend.execute({ argv: job.argv, cwd: job.cwd, env: job.env, timeoutMs: remaining, outputBytesCap: 256_000 })
        .then(result => job.resolve({ status: result.stdoutTruncated || result.stderrTruncated ? null : result.exitCode, stdout: result.stdout, stderr: result.stderr,
          error: result.timedOut ? { code: 'ETIMEDOUT' } : result.stdoutTruncated || result.stderrTruncated ? { code: 'OUTPUT_LIMIT' } : result.exitCode === 127 ? { code: 'EXEC_FAILED' } : null }))
        .catch(() => job.resolve(unavailable('EXEC_FAILED')))
        .finally(() => { active--; drain(); });
    }
  }

  // Host diagnostic argv only; caller-controlled agent commands use command-probe.
  // The deadline includes queue time. No Next.js import or request-lifetime process.
  return function runAsyncProbe(command, args, options = {}) {
    const timeout = timeoutPolicy(options.policy || 'diagnostic', { value: options.timeout });
    if (queue.length >= 64) return Promise.resolve(unavailable('EBUSY'));
    return new Promise(resolve => {
      let settled = false;
      const job = { argv: [command, ...args], cwd: options.cwd || process.cwd(), env: options.env || process.env,
        deadline: Date.now() + timeout, timer: null,
        resolve(result) { if (!settled) { settled = true; clearTimeout(job.timer); resolve(result); } },
      };
      // Returning an unavailable diagnostic must not wait for the OS to reap a
      // killed process or close its pipes. Keep its execution slot occupied until
      // backend cleanup finishes, so late reaping cannot create unbounded workers.
      job.timer = setTimeout(() => {
        const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
        job.resolve(unavailable('ETIMEDOUT'));
      }, timeout);
      queue.push(job); drain();
    });
  };
}

export const runAsyncProbe = createAsyncProbeRunner();

export function createProbeCache({ ttlMs = 120_000, maxEntries = 16, now = Date.now } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300_000 || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 128) throw new Error('Invalid probe cache bounds');
  const entries = new Map();
  return {
    invalidate(key) { if (key === undefined) entries.clear(); else entries.delete(key); },
    async get(key, loader, { fresh = false } = {}) {
      if (fresh) entries.delete(key);
      const existing = entries.get(key);
      if (existing && (existing.pending || existing.expiresAt > now())) return existing.promise;
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const entry = { pending: true, expiresAt: 0, promise: null };
      entry.promise = Promise.resolve().then(loader).then(value => { entry.pending = false; entry.expiresAt = now() + ttlMs; return value; }, error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
      entries.set(key, entry); return entry.promise;
    },
  };
}

// Next may evaluate API and server-rendered modules in separate bundles in the
// same process. Share only explicitly named host caches; each value still has
// an instance-scoped key and the normal bounded TTL/invalidation rules.
export function sharedProbeCache(namespace, options = {}) {
  if (!/^[a-z0-9-]{1,64}$/.test(namespace)) throw new Error('Invalid probe cache namespace');
  const key = Symbol.for('pritha.shared-probe-caches.v1');
  const caches = globalThis[key] ||= new Map();
  if (!caches.has(namespace)) {
    if (caches.size >= 16) throw new Error('Shared probe cache limit exceeded');
    caches.set(namespace, createProbeCache(options));
  }
  return caches.get(namespace);
}
