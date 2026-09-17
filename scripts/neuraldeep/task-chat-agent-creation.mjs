import { mkdirSync, realpathSync } from "node:fs";
import { resolvePrithaStatePathFrom } from "../lib/paths.mjs";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** Detect explicit Task Chat agent_creation. Casual "создай агента" does not reserve. */
export function parseTaskChatAgentCreation(text) {
  const raw = String(text || "");
  if (!/\btask_type\s*=\s*agent_creation\b/i.test(raw)) return null;
  const patterns = [
    /\bsubject_id\s*=\s*([A-Za-z0-9][A-Za-z0-9._-]{0,79})/i,
    /\bslug\s*[:=]\s*`?([A-Za-z0-9][A-Za-z0-9._-]{0,79})`?/i,
    /\$PRITHA_AGENT_PARENT\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})/,
    /PRITHA_AGENT_PARENT\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const subjectId = String(match?.[1] || "").replace(/\.+$/g, "");
    if (subjectId && SLUG.test(subjectId) && subjectId !== "PRITHA_AGENT_PARENT") {
      return { taskType: "agent_creation", subjectId };
    }
  }
  return { taskType: "agent_creation", subjectId: null };
}

export function taskChatAgentCreationNotice({ agentTarget = null, agentMemoryRoot = null, requested = false, writableDirs = [] } = {}) {
  if (!requested) return "";
  const extra = [];
  if (writableDirs.length) {
    extra.push(`Writable roots for this turn: ${writableDirs.join(", ")}`);
    if (writableDirs.some((dir) => String(dir).endsWith("/audit"))) {
      extra.push("Instance agents/contracts and audit are writable: run outcome approve and copy the contract from this chat, do not ask for host-side approval.");
    }
  }
  if (!agentTarget) {
    const base = [
      "Host notice: task_type=agent_creation was seen, but no sibling was reserved.",
      "Name the child as subject_id=<slug> or $PRITHA_AGENT_PARENT/<slug>.",
      "The host does not grant write access to the whole agent parent.",
    ].join(" ");
    return extra.length ? `${base}\n${extra.join("\n")}` : base;
  }
  return [
    `Host reserved execution_agent_target: ${agentTarget}`,
    agentMemoryRoot ? `Instance agent memory (writable): ${agentMemoryRoot}` : "",
    "Write the child only into execution_agent_target. The parent directory is not writable.",
    "If the folder already has files, fill or replace them. Do not create another sibling.",
    "Do not copy secrets, .env, cookies, .memory, .queue or .logs.",
    "After AGENTS.md exists, rebuild the registry so /agents can show the card. Do not start the child UI from this chat.",
    ...extra,
  ].filter(Boolean).join("\n");
}

/** Normalize a structured subject id: strip trailing dots, keep SLUG-valid slugs only. */
function normalizeSlug(value) {
  const slug = String(value ?? "").replace(/\.+$/g, "");
  return slug !== "" && SLUG.test(slug) ? slug : null;
}

/** Reserve one sibling plus instance agent memory. Never add the parent itself. */
export function reserveTaskChatAgentTarget({
  allocator,
  ownerId,
  agentParent,
  agentMemoryRoot,
  sandbox,
  text,
  task = null,
  stateRoot = null,
  root = null,
} = {}) {
  let parsed = null;
  if (task) {
    if (String(task.taskType || task.task_type || "") === "agent_creation") {
      parsed = { taskType: "agent_creation", subjectId: normalizeSlug(task.subjectId ?? task.subject_id) };
    }
  } else {
    parsed = parseTaskChatAgentCreation(text);
  }
  const additionalWritableDirs = [];
  if (!parsed || sandbox === "read-only" || sandbox === "read_only") {
    return { requested: Boolean(parsed), additionalWritableDirs, agentTarget: null, parsed };
  }
  let agentTarget = null;
  if (parsed.subjectId) {
    try {
      agentTarget = allocator.allocateAgentTarget(ownerId, agentParent, parsed.subjectId);
    } catch (error) {
      if (error?.code === "agent_target_exists" && typeof allocator.adoptReadyAgentTarget === "function") {
        agentTarget = allocator.adoptReadyAgentTarget(agentParent, parsed.subjectId);
      }
      if (!agentTarget) throw error;
    }
    additionalWritableDirs.push(agentTarget);
  }
  if (agentMemoryRoot) {
    mkdirSync(agentMemoryRoot, { recursive: true, mode: 0o700 });
    additionalWritableDirs.push(realpathSync(agentMemoryRoot));
  }
  if (stateRoot) {
    for (const parts of [["agents", "contracts"], ["audit"]]) {
      const directory = resolvePrithaStatePathFrom({ root: root || undefined, stateRoot }, ...parts);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      additionalWritableDirs.push(realpathSync(directory));
    }
  }
  return { requested: true, additionalWritableDirs, agentTarget, parsed };
}
