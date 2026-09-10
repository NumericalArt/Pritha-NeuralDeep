"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  CheckCircle,
  ClipboardCheck,
  ExternalLink,
  KeyRound,
  Play,
  RefreshCcw,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AgentCardModel } from "@/data/mockAgents";
import { getCardActionLabel, getPrimaryAction } from "@/data/mockAgents";
import { copyTextToClipboard } from "@/lib/clipboard";
import { ACCESS_MODE_CHANGED_EVENT, type AccessMode, preferredAccessMode, readStoredAccessMode } from "@/lib/access-mode";
import type {
  ControlCenterCommandReadiness,
  ControlCenterAgentCredentialsResponse,
  ControlCenterFleetManualAuditResult,
  ControlCenterOperatorAction,
  ControlCenterOperatorActionPlan,
  ControlCenterOperatorActionResult,
  ControlCenterSecretDefinition,
  ControlCenterSecretMutationResult,
  ControlCenterSecretValidationResult,
  ControlCenterStatus,
} from "@/lib/control-center/types";
import { MobileAgents } from "./MobileAgents";
import { AgentsGrid } from "./AgentsGrid";
import { AgentsRightRail } from "./RightRail";
import { PageHeader } from "../shell/PageHeader";

type AgentView = "active" | "drafts" | "all";

type PanelState = {
  plan?: ControlCenterOperatorActionPlan;
  result?: ControlCenterOperatorActionResult;
  loading: boolean;
  running: boolean;
  error?: string;
};

type CredentialMessage = {
  tone: "ok" | "warn" | "error";
  text: string;
};

type CredentialPanelState = {
  response?: ControlCenterAgentCredentialsResponse;
  loading: boolean;
  busySecret?: string;
  error?: string;
  inputs: Record<string, string>;
  messages: Record<string, CredentialMessage>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await response.json()) as T;
  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json ? String((json as { error?: unknown }).error) : response.statusText;
    throw new Error(message || `HTTP ${response.status}`);
  }
  if (init?.method && init.method !== "GET") window.dispatchEvent(new Event("pritha:status-refresh"));
  return json;
}

function actionLabel(action: ControlCenterOperatorAction) {
  if (action === "start") return "Start";
  if (action === "stop") return "Stop";
  if (action === "restore") return "Restore";
  return "Check";
}

function actionProgressLabel(action: ControlCenterOperatorAction) {
  if (action === "start") return "Starting...";
  if (action === "stop") return "Stopping...";
  if (action === "restore") return "Restoring...";
  return "Checking...";
}

function ActionIcon({ action }: { action: ControlCenterOperatorAction }) {
  if (action === "start") return <Play size={18} fill="currentColor" />;
  if (action === "stop") return <Square size={15} fill="currentColor" />;
  if (action === "restore") return <RefreshCcw size={18} />;
  return <ClipboardCheck size={18} />;
}

function CheckIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 size={16} />;
  return <AlertTriangle size={16} />;
}

function resultText(result: ControlCenterOperatorActionResult) {
  if (result.execution) {
    const readiness = result.execution.readiness ? `; readiness: ${result.execution.readiness.status}` : "";
    const exit = result.execution.exitCode !== undefined && result.execution.exitCode !== null ? `; exit ${result.execution.exitCode}` : "";
    return `${actionLabel(result.action)} ${result.status}${exit}${readiness}`;
  }
  return `${result.status}: ${result.summary.passed} pass / ${result.summary.warnings} warn / ${result.summary.failed} fail`;
}

function executionLabel(plan?: ControlCenterOperatorActionPlan) {
  if (!plan) return "Plan only";
  if (plan.control.executionMode === "executable") return "Executable";
  if (plan.control.executionMode === "manual_only") return "Manual only";
  if (plan.control.executionMode === "codex_plan") return "Codex plan";
  if (plan.control.executionMode === "unavailable") return "Unavailable";
  return "Plan only";
}

function commandReadinessLabel(readiness?: ControlCenterCommandReadiness) {
  if (readiness === "structured_executable") return "structured executable";
  if (readiness === "human_instruction") return "human instruction";
  if (readiness === "legacy_declared") return "legacy declared";
  return "missing";
}

