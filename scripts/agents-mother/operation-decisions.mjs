import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { resolvePrithaStateRoot, resolvePrithaStatePathFrom, resolveTechscopeRoot } from "../lib/paths.mjs";
import { readAgentCatalog, findCatalogAgent, readAgentOperationsManifest, readIdentityEvidence } from "./identity.mjs";
import { readAgentResultReadiness } from "./result-readiness.mjs";
import { readTaskDelivery, TaskDeliveryError } from "./task-delivery.mjs";
import { workspaceRevision } from "./workspace-revision.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const valid = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const fail = (code, message) => { throw new TaskDeliveryError(code, message, 409); };

export async function planOperationDecision(task, runId, action, options) {
  if (!["start", "tailscale-serve"].includes(action)) fail("operation_invalid", "Choose Start or Tailscale Serve.");
  const root = path.resolve(options.root || resolveTechscopeRoot()), stateRoot = resolvePrithaStateRoot({ ...options, root });
  const input = { ...options, root, stateRoot };
  const run = readTaskDelivery(runId, task, input);
  if (run.bindingStatus !== "bound") fail("operation_task_unbound", "Bind this delivery to its original task first.");
  const agent = findCatalogAgent(readAgentCatalog({ ...input, fresh: true }), run.agentId);
  if (!agent?.projectPath || agent.identityStatus === "conflict") fail("operation_identity_unavailable", "Restore the canonical agent identity first.");
  const operation = readAgentOperationsManifest(agent);
  if (!operation.manifest || operation.issue) fail("operation_manifest_unavailable", "Review the agent's operations manifest first.");
  const manifest = operation.manifest;
  const revision = workspaceRevision(agent.projectPath, { requireComplete: true });
  const readiness = readAgentResultReadiness(agent.agentId, input);
  // Operator-judged Trials may require starting the service. Fresh machine
  // evidence permits an explicit operational decision without claiming acceptance.
  const verified = ["verified", "awaiting_operator"].includes(readiness.verification.status)
    && readiness.verification.reason === "fresh" && readiness.run?.id === runId
    && readiness.verification.counts?.automated > 0
    && readiness.verification.counts.passed === readiness.verification.counts.automated;
  let port = null, healthPath = null;
  try {
    const local = new URL(manifest.local_upstream_url), health = new URL(manifest.health_url);
    if (local.protocol === "http:" && local.hostname === "127.0.0.1" && !local.username && !local.password && local.origin === health.origin && !health.search && !health.hash && local.pathname === "/") {
      port = Number(local.port); healthPath = health.pathname;
    }
  } catch { /* A missing loopback endpoint disables Serve, never infers a port. */ }
  const preview = action === "start" ? await options.runtime.startPlan(agent.agentId)
    : port && healthPath ? await options.runtime.accessPlan({ agentId: agent.agentId, port, healthPath }) : { enabled: false };
  if (hash(workspaceRevision(agent.projectPath, { requireComplete: true })) !== hash(revision)) fail("operation_plan_changed", "The project changed while preparing the plan.");
  const enabled = verified && preview?.enabled === true;
  const bound = { task: { chatId: task.chatId, nativeThreadId: task.nativeThreadId, providerId: task.providerId, stateIdentityHash: task.stateIdentityHash },
    instanceKey: agent.instanceKey, runId, runRevision: run.revision, agentId: agent.agentId,
    projectRevision: revision, manifestHash: hash(manifest), action, port, healthPath,
    enabled, confirmation: preview?.confirmation || "", runtimeLock: preview?.lock || null };
  let pendingRequest = null;
  const pendingFile = resolvePrithaStatePathFrom(input, "audit", "operation-decisions", `${hash([task.stateIdentityHash, runId])}-pending.json`);
  if (existsSync(pendingFile)) {
    try {
      const saved = JSON.parse(readIdentityEvidence(pendingFile, stateRoot, 64_000));
      if (saved.status === "started" && saved.binding === hash([task.chatId, task.nativeThreadId, task.stateIdentityHash, saved.request])) pendingRequest = saved.request;
    } catch { fail("operation_receipt_invalid", "Recover the saved operation evidence first."); }
  }
  return { ...bound, planLock: hash(bound), pendingRequest, label: action === "start" ? "Start" : "Tailscale Serve",
    summary: action === "start" ? "Запустить выбранный управляемый сервис агента." : `Открыть приватный доступ к сервису на порту ${port || "не задан"}. Доступ с другого устройства проверяется отдельно.`,
    reason: enabled ? null : !verified ? "Сначала нужна проверка текущей канонической ревизии агента." : "Управляемая операция пока недоступна; проверьте Operations.",
  };
}

