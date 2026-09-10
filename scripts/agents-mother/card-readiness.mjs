import { readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "../lib/paths.mjs";
import { readAgentCatalog, findCatalogAgent, agentAlias, agentOperationsApplicability, readAgentOperationsManifest } from "./identity.mjs";
import { readAgentResultReadinessAsync, unavailableResultReadiness } from "./result-readiness-async.mjs";

function controlCenterSlug(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function comparableKey(value) {
  return agentAlias(String(value || ""));
}

function evidencePaths(root, record) {
  return {
    contracts: (record?.artifacts || []).filter((item) => ["agent-contract", "agent-outcome-spec"].includes(item.type)).map((item) => path.relative(root, item.path)),
    reports: (record?.artifacts || []).filter((item) => item.type.endsWith("report")).map((item) => path.relative(root, item.path)),
  };
}

function artifactSummary(root, relativePath) {
  try {
    const text = readFileSync(path.resolve(root, relativePath), "utf8");
    const fm = parseFrontmatterData(text) || {};
    return {
      id: fm.id || path.basename(relativePath, ".md"),
      type: fm.type || "unknown",
      status: fm.outcome_spec_status || fm.status || "unknown",
      path: relativePath,
      updated: fm.updated || fm.created || "unknown",
      approved: fm.type === "agent-outcome-spec" && fm.approved_by === "user" && fm.outcome_spec_status === "approved",
    };
  } catch {
    return null;
  }
}

function latestArtifact(artifacts, type) {
  return artifacts
    .filter((artifact) => artifact?.type === type)
    .sort((left, right) => `${right.updated}:${right.path}`.localeCompare(`${left.updated}:${left.path}`))[0] || null;
}

function deliveryLifecycle(root, evidence) {
  const contracts = evidence.contracts.map((filePath) => artifactSummary(root, filePath)).filter(Boolean);
  const reports = evidence.reports.map((filePath) => artifactSummary(root, filePath)).filter(Boolean);
  const outcome = latestArtifact(contracts, "agent-outcome-spec");
  const delivery = latestArtifact(reports, "agent-delivery-report");
  return {
    outcome: outcome
      ? { present: true, id: outcome.id, path: outcome.path, status: outcome.status, approved: outcome.approved }
      : { present: false, status: "missing", approved: false },
    delivery: delivery
      ? { present: true, id: delivery.id, path: delivery.path, status: delivery.status }
      : { present: false, status: "not-started" },
  };
}

function structuredCommand(command) {
  return Boolean(command && typeof command === "object" && Array.isArray(command.argv) && command.argv.length);
}

function controlCenterRuntimeSelected(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const serviceMode = String(manifest.service_mode || "").trim().toLowerCase();
  const manager = String(manifest.control_center_runtime?.manager || "").trim().toLowerCase();
  const defaultExecution = String(manifest.control_center_contract?.default_execution || "").trim().toLowerCase();
  return Boolean(
    manifest.control_center_managed === true ||
      defaultExecution.includes("control-center") ||
      (manager && manager !== "none") ||
      (serviceMode && serviceMode !== "none"),
  );
}

function hasHealthContract(manifest) {
  const healthcheckArgv = Array.isArray(manifest?.healthcheck_argv) ? manifest.healthcheck_argv.filter(Boolean) : [];
  return Boolean(manifest?.health_url || manifest?.local_upstream_url || healthcheckArgv.length > 0);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { ok: false, status: response.status, value: null };
    return { ok: true, status: response.status, value: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), value: null };
  } finally {
    clearTimeout(timer);
  }
}

function planActionForAgent(agent) {
  const explicit = agent?.control?.planAction;
  if (explicit) return explicit;
  const primary = agent?.ui?.primaryAction;
  if (primary === "stop" || primary === "stop_plan") return "stop";
  if (primary === "start" || primary === "start_plan") return "start";
  if (primary === "restore" || primary === "restore_plan") return "restore";
  return "check";
}

function normalizedActionPlanStatus(plan) {
  if (!plan) return undefined;
  const blockers = Array.isArray(plan?.blockers) ? plan.blockers : [];
  const executionMode = plan?.control?.executionMode;
  if (blockers.length > 0) return plan?.status === "unavailable" || executionMode === "unavailable" ? "unavailable" : "blocked";
  if (executionMode === "executable") {
    if (plan?.status === "needs_confirmation" || plan?.requiresConfirmation === true || plan?.confirmation) return "needs_confirmation";
    if (plan?.actionEnabled !== false) return "ready";
    return "blocked";
  }
  if (executionMode === "plan_only" || plan?.status === "planned") return "plan_only";
  if (executionMode === "unavailable" || plan?.status === "unavailable") return "unavailable";
  if (executionMode === "manual_only" || plan?.status === "manual_only") return "manual_only";
  if (["ready", "needs_confirmation", "plan_only", "blocked", "unavailable"].includes(plan?.status)) {
    return plan.status;
  }
  return plan?.status;
}

