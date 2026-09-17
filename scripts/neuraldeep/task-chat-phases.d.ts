export type TaskChatSubject = {
  taskType: string;
  subjectId?: string | null;
};

export type TaskChatItem = {
  kind: string;
  [key: string]: unknown;
};

export type TaskChatPhaseOptions = {
  subject?: TaskChatSubject | null;
  text?: string;
};

export type TaskChatTurnTimeoutOptions = {
  subject?: TaskChatSubject | null;
  settingsTimeoutMs?: number | string | null;
  environment?: Record<string, string | undefined> | null;
};

export type TaskChatPhasePreambleOptions = {
  phase?: string | null;
  timeoutMs?: number | null;
};

export type TaskChatTimeoutCheckpointOptions = {
  items?: TaskChatItem[];
  phase?: string | null;
  timeoutMs?: number | null;
};

export const TASK_CHAT_PHASES: readonly string[];

export function resolveTaskChatPhase(options?: TaskChatPhaseOptions): string | null;

export function taskChatTurnTimeoutMs(options?: TaskChatTurnTimeoutOptions): number;

export function taskChatPhasePreamble(options?: TaskChatPhasePreambleOptions): string;

export function taskChatTimeoutCheckpoint(options?: TaskChatTimeoutCheckpointOptions): string;
