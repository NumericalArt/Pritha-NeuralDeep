export type ChatComposerSubject = { taskType: "self"; subjectId: null } | { taskType: "agent_creation"; subjectId: string };
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function composeChatSubject(kind: "self" | "child", slug = ""): { ok: true; subject: ChatComposerSubject } | { ok: false; error: string } {
  if (kind === "self") return { ok: true, subject: { taskType: "self", subjectId: null } };
  const subjectId = String(slug || "").trim();
  if (!SLUG.test(subjectId)) return { ok: false, error: "Child slug must be 1–80 chars: letters, digits, dot, underscore, hyphen." };
  return { ok: true, subject: { taskType: "agent_creation", subjectId } };
}
