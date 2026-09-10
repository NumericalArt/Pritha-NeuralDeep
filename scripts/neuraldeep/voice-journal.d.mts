import type { NeuralDeepCoordinationStore } from './coordination-store.mjs';
export const VOICE_SCHEMA: string;
export function stableVoiceJson(value: unknown): string;
export function voiceRequestHash(value: unknown): string;
export function voiceOperationId(
  session: string,
  turn: string,
  step: number,
  ordinal: number,
): string;
export type VoiceOperationReceipt = {
  id: string;
  session_id: string;
  turn_id: string;
  name: string;
  request_hash: string;
  task_id: string | null;
  status: string;
  result: Record<string, unknown> | null;
};
export type VoiceRequestReceipt = {
  id: string;
  session_id: string;
  turn_id: string;
  kind: 'llm' | 'stt' | 'tts';
  status: string;
  started_at: string;
  finished_at: string | null;
  metadata: Record<string, unknown>;
  accounting_pending: number;
};
export class NeuralDeepVoiceJournal {
  constructor(store: NeuralDeepCoordinationStore);
  reserveOperation(input: {
    id: string;
    sessionId: string;
    turnId: string;
    name: string;
    args: Record<string, unknown>;
  }): VoiceOperationReceipt & { dispatch: boolean };
  operation(id: string): VoiceOperationReceipt | null;
  finishOperation(
    id: string,
    result: Record<string, unknown>,
  ): VoiceOperationReceipt;
  reserveTurn(
    session: string,
    id: string,
    hash: string,
  ): { dispatch: boolean; status: string };
  turn(session: string, id: string): { status: string } | null;
  finishTurn(session: string, id: string, status: string): void;
  claimRequest(input: {
    id: string;
    sessionId: string;
    turnId: string;
    kind: string;
    requestHash: string;
    metadata?: Record<string, unknown>;
  }): VoiceRequestReceipt;
  request(id: string): VoiceRequestReceipt | null;
  finishRequest(
    id: string,
    status: string,
    metadata: Record<string, unknown>,
    accountingPending?: boolean,
  ): void;
  pendingAccounting(): VoiceRequestReceipt[];
  accounted(id: string): void;
}
