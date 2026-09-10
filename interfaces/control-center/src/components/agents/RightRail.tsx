"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, RefreshCcw, Search, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlCenterFleetManualAuditResult, ControlCenterOperatorActivityEntry, ControlCenterStatus } from "@/lib/control-center/types";
import { PrithaStarScene } from "@/components/voice/PrithaStarScene";

export function AgentsRightRail({
  status,
  onManualAudit,
  manualAuditRunning = false,
  manualAuditResult,
  manualAuditError,
}: {
  status: ControlCenterStatus;
  onManualAudit?: () => void;
  manualAuditRunning?: boolean;
  manualAuditResult?: ControlCenterFleetManualAuditResult;
  manualAuditError?: string;
}) {
  const ready = status.pritha.status === "ready";
  const latestReports = status.latestReports.slice(0, 3);
  const activity = status.operatorActivity.slice(0, 4);

  return (
    <aside className="right-rail">
      <section className="side-card pritha-status-card">
        <h2>Pritha Status</h2>
        <div className="status-star-shell" aria-hidden="true">
          <PrithaStarScene phase={ready ? "idle" : "error"} />
        </div>
        <div className="ready-line">
          <span className={`dot ${ready ? "green" : "orange"}`} />
          {ready ? "Ready" : "Needs setup"}
        </div>
        <p>{status.pritha.summary}</p>
        <Link className="rail-button" href="/dev">Open Diagnostics</Link>
      </section>

      <section className="side-card">
        <h2>Recent Activity</h2>
        <div className="activity-list">
          {activity.length ? (
            activity.map((entry) => <OperatorActivity entry={entry} key={entry.id} />)
          ) : (
            <Activity
              icon={<ShieldCheck size={18} />}
              title="Read-only scan"
              subtitle={`${status.counts.alive} alive · ${status.counts.missing} missing`}
              time="now"
              tone={status.warnings.length ? "orange" : "green"}
            />
          )}
          {activity.length < 2
            ? latestReports.slice(0, 2 - activity.length).map((report) => (
                <Activity icon={<span>◇</span>} title="Report indexed" subtitle={report.title} time="recent" tone="purple" key={report.path} />
              ))
            : null}
        </div>
        <Link className="rail-button" href="/dev">View All Reports</Link>
      </section>

      <section className="side-card">
        <h2>Quick Actions</h2>
        {manualAuditResult ? (
          <div className={`rail-result ${manualAuditResult.status}`}>
            {manualAuditResult.status}: {manualAuditResult.summary.passed} passed · {manualAuditResult.summary.warnings} warnings · {manualAuditResult.summary.failed} failed
          </div>
        ) : null}
        {manualAuditError ? <div className="rail-result failed">{manualAuditError}</div> : null}
        <div className="rail-actions">
          <button type="button" onClick={onManualAudit} disabled={!onManualAudit || manualAuditRunning} title="Run manual checks for all child agents">
            <Search size={17} />
            {manualAuditRunning ? "Running Audit" : "Run Manual Audit"}
          </button>
          <button type="button" disabled title="Update suggestion backend is planned"><RefreshCcw size={17} />Check for Updates</button>
        </div>
      </section>
    </aside>
  );
}

function OperatorActivity({ entry }: { entry: ControlCenterOperatorActivityEntry }) {
  const tone = entry.result === "passed" ? "green" : entry.result === "warnings" ? "orange" : "orange";
  const title = entry.action === "check" ? "Manual check" : entry.action === "fleet-manual-audit" ? "Manual audit" : `${entry.action} action`;
  const subtitle = `${entry.agentName}: ${entry.checks.passed} pass · ${entry.checks.warnings} warn · ${entry.checks.failed} fail`;

  return (
    <Activity
      icon={entry.result === "passed" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      title={title}
      subtitle={subtitle}
      time={relativeTime(entry.timestamp)}
      tone={tone}
    />
  );
}

function relativeTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "recent";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function Activity({
  icon,
  title,
  subtitle,
  time,
  tone,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  time: string;
  tone: "green" | "orange" | "purple";
}) {
  return (
    <div className="activity-item">
      <span className={`activity-icon ${tone}`}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <time>{time}</time>
    </div>
  );
}
