"use client";

import { VoiceControlPage } from "@/components/voice/VoiceControlPage";
import { AgentsOperatorExperience } from "@/components/agents/AgentsOperatorExperience";
import { SettingsControlPage } from "@/components/settings/SettingsControlPage";
import type { AgentCardModel, AgentIconType } from "@/data/mockAgents";
import type { ControlCenterAgent } from "@/lib/control-center/types";
import { useControlCenterStatus } from "./ControlCenterStatusProvider";

function iconForAgent(agent: ControlCenterAgent): AgentIconType {
  if (agent.name.toLowerCase().includes("fespa")) return "sail";
  if (agent.ui.state === "needs-check") return "warning";
  if (agent.ui.state === "missing") return "box";
  return "bot";
}

function deliveryLifecycleCard(agent: ControlCenterAgent): Pick<AgentCardModel, "lifecycleNote" | "lifecycleTone"> | null {
  if (agent.resultReadiness) {
    const run = agent.resultReadiness.run;
    return { lifecycleNote: run ? `Сборка ${run.id} · ${run.status.replaceAll("_", " ")}` : "Нет актуального результата delivery", lifecycleTone: "muted" };
  }
  const value = agent.lifecycle.delivery.status;
  if (value === "accepted") return { lifecycleNote: "Delivery accepted", lifecycleTone: "ok" };
  if (value === "awaiting_acceptance") return { lifecycleNote: "Awaiting user acceptance", lifecycleTone: "update" };
  if (value === "verified") return { lifecycleNote: "Outcome machine-verified", lifecycleTone: "ok" };
  if (["created", "preparing", "building", "verifying", "correcting", "running"].includes(value)) return { lifecycleNote: `Outcome delivery · ${value.replace(/_/g, " ")}`, lifecycleTone: "update" };
  if (value === "paused" || value === "blocked") return { lifecycleNote: `Outcome delivery ${value}`, lifecycleTone: "update" };
  if (["failed", "abandoned", "cancelled"].includes(value)) return { lifecycleNote: `Delivery ${value}`, lifecycleTone: "update" };
  if (agent.lifecycle.outcome.status === "approved" && agent.lifecycle.outcome.approved) return { lifecycleNote: "Outcome approved · delivery not started", lifecycleTone: "update" };
  if (agent.lifecycle.outcome.status === "draft") return { lifecycleNote: "Outcome Spec needs approval", lifecycleTone: "update" };
  if (agent.lifecycle.outcome.status === "missing") return { lifecycleNote: "Legacy agent · Outcome Spec missing", lifecycleTone: "muted" };
  return null;
}

function toCardAgent(agent: ControlCenterAgent): AgentCardModel {
  const delivery = deliveryLifecycleCard(agent);
  return {
    id: agent.id, name: agent.name, version: agent.version, versionStatus: agent.versionStatus, versionSource: agent.versionSource,
    description: agent.mission, state: agent.ui.state, activity: agent.ui.activity, url: agent.url.local, tailscaleUrl: agent.url.tailscale,
    agentKind: agent.agentKind, resultReadiness: agent.resultReadiness, runtimeReadiness: agent.readiness.runtime, healthStatus: agent.health.status,
    statusUrl: `/agents/${agent.id}`, updateStatus: agent.ui.updateStatus,
    issueText: agent.ui.issueText || (agent.versionStatus === "unavailable" ? "Assigned version unavailable" : undefined),
    lifecycleNote: delivery?.lifecycleNote || (agent.lifecycle.rollback.status === "ready" ? "Rollback snapshots available" : agent.lifecycle.snapshotPlan.status === "manual_only" ? "Snapshot draft available" : agent.lifecycle.snapshots.status === "unavailable" || agent.lifecycle.snapshots.count === 0 ? "No rollback snapshots" : undefined),
    lifecycleTone: delivery?.lifecycleTone || (agent.lifecycle.rollback.status === "ready" ? "ok" : "muted"),
    restorePlanStatus: agent.lifecycle.restorePlan.status === "ready" ? "ready" : agent.lifecycle.restorePlan.status === "planned" ? "planned" : "unavailable",
    rollbackStatus: agent.lifecycle.rollback.status === "ready" ? "ready" : agent.lifecycle.rollback.status === "planned" ? "planned" : "unavailable",
    credentials: { status: agent.credentials.status === "ready" || agent.credentials.status === "pending_auth" ? agent.credentials.status : "unavailable", required: agent.credentials.required, missingRequired: agent.credentials.missingRequired, total: agent.credentials.definitions.length },
    iconType: iconForAgent(agent), actionEnabled: agent.ui.actionEnabled, actionDisabledReason: agent.ui.actionDisabledReason, control: agent.control,
  };
}

export function VoiceStatusPage() { return <VoiceControlPage status={useControlCenterStatus().status} />; }
export function AgentsStatusPage() {
  const { status } = useControlCenterStatus();
  return <AgentsOperatorExperience status={status} agents={status.childAgents.map(toCardAgent)} />;
}
export function SettingsStatusPage() {
  const { status } = useControlCenterStatus();
  return <SettingsControlPage access={status.access} status={status} />;
}
