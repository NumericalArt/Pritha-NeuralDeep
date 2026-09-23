import type { DeliveryTask, TaskDeliveryView } from "../agents-mother/task-delivery.mjs";
export class CreationDeliveryError extends Error { code: string }
export type CreationDeliveryOptions = {
  root: string; stateRoot: string; agentParent?: string; model?: string; effort?: string;
  task: DeliveryTask; signal?: AbortSignal; shouldContinue?: () => boolean | Promise<boolean>;
  onRunId?: (runId: string) => void | Promise<void>;
  buildExecutor?: unknown; trialBackend?: string; reportDir?: string | false;
};
export type CreationDeliveryResult = {
  runId: string; runRoot: string; status: string; blocker: any; adopted: boolean; head: string | null; acceptance: "not_accepted";
  usage: { preparationTokens: number; deliveryTokens: number; knownTotalTokens: number; coverage: string; activeMs: number; iterations: number; maxTokens: number; scope: string };
  taskDelivery: TaskDeliveryView;
  recovery: {verifySaved:boolean;adoptVerified:boolean;evidenceFresh:boolean;modelUse:string;reason:string};
};
export function creationDeliveryRunId(job: any): string;
export function readCreationDelivery(job: any, options: CreationDeliveryOptions): CreationDeliveryResult | null;
export function runCreationDelivery(job: any, options: CreationDeliveryOptions): Promise<CreationDeliveryResult>;
export function recoverCreationDelivery(job:any,options:CreationDeliveryOptions & {action:'verify_saved'|'adopt_verified';requestId:string}):Promise<CreationDeliveryResult>;
