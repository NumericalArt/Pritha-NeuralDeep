import type { NeuralDeepCoordinationStore } from "./coordination-store.mjs";
export type OperatorRequestRecord = {
  requestId: string; taskId: string; topicId: string; scope: string; generation: number; ownerGeneration: number;
  kind: "answer" | "approval" | "recovery" | "handoff"; context: Record<string, unknown>; status: "pending" | "accepted" | "completed" | "recovery_required";
  revision: number; intentId: string | null; answer: Record<string, unknown> | null; result: Record<string, unknown> | null;
};
export class OperatorRequestError extends Error { code: string; statusCode: number; constructor(code: string); }
export class NeuralDeepOperatorRequests {
  constructor(coordination: NeuralDeepCoordinationStore);
  get(id: string): OperatorRequestRecord | null;
  latest(taskId: string): OperatorRequestRecord | null;
  register(input: { requestId: string; taskId: string; topicId: string; scope: string; generation: number; ownerGeneration: number;
    kind: "answer" | "approval" | "recovery" | "handoff"; context: Record<string, unknown> }): OperatorRequestRecord;
  accept(input: { requestId: string; taskId: string; topicId: string; generation: number; expectedRevision: number; answer: Record<string, unknown> }): OperatorRequestRecord & { dispatch: boolean; duplicate: boolean };
  finish(requestId: string, intentId: string, result: Record<string, unknown>): OperatorRequestRecord;
}