function receiptDirectory(stateRoot, options) {
  if (!lstatSync(stateRoot).isDirectory() || lstatSync(stateRoot).isSymbolicLink()) fail("operation_store_unsafe", "Restore the instance state boundary first.");
  let current = stateRoot;
  const target = resolvePrithaStatePathFrom(options, "audit", "operation-decisions");
  for (const segment of path.relative(stateRoot, target).split(path.sep)) {
    current = path.join(current, segment);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) fail("operation_store_unsafe", "Restore private operation evidence first.");
  }
  return current;
}

export async function resolveOperationDecision(task, request, options) {
  if (!valid(request?.requestId) || !valid(request.runId) || !["approve", "cancel"].includes(request.decision)
    || !["start", "tailscale-serve"].includes(request.action) || !/^[a-f0-9]{64}$/.test(request.planLock || "")) fail("operation_request_invalid", "Choose a current operation card.");
  const stateRoot = resolvePrithaStateRoot(options), directory = receiptDirectory(stateRoot, options);
  // Serialize this agent/run's decisions across processes; a started receipt is
  // deliberately not replayed after a lost response or host restart.
  const file = path.join(directory, `${hash([task.chatId, request.runId, request.requestId])}.json`);
  const pendingFile = path.join(directory, `${hash([task.stateIdentityHash, request.runId])}-pending.json`);
  const binding = hash([task.chatId, task.nativeThreadId, task.stateIdentityHash, request]);
  return withFileLock(path.join(directory, hash([task.stateIdentityHash, request.runId])), async () => {
    if (existsSync(file)) {
      let saved; try { saved = JSON.parse(readIdentityEvidence(file, stateRoot, 64_000)); } catch { fail("operation_receipt_invalid", "Recover the previous operation receipt before retrying."); }
      if (saved.binding !== binding) fail("operation_idempotency_conflict", "This identifier already belongs to another operation.");
      return { ...saved, replayed: true };
    }
    if (existsSync(pendingFile)) {
      let previous; try { previous = JSON.parse(readIdentityEvidence(pendingFile, stateRoot, 64_000)); } catch { fail("operation_receipt_invalid", "Recover the previous operation receipt first."); }
      if (previous.status === "started") fail("operation_pending", "The previous operation is unconfirmed; inspect its saved result before starting another.");
    }
    const plan = await planOperationDecision(task, request.runId, request.action, options);
    if (plan.planLock !== request.planLock) fail("operation_plan_changed", "The plan changed. Review a fresh operation card.");
    if (request.decision === "approve" && !plan.enabled) fail("operation_unavailable", plan.reason);
    const receipt = { request, requestId: request.requestId, binding, action: request.action, runId: request.runId, status: request.decision === "cancel" ? "cancelled" : "started", at: new Date().toISOString() };
    atomicWriteFile(file, JSON.stringify(receipt) + "\n");
    if (receipt.status === "cancelled") return receipt;
    atomicWriteFile(pendingFile, JSON.stringify(receipt) + "\n");
    try {
      const result = request.action === "start" ? await options.runtime.start(plan.agentId, plan.confirmation)
        : await options.runtime.serve({ agentId: plan.agentId, port: plan.port, healthPath: plan.healthPath });
      receipt.status = result?.ok === true ? "completed" : "failed";
    } catch { receipt.status = "failed"; }
    atomicWriteFile(file, JSON.stringify(receipt) + "\n");
    atomicWriteFile(pendingFile, JSON.stringify(receipt) + "\n");
    return receipt;
  });
}
