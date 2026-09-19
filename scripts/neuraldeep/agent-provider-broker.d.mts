import type { AgentProviderBindings } from './agent-provider-binding.mjs';
export function flushAgentProviderAccounting(bindings: AgentProviderBindings, stateRoot: string, recorder?: (input: any) => unknown): void;
export function handleAgentProviderRequest(request: Request, agentId: string, options: {
  bindings: AgentProviderBindings; stateRoot: string;
  acquire: (input: { attemptId: string; surface: 'child_agent'; workloadId: string; coordinationKey: string; signal: AbortSignal }) => Promise<{ release: (outcome: 'completed' | 'failed' | 'cancelled') => Promise<void> }>;
  credentials: () => { origin: string; key: string } | Promise<{ origin: string; key: string }>;
  fetcher?: typeof fetch; recorder?: (input: any) => unknown; timeoutMs?: number;
}): Promise<Response>;
