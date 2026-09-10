import { randomUUID } from "node:crypto";
import { boundedJson, credential } from "./provider.mjs";
import {
  NeuralDeepCoordinationStore,
  neuralDeepCoordinationPaths,
  coordinationHash,
} from "../neuraldeep/coordination-store.mjs";
import {
  loadNeuralDeepAccountSnapshot,
  billingContextForModel,
} from "../neuraldeep/account-snapshot.mjs";
import { recordNeuralDeepRun } from "../neuraldeep/usage-ledger.mjs";
import { assertNeuralDeepDispatchAllowed } from "../neuraldeep/release-maintenance.mjs";
import { SearchError } from "./contracts.mjs";
export function researchModelCall({ stateRoot, codeRoot, store, job }) {
  return async (body, { signal, timeoutMs, beforeDispatch }) => {
    assertNeuralDeepDispatchAllowed(stateRoot);
    const token = await credential();
    const journal = new NeuralDeepCoordinationStore(
      neuralDeepCoordinationPaths(stateRoot, codeRoot),
    );
    const id = `research_http_${randomUUID()}`;
    let claim = null,
      success = false,
      dispatched = false,
      timer;
    const startedAt = new Date().toISOString();
    try {
      const account = await loadNeuralDeepAccountSnapshot({
        stateRoot,
        token,
        apiOrigin: "https://api.neuraldeep.ru",
      });
      signal.throwIfAborted();
      journal.enqueue({
        attemptId: id,
        workloadId: job.id,
        surface: "delivery",
        coordinationKeyHash: coordinationHash(id),
        queuedAt: startedAt,
      });
      let limit =
        account.sections?.limits?.stale === false
          ? Math.max(1, Math.min(account.limits?.parallelLimit || 1, 64))
          : 1;
      const local = Math.max(
        1,
        Math.min(
          Number(process.env.PRITHA_NEURALDEEP_LOCAL_PARALLEL_LIMIT) || 64,
          64,
        ),
      );
      limit = Math.min(limit, local);
      let refreshedAt = Date.now();
      const waitUntil = Date.now() + 300000;
      while (!(claim = journal.claim(id, limit))) {
        if (Date.now() > waitUntil) throw new SearchError("admission_timeout");
        signal.throwIfAborted();
        if (Date.now() - refreshedAt > 5000) {
          const fresh = await loadNeuralDeepAccountSnapshot({
            stateRoot,
            token,
            apiOrigin: "https://api.neuraldeep.ru",
          });
          limit = Math.min(
            local,
            fresh.sections?.limits?.stale === false
              ? Math.max(1, fresh.limits?.parallelLimit || 1)
              : 1,
          );
          refreshedAt = Date.now();
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      signal.throwIfAborted();
      assertNeuralDeepDispatchAllowed(stateRoot);
      const controller = new AbortController();
      timer = setTimeout(
        () => controller.abort(new SearchError("timeout")),
        Math.min(timeoutMs, 60000),
      );
      const combined = AbortSignal.any([signal, controller.signal]);
      beforeDispatch();
      dispatched = true;
      const receipt = {
        stateRoot,
        runId: id,
        source: "agent-mother",
        workloadId: job.id,
        model: body.model,
        startedAt,
        finishedAt: null,
        status: "unknown",
        providerRequests: 1,
        usage: null,
        usageKnown: false,
        billing: billingContextForModel(account, body.model),
      };
      store.meta(`research_usage:${id}`, receipt);
      const response = await boundedJson(
        "https://api.neuraldeep.ru/v1/chat/completions",
        { method: "POST", body, token, signal: combined },
      );
      combined.throwIfAborted();
      receipt.finishedAt = new Date().toISOString();
      receipt.status = "completed";
      receipt.usage = response.usage;
      receipt.usageKnown = Boolean(response.usage);
      store.meta(`research_usage:${id}`, receipt);
      try {
        recordNeuralDeepRun(receipt);
        store.meta(`research_usage:${id}`, { accounted: true });
      } catch {
        /* Recovery accounts receipt without repeating a completed response. */
      }
      success = true;
      return response;
    } finally {
      clearTimeout(timer);
      if (claim)
        journal.finish(
          id,
          claim.ownerToken,
          success ? "completed" : signal.aborted ? "cancelled" : "failed",
        );
      else journal.cancelQueued(id);
      journal.close();
      if (dispatched && !success) {
        const receipt = store.meta(`research_usage:${id}`);
        if (receipt && !receipt.accounted) {
          receipt.finishedAt = new Date().toISOString();
          receipt.status = "failed";
          store.meta(`research_usage:${id}`, receipt);
          try {
            recordNeuralDeepRun(receipt);
            store.meta(`research_usage:${id}`, { accounted: true });
          } catch {
            /* Reconcile accounting without replaying inference. */
          }
        }
      }
    }
  };
}

export function reconcileResearchUsage(store, record = recordNeuralDeepRun) {
  for (const row of store.db
    .prepare("SELECT key,value FROM metadata WHERE key LIKE 'research_usage:%'")
    .all()) {
    const receipt = JSON.parse(row.value);
    if (receipt.accounted) continue;
    // Another host process may start a worker while the first still owns a job.
    // Recover only receipts whose job has been reconciled to a terminal state.
    const job = store.db
      .prepare("SELECT state FROM jobs WHERE id=?")
      .get(receipt.workloadId);
    if (!job || ["queued", "running", "cancelling"].includes(job.state))
      continue;
    try {
      record({
        ...receipt,
        finishedAt: receipt.finishedAt || new Date().toISOString(),
        status: receipt.status === "unknown" ? "interrupted" : receipt.status,
      });
      store.meta(row.key, { accounted: true });
    } catch {
      /* Persisted receipt remains for later accounting; inference is never replayed. */
    }
  }
}
