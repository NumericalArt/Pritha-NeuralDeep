export const TASK_CHAT_PHASES = ["interview", "contract", "outcome", "scaffold", "implement", "verify", "finish"];

const PHASE_GOALS = {
  interview: "Phase goal: ask at most 8 questions, then write the contract draft that passes validate.",
  contract: "Phase goal: a contract file that passes `agents-mother validate` with zero errors.",
  outcome: "Phase goal: outcome init -> minimal edits -> validate -> preflight. Approve is a separate step.",
  scaffold: "Phase goal: scaffold-plan first; scaffold only if the plan has no runtime-adapter-missing.",
  implement: "Phase goal: one product file, syntax-checked with node --check, nothing else.",
  verify: "Phase goal: run the outcome trials once and report pass/fail per trial. Do not fix code in this turn.",
  finish: "Phase goal: registry rebuild and card-readiness; report the card state."
};

const DEFAULT_TURN_TIMEOUT_MS = 600000;
const DEFAULT_CHILD_TURN_TIMEOUT_MS = 720000;
const MIN_CHILD_TURN_TIMEOUT_MS = 120000;
const MAX_CHILD_TURN_TIMEOUT_MS = 1800000;
const MAX_CHECKPOINT_FILES = 12;
const MAX_COMMAND_PREVIEW_CHARS = 200;
const MAX_CHECKPOINT_NOTE_CHARS = 300;

export function resolveTaskChatPhase({ subject = null, text = "" } = {}) {
  if (!subject || subject.taskType !== "agent_creation") return null;
  const match = String(text ?? "").match(/\bphase\s*[:=]\s*([a-z]+)/i);
  if (match) {
    const candidate = match[1].toLowerCase();
    if (TASK_CHAT_PHASES.includes(candidate)) return candidate;
  }
  return "implement";
}

export function taskChatTurnTimeoutMs({ subject = null, settingsTimeoutMs, environment = process.env } = {}) {
  const asNumber = Number(settingsTimeoutMs);
  const base = Number.isFinite(asNumber) && asNumber > 0 ? Math.round(asNumber) : DEFAULT_TURN_TIMEOUT_MS;
  if (!subject || subject.taskType !== "agent_creation") return base;
  const rawChildLimit = Number(environment.PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS);
  const childLimit = Number.isFinite(rawChildLimit) && rawChildLimit > 0 ? rawChildLimit : DEFAULT_CHILD_TURN_TIMEOUT_MS;
  const clamped = Math.min(MAX_CHILD_TURN_TIMEOUT_MS, Math.max(MIN_CHILD_TURN_TIMEOUT_MS, childLimit));
  return Math.min(base, clamped);
}

export function taskChatPhasePreamble({ phase = null, timeoutMs = 720000 } = {}) {
  if (!phase || !TASK_CHAT_PHASES.includes(phase)) return "";
  const minutes = Math.max(1, Math.round(timeoutMs / 60000));
  return [
    `Host turn contract (phase: ${phase}, budget: ${minutes} min).`,
    "One deliverable per turn: exactly one file or one CLI step. Split anything larger into the next turn.",
    "Do not run commands expected to take longer than 60 seconds (builds, downloads, transcription, harvests, model calls in loops). Use fixtures and mocks; long jobs belong to the child UI buttons.",
    "Do not study validators or generators. Run the command with --help or validate and follow the printed allowed values.",
    "Write each file in a single command (heredoc or apply_patch). Do not use Resume or Retry semantics; if the budget is nearly spent, stop and report a checkpoint.",
    "Final message: files changed, commands run, what is left. Nothing else.",
    PHASE_GOALS[phase]
  ].join("\n");
}

export function taskChatTimeoutCheckpoint({ items = [], phase = null, timeoutMs = null } = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const seenPaths = new Set();
  const files = [];
  let lastCommand = null;
  let lastNote = null;

  for (const item of safeItems) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "file_change") {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      for (const change of changes) {
        if (!change || typeof change.path !== "string" || change.path === "") continue;
        if (seenPaths.has(change.path)) continue;
        seenPaths.add(change.path);
        files.push(change.path);
      }
    } else if (item.kind === "command") {
      const preview = String(item.commandPreview ?? "").slice(0, MAX_COMMAND_PREVIEW_CHARS);
      lastCommand = `${preview} (exit ${item.exitCode ?? "?"})`;
    } else if (item.kind === "assistant_message") {
      const message = item.message && typeof item.message === "object" ? item.message : {};
      const raw = message.markdown ?? message.text ?? "";
      lastNote = String(raw).replace(/\s+/g, " ").trim().slice(0, MAX_CHECKPOINT_NOTE_CHARS);
    }
  }

  const recentFiles = files.slice(-MAX_CHECKPOINT_FILES);
  return [
    `Step timeout checkpoint${phase ? ` (phase: ${phase})` : ""}${timeoutMs ? ` after ${Math.round(timeoutMs / 60000)} min` : ""}.`,
    `Files changed: ${recentFiles.length ? recentFiles.join(", ") : "none recorded"}.`,
    `Last command: ${lastCommand || "none"}.`,
    `Last assistant note: ${lastNote || "none"}.`,
    "Next: open a New chat with the same Subject, paste this checkpoint and continue from the next step. Do not Resume or Retry this turn."
  ].join("\n");
}
