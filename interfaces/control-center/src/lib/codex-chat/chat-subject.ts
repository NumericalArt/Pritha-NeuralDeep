export type ChatComposerSubject = { taskType: "self"; subjectId: null } | { taskType: "agent_creation"; subjectId: string; tokenBudget?: number };
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function composeChatSubject(kind: "self" | "child", slug = "", tokenBudget?: string): { ok: true; subject: ChatComposerSubject } | { ok: false; error: string } {
  if (kind === "self") return { ok: true, subject: { taskType: "self", subjectId: null } };
  const subjectId = String(slug || "").trim();
  if (!SLUG.test(subjectId)) return { ok: false, error: "Child slug must be 1–80 chars: letters, digits, dot, underscore, hyphen." };
  if (tokenBudget !== undefined && (!/^\d+$/.test(tokenBudget) || !Number.isSafeInteger(Number(tokenBudget)) || Number(tokenBudget) < 1 || Number(tokenBudget) > 1_000_000)) return { ok: false, error: "Лимит создания должен быть целым числом от 1 до 1 000 000 токенов." };
  return { ok: true, subject: { taskType: "agent_creation", subjectId, ...(tokenBudget === undefined ? {} : { tokenBudget: Number(tokenBudget) }) } };
}
