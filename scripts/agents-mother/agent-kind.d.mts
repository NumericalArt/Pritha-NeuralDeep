export type AgentKind = "service" | "one-shot-cli" | "job-runner" | "tool-server" | "library" | "interactive-agent";
export type AgentKindView = { kind: AgentKind | "legacy-unclassified"; schemaVersion: number | null; status: "declared" | "legacy" | "invalid"; suggestedKind: AgentKind | null; issues: string[] };
export type OperationsApplicability = { manifestRequired: boolean | null; status: "required" | "not-required" | "invalid-contract" | "unknown"; reasons: string[] };
export const CONTRACT_SCHEMA_VERSION: 2;
export const AGENT_KINDS: Set<AgentKind>;
export function proposeAgentKind(data?: { agentKind?: AgentKind; primaryInterface?: string; serviceMode?: string; proactiveMode?: string }): AgentKind;
export function readAgentKind(text?: string): AgentKindView;
export function operationsApplicability(text?: string, manifest?: object | null): OperationsApplicability;
