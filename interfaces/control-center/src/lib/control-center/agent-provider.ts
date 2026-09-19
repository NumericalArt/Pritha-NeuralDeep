import { AgentProviderBindings, AgentProviderError, ownedProviderAgent, type ProviderBindingView } from '../../../../../scripts/neuraldeep/agent-provider-binding.mjs';
import { handleAgentProviderRequest } from '../../../../../scripts/neuraldeep/agent-provider-broker.mjs';
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from '../../../../../scripts/neuraldeep/coordination-store.mjs';
import { voiceRuntimeCredentials } from '../../../../../scripts/neuraldeep/voice-runtime-config.mjs';
import { getNeuralDeepCredentialStatus } from '@/lib/settings/neuraldeep-credentials';
import { getNeuralDeepServiceCatalog } from '@/lib/settings/codex-model-catalog-server';
import { getNeuralDeepAdmissionCoordinator } from '@/lib/codex-chat/admission-coordinator';
import { resolvePrithaAgentParent, resolvePrithaStateRoot, resolveTechscopeRoot } from '@/lib/pritha-paths';

function context() {
  const root = resolveTechscopeRoot();
  return { root, stateRoot: resolvePrithaStateRoot(root), agentParent: resolvePrithaAgentParent(root) };
}
async function withBindings<T>(agentId: string, operation: (bindings: AgentProviderBindings, stateRoot: string) => Promise<T>): Promise<T> {
  const options = context();
  // Reject foreign and history-only identities before touching any local store.
  ownedProviderAgent(options, agentId);
  const store = new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(options.stateRoot, options.root));
  try { return await operation(new AgentProviderBindings(store, options), options.stateRoot); }
  finally { store.close(); }
}
async function readiness() {
  const catalog = await getNeuralDeepServiceCatalog().catch(() => null);
  return { configured: getNeuralDeepCredentialStatus().configured,
    models: catalog?.chat.map(model => model.id) || [], source: catalog?.source || 'unavailable' };
}
export type AgentProviderPanelResponse = { ok: true; binding: ProviderBindingView; models: string[]; source: string };
export async function getAgentProviderBinding(agentId: string): Promise<AgentProviderPanelResponse> {
  return withBindings(agentId, async bindings => {
    const provider = await readiness();
    return { ok: true, binding: bindings.view(agentId, provider), models: provider.models, source: provider.source };
  });
}
export async function setAgentProviderBinding(agentId: string, input: { mode: 'none' | 'instance-neuraldeep'; model?: string; expectedRevision: number }): Promise<AgentProviderPanelResponse> {
  return withBindings(agentId, async bindings => {
    const provider = input?.mode === 'none' ? { configured: false, models: [] as string[], source: 'unavailable' } : await readiness();
    return { ok: true, binding: bindings.set(agentId, input, provider), models: provider.models, source: provider.source };
  });
}
export async function agentProviderStartEnvironment(agentId: string, serviceRunning: boolean | (() => Promise<boolean>) = false) {
  // Legacy folder-only cards retain their existing lifecycle without receiving
  // provider access. They need an instance-owned contract before explicit binding.
  try { ownedProviderAgent(context(), agentId); }
  catch (error) { if (error instanceof AgentProviderError && ['provider_agent_not_owned','provider_runtime_unsupported'].includes(error.code)) return {}; throw error; }
  return withBindings(agentId, async bindings => {
    if (bindings.view(agentId).mode === 'none') return {};
    if (typeof serviceRunning === 'function' ? await serviceRunning() : serviceRunning) throw new AgentProviderError('provider_agent_restart_required');
    const provider = await readiness();
    return bindings.issueEnvironment(agentId, { provider, port: Number(process.env.PRITHA_CONTROL_CENTER_PORT || 3420) });
  });
}
export async function agentProviderCompletion(request: Request, agentId: string) {
  return withBindings(agentId, async (bindings, stateRoot) => handleAgentProviderRequest(request, agentId, {
    bindings, stateRoot, credentials: voiceRuntimeCredentials,
    acquire: input => getNeuralDeepAdmissionCoordinator().acquire(input),
  }));
}
export function agentProviderErrorResponse(error: unknown) {
  return Response.json({ ok: false, error: { code: error instanceof AgentProviderError ? error.code : 'provider_binding_unavailable' } },
    { status: error instanceof AgentProviderError ? error.status : 503, headers: { 'cache-control': 'no-store' } });
}
