export type DiagnosticResult = { status: number | null; stdout: string; stderr: string; error: { code: string } | null };
export function runAsyncProbe(command: string, args: string[], options?: { timeout?: number; policy?: string; cwd?: string; env?: NodeJS.ProcessEnv }): Promise<DiagnosticResult>;
export function createAsyncProbeRunner(backend?: { execute(request: object): Promise<{ exitCode: number; stdout: string; stderr: string; stdoutTruncated?: boolean; stderrTruncated?: boolean; timedOut?: boolean }> }): typeof runAsyncProbe;
export function createProbeCache(options?: { ttlMs?: number; maxEntries?: number; now?: () => number }): {
  invalidate(key?: string): void;
  get<T>(key: string, loader: () => T | Promise<T>, options?: { fresh?: boolean }): Promise<T>;
};
export function sharedProbeCache(namespace: string, options?: { ttlMs?: number; maxEntries?: number; now?: () => number }): ReturnType<typeof createProbeCache>;
