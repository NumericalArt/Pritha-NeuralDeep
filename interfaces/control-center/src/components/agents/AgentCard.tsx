import { CheckCircle2, ClipboardCheck, Copy, ExternalLink, HelpCircle, KeyRound, Play, RefreshCcw, RotateCcw, Square } from "lucide-react";
import { useState } from "react";
import type { AgentCardModel } from "@/data/mockAgents";
import { type AccessMode, accessBaseUrl, agentUrlForAccessMode } from "@/lib/access-mode";
import { getCardAction, getCardActionLabel, getCardActionTone } from "@/data/mockAgents";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { ControlCenterStatus } from "@/lib/control-center/types";
import { AgentIcon } from "./AgentIcon";
import { AgentResultReadiness } from "./AgentResultReadiness";

function stateLabel(agent: AgentCardModel) {
  if (agent.resultReadiness && agent.state !== "missing") return "Проект найден";
  if (agent.state === "alive") return "Alive";
  if (agent.state === "missing") return "Missing";
  if (agent.state === "needs-check") return "Needs check";
  return "Unknown";
}

function activityLabel(agent: AgentCardModel) {
  if (agent.runtimeReadiness?.status === "not_applicable") return "По запросу";
  if (agent.resultReadiness) return agent.healthStatus === "ok" ? "Health OK" : agent.healthStatus === "failed" ? "Нет ответа" : "Процесс не проверен";
  if (agent.activity === "active") return "Active";
  if (agent.activity === "inactive") return "Inactive";
  return "Unknown";
}

