import {
  neuralDeepRuntimeConfig,
  readNeuralDeepCredential,
} from '../neuraldeep-codex.mjs';
import { recordNeuralDeepRun } from './usage-ledger.mjs';
let cached = null;
export function voiceRuntimeCredentials() {
  const config = neuralDeepRuntimeConfig();
  if (
    !cached ||
    cached.service !== config.keychainService ||
    cached.expiresAt < Date.now()
  )
    cached = {
      service: config.keychainService,
      key: readNeuralDeepCredential(config.keychainService),
      expiresAt: Date.now() + 30000,
    };
  return {
    origin: config.upstreamOrigin,
    key: cached.key,
    instanceId: config.instanceId,
  };
}
export function recordVoiceUsage(stateRoot, receipt) {
  return recordNeuralDeepRun({
    stateRoot,
    runId: receipt.id,
    source: 'voice-dialogue',
    workloadId: receipt.turn_id,
    sessionId: receipt.session_id,
    model: receipt.metadata.model || 'unknown',
    status: receipt.status,
    startedAt: receipt.started_at,
    finishedAt: receipt.finished_at,
    providerRequests: 1,
    usage: receipt.metadata.usage,
    usageKnown: receipt.metadata.usageKnown === true,
    billing: receipt.metadata.billing,
  });
}
