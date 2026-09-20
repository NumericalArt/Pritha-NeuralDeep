export type ProjectMetadataFile = { status: "read" | "missing" | "unavailable"; text: string; mtime: string | null; mode: string | null };
export type ProjectMetadata = { schema: "pritha-project-metadata-v1"; manifest: { manifest: Record<string, unknown> | null; present: boolean | null; issue: string | null }; envExample: ProjectMetadataFile; envLocal: ProjectMetadataFile };
export function unavailableProjectMetadata(reason?: string): ProjectMetadata;
export function projectMetadataIssueMessage(issue: string | null | undefined): string | null;
export function readProjectMetadataAsync(projectPath: string, options?: { codeRoot?: string; timeoutMs?: number }): Promise<ProjectMetadata>;
