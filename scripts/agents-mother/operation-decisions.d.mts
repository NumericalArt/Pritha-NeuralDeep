import type { DeliveryTask } from "./task-delivery.mjs";
import type { CatalogOptions } from "./identity.mjs";
export type OperationAction = "start" | "tailscale-serve";
export type OperationRequest = { runId: string; requestId: string; action: OperationAction; planLock: string; decision: "approve" | "cancel" };
export type OperationPlan = { runId: string; agentId: string; action: OperationAction; planLock: string; enabled: boolean; label: string; summary: string; reason: string | null; pendingRequest: OperationRequest | null };
export type OperationReceipt = { requestId: string; action: OperationAction; runId: string; status: "started" | "completed" | "failed" | "cancelled"; replayed?: boolean };
type Target = { agentId: string; port: number; healthPath: string };
export type OperationRuntime = {
  startPlan(id: string): Promise<{ enabled: boolean; confirmation?: string; lock?: unknown }>;
  accessPlan(target: Target): Promise<{ enabled: boolean; lock?: unknown }>;
  start(id: string, confirmation: string): Promise<{ ok: boolean }>;
  serve(target: Target): Promise<{ ok: boolean }>;
};
export function planOperationDecision(task: DeliveryTask, runId: string, action: OperationAction, options: CatalogOptions & { runtime: OperationRuntime }): Promise<OperationPlan>;
export function resolveOperationDecision(task: DeliveryTask, request: OperationRequest, options: CatalogOptions & { runtime: OperationRuntime }): Promise<OperationReceipt>;
