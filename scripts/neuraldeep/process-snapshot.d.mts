export type ProcessIdentity = { pid: number; parent: number; group: number; session: number; state: string; started: string };
export type ProcessTreeEvidence = { version: 1; session: number; leaderStarted?: string; coverage?: "observed" | "unknown"; escaped: Array<{ pid: number; started: string }> };
export function processSnapshot(): ProcessIdentity[];
export function processTreeExited(evidence: unknown, snapshot?: ProcessIdentity[]): boolean;
export function signalCurrentSession(signal: "SIGTERM" | "SIGINT" | "SIGKILL", options?: { includeLeaderGroup?: boolean }): void;
