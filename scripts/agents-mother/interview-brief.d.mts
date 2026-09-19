export interface InterviewBrief {
  schemaVersion: 1;
  identity: { name: string; slug: string };
  goal: string;
  user: string;
  successCriteria: string[];
  coreFunctions: string[];
  workflows: string[];
  sources: string[];
  constraints: string[];
  nonGoals: string[];
  permissions: { network: string[]; filesystem: string[]; authorization: string };
  technical: {
    preset?: "generic" | "local-feed" | "llm-app";
    sourceFormat?: "json" | "rss" | "atom" | "mixed";
    runtimeFamily?: string; serviceMode?: string; primaryInterface?: string;
    runtimePlacementProfile?: string; repositoryResearchPolicy?: string;
    repositoryAdoptionMode?: string; repositoryResearchWaiverReason?: string;
    repositoryResearchTopics?: string; targetFolder?: string;
  };
}
export const INTERVIEW_BRIEF_SCHEMA_VERSION: 1;
export const INTERVIEW_PRESETS: Set<string>;
export function normalizeInterviewBrief(value?: unknown): InterviewBrief;
export function validateInterviewBrief(value: unknown, options?: { requireComplete?: boolean }): string[];
export function parseInterviewBrief(text: string): InterviewBrief;
export function serializeInterviewBrief(value: unknown): string;
export function interviewBriefOptions(value: unknown): Record<string, string>;
