import type { NeuralDeepCoordinationStore } from './coordination-store.mjs';
export type ProviderBindingOptions = { root: string; stateRoot: string; agentParent: string };
export type ProviderReadiness = { configured?: boolean; models?: string[] };
export type ProviderBindingView = {
  agentId: string; mode: 'none' | 'instance-neuraldeep'; model: string | null; revision: number;
  state: string; configured: boolean; modelAvailable: boolean; restartRequired: boolean;
  blocker: { requestId: string; code: string } | null;
};
export class AgentProviderError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export function ownedProviderAgent(options: ProviderBindingOptions, agentId: string): { id: string; instanceKey: string; projectPath: string };
export class AgentProviderBindings {
  constructor(coordination: NeuralDeepCoordinationStore, options: ProviderBindingOptions);
  view(agentId: string, provider?: ProviderReadiness): ProviderBindingView;
  set(agentId: string, input: { mode: 'none' | 'instance-neuraldeep'; model?: string; expectedRevision: number }, provider?: ProviderReadiness): ProviderBindingView;
  issueEnvironment(agentId: string, options: { port: number; provider: ProviderReadiness }): Record<string,string>;
  authorize(agentId: string, token: string): { model: string; revision: number };
  reserve(agentId: string, token: string, requestId: string, requestHash: string): { model: string; revision: number; requestId: string };
  current(agentId: string, token: string, revision: number): void;
  dispatched(requestId: string, agentId: string, token: string): void;
  finish(requestId: string, input: { status: string; usage?: unknown }): void;
  pendingAccounting(): Array<Record<string, any>>;
  accounted(requestId: string): void;
}
export function managedAgentEnvironment(parent?: NodeJS.ProcessEnv, declared?: Record<string,string>, binding?: Record<string,string>): NodeJS.ProcessEnv & Record<string,string>;
export function redactAgentRuntimeOutput(value: unknown, environment?: Record<string,string | undefined>): string;
