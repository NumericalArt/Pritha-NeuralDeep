export type TargetFileManifest = {
  schema: "pritha-target-file-manifest-v1"; targetRoot: string; targetKey: string; capturedAt: string;
  exists: boolean; complete: boolean; files: Array<{ path: string; size: number; sha256: string; executable: boolean }>;
  excludedEntries: number; issues: string[]; hashedBytes: number;
};
export type TargetFileDiff = { schema: "pritha-target-file-diff-v1"; targetKey: string; complete: boolean; added: string[]; modified: string[]; deleted: string[]; issues: string[] };
export const TARGET_FILE_MANIFEST_SCHEMA: "pritha-target-file-manifest-v1";
export function captureTargetFileManifest(targetRoot: string, options?: { allowedParent?: string; maxFiles?: number; maxEntries?: number; maxFileBytes?: number; maxTotalBytes?: number; maxDurationMs?: number }): TargetFileManifest;
export function diffTargetFileManifests(before: TargetFileManifest, after: TargetFileManifest): TargetFileDiff;
