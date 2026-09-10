import type { CatalogOptions } from "./identity.mjs";
import type { DeliveryUsageView } from "./phase-usage.mjs";
export type DeliveryTask = { chatId: string; nativeThreadId: string; providerId: "neuraldeep_cli"; stateIdentityHash: string | null };
export type DeliveryBudgetChange = { mode: "add" | "set"; tokens: number; resume: boolean; addIterations?: number; addElapsedMs?: number };
export type TaskDeliveryRequest = { runId: string; requestId: string; expectedRevision: string; action: "bind" | "verify" | "prepare_handoff" | "budget"; budget?: DeliveryBudgetChange; sourceTextHash?: string };
export type TaskDeliveryView = {
  runId: string; agentId: string; agentName: string; status: string; specId: string;
  bindingStatus: "unbound" | "bound" | "other_task"; revision: string;
  budget: { tokensUsed: number; maxTokens: number; scope: "build-executor"; usageStatus: "complete" | "unknown" | "legacy-unknown";
    iterations: number; maxIterations: number; elapsedMs: number; maxElapsedMs: number };
  actions: { verify: boolean; prepareHandoff: boolean; budget: boolean };
  plan: { backend: string; commands: Array<{ id: string; argv: string[]; cwd: string; timeoutMs: number; isolation: string }>;
    outputBytesCap: number; concurrency: number; maxVerificationPasses: number; effects: string };
  receipts: Array<{ requestId: string; action: TaskDeliveryRequest["action"]; status: "started" | "completed" | "failed" | "interrupted";
    request: TaskDeliveryRequest | null;
    result: { status?: string; code?: string; handoff?: string | null; retry?: string; resume?: string; tokensUsed?: number; maxTokens?: number } | null }>;
  acceptance: "accepted_by_user" | "not_accepted";
  preparation: { preparedAt: string; demo: string[]; head: string | null; verification: string; acceptance: string } | null;
  usage: DeliveryUsageView;
};
export class TaskDeliveryError extends Error { code: string; status: number }
export function normalizeTaskDeliveryBudgetRequest(input: TaskDeliveryRequest): TaskDeliveryRequest;
export function readTaskDelivery(runId: string, task: DeliveryTask, options?: CatalogOptions): TaskDeliveryView;
export function listTaskDeliveries(task: DeliveryTask, options?: CatalogOptions): Array<{ runId: string; status: string }>;
export function performTaskDeliveryAction(task: DeliveryTask, input: TaskDeliveryRequest, options?: CatalogOptions): Promise<{ run: TaskDeliveryView; replayed: boolean }>;
