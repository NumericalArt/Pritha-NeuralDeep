import type { AgentCardModel } from "@/data/mockAgents";
import type { AccessMode } from "@/lib/access-mode";
import type { ControlCenterFleetManualAuditResult, ControlCenterStatus } from "@/lib/control-center/types";
import { AgentCard } from "./AgentCard";

type AgentView = "active" | "drafts" | "all";

function auditSummaryLabel(result: ControlCenterFleetManualAuditResult) {
  return `Fleet: ${result.summary.passed} ok · ${result.summary.warnings} warn · ${result.summary.failed} failed`;
}

export function MobileAgents({
  agents,
  agentView = "active",
  agentCounts,
  access,
  accessMode,
  onAgentViewChange,
  onAgentAction,
  onAgentCredentials,
  onCreatePlan,
  onManualAudit,
  manualAuditRunning = false,
  manualAuditResult,
}: {
  agents: AgentCardModel[];
  agentView?: AgentView;
  agentCounts?: {
    active: number;
    drafts: number;
    all: number;
  };
  access?: ControlCenterStatus["access"];
  accessMode?: AccessMode;
  onAgentViewChange?: (view: AgentView) => void;
  onAgentAction?: (agent: AgentCardModel) => void;
  onAgentCredentials?: (agent: AgentCardModel) => void;
  onCreatePlan?: () => void;
  onManualAudit?: () => void;
  manualAuditRunning?: boolean;
  manualAuditResult?: ControlCenterFleetManualAuditResult;
}) {
  const alive = agents.filter((agent) => agent.state === "alive").length;
  const missing = agents.filter((agent) => agent.state === "missing").length;
  const updates = agents.filter((agent) => agent.updateStatus === "available").length;
  const counts = agentCounts || { active: agents.length, drafts: 0, all: agents.length };

  return (
    <div className="mobile-agents-screen">
      <div className="mobile-page-title-row">
        <h1 className="mobile-page-title">Child Agents</h1>
        <span className="count-pill">{agents.length}</span>
      </div>
      <div className="mobile-summary-grid">
        <div className="mobile-summary-chip">
          <span>Total</span>
          <strong>{agents.length}</strong>
        </div>
        <div className="mobile-summary-chip wide">
          <span><span className="dot green" />Настроены</span>
          <strong>{alive}</strong>
          <span><span className="dot red" />Missing</span>
          <strong>{missing}</strong>
        </div>
        <div className="mobile-summary-chip">
          <span>↑ Updates</span>
          <strong>{updates}</strong>
        </div>
      </div>
      <div className="agent-view-toggle mobile-agent-view-toggle" role="group" aria-label="Agent view">
        <button className={agentView === "active" ? "active" : ""} type="button" aria-pressed={agentView === "active"} onClick={() => onAgentViewChange?.("active")}>
          Active
        </button>
        <button
          className={agentView === "drafts" ? "active" : ""}
          type="button"
          aria-pressed={agentView === "drafts"}
          onClick={() => onAgentViewChange?.("drafts")}
          disabled={!counts.drafts}
        >
          Drafts
        </button>
        <button className={agentView === "all" ? "active" : ""} type="button" aria-pressed={agentView === "all"} onClick={() => onAgentViewChange?.("all")}>
          All
        </button>
      </div>
      <div className="mobile-operator-actions">
        <button type="button" onClick={onManualAudit} disabled={!onManualAudit || manualAuditRunning}>
          {manualAuditRunning ? "Running Audit" : "Run Manual Audit"}
        </button>
        {manualAuditResult ? <span>{auditSummaryLabel(manualAuditResult)}</span> : null}
      </div>
      <div className="mobile-agent-list">
        {agents.map((agent) => (
          <AgentCard agent={agent} access={access} accessMode={accessMode} mobile key={agent.id} onAction={onAgentAction} onCredentials={onAgentCredentials} />
        ))}
        <button className="mobile-add-agent-card" type="button" onClick={onCreatePlan} title="Open a safe Codex planning handoff">
          + Create Plan
        </button>
      </div>
    </div>
  );
}
