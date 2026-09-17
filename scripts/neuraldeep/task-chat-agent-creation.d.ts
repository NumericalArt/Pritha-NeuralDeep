export function parseTaskChatAgentCreation(text: string): { taskType: "agent_creation"; subjectId: string | null } | null;

export function taskChatAgentCreationNotice(input?: {
  agentTarget?: string | null;
  agentMemoryRoot?: string | null;
  requested?: boolean;
  writableDirs?: string[];
}): string;

export function reserveTaskChatAgentTarget(input: {
  allocator: {
    allocateAgentTarget: (ownerId: string, parentPath: string, name?: string | null) => string;
    adoptReadyAgentTarget?: (parentPath: string, name: string) => string | null;
  };
  ownerId: string;
  agentParent: string;
  agentMemoryRoot?: string | null;
  sandbox?: string;
  text?: string;
  task?: { taskType: string; subjectId?: string | null } | null;
  stateRoot?: string | null;
  root?: string | null;
}): {
  requested: boolean;
  additionalWritableDirs: string[];
  agentTarget: string | null;
  parsed: { taskType: "agent_creation"; subjectId: string | null } | null;
};
