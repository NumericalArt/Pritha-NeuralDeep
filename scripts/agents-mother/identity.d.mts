import type { AgentKindView, OperationsApplicability } from "./agent-kind.mjs";
export type AgentArtifact = {
  path: string; type: string; fm: Record<string, unknown>; name: string;
  agentId: string | null; issue: string | null; contractPath: string | null;
  projectRef: string; aliases: string[]; mission: string; runtime: string;
  interface: string; deployment: string; proactivity: string; updated: string;
  attribution: "authored-id" | "contract-path" | "legacy";
  agentKind: AgentKindView | null;
};
export type CatalogAgent = {
  id: string; agentId: string | null; key: string; instanceKey: string;
  name: string; mission: string; missionSource: string | null;
  runtime: string; interface: string; deployment: string; proactivity: string;
  evidence: string; aliases: string[]; artifacts: AgentArtifact[];
  projectPath: string | null; source: string;
  identityStatus: "identified" | "legacy" | "conflict"; diagnostics: string[];
  agentKind: AgentKindView; contractSource: string | null;
};
export type AgentCatalog = {
  schemaVersion: 1; instanceKey: string; registryPath: string; agents: CatalogAgent[];
  artifacts: AgentArtifact[]; diagnostics: Array<{ code: string; path?: string }>;
};
export type CatalogOptions = { root?: string; stateRoot?: string; memoryRoot?: string; agentParent?: string; fresh?: boolean };
export function agentAlias(input: string): string;
export function agentInstanceKey(stateRoot: string): string;
export function authoredAgentId(frontmatter: Record<string, unknown>): { id: string | null; issue: string | null };
export function readAgentCatalog(options?: CatalogOptions): AgentCatalog;
export function findCatalogAgent(catalog: AgentCatalog, target: string): CatalogAgent | null;
export function currentAgentMission(agent: CatalogAgent, options?: CatalogOptions): { text: string; source: string | null };
export function readCatalogArtifact(agent: CatalogAgent, file: string, options?: CatalogOptions): string;
export function readIdentityEvidence(file: string, stateRoot: string, maxBytes?: number): string;
export function agentOperationsApplicability(agent: CatalogAgent | null, manifest?: object | null, options?: CatalogOptions): OperationsApplicability;
export function readAgentOperationsManifest(agent: CatalogAgent | null): { manifest: Record<string, unknown> | null; present: boolean; issue: string | null };
