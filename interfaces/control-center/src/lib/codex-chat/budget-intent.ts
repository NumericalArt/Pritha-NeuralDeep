export type BudgetIntent =
  | { kind: "none" }
  | { kind: "clarification"; message: string }
  | { kind: "delivery_budget"; mode: "add" | "set"; tokens: number; resume: boolean; runId: string | null };

const clarification: BudgetIntent = {
  kind: "clarification",
  message: "Укажите объект и изменение бюджета: например, «добавь 100 000 токенов к бюджету этой задачи» или «установи бюджет сборки до 500 000 токенов». Для сборки выберите связанный run в панели; для продолжения добавьте «и продолжай». Лимиты аккаунта учитываются отдельно.",
};
const taskBudget = "(?:бюджет(?:у)? (?:этой |текущей )?задачи|(?:бюджет(?:у)? )?goal)";
const runId = "([A-Za-z0-9][A-Za-z0-9._-]{0,127})";
const buildBudget = `бюджет(?:у)? (?:этой |текущей )?сборки(?: ${runId})?`;
const englishBuildBudget = `(?:this |the current )?build(?: ${runId})? budget`;
const rules: Array<{ mode: "add" | "set"; pattern: RegExp; scope?: "delivery"; amountGroup?: number; runGroup?: number }> = [
  { mode: "add", pattern: new RegExp(`^добавь(?:те)? (?:ещ[её] )?(.+?) токен(?:ов|а)? (?:к |в )${taskBudget}$`, "iu") },
  { mode: "add", pattern: new RegExp(`^добавь(?:те)? к ${taskBudget} (?:ещ[её] )?(.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "add", pattern: new RegExp(`^увеличь(?:те)? ${taskBudget} на (.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "set", pattern: new RegExp(`^(?:установи(?:те)?|увеличь(?:те)?|подними(?:те)?) ${taskBudget} (?:до|в|на уровне) (.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "add", pattern: /^add (?:another )?(.+?) tokens? to (?:this |the current )task budget$/iu },
  { mode: "set", pattern: /^set (?:this |the current )task budget to (.+?) tokens?$/iu },
  { mode: "add", scope: "delivery", runGroup: 2, pattern: new RegExp(`^добавь(?:те)? (?:ещ[её] )?(.+?) токен(?:ов|а)? (?:к |в )${buildBudget}$`, "iu") },
  { mode: "add", scope: "delivery", amountGroup: 2, runGroup: 1, pattern: new RegExp(`^добавь(?:те)? к ${buildBudget} (?:ещ[её] )?(.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "add", scope: "delivery", amountGroup: 2, runGroup: 1, pattern: new RegExp(`^увеличь(?:те)? ${buildBudget} на (.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "set", scope: "delivery", amountGroup: 2, runGroup: 1, pattern: new RegExp(`^(?:установи(?:те)?|увеличь(?:те)?|подними(?:те)?) ${buildBudget} (?:до|в|на уровне) (.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "add", scope: "delivery", runGroup: 2, pattern: new RegExp(`^add (?:another )?(.+?) tokens? to ${englishBuildBudget}$`, "iu") },
  { mode: "set", scope: "delivery", amountGroup: 2, runGroup: 1, pattern: new RegExp(`^set ${englishBuildBudget} to (.+?) tokens?$`, "iu") },
];

// Only a complete, direct operator command is eligible. Quoted instructions,
// forwarded text, prose, attachments and model output are never authorization.
export function parseBudgetIntent(value: string): BudgetIntent {
  const raw = value.trim();
  if (!raw || /^[>"'«“`]/u.test(raw)) return { kind: "none" };
  if (!/^(?:(?:добавь(?:те)?|увеличь(?:те)?|установи(?:те)?|подними(?:те)?)\s+(?:(?:к\s+)?бюджет|лимит|goal|(?:ещ[её]\s+)?[+\-\d])|(?:add|set)\s+(?:another\s+|this\s+|the current\s+|build\s+|[+\-\d]))/iu.test(raw)) return { kind: "none" };
  if (!/(?:токен|бюджет|лимит|goal|token|budget)/iu.test(raw)) return { kind: "none" };
  if (raw.length > 500 || /[\r\n"'«»“”`]/u.test(raw)) return clarification;
  let text = raw.replace(/[.!]$/u, "").replace(/[\u00a0\u202f]/gu, " ").replace(/\s+/gu, " ");
  const resume = /(?:[,;]? и продолжай(?:те)?|[,;]? and (?:continue|resume))$/iu.test(text);
  if (resume) text = text.replace(/(?:[,;]? и продолжай(?:те)?|[,;]? and (?:continue|resume))$/iu, "");
  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const amount = match[rule.amountGroup || 1];
    // A separator consistently groups triples; decimals and mixed groups need
    // clarification instead of a surprising interpretation of the amount.
    if (!/^(?:\d+|\d{1,3}([ _,.])\d{3}(?:\1\d{3})*)$/u.test(amount)) return clarification;
    const tokens = Number(amount.replace(/[ _,.]/gu, ""));
    if (!Number.isSafeInteger(tokens) || tokens < 1) return clarification;
    return rule.scope === "delivery" ? { kind: "delivery_budget", mode: rule.mode, tokens, resume, runId: match[rule.runGroup!] || null }
      : { kind: "clarification", message: "Укажите бюджет конкретной сборки. В NeuralDeep CLI нет отдельного Goal API; бюджет сборки управляется Pritha." };
  }
  return clarification;
}
