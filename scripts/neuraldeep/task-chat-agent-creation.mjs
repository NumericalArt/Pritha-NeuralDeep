import { mkdirSync, realpathSync, existsSync, lstatSync } from "node:fs";
import path from "node:path";

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
    agentMemoryRoot ? `Instance agent memory (host-owned): ${agentMemoryRoot}` : "",
    "Write the child only into execution_agent_target. The parent directory is not writable.",
    "Preserve existing files. Do not create another sibling or overwrite an unrelated project.",
    "Do not copy secrets, .env, cookies, .memory, .queue or .logs.",
    "The host owns approvals, scaffold, registry and delivery. Never approve your own documents or start services. Author drafts only in the supplied authoring directory.",
    ...extra,
  ].filter(Boolean).join("\n");
}

/** Normalize a structured subject id: strip trailing dots, keep SLUG-valid slugs only. */
function normalizeSlug(value) {
  const slug = String(value ?? "").replace(/\.+$/g, "");
  return slug !== "" && SLUG.test(slug) ? slug : null;
}

/** Reserve one sibling and optionally a confined draft directory. Canonical memory stays host-owned. */
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
  authoringRoot = null,
  writableTarget = true,
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
    if (writableTarget) additionalWritableDirs.push(agentTarget);
  }
  // Canonical memory and audit are host-owned. Legacy tasks may edit their
  // target, but must use the UI for approvals instead of gaining broad writes.
  if (authoringRoot) {
    const boundary=stateRoot && path.join(path.resolve(stateRoot),'creation-drafts');
    if(!boundary || path.dirname(path.resolve(authoringRoot))!==boundary || !/^creation_[a-f0-9]{24}$/.test(path.basename(authoringRoot))) {
      throw Object.assign(new Error('Invalid creation draft directory'),{code:'creation_document_boundary'});
    }
    mkdirSync(boundary,{recursive:true,mode:0o700});
    if(realpathSync(boundary)!==path.join(realpathSync(stateRoot),'creation-drafts') || lstatSync(boundary).isSymbolicLink()
      || (existsSync(authoringRoot) && lstatSync(authoringRoot).isSymbolicLink())) {
      throw Object.assign(new Error('Creation draft directory cannot redirect to another location'),{code:'creation_document_boundary'});
    }
    mkdirSync(authoringRoot, { recursive: true, mode: 0o700 });
    additionalWritableDirs.push(realpathSync(authoringRoot));
  }
  return { requested: true, additionalWritableDirs, agentTarget, parsed };
}