async function liveControlCenterCard(params) {
  if (params.baseUrl === false) return { visible: "unknown", reason: "live Control Center check disabled" };
  const baseUrl = String(params.baseUrl || `http://127.0.0.1:${process.env.PRITHA_CONTROL_CENTER_PORT || 3420}`).replace(/\/$/, "");
  const agentsResponse = await fetchJson(`${baseUrl}/api/agents`, params.timeoutMs);
  if (!agentsResponse.ok) {
    return { visible: "unknown", reason: `Control Center unavailable at ${baseUrl}`, baseUrl };
  }

  const agents = Array.isArray(agentsResponse.value?.agents)
    ? agentsResponse.value.agents
    : Array.isArray(agentsResponse.value?.childAgents)
      ? agentsResponse.value.childAgents
      : [];
  const key = comparableKey(params.record?.name || params.target);
  const exact = agents.filter((item) => item.id === params.record?.id);
  const legacy = agents.filter((item) => comparableKey(item.name) === key || comparableKey(item.id) === key);
  const agent = exact.length === 1 ? exact[0] : legacy.length === 1 ? legacy[0] : null;
  if (!agent) return { visible: false, reason: "Agent is absent from /api/agents", baseUrl };

  const action = planActionForAgent(agent);
  const planResponse = await fetchJson(`${baseUrl}/api/agents/${encodeURIComponent(agent.id)}/actions/${action}/plan`, params.timeoutMs);
  return {
    visible: true,
    baseUrl,
    agentId: agent.id,
    agentName: agent.name,
    action,
    actionPlanAvailable: planResponse.ok,
    actionPlanStatus: normalizedActionPlanStatus(planResponse.value),
    rawActionPlanStatus: planResponse.value?.status,
    actionExecutionMode: planResponse.value?.control?.executionMode,
    actionEnabled: planResponse.value?.actionEnabled,
    actionPlanBlockers: Array.isArray(planResponse.value?.blockers) ? planResponse.value.blockers : [],
    actionPlanRequiredPhrase: planResponse.value?.confirmation?.requiredPhrase,
    reason: planResponse.ok ? undefined : `Action plan unavailable: HTTP ${planResponse.status || "unreachable"}`,
  };
}