function secretStatusLabel(definition: ControlCenterSecretDefinition) {
  if (definition.status === "configured") return "Configured";
  if (definition.status === "missing") return "Missing";
  if (definition.status === "optional") return "Optional";
  return "Unavailable";
}

function secretProviderLabel(definition: ControlCenterSecretDefinition) {
  if (definition.provider === "openai") return "OpenAI";
  if (definition.provider === "telegram") return "Telegram";
  if (definition.provider === "anthropic") return "Anthropic";
  if (definition.provider === "whatsapp") return "WhatsApp";
  if (definition.provider === "codex_external") return "Codex external";
  return "Generic";
}

function browserExposureLabel(definition: ControlCenterSecretDefinition) {
  if (definition.browserExposure === "server_only") return "Server only";
  if (definition.browserExposure === "ephemeral_only") return "Ephemeral only";
  if (definition.browserExposure === "client_allowed") return "Client allowed";
  return "Never";
}

function credentialsSummaryLabel(response?: ControlCenterAgentCredentialsResponse) {
  if (!response) return "Loading";
  const credentials = response.credentials;
  if (credentials.status === "ready") return "Ready";
  if (credentials.missingRequired) return `${credentials.missingRequired} missing`;
  if (!credentials.definitions.length) return "No definitions";
  return String(credentials.status);
}

