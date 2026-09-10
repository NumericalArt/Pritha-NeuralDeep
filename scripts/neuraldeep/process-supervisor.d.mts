import type { ChildProcess } from "node:child_process";
import type { ProcessTreeEvidence } from "./process-snapshot.mjs";
export type SupervisedCliResult = { code: number | null; signal: NodeJS.Signals | null; processTreeExited: boolean; evidence: ProcessTreeEvidence | null; error: string | null; launchErrorCode: string | null };
export function spawnSupervisedCli(command: string, args: string[], options?: {
  cwd?: string; env?: NodeJS.ProcessEnv; inherit?: boolean;
  beforeStart?: (evidence: ProcessTreeEvidence) => void | Promise<void>;
  onEvidence?: (evidence: ProcessTreeEvidence) => void;
}): Promise<{ child: ChildProcess; completion: Promise<SupervisedCliResult>; evidence: ProcessTreeEvidence; stop: (signal?: "SIGTERM" | "SIGINT") => boolean }>;
