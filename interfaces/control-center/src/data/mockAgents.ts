import type { ControlCenterAgent, ControlCenterAgentControl, ControlCenterCardAction, ControlCenterOperatorAction } from "@/lib/control-center/types";

export type AgentState = "alive" | "missing" | "needs-check" | "unknown";
export type AgentActivity = "active" | "inactive" | "unknown";
export type AgentIconType = "bot" | "sail" | "cube" | "warning" | "box";

export type AgentCardModel = {
  id: string;
  name: string;
  version: string;
  versionStatus?: "ready" | "unavailable";
  versionSource?: string;
  description: string;
  state: AgentState;
  activity: AgentActivity;
  url?: string;
  tailscaleUrl?: string;
  statusUrl?: string;
  updateStatus?: "available" | "up-to-date" | "review-needed" | "none";
  issueText?: string;
  lifecycleNote?: string;
  lifecycleTone?: "ok" | "muted" | "update";
  agentKind?: ControlCenterAgent["agentKind"];
  resultReadiness?: ControlCenterAgent["resultReadiness"];
  runtimeReadiness?: ControlCenterAgent["readiness"]["runtime"];
  healthStatus?: ControlCenterAgent["health"]["status"];
  restorePlanStatus?: "ready" | "unavailable" | "planned";
  rollbackStatus?: "ready" | "unavailable" | "planned";
  credentials?: {
    status: "ready" | "pending_auth" | "unavailable";
    required: number;
    missingRequired: number;
    total: number;
  };
  iconType: AgentIconType;
  actionEnabled?: boolean;
  actionDisabledReason?: string;
  control?: ControlCenterAgentControl;
};

export const mockAgents: AgentCardModel[] = [
  {
    id: "funny-teacher",
    name: "Funny Teacher",
    version: "v1.3",
    description: "Voice learning agent for kids and parents",
    state: "alive",
    activity: "inactive",
    url: "http://localhost:3021",
    updateStatus: "available",
    iconType: "bot",
  },
  {
    id: "fespa26",
    name: "FESPA26",
    version: "v1.1",
    description: "Event & media processing workbench",
    state: "alive",
    activity: "active",
    url: "http://localhost:3022",
    updateStatus: "available",
    iconType: "sail",
  },
  {
    id: "research-helper",
    name: "Research Helper",
    version: "v0.9.4",
    description: "Academic research assistant",
    state: "alive",
    activity: "inactive",
    url: "http://localhost:3023",
    updateStatus: "up-to-date",
    iconType: "cube",
  },
  {
    id: "market-scout",
    name: "Market Scout",
    version: "v0.8.0",
    description: "Market analysis and monitoring",
    state: "missing",
    activity: "unknown",
    updateStatus: "none",
    issueText: "Folder not found",
    iconType: "box",
  },
  {
    id: "code-auditor",
    name: "Code Auditor",
    version: "v1.0.0",
    description: "Security and code quality audit",
    state: "needs-check",
    activity: "unknown",
    updateStatus: "none",
    issueText: "Manifest or healthcheck issue",
    iconType: "warning",
  },
];

function fallbackPlanAction(agent: AgentCardModel): ControlCenterOperatorAction {
  if (agent.state === "missing") return "restore";
  if (agent.state === "needs-check") return "check";
  if (agent.state === "alive" && agent.activity === "active") return "stop";
  if (agent.state === "alive") return "start";
  return "check";
}

function fallbackCardAction(agent: AgentCardModel): ControlCenterCardAction {
  const action = fallbackPlanAction(agent);
  if (action === "start") return "start_plan";
  if (action === "stop") return "stop_plan";
  if (action === "restore") return "restore_plan";
  return "run_check";
}

export function getPrimaryAction(agent: AgentCardModel): ControlCenterOperatorAction {
  return agent.control?.planAction || fallbackPlanAction(agent);
}

export function getCardAction(agent: AgentCardModel): ControlCenterCardAction {
  return agent.control?.primaryCardAction || fallbackCardAction(agent);
}

export function getCardActionLabel(agent: AgentCardModel) {
  const action = getCardAction(agent);
  if (action === "start_plan") return "Start Plan";
  if (action === "stop_plan") return "Stop Plan";
  if (action === "restore_plan") return "Restore Plan";
  if (action === "open_codex") return "Open in Task Chat";
  if (agent.control?.label) return agent.control.label;
  if (action === "run_now") return "Run Now";
  if (action === "pause_schedule") return "Pause Schedule";
  if (action === "resume_schedule") return "Resume Schedule";
  return "Run Check";
}

export function getCardActionTone(agent: AgentCardModel): "start" | "stop" | "restore" | "check" {
  const action = getCardAction(agent);
  if (action === "start_plan" || action === "run_now" || action === "resume_schedule") return "start";
  if (action === "stop_plan" || action === "pause_schedule") return "stop";
  if (action === "restore_plan") return "restore";
  return "check";
}