export function AgentsOperatorExperience({ status, agents }: { status: ControlCenterStatus; agents: AgentCardModel[] }) {
  const router = useRouter();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ControlCenterOperatorAction>("check");
  const [panel, setPanel] = useState<PanelState>({ loading: false, running: false });
  const [confirmationInput, setConfirmationInput] = useState("");
  const [agentView, setAgentView] = useState<AgentView>("active");
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createPlanCopyStatus, setCreatePlanCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [credentialsAgentId, setCredentialsAgentId] = useState<string | null>(null);
  const [credentialsPanel, setCredentialsPanel] = useState<CredentialPanelState>({
    loading: false,
    inputs: {},
    messages: {},
  });
  const [manualAuditRunning, setManualAuditRunning] = useState(false);
  const [manualAuditResult, setManualAuditResult] = useState<ControlCenterFleetManualAuditResult | undefined>();
  const [manualAuditError, setManualAuditError] = useState<string | undefined>();
  const [accessMode, setAccessMode] = useState<AccessMode>(() => preferredAccessMode(status.access));
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId) || null, [agents, selectedAgentId]);
  const credentialsAgent = useMemo(() => agents.find((agent) => agent.id === credentialsAgentId) || null, [agents, credentialsAgentId]);
  const activeAgents = useMemo(() => agents.filter((agent) => agent.control?.runtimeKind !== "scaffold"), [agents]);
  const draftAgents = useMemo(() => agents.filter((agent) => agent.control?.runtimeKind === "scaffold"), [agents]);
  const visibleAgents = agentView === "drafts" ? draftAgents : agentView === "all" ? agents : activeAgents;

  function openAction(agent: AgentCardModel) {
    setSelectedAgentId(agent.id);
    setSelectedAction(getPrimaryAction(agent));
    setConfirmationInput("");
    setPanel({ loading: true, running: false });
  }

  function closeAction() {
    setSelectedAgentId(null);
    setConfirmationInput("");
    setPanel({ loading: false, running: false });
  }

  function openCredentials(agent: AgentCardModel) {
    setCredentialsAgentId(agent.id);
    setCredentialsPanel({ loading: true, inputs: {}, messages: {} });
  }

  function closeCredentials() {
    setCredentialsAgentId(null);
    setCredentialsPanel({ loading: false, inputs: {}, messages: {} });
  }

  async function loadPlan(agentId: string, action: ControlCenterOperatorAction) {
    setPanel((current) => ({ ...current, loading: true, error: undefined, result: undefined }));
    try {
      const plan = await fetchJson<ControlCenterOperatorActionPlan>(`/api/agents/${agentId}/actions/${action}/plan`);
      setPanel({ plan, loading: false, running: false });
    } catch (error) {
      setPanel({ loading: false, running: false, error: error instanceof Error ? error.message : "Action plan unavailable" });
    }
  }

  async function runManualCheck() {
    if (!selectedAgent) return;
    setPanel((current) => ({ ...current, running: true, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterOperatorActionResult>(`/api/agents/${selectedAgent.id}/actions/check`, {
        method: "POST",
      });
      setPanel((current) => ({ ...current, result, running: false }));
      router.refresh();
    } catch (error) {
      setPanel((current) => ({ ...current, running: false, error: error instanceof Error ? error.message : "Manual check failed" }));
    }
  }

  async function runRuntimeAction() {
    if (!selectedAgent || (selectedAction !== "start" && selectedAction !== "stop")) return;
    const plan = panel.plan;
    if (!plan?.actionEnabled) return;
    const needsConfirmation = plan.requiresConfirmation === true;
    const requiredPhrase = panel.plan?.confirmation?.requiredPhrase || "";
    if (needsConfirmation && !requiredPhrase) return;
    if (needsConfirmation && confirmationInput !== requiredPhrase) return;
    setPanel((current) => ({ ...current, running: true, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterOperatorActionResult>(`/api/agents/${selectedAgent.id}/actions/${selectedAction}`, {
        method: "POST",
        body: JSON.stringify({ confirmation: needsConfirmation ? confirmationInput : "" }),
      });
      setPanel((current) => ({ ...current, result, running: false }));
      router.refresh();
      await loadPlan(selectedAgent.id, selectedAction);
      setPanel((current) => ({ ...current, result }));
    } catch (error) {
      setPanel((current) => ({ ...current, running: false, error: error instanceof Error ? error.message : `${actionLabel(selectedAction)} failed` }));
    }
  }

  async function runFleetManualAudit() {
    setManualAuditRunning(true);
    setManualAuditError(undefined);
    try {
      const result = await fetchJson<ControlCenterFleetManualAuditResult>("/api/agents/actions/manual-audit", {
        method: "POST",
      });
      setManualAuditResult(result);
      router.refresh();
    } catch (error) {
      setManualAuditError(error instanceof Error ? error.message : "Manual audit failed");
    } finally {
      setManualAuditRunning(false);
    }
  }

  async function loadCredentials(agentId: string) {
    setCredentialsPanel((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const response = await fetchJson<ControlCenterAgentCredentialsResponse>(`/api/agents/${agentId}/credentials`);
      setCredentialsPanel((current) => ({ ...current, response, loading: false, error: undefined }));
    } catch (error) {
      setCredentialsPanel((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Credentials unavailable",
      }));
    }
  }

  function updateCredentialInput(name: string, value: string) {
    setCredentialsPanel((current) => ({
      ...current,
      inputs: {
        ...current.inputs,
        [name]: value,
      },
    }));
  }

  function credentialMessage(name: string, message: CredentialMessage) {
    setCredentialsPanel((current) => ({
      ...current,
      messages: {
        ...current.messages,
        [name]: message,
      },
    }));
  }

  async function saveCredential(name: string) {
    if (!credentialsAgentId) return;
    const value = credentialsPanel.inputs[name] || "";
    if (!value.trim()) {
      credentialMessage(name, { tone: "error", text: "Paste a value before saving." });
      return;
    }
    setCredentialsPanel((current) => ({ ...current, busySecret: name, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterSecretMutationResult>(`/api/agents/${credentialsAgentId}/credentials/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setCredentialsPanel((current) => ({
        ...current,
        busySecret: undefined,
        inputs: { ...current.inputs, [name]: "" },
      }));
      credentialMessage(name, { tone: "ok", text: `${result.secret.name} saved as ${result.secret.maskedValue || "configured"}.` });
      await loadCredentials(credentialsAgentId);
      router.refresh();
    } catch (error) {
      setCredentialsPanel((current) => ({ ...current, busySecret: undefined }));
      credentialMessage(name, { tone: "error", text: error instanceof Error ? error.message : "Save failed." });
    }
  }

  async function removeCredential(name: string) {
    if (!credentialsAgentId) return;
    setCredentialsPanel((current) => ({ ...current, busySecret: name, error: undefined }));
    try {
      await fetchJson<ControlCenterSecretMutationResult>(`/api/agents/${credentialsAgentId}/credentials/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      setCredentialsPanel((current) => ({
        ...current,
        busySecret: undefined,
        inputs: { ...current.inputs, [name]: "" },
      }));
      credentialMessage(name, { tone: "warn", text: `${name} removed from the private store.` });
      await loadCredentials(credentialsAgentId);
      router.refresh();
    } catch (error) {
      setCredentialsPanel((current) => ({ ...current, busySecret: undefined }));
      credentialMessage(name, { tone: "error", text: error instanceof Error ? error.message : "Remove failed." });
    }
  }

  async function validateCredential(name: string) {
    if (!credentialsAgentId) return;
    setCredentialsPanel((current) => ({ ...current, busySecret: name, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterSecretValidationResult>(`/api/agents/${credentialsAgentId}/credentials/${encodeURIComponent(name)}/validate`, {
        method: "POST",
      });
      const failed = result.checks.filter((check) => check.status === "fail").length;
      const warnings = result.checks.filter((check) => check.status === "warn").length;
      setCredentialsPanel((current) => ({ ...current, busySecret: undefined }));
      credentialMessage(name, {
        tone: failed ? "error" : warnings ? "warn" : "ok",
        text: `${result.secret.status}: ${result.checks.length - failed - warnings} pass / ${warnings} warn / ${failed} fail`,
      });
    } catch (error) {
      setCredentialsPanel((current) => ({ ...current, busySecret: undefined }));
      credentialMessage(name, { tone: "error", text: error instanceof Error ? error.message : "Validation failed." });
    }
  }

  async function copyCreatePlanPrompt() {
    const prompt = [
      "Create a safe child-agent plan for Pritha.",
      "Start with an agent-contract. Do not scaffold, write secrets, install services, start processes, or enable cron/launchd without explicit approval.",
      "Define mission, runtime class, interfaces, deployment target, isolation, operations, required secrets, tests, and handoff criteria.",
    ].join("\n");
    const ok = await copyTextToClipboard(prompt);
    setCreatePlanCopyStatus(ok ? "copied" : "failed");
    window.setTimeout(() => setCreatePlanCopyStatus("idle"), 1600);
  }

  useEffect(() => {
    if (!selectedAgentId) return;
    void loadPlan(selectedAgentId, selectedAction);
  }, [selectedAgentId, selectedAction]);

  useEffect(() => {
    if (!credentialsAgentId) return;
    void loadCredentials(credentialsAgentId);
  }, [credentialsAgentId]);

  useEffect(() => {
    const syncAccessMode = () => setAccessMode(preferredAccessMode(status.access, readStoredAccessMode()));
    syncAccessMode();
    window.addEventListener("storage", syncAccessMode);
    window.addEventListener(ACCESS_MODE_CHANGED_EVENT, syncAccessMode);
    return () => {
      window.removeEventListener("storage", syncAccessMode);
      window.removeEventListener(ACCESS_MODE_CHANGED_EVENT, syncAccessMode);
    };
  }, [status.access]);

  const selectedActionLabel = panel.plan?.control.label || (selectedAgent ? getCardActionLabel(selectedAgent) : actionLabel(selectedAction));
  const runtimeAction = selectedAction === "start" || selectedAction === "stop";
  const requiredPhrase = runtimeAction ? panel.plan?.confirmation?.requiredPhrase || "" : "";
  const runtimeActionEnabled = Boolean(
    runtimeAction
      && panel.plan?.actionEnabled
      && !panel.running
      && (!panel.plan.requiresConfirmation || (requiredPhrase && confirmationInput === requiredPhrase)),
  );

  return (
    <>
      <div className="agents-desktop-content">
        <PageHeader
          title="Child Agents"
          subtitle="Pritha remembers. You control."
          count={status.counts.childAgents}
          variant="agents"
          status={status}
          showCountPill={false}
        />
        <div className="agents-page">
          <div className="agents-layout">
            <section className="agents-main">
              <div className="agents-toolbar" aria-label="Agent filters" data-testid="agent-filter-toolbar">
                <div>
                  <strong>{visibleAgents.length} shown</strong>
                  <span>{draftAgents.length ? `${draftAgents.length} draft${draftAgents.length === 1 ? "" : "s"}` : "No drafts"}</span>
                </div>
                <div className="agent-view-toggle" role="group" aria-label="Agent view">
                  <button
                    className={agentView === "active" ? "active" : ""}
                    type="button"
                    data-filter="active"
                    aria-pressed={agentView === "active"}
                    onClick={(event) => {
                      event.preventDefault();
                      setAgentView("active");
                    }}
                  >
                    Active
                  </button>
                  <button
                    className={agentView === "drafts" ? "active" : ""}
                    type="button"
                    data-filter="drafts"
                    aria-pressed={agentView === "drafts"}
                    onClick={(event) => {
                      event.preventDefault();
                      setAgentView("drafts");
                    }}
                    disabled={!draftAgents.length}
                  >
                    Drafts
                  </button>
                  <button
                    className={agentView === "all" ? "active" : ""}
                    type="button"
                    data-filter="all"
                    aria-pressed={agentView === "all"}
                    onClick={(event) => {
                      event.preventDefault();
                      setAgentView("all");
                    }}
                  >
                    All
                  </button>
                </div>
              </div>
              <AgentsGrid
                agents={visibleAgents}
                access={status.access}
                accessMode={accessMode}
                onAgentAction={openAction}
                onAgentCredentials={openCredentials}
                onCreatePlan={() => setCreatePlanOpen(true)}
              />
            </section>
            <AgentsRightRail
              status={status}
              onManualAudit={() => void runFleetManualAudit()}
              manualAuditRunning={manualAuditRunning}
              manualAuditResult={manualAuditResult}
              manualAuditError={manualAuditError}
            />
          </div>
        </div>
      </div>
      <MobileAgents
        agents={visibleAgents}
        agentView={agentView}
        agentCounts={{ active: activeAgents.length, drafts: draftAgents.length, all: agents.length }}
        access={status.access}
        accessMode={accessMode}
        onAgentViewChange={setAgentView}
        onAgentAction={openAction}
        onAgentCredentials={openCredentials}
        onCreatePlan={() => setCreatePlanOpen(true)}
        onManualAudit={() => void runFleetManualAudit()}
        manualAuditRunning={manualAuditRunning}
        manualAuditResult={manualAuditResult}
      />

      {selectedAgent ? (
        <div className="operator-action-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? closeAction() : undefined)}>
          <aside className="operator-action-panel" aria-label={`${selectedActionLabel} for ${selectedAgent.name}`}>
            <div className="operator-action-header">
              <div className={`operator-action-icon ${selectedAction}`}>
                <ActionIcon action={selectedAction} />
              </div>
              <div>
                <span>Operator Action</span>
                <h2>{selectedActionLabel} {selectedAgent.name}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close action panel" onClick={closeAction}>
                <X size={18} />
              </button>
            </div>

            <div className="operator-action-status-grid">
              <div>
                <span>Status</span>
                <strong>{panel.plan?.status || (panel.loading ? "Loading" : "Unavailable")}</strong>
              </div>
              <div>
                <span>Execution</span>
                <strong>{executionLabel(panel.plan)}</strong>
              </div>
              <div>
                <span>Target</span>
                <strong>{panel.plan?.target.kind || "none"}</strong>
              </div>
              <div>
                <span>Runtime</span>
                <strong>{panel.plan?.control.runtimeKind || selectedAgent.control?.runtimeKind || "unknown"}</strong>
              </div>
              <div>
                <span>Start command</span>
                <strong>{commandReadinessLabel(panel.plan?.control.commandReadiness.start || selectedAgent.control?.commandReadiness.start)}</strong>
              </div>
              <div>
                <span>Stop command</span>
                <strong>{commandReadinessLabel(panel.plan?.control.commandReadiness.stop || selectedAgent.control?.commandReadiness.stop)}</strong>
              </div>
            </div>

            {panel.error ? <div className="operator-action-message error">{panel.error}</div> : null}
            {panel.result ? <div className="operator-action-message ok">{resultText(panel.result)}</div> : null}

            <section className="operator-action-section">
              <h3>Preflight</h3>
              <div className="operator-check-list">
                {panel.plan?.checks.map((check) => (
                  <div className={`operator-check-row ${check.status}`} key={check.id}>
                    <CheckIcon status={check.status} />
                    <span>{check.label}</span>
                    <small>{check.detail}</small>
                  </div>
                ))}
                {panel.loading ? <div className="operator-empty">Loading action plan...</div> : null}
              </div>
            </section>

            <section className="operator-action-section">
              <h3>Plan</h3>
              <div className="operator-plan-list">
                {panel.plan?.steps.map((step) => (
                  <div key={step}>{step}</div>
                ))}
              </div>
            </section>

            {panel.plan?.blockers.length ? (
              <section className="operator-action-section">
                <h3>Blockers</h3>
                <div className="operator-plan-list warn">
                  {panel.plan.blockers.map((blocker) => (
                    <div key={blocker}>{blocker}</div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="operator-action-section">
              <h3>Safety</h3>
              <div className="operator-safety-note">
                <ShieldCheck size={17} />
                <span>{panel.plan?.warnings[0] || "No runtime mutation is available without an explicit backend."}</span>
              </div>
              {panel.plan?.risks[0] ? (
                <div className="operator-safety-note muted">
                  <Activity size={17} />
                  <span>{panel.plan.risks[0]}</span>
                </div>
              ) : null}
            </section>

            {runtimeAction && panel.plan?.requiresConfirmation && requiredPhrase ? (
              <section className="operator-action-section operator-confirmation-section">
                <h3>Manual Confirmation</h3>
                <div className="operator-confirmation-copy">
                  <span>Required phrase</span>
                  <strong>{requiredPhrase}</strong>
                </div>
                <label className="operator-confirmation-input">
                  <span>Type the phrase exactly to enable {actionLabel(selectedAction).toLowerCase()}</span>
                  <input
                    type="text"
                    value={confirmationInput}
                    onChange={(event) => setConfirmationInput(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </section>
            ) : null}

            <div className="operator-action-footer">
              <button className="outline-button compact" type="button" onClick={closeAction}>
                Close
              </button>
              {runtimeAction ? (
                <div className="operator-footer-actions">
                  <button className="outline-button compact" type="button" disabled={panel.running} onClick={() => void runManualCheck()}>
                    <ClipboardCheck size={16} />
                    Check
                  </button>
                  <button className="primary-action-button compact" type="button" disabled={!runtimeActionEnabled} onClick={() => void runRuntimeAction()}>
                    <ActionIcon action={selectedAction} />
                    {panel.running ? actionProgressLabel(selectedAction) : actionLabel(selectedAction)}
                  </button>
                </div>
              ) : (
                <button className="primary-action-button compact" type="button" disabled={panel.running} onClick={() => void runManualCheck()}>
                  <ClipboardCheck size={16} />
                  {panel.running ? "Checking..." : "Run Manual Check"}
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {credentialsAgent ? (
        <div className="operator-action-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? closeCredentials() : undefined)}>
          <aside className="operator-action-panel credentials-panel" data-testid="credentials-panel" data-agent-id={credentialsAgent.id} aria-label={`Credentials for ${credentialsAgent.name}`}>
            <div className="operator-action-header">
              <div className="operator-action-icon check">
                <KeyRound size={18} />
              </div>
              <div>
                <span>Per-Agent Credentials</span>
                <h2>{credentialsAgent.name}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close credentials panel" onClick={closeCredentials}>
                <X size={18} />
              </button>
            </div>

            <div className="operator-action-status-grid credentials-summary-grid">
              <div>
                <span>Status</span>
                <strong>{credentialsSummaryLabel(credentialsPanel.response)}</strong>
              </div>
              <div>
                <span>Required</span>
                <strong>
                  {credentialsPanel.response
                    ? `${credentialsPanel.response.credentials.configuredRequired}/${credentialsPanel.response.credentials.required}`
                    : "Loading"}
                </strong>
              </div>
              <div>
                <span>Storage</span>
                <strong>{credentialsPanel.response?.credentials.storage.target || ".env.local"}</strong>
              </div>
            </div>

            {credentialsPanel.error ? <div className="operator-action-message error">{credentialsPanel.error}</div> : null}

            <section className="operator-action-section">
              <h3>Secret Definitions</h3>
              <div className="credential-list">
                {credentialsPanel.loading ? <div className="operator-empty">Loading credential metadata...</div> : null}
                {credentialsPanel.response?.credentials.definitions.map((definition) => {
                  const busy = credentialsPanel.busySecret === definition.name;
                  const message = credentialsPanel.messages[definition.name];
                  return (
                    <div className={`credential-row ${definition.status}`} key={definition.name}>
                      <div className="credential-row-header">
                        <div>
                          <strong>{definition.label}</strong>
                          <span>{definition.name}</span>
                        </div>
                        <small>{secretStatusLabel(definition)}</small>
                      </div>
                      <div className="credential-meta-grid">
                        <span>{secretProviderLabel(definition)}</span>
                        <span>{definition.required ? "Required" : "Optional"}</span>
                        <span>{browserExposureLabel(definition)}</span>
                        <span>{definition.maskedValue || "Not configured"}</span>
                      </div>
                      {definition.note ? <p>{definition.note}</p> : null}
                      <label className="credential-input-label">
                        <span>{definition.configured ? "Replace value" : "Secret value"}</span>
                        <input
                          type="password"
                          value={credentialsPanel.inputs[definition.name] || ""}
                          onChange={(event) => updateCredentialInput(definition.name, event.target.value)}
                          placeholder={definition.configured ? "Paste a new value to replace" : "Paste secret value"}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={!definition.canWrite || busy}
                        />
                      </label>
                      {message ? <div className={`credential-message ${message.tone}`}>{message.text}</div> : null}
                      <div className="credential-actions">
                        <button className="primary-action-button compact" type="button" disabled={!definition.canWrite || busy} onClick={() => void saveCredential(definition.name)}>
                          <KeyRound size={15} />
                          {busy ? "Working..." : "Save"}
                        </button>
                        <button className="outline-button compact" type="button" disabled={busy || !definition.configured} onClick={() => void validateCredential(definition.name)}>
                          Validate
                        </button>
                        <button className="outline-button compact danger" type="button" disabled={busy || !definition.canRemove} onClick={() => void removeCredential(definition.name)}>
                          <Trash2 size={15} />
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
                {credentialsPanel.response && !credentialsPanel.response.credentials.definitions.length ? (
                  <div className="operator-empty">No credential definitions found for this agent.</div>
                ) : null}
              </div>
            </section>

            <section className="operator-action-section">
              <h3>Safety</h3>
              <div className="operator-safety-note">
                <ShieldCheck size={17} />
                <span>Values are written only to the child agent private `.env.local` file with mode 0600. API responses return readiness and masked suffix only.</span>
              </div>
              <div className="operator-safety-note muted">
                <Activity size={17} />
                <span>NeuralDeep Codex CLI credentials stay in the dedicated Settings section. Do not paste provider credentials here.</span>
              </div>
            </section>

            <div className="operator-action-footer">
              <button className="outline-button compact" type="button" onClick={closeCredentials}>
                Close
              </button>
              <button className="primary-action-button compact" type="button" onClick={() => credentialsAgentId && void loadCredentials(credentialsAgentId)}>
                <RefreshCcw size={16} />
                Refresh
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {createPlanOpen ? (
        <div className="operator-action-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? setCreatePlanOpen(false) : undefined)}>
          <aside className="operator-action-panel create-plan-panel" aria-label="Open in Task Chat / Create Plan">
            <div className="operator-action-header">
              <div className="operator-action-icon check">
                <ExternalLink size={18} />
              </div>
              <div>
                <span>Planning Handoff</span>
                <h2>Open in Task Chat / Create Plan</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close create plan panel" onClick={() => setCreatePlanOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <section className="operator-action-section">
              <h3>Plan Contract</h3>
              <div className="operator-plan-list">
                <div>Create an agent-contract first.</div>
                <div>Define runtime, interfaces, deployment, isolation, secrets and tests.</div>
                <div>No scaffold, service install or secret write happens from this card.</div>
              </div>
            </section>

            <section className="operator-action-section">
              <h3>Safety</h3>
              <div className="operator-safety-note">
                <ShieldCheck size={17} />
                <span>Task Chat prepares a plan or manifest proposal. Runtime actions require later confirmation.</span>
              </div>
            </section>

            <div className="operator-action-footer">
              <button className="outline-button compact" type="button" onClick={() => setCreatePlanOpen(false)}>
                Close
              </button>
              <button className="primary-action-button compact" type="button" onClick={() => void copyCreatePlanPrompt()}>
                {createPlanCopyStatus === "copied" ? <CheckCircle size={16} /> : <Clipboard size={16} />}
                {createPlanCopyStatus === "copied" ? "Copied" : createPlanCopyStatus === "failed" ? "Copy Failed" : "Copy Prompt"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
