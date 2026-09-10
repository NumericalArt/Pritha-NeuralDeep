import { coordinationHash } from "./coordination-store.mjs";
import path from "node:path";
import { executionResourceClaims } from "./execution-resources.mjs";

/** Join the host lease, or acquire a standalone CLI lease from the same authority. */
export async function acquireRuntimeAdmission(store, runtime, options, runId, limitProvider) {
  const sessionIdentity = session => coordinationHash(JSON.stringify([runtime.codexHome, runtime.upstreamOrigin, session]));
  const resources=executionResourceClaims({cwd:path.resolve(options.cwd || runtime.projectRoot),sandbox:options.passthrough === "inherit" ? "danger-full-access" : options.sandbox || "workspace-write",additionalWritableDirs:options.addDirs || []});
  let linked;
  if (process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT) {
    try { linked = JSON.parse(process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT); } catch { throw new Error("admission_runtime_owner_invalid"); }
    if (!linked?.attemptId || !linked?.ownerToken) throw new Error("admission_runtime_owner_invalid");
    store.assertRuntimeResources(linked.attemptId,resources);
    store.attachRuntime(linked.attemptId, linked.ownerToken, runId, options.resume ? sessionIdentity(options.resume) : null);
    return { bindSession: session => store.bindSession(linked.attemptId, linked.ownerToken, sessionIdentity(session)), finish() {} };
  }
  const attemptId = `runtime_${runId}`;
  const scope = coordinationHash(JSON.stringify([runtime.codexHome, options.resume || runId]));
  store.enqueue({ attemptId, workloadId: runId, surface: "delivery", coordinationKeyHash: scope, queuedAt: new Date().toISOString(),
    sessionKeyHash: options.resume ? sessionIdentity(options.resume) : null,
    payload: { runId, model: options.model || runtime.model },resources });
  let cancelled = false;
  const cancel = () => { cancelled = true; store.cancelQueued(attemptId); };
  process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
  try {
    const configured = Number(process.env.PRITHA_NEURALDEEP_LOCAL_PARALLEL_LIMIT || 64);
    const local = Number.isSafeInteger(configured) && configured >= 1 && configured <= 64 ? configured : 1;
    const refreshMs = Math.max(100, Math.min(options.limitRefreshMs || 5000, 60000));
    let claim, provider = 1, refreshedAt = 0;
    while (!cancelled) {
      if (Date.now() - refreshedAt >= refreshMs) {
        const supplied = await limitProvider().catch(() => null);
        provider = Number.isSafeInteger(supplied) && supplied >= 1 && supplied <= 64 ? supplied : 1;
        refreshedAt = Date.now();
      }
      if (cancelled || (claim = store.claim(attemptId, Math.min(provider,local)))) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!claim) throw new Error("admission_cancelled");
    store.attachRuntime(attemptId, claim.ownerToken, runId, options.resume ? sessionIdentity(options.resume) : null);
    return { bindSession: session => store.bindSession(attemptId, claim.ownerToken, sessionIdentity(session)),
      finish: outcome => store.finish(attemptId, claim.ownerToken, outcome) };
  } finally { process.off("SIGTERM", cancel); process.off("SIGINT", cancel); }
}