function footer(agent: AgentCardModel) {
  if (agent.restorePlanStatus === "ready") {
    return (
      <div className="agent-footer update">
        <RefreshCcw size={15} />
        Restore plan available
      </div>
    );
  }
  if (agent.updateStatus === "available") {
    return (
      <div className="agent-footer update">
        <span aria-hidden="true">↑</span>
        Update available
      </div>
    );
  }
  if (agent.updateStatus === "up-to-date") {
    return (
      <div className="agent-footer ok">
        <CheckCircle2 size={15} />
        Up to date
      </div>
    );
  }
  if (agent.issueText) {
    return (
      <div className="agent-footer muted">
        {agent.issueText}
        <HelpCircle size={16} />
      </div>
    );
  }
  if (agent.lifecycleNote) {
    return (
      <div className={`agent-footer ${agent.lifecycleTone || "muted"}`}>
        {agent.lifecycleTone === "ok" ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
        {agent.lifecycleNote}
      </div>
    );
  }
  return null;
}

function credentialLabel(agent: AgentCardModel) {
  if (!agent.credentials || !agent.credentials.total) return "No definitions";
  if (agent.credentials.status === "ready") return "Ready";
  if (agent.credentials.missingRequired) return `${agent.credentials.missingRequired} missing`;
  return "Unavailable";
}

function statusUrlForAccessMode(path: string | undefined, access: ControlCenterStatus["access"] | undefined, mode: AccessMode | undefined) {
  if (!path) return undefined;
  if (!access || !mode) return path;
  const baseUrl = accessBaseUrl(access, mode);
  if (!baseUrl) return path;
  try {
    return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString().replace(/\/$/, "");
  } catch {
    return path;
  }
}

export function AgentCard({
  agent,
  access,
  accessMode,
  mobile = false,
  onAction,
  onCredentials,
}: {
  agent: AgentCardModel;
  access?: ControlCenterStatus["access"];
  accessMode?: AccessMode;
  mobile?: boolean;
  onAction?: (agent: AgentCardModel) => void;
  onCredentials?: (agent: AgentCardModel) => void;
}) {
  const [copied, setCopied] = useState(false);
  const cardAction = getCardAction(agent);
  const actionTone = getCardActionTone(agent);
  const actionLabel = getCardActionLabel(agent);
  const directUrl = access && accessMode ? agentUrlForAccessMode(agent.url, access, accessMode, agent.tailscaleUrl) : agent.url;
  const fallbackStatusUrl = statusUrlForAccessMode(agent.statusUrl, access, accessMode);
  const useDirectUrl = agent.activity === "active" && Boolean(directUrl);
  const displayUrl = useDirectUrl ? directUrl : fallbackStatusUrl || directUrl;
  const displayUrlLabel = useDirectUrl ? displayUrl?.replace("http://", mobile ? "" : "http://") : "Status page";
  const canShowUrl = agent.state === "alive" && Boolean(displayUrl);
  const canOpenPlan = Boolean(onAction);
  const canOpenCredentials = Boolean(onCredentials && agent.credentials?.total);

  async function copyUrl() {
    if (!displayUrl) return;
    const ok = await copyTextToClipboard(displayUrl);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className={`${mobile ? "mobile-agent-card" : "agent-card"}`} data-state={agent.state}>
      {mobile ? (
        <div className="mobile-agent-topline">
          <span className={`state-label ${agent.state}`}>
            <span className={`dot ${agent.state === "alive" ? "green" : agent.state === "missing" ? "red" : "orange"}`} />
            {stateLabel(agent)}
          </span>
        </div>
      ) : (
        <span className={`agent-corner-dot ${agent.state}`} />
      )}

      <div className={mobile ? "mobile-agent-body" : "agent-top"}>
        <AgentIcon type={agent.iconType} />
        <div className="agent-copy">
          <div className="agent-title-row">
            <h2>{agent.name}</h2>
            <span className="version-pill" title={agent.versionSource ? `Version source: ${agent.versionSource}` : "Assigned version unavailable"}>
              {agent.version}
            </span>
          </div>
          <p>{agent.description}</p>
          {mobile ? (
            <span className={`activity-label ${agent.activity}`}>
              <span className={`dot ${agent.activity === "active" ? "green" : ""}`} />
              {activityLabel(agent)}
            </span>
          ) : null}
        </div>
      </div>

      {!mobile ? (
        <div className="agent-state-row">
          <span className={`state-label ${agent.state}`}>
            <span className={`dot ${agent.state === "alive" ? "green" : agent.state === "missing" ? "red" : "orange"}`} />
            {stateLabel(agent)}
          </span>
          <span className={`activity-label ${agent.activity}`}>
            <span className={`dot ${agent.activity === "active" ? "green" : ""}`} />
            {activityLabel(agent)}
          </span>
        </div>
      ) : null}

      <AgentResultReadiness agent={agent} />

      {agent.credentials?.total ? (
        <button
          className={`agent-credentials-button ${agent.credentials.status === "ready" ? "ready" : agent.credentials.missingRequired ? "missing" : "unavailable"}`}
          type="button"
          data-testid="agent-credentials-button"
          data-agent-id={agent.id}
          onClick={
            canOpenCredentials
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCredentials?.(agent);
                }
              : undefined
          }
          disabled={!canOpenCredentials}
          title={`Configure credentials for ${agent.name}`}
        >
          <KeyRound size={16} />
          <span>Credentials</span>
          <strong>{credentialLabel(agent)}</strong>
        </button>
      ) : null}

      <button
        className={`${mobile ? "mobile-agent-action" : "agent-action"} ${actionTone}`}
        type="button"
        disabled={!canOpenPlan && agent.actionEnabled === false}
        title={canOpenPlan ? `Open ${actionLabel} for ${agent.name}` : agent.actionEnabled === false ? agent.actionDisabledReason : undefined}
        onClick={canOpenPlan ? () => onAction?.(agent) : undefined}
      >
        {cardAction === "start_plan" || cardAction === "run_now" || cardAction === "resume_schedule" ? <Play size={18} fill="currentColor" /> : null}
        {cardAction === "stop_plan" || cardAction === "pause_schedule" ? <Square size={15} fill="currentColor" /> : null}
        {cardAction === "restore_plan" ? <RefreshCcw size={17} /> : null}
        {cardAction === "run_check" ? <ClipboardCheck size={17} /> : null}
        {cardAction === "open_codex" ? <ExternalLink size={17} /> : null}
        {actionLabel}
      </button>

      {canShowUrl ? (
        <div className={mobile ? "mobile-agent-url-row" : "agent-url-row"}>
          <span>{displayUrlLabel}</span>
          <a
            className="icon-button"
            href={displayUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open URL for ${agent.name}`}
            data-testid="agent-url-link"
            data-agent-id={agent.id}
            data-url={displayUrl}
          >
            <ExternalLink size={17} />
          </a>
          <button className="icon-button" type="button" aria-label={`Copy URL for ${agent.name}`} title={copied ? "Copied" : "Copy URL"} onClick={() => void copyUrl()}>
            <Copy size={17} />
          </button>
        </div>
      ) : null}

      {footer(agent)}
    </article>
  );
}
