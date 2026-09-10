export class VoiceProviderError extends Error {
  code: string;
  status: number;
  constructor(code: string, status?: number);
}
export function readBoundedBody(
  response: Response,
  limit: number,
): Promise<Buffer>;
export function parseVoiceSSE(
  response: Response,
): AsyncGenerator<Record<string, any>>;
export function validateVoiceWav(
  bytes: Uint8Array,
  options?: { sampleRate?: number; maxSeconds?: number; maxBytes?: number },
): { seconds: number; rms: number };
export function voiceHttp(input: {
  origin: string;
  key: string;
  endpoint: string;
  body: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): Promise<Response>;
export function speechPhrases(text: string): string[];
