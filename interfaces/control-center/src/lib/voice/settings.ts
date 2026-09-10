export const VOICE_SETTINGS_CHANGED_EVENT = 'pritha:voice-settings-changed';
export type VoiceTransportId = 'openai_realtime' | 'neuraldeep_chained';
export const CHAINED_VOICES = [
  'serena',
  'vivian',
  'ono_anna',
  'sohee',
] as const;
export type ChainedVoiceSettings = {
  model: 'qwen3.6-35b-a3b-noreason';
  sttModel: 'whisper-1';
  voice: (typeof CHAINED_VOICES)[number];
  language: 'auto' | 'ru' | 'en';
};
export const DEFAULT_CHAINED_VOICE_SETTINGS: ChainedVoiceSettings = {
  model: 'qwen3.6-35b-a3b-noreason',
  sttModel: 'whisper-1',
  voice: 'serena',
  language: 'auto',
};
export function validChainedVoicePatch(
  value: unknown,
): value is Partial<ChainedVoiceSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, v]) =>
    key === 'model'
      ? v === DEFAULT_CHAINED_VOICE_SETTINGS.model
      : key === 'sttModel'
        ? v === 'whisper-1'
        : key === 'voice'
          ? CHAINED_VOICES.includes(v as ChainedVoiceSettings['voice'])
          : key === 'language'
            ? ['auto', 'ru', 'en'].includes(String(v))
            : false,
  );
}
export function normalizeChainedVoiceSettings(
  value: unknown,
): ChainedVoiceSettings {
  return validChainedVoicePatch(value)
    ? { ...DEFAULT_CHAINED_VOICE_SETTINGS, ...value }
    : { ...DEFAULT_CHAINED_VOICE_SETTINGS };
}
