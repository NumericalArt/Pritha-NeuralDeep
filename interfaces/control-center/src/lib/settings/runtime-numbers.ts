export const RUNTIME_NUMBER_RULES = {
  codexTimeoutMs: { min: 10_000, max: 3_600_000, label: "Task timeout (milliseconds)" },
  codexPromptTokenBudget: { min: 4_000, max: 120_000, label: "Prompt budget" },
  codexMaxPlanSteps: { min: 1, max: 10, label: "Maximum plan steps" },
} as const;

export type RuntimeNumberKey = keyof typeof RUNTIME_NUMBER_RULES;
export type RuntimeNumbers = Record<RuntimeNumberKey, number>;
export type RuntimeNumberDrafts = Record<RuntimeNumberKey, string>;
export type TimeoutUnit = "seconds" | "milliseconds";

export function hasRuntimeNumbers(value: unknown): value is RuntimeNumbers {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(RUNTIME_NUMBER_RULES).every(key => Object.hasOwn(value, key))
    && !validateRuntimeNumbers(value as Record<string, unknown>);
}

export function validateRuntimeNumbers(payload: Record<string, unknown>): { error: string; message: string } | null {
  for (const [key, rule] of Object.entries(RUNTIME_NUMBER_RULES)) {
    if (!Object.hasOwn(payload, key)) continue;
    const value = payload[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < rule.min || value > rule.max) {
      return { error: `invalid_${key}`, message: `${rule.label} must be a whole number from ${rule.min} to ${rule.max}.` };
    }
  }
  return null;
}

export function runtimeNumberDrafts(settings: RuntimeNumbers, unit: TimeoutUnit): RuntimeNumberDrafts {
  return Object.fromEntries(Object.keys(RUNTIME_NUMBER_RULES).map(key => [key,
    String(settings[key as RuntimeNumberKey] / (key === "codexTimeoutMs" && unit === "seconds" ? 1000 : 1)),
  ])) as RuntimeNumberDrafts;
}

export function parseRuntimeNumberDrafts(drafts: RuntimeNumberDrafts, unit: TimeoutUnit): { values: RuntimeNumbers; error?: never } | { error: string; values?: never } {
  const values = {} as RuntimeNumbers;
  for (const key of Object.keys(RUNTIME_NUMBER_RULES) as RuntimeNumberKey[]) {
    const text = drafts[key].trim();
    const seconds = key === "codexTimeoutMs" && unit === "seconds";
    if (!(seconds ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/).test(text)) {
      return { error: `${seconds ? "Task timeout (seconds)" : RUNTIME_NUMBER_RULES[key].label}: enter ${seconds ? "a number with up to three decimal places" : "a whole number"}.` };
    }
    values[key] = seconds ? Math.round(Number(text) * 1000) : Number(text);
  }
  const failure = validateRuntimeNumbers(values);
  return failure ? { error: failure.message } : { values };
}

export function convertTimeoutDraft(text: string, from: TimeoutUnit, to: TimeoutUnit): string | null {
  if (!text.trim() || from === to) return text;
  if (!(from === "seconds" ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/).test(text.trim())) return null;
  const millis = from === "seconds" ? Math.round(Number(text) * 1000) : Number(text);
  if (!Number.isSafeInteger(millis)) return null;
  return String(to === "seconds" ? millis / 1000 : millis);
}