export async function checkCardReadiness(target, options = {}) {
  const root = options.root || resolveTechscopeRoot();
  const normalizedTarget = controlCenterSlug(target);
  const registry = readAgentCatalog({ ...options, root, fresh: true });
  const record = findCatalogAgent(registry, String(target || ""));
  const folder = record?.projectPath ? { name: path.basename(record.projectPath), absolutePath: record.projectPath } : null;
  const manifestPath = folder ? path.join(folder.absolutePath, "operations", "manifest.json") : "";
  const manifestRead = readAgentOperationsManifest(record);
  const manifest = manifestRead.manifest;
  const applicability = agentOperationsApplicability(record, manifest, { ...options, root });
  const evidence = evidencePaths(root, record);
  const lifecycle = deliveryLifecycle(root, evidence);
  const blockers = [];
  const nextActions = [];
  if (record?.identityStatus === "conflict") blockers.push(`Agent identity needs reconciliation: ${record.diagnostics.join(", ")}`);

  if (!record) {
    blockers.push("Agent is missing from the current instance registry; rebuild the registry after scaffold.");
    nextActions.push("Run `node scripts/pritha.mjs registry` after contract/scaffold artifacts exist.");
  }
  if (!folder) {
    blockers.push("Sibling child-agent folder is missing.");
    nextActions.push("Create or repair the sibling child-agent scaffold.");
  }
  if (folder && !manifest && applicability.manifestRequired !== false) {
    blockers.push(applicability.status === "unknown" ? "Operations applicability needs an accepted contract or operations metadata." : "operations/manifest.json is missing or invalid for the selected operations.");
    nextActions.push("Review the selected operations contract before preparing required metadata.");
  }
  if (applicability.status === "invalid-contract") blockers.push("Agent type metadata needs contract schema review.");
  if (manifestRead.issue) blockers.push("operations/manifest.json is invalid or unsafe to read.");
  if (!lifecycle.outcome.present) {
    nextActions.push("Create and separately approve an Outcome Spec before autonomous delivery.");
  } else if (!lifecycle.outcome.approved) {
    nextActions.push("Review and approve the Outcome Spec before autonomous delivery.");
  } else if (!lifecycle.delivery.present) {
    nextActions.push("Run outcome delivery to produce revision-bound verification evidence.");
  } else if (["blocked", "awaiting_acceptance", "verified"].includes(lifecycle.delivery.status)) {
    nextActions.push(`Continue the delivery lifecycle from ${lifecycle.delivery.status}.`);
  }
  const runtimeSelected = controlCenterRuntimeSelected(manifest);
  if (manifest) {
    if (runtimeSelected) {
      if (!manifest.control_center_contract) blockers.push("operations/manifest.json is missing control_center_contract.");
      if (manifest.control_center_managed !== true) blockers.push("selected Control Center runtime must set control_center_managed=true.");
      if (!manifest.control_center_runtime || String(manifest.control_center_runtime.manager || "none") === "none") {
        blockers.push("selected Control Center runtime requires control_center_runtime.manager.");
      }
      if (!structuredCommand(manifest.start_command)) blockers.push("selected Control Center runtime requires a structured start_command argv.");
      if (!structuredCommand(manifest.stop_command)) blockers.push("selected Control Center runtime requires a structured stop_command argv.");
      if (manifest.start_command?.control_center_managed !== true) blockers.push("managed start_command must be marked control_center_managed.");
      if (manifest.stop_command?.control_center_managed !== true) blockers.push("managed stop_command must be marked control_center_managed.");
      if (!hasHealthContract(manifest)) {
        blockers.push("selected Control Center runtime requires health_url, local_upstream_url, or healthcheck_argv.");
      }
    } else if (!manifest.health_url && !manifest.local_upstream_url) {
      nextActions.push("Add health_url or local_upstream_url only if the agent later selects a local service runtime.");
    }
  }

  const live = await liveControlCenterCard({
    target: normalizedTarget,
    record,
    baseUrl: options.baseUrl === undefined ? undefined : options.baseUrl,
    timeoutMs: Number(options.timeoutMs || 2000),
  });
  if (live.visible === false) {
    blockers.push(live.reason || "Control Center did not expose the agent card.");
    nextActions.push("Restart or refresh Control Center after rebuilding the registry.");
  }
  if (live.visible === "unknown") {
    nextActions.push("Start Control Center and rerun card-readiness to verify live /api/agents visibility.");
  }
  if (live.visible === true && !live.actionPlanAvailable) {
    blockers.push(live.reason || "Control Center action plan endpoint is unavailable.");
  }
  if (
    live.visible === true &&
    live.actionPlanAvailable &&
    runtimeSelected &&
    ["start", "stop"].includes(live.action || "") &&
    live.actionExecutionMode !== "executable"
  ) {
    blockers.push(`Control Center ${live.action} plan must be executable for the selected runtime.`);
  }
  if (live.visible === true && live.actionPlanAvailable && ["blocked", "unavailable"].includes(live.actionPlanStatus || "")) {
    blockers.push(`Control Center action plan status is ${live.actionPlanStatus}.`);
  }
  if (live.actionPlanBlockers?.length) {
    nextActions.push("Resolve runtime blockers when Start/Stop should become executable.");
  }

  const localCardReady = Boolean(record && folder && (manifest || applicability.manifestRequired === false) && blockers.length === 0);
  const status = !record || live.visible === false ? "missing" : localCardReady ? "ready" : "blocked";
  const { timeoutMs: _httpTimeout, ...readinessOptions } = options;
  const resultReadiness = record ? await readAgentResultReadinessAsync(record.id, { ...readinessOptions, root }) : unavailableResultReadiness("agent-identity-unavailable");

  return {
    ok: status !== "missing",
    status,
    target: normalizedTarget,
    agentId: live.agentId || record?.id || normalizedTarget,
    identity: record ? { status: record.identityStatus, agentId: record.agentId, instanceKey: record.instanceKey, diagnostics: record.diagnostics } : null,
    registryPresent: Boolean(record),
    registryPath: path.relative(root, registry.registryPath),
    folderPresent: Boolean(folder),
    folderPath: folder ? path.relative(root, folder.absolutePath) : undefined,
    manifestPresent: Boolean(manifest),
    agentKind: record?.agentKind || null,
    operationsApplicability: applicability,
    readinessScope: "card-configuration-only",
    resultReadiness,
    manifestPath: manifest ? path.relative(root, manifestPath) : undefined,
    controlCenterVisible: live.visible,
    actionPlanAvailable: live.actionPlanAvailable ?? false,
    actionEnabled: live.actionEnabled,
    actionPlanStatus: live.actionPlanStatus,
    rawActionPlanStatus: live.rawActionPlanStatus,
    actionExecutionMode: live.actionExecutionMode,
    runtimeBlockers: live.actionPlanBlockers || [],
    blockers,
    nextActions: [...new Set(nextActions)],
    evidence,
    lifecycle,
    warnings: live.visible === "unknown" ? [live.reason] : [],
  };
}

export function printCardReadiness(result) {
  console.log(JSON.stringify(result, null, 2));
}
