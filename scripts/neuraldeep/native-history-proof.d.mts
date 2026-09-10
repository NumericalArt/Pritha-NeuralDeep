import type { ChatBinding } from '../../interfaces/control-center/src/lib/codex-chat/private-store';
export type NativeHistoryProof = { available: boolean; code: string; restoreAvailable: boolean; proofHash?: string; profileIdentity?: string; stateIdentityHash?: string; workspacePath?: string };
export function inspectNativeSession(binding: ChatBinding, options: { stateRoot: string; codeRoot: string; env?: Record<string, string | undefined> }): NativeHistoryProof;
