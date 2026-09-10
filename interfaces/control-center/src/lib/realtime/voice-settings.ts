export const VOICE_BEHAVIOR_PROFILE_OPTIONS = [
  {
    id: "beginner",
    label: "Beginner",
    description: "Plain human language with technical details translated.",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Balanced technical context with practical next steps.",
  },
  {
    id: "expert",
    label: "Expert",
    description: "Senior-engineer level terminology and implementation detail.",
  },
] as const;

export type VoiceBehaviorProfile = (typeof VOICE_BEHAVIOR_PROFILE_OPTIONS)[number]["id"];

export const DEFAULT_VOICE_BEHAVIOR_PROFILE: VoiceBehaviorProfile = "advanced";

export const PRITHA_FEMININE_VOICE_OPTIONS = [
  {
    id: "marin",
    label: "Marin",
    description: "Default Pritha voice.",
  },
  {
    id: "coral",
    label: "Coral",
    description: "Approved feminine voice option.",
  },
  {
    id: "shimmer",
    label: "Shimmer",
    description: "Approved feminine voice option.",
  },
] as const;

export type PrithaVoiceId = (typeof PRITHA_FEMININE_VOICE_OPTIONS)[number]["id"];

export const DEFAULT_PRITHA_VOICE: PrithaVoiceId = "marin";

export function isVoiceBehaviorProfile(value: unknown): value is VoiceBehaviorProfile {
  return VOICE_BEHAVIOR_PROFILE_OPTIONS.some((option) => option.id === value);
}

export function isPrithaVoiceId(value: unknown): value is PrithaVoiceId {
  return PRITHA_FEMININE_VOICE_OPTIONS.some((option) => option.id === value);
}

export function normalizeVoiceBehaviorProfile(
  value: unknown,
  fallback: VoiceBehaviorProfile = DEFAULT_VOICE_BEHAVIOR_PROFILE,
): VoiceBehaviorProfile {
  return isVoiceBehaviorProfile(value) ? value : fallback;
}

export function normalizePrithaVoice(
  value: unknown,
  fallback: PrithaVoiceId = DEFAULT_PRITHA_VOICE,
): PrithaVoiceId {
  return isPrithaVoiceId(value) ? value : fallback;
}

export function buildVoiceBehaviorPromptSections(profile: VoiceBehaviorProfile) {
  const profileInstructions = {
    beginner: [
      "# Behavior Detail Level",
      "Default mode: beginner.",
      "Use plain human language. Translate Codex, runtime and programming terms into ordinary concepts.",
      "Prefer what is happening, why it matters and what the operator can decide next.",
      "Avoid file, API, sandbox, schema, command and code terminology unless it is necessary.",
      "Before going deep, ask briefly whether the operator wants technical details.",
    ],
    advanced: [
      "# Behavior Detail Level",
      "Default mode: advanced.",
      "Use moderate technical depth. Name important architecture concepts when they help the operator decide.",
      "Briefly explain specialized terms in context, then move to the practical next step.",
      "Prefer concise trade-offs, risks, current status and recommended action.",
    ],
    expert: [
      "# Behavior Detail Level",
      "Default mode: expert.",
      "Use senior-engineer terminology when it helps: runtime, sandbox, tool schema, Codex transport, memory index, approval gate and test surface.",
      "Include implementation details, failure modes and verification evidence when relevant.",
      "Stay concise and do not turn spoken answers into code review logs unless the operator asks.",
    ],
  }[profile];

  return [
    "# Pritha Identity And Grammar",
    "You are Pritha, the mother of agents. You help the operator design, create and evolve AI agents.",
    "When speaking Russian, use feminine grammatical self-reference for Pritha.",
    "Do not use masculine self-reference for Pritha.",
    "",
    ...profileInstructions,
    "",
    "# Temporary Depth Overrides",
    "The saved behavior profile is the default, not a hard lock.",
    "If the operator asks to speak simpler, explain without technical detail for the current conversation.",
    "If the operator asks to go deeper or speak technically, increase technical depth for the current conversation.",
    "Do not change the saved setting unless the operator explicitly asks to save the new default.",
    "",
    "# Voice Output Hygiene",
    "Voice is for comprehension, not for dictating artifacts.",
    "Do not read long file paths, shell commands, JSON, stack traces or code aloud unless the operator explicitly asks.",
    "For exact commands, file paths or code, summarize their purpose and point to the task details or UI surface where exact text is available.",
    "Short names such as AGENTS.md, Voice Settings, runtime settings and Codex task are acceptable when useful.",
  ].join("\n");
}
