import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { controlCenterStatusForClient, getControlCenterStatus } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

function statusText(value: string | undefined) {
  if (!value) return "unknown";
  return value.replace(/_/g, " ");
}

export default async function AgentStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = await getControlCenterStatus();
  const agent = status.childAgents.find((item) => item.id === id);
  if (!agent) notFound();

  const clientStatus = controlCenterStatusForClient(status);
  const directUrl = agent.url.tailscale || agent.url.local;
  const canOpenDirect = agent.ui.activity === "active" && Boolean(directUrl);
  const deliveryDetail = agent.lifecycle.delivery.runId
    ? `run ${agent.lifecycle.delivery.runId}${agent.lifecycle.delivery.phase ? ` · ${agent.lifecycle.delivery.phase}` : ""}`
    : agent.lifecycle.delivery.path || agent.lifecycle.delivery.reason || "not started";
  const readinessRows = [
    ["Folder", agent.folder.status, agent.folder.relativePath || agent.folder.name || "not available"],
    ["Outcome Spec", agent.lifecycle.outcome.status, agent.lifecycle.outcome.path || agent.lifecycle.outcome.reason || "not available"],
    ["Outcome delivery", agent.lifecycle.delivery.status, deliveryDetail],
    ["Health", agent.health.status, agent.health.checkedUrl || agent.health.detail || "not checked"],
    ["Readiness", agent.readiness.status, agent.readiness.summary],
    ["Runtime service", agent.readiness.runtime.status, agent.readiness.runtime.detail],
    ["Access", agent.readiness.access.tailscale, agent.readiness.access.detail],
    ["Runtime", agent.control.executionMode, agent.control.reason],
    ["Operations", agent.operations.status, agent.operations.localUrl || agent.operations.issue || "manifest not available"],
  ];

  return (
    <div className="agent-status-page">
      <PageHeader
        title={agent.name}
        subtitle="Child agent status"
        variant="agents"
        status={clientStatus}
        showCountPill={false}
      />
      <section className="agent-status-hero">
        <div>
          <span className={`status-pill ${agent.ui.activity === "active" ? "alive" : "unknown"}`}>
            {statusText(agent.ui.activity)}
          </span>
          <h1>{agent.name}</h1>
          <p>{agent.mission}</p>
        </div>
        {canOpenDirect ? (
          <a className="agent-status-primary-link" href={directUrl} target="_blank" rel="noreferrer">
            Open Runtime
          </a>
        ) : null}
      </section>
      <section className="agent-status-grid" aria-label="Agent readiness">
        {readinessRows.map(([label, value, detail]) => (
          <div className="agent-status-tile" key={label}>
            <span>{label}</span>
            <strong>{statusText(value)}</strong>
            <p>{detail}</p>
          </div>
        ))}
      </section>
      <section className="agent-status-note">
        <h2>{canOpenDirect ? "Runtime available" : "Runtime not open"}</h2>
        <p>
          {canOpenDirect
            ? "The agent has an active local runtime. Use the runtime link for the agent surface, or return to Child Agents for Start/Stop controls."
            : "The agent has a Control Center record, but its runtime is not currently answering as an active service. Use Child Agents to run Start, Check, or remediation before opening the runtime URL."}
        </p>
      </section>
    </div>
  );
}
