import type { VoiceTopicRecord, VoiceTopicScope } from "./voice-topic-store";

function safeGeneration(value: unknown) {
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation >= 1 && generation <= 999 ? generation : 1;
}

export function resolveVoiceTopicScope(input: {
  scope: VoiceTopicScope;
  topics: VoiceTopicRecord[];
  stateIdentityHash: string;
  threadReset: boolean;
  exactGeneration: boolean;
}) {
  const matching = input.topics
    .filter((topic) => topic.stateIdentityHash === input.stateIdentityHash)
    .filter((topic) => topic.scope.kind === input.scope.kind && topic.scope.id === input.scope.id)
    .sort((left, right) => right.scope.generation - left.scope.generation);
  const requestedGeneration = safeGeneration(input.scope.generation);
  const generation = input.exactGeneration
    ? requestedGeneration
    : input.threadReset
      ? Math.min(999, (matching[0]?.scope.generation || 0) + 1)
      : matching[0]?.scope.generation || requestedGeneration;
  return {
    kind: input.scope.kind,
    id: input.scope.id,
    label: input.scope.label,
    generation,
  } satisfies VoiceTopicScope;
}

export function neuralDeepVoiceRoutingMode(value: unknown) {
  // Keep reading the legacy setting name during this migration; its neutral
  // NeuralDeep meaning is one persistent session per subject scope.
  return value === "subject_scoped" || value === "subject_scoped_rotate" ? value : "subject_scoped";
}
