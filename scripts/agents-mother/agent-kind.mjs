import { parseFrontmatterData } from "../lib/frontmatter.mjs";

export const CONTRACT_SCHEMA_VERSION = 2;
export const AGENT_KINDS = new Set(["service", "one-shot-cli", "job-runner", "tool-server", "library", "interactive-agent"]);
const value = input => typeof input === "string" ? input.trim() : "";
const field = (text, name) => text.match(new RegExp(`^- ${name}:\\s*(.*)$`, "mi"))?.[1]?.trim() || "";
const scheduled = new Set(["scheduled", "heartbeat", "event-driven", "queue-watcher", "hybrid"]);

// A proposal describes the product. It never grants a process, scheduler or
// network permission; those still come from the separately reviewed operations.
export function proposeAgentKind(data = {}) {
  if (data.agentKind != null) {
    if (!AGENT_KINDS.has(data.agentKind)) throw new Error("invalid agent_kind; use a supported result type");
    return data.agentKind;
  }
  const iface = value(data.primaryInterface).toLowerCase();
  if (["library", "module"].includes(iface)) return "library";
  if (["mcp", "tool-server", "tool server"].includes(iface)) return "tool-server";
  if (scheduled.has(value(data.proactiveMode).toLowerCase())) return "job-runner";
  if (["manual", "launchd", "external", "process"].includes(value(data.serviceMode).toLowerCase())) return "service";
  if (["web", "api"].includes(iface)) return "service";
  if (["cli", "headless"].includes(iface)) return "one-shot-cli";
  return "interactive-agent";
}

export function readAgentKind(text = "") {
  const fm = parseFrontmatterData(text.replaceAll("\r\n", "\n")) || {};
  const version = fm.contract_schema_version;
  const issues = [];
  if (version != null && (typeof version !== "string" || !["1", "2"].includes(version))) issues.push("unsupported-contract-schema-version");
  const raw = text.replaceAll("\r\n", "\n").match(/^---\n([\s\S]*?)\n---\n/)?.[1] || "";
  for (const key of ["contract_schema_version", "agent_kind"]) {
    if ([...raw.matchAll(new RegExp(`^${key}:`, "gm"))].length > 1) issues.push(`duplicate-${key}`);
  }
  if (String(version) === "2") {
    if (!AGENT_KINDS.has(fm.agent_kind)) issues.push("invalid-agent-kind");
  } else if (Object.hasOwn(fm, "agent_kind")) issues.push("agent-kind-requires-contract-schema-v2");
  if (issues.length) return { kind: "legacy-unclassified", schemaVersion: null, status: "invalid", suggestedKind: null, issues };
  if (String(version) === "2") return { kind: fm.agent_kind, schemaVersion: 2, status: "declared", suggestedKind: null, issues };
  const primaryInterface = field(text, "Primary interface");
  const serviceMode = field(text, "Service mode");
  const proactiveMode = field(text, "Proactive mode");
  const canSuggest = ["codex project", "telegram", "cli", "headless", "web", "api", "library", "module", "mcp", "tool-server", "tool server"].includes(primaryInterface.toLowerCase())
    || ["manual", "launchd", "external", "process"].includes(serviceMode) || scheduled.has(proactiveMode);
  return { kind: "legacy-unclassified", schemaVersion: version == null ? null : 1, status: "legacy",
    suggestedKind: canSuggest ? proposeAgentKind({ primaryInterface, serviceMode, proactiveMode }) : null, issues };
}

// Applicability is deliberately independent of agent_kind. A CLI can select
// managed operations, and a service product can still have no local deployment.
export function operationsApplicability(text = "", manifest = null) {
  const fm = parseFrontmatterData(text.replaceAll("\r\n", "\n")) || {};
  const service = field(text, "Service mode"), autostart = field(text, "Autostart"), proactive = field(text, "Proactive mode");
  const declarations = [];
  if (["manual", "launchd", "external", "process"].includes(service)) declarations.push("contract-service");
  if (["launchd-on-approval", "external"].includes(autostart)) declarations.push("contract-autostart");
  if (scheduled.has(proactive)) declarations.push("contract-proactivity");
  if (manifest && (manifest.control_center_managed === true || (manifest.service_mode && manifest.service_mode !== "none")
    || (manifest.control_center_runtime?.manager && manifest.control_center_runtime.manager !== "none")
    || value(manifest.control_center_contract?.default_execution).includes("control-center")
    || manifest.local_upstream_url || manifest.health_url
    || scheduled.has(manifest.proactivity?.mode) || manifest.schedule_command || manifest.job_runner_command)) declarations.push("manifest-operations");
  const kind = readAgentKind(text);
  if (kind.status === "invalid") return { manifestRequired: true, status: "invalid-contract", reasons: kind.issues };
  if (declarations.length) return { manifestRequired: true, status: "required", reasons: declarations };
  if (fm.type === "agent-contract" && fm.status === "accepted" && service === "none"
    && ["disabled", "optional"].includes(autostart) && ["none", "manual"].includes(proactive)) {
    return { manifestRequired: false, status: "not-required", reasons: ["accepted-contract-no-managed-operations"] };
  }
  return { manifestRequired: null, status: "unknown", reasons: ["operations-selection-needs-contract-evidence"] };
}
