import type { VoiceRequestReceipt } from './voice-journal.mjs';
export function voiceRuntimeCredentials(): {
  origin: string;
  key: string;
  instanceId: string;
};
export function recordVoiceUsage(
  stateRoot: string,
  receipt: VoiceRequestReceipt,
): unknown;
