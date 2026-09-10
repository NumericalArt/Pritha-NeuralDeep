export class LocalExecBackend {
  constructor(options?: { killGraceMs?: number });
  execute(request: { argv: string[]; cwd: string; env?: Record<string, string>; timeoutMs?: number; outputBytesCap?: number }): Promise<{
    exitCode: number; stdout: string; stderr: string; timedOut: boolean; stdoutTruncated: boolean; stderrTruncated: boolean;
  }>;
}
