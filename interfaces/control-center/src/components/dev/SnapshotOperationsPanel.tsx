"use client";

import { AlertTriangle, CheckCircle2, ClipboardList, FileJson, GitCompareArrows, LockKeyhole, RefreshCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ControlCenterAgent,
  ControlCenterPreRestoreContract,
  ControlCenterSnapshotAuditResponse,
  ControlCenterSnapshotCompare,
  ControlCenterSnapshotCreateResult,
  ControlCenterSnapshotPlan,
  ControlCenterSnapshotRetentionPlan,
  ControlCenterSnapshotRetentionResult,
  ControlCenterSnapshotValidation,
} from "@/lib/control-center/types";

type SnapshotListResponse = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  snapshots: ControlCenterAgent["lifecycle"]["snapshots"];
};

type SnapshotOperationsPanelProps = {
  agents: ControlCenterAgent[];
};

type LoadState = {
  plan?: ControlCenterSnapshotPlan;
  snapshots?: SnapshotListResponse;
  validation?: ControlCenterSnapshotValidation;
  compare?: ControlCenterSnapshotCompare;
  retention?: ControlCenterSnapshotRetentionPlan;
  audit?: ControlCenterSnapshotAuditResponse;
  preRestore?: ControlCenterPreRestoreContract;
  result?: ControlCenterSnapshotCreateResult;
  retentionResult?: ControlCenterSnapshotRetentionResult;
  loading: boolean;
  error?: string;
};

function initialAgentId(agents: ControlCenterAgent[]) {
  return agents.find((agent) => agent.lifecycle.snapshotPlan.status === "manual_only")?.id || agents[0]?.id || "";
}

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
    const message = json && typeof json === "object" && "errors" in json ? JSON.stringify((json as { errors?: unknown }).errors) : response.statusText;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return json;
}

function CheckIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 size={16} />;
  return <AlertTriangle size={16} />;
}

function statusText(status: string | undefined) {
  if (!status) return "Unknown";
  if (status === "manual_only") return "Manual only";
  if (status === "not_installed") return "Not installed";
  return status[0].toUpperCase() + status.slice(1);
}

function summaryCount(compare: ControlCenterSnapshotCompare | undefined) {
  if (!compare) return "No compare";
  return `${compare.summary.changed} changed / ${compare.summary.added} added / ${compare.summary.removed} removed`;
}

function retentionText(retention: ControlCenterSnapshotRetentionPlan | undefined) {
  if (!retention) return "No retention";
  if (retention.retention.status === "over_limit") return `${retention.retention.overflow} over limit`;
  if (retention.retention.status === "within_limit") return "Within limit";
  return "Not configured";
}

export function SnapshotOperationsPanel({ agents }: SnapshotOperationsPanelProps) {
  const [agentId, setAgentId] = useState(initialAgentId(agents));
  const [description, setDescription] = useState("");
  const [snapshotId, setSnapshotId] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [retentionPhrase, setRetentionPhrase] = useState("");
  const [state, setState] = useState<LoadState>({ loading: true });
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId), [agentId, agents]);
  const requiredPhrase = state.plan ? `CREATE SNAPSHOT ${state.plan.agent.id}` : selectedAgent ? `CREATE SNAPSHOT ${selectedAgent.id}` : "";
  const requiredRetentionPhrase = state.retention?.confirmation.requiredPhrase || (selectedAgent ? `PRUNE SNAPSHOTS ${selectedAgent.id}` : "");
  const canWrite = confirmationPhrase === requiredPhrase && state.plan?.status === "manual_only";
  const canPrune = retentionPhrase === requiredRetentionPhrase && Boolean(state.retention?.candidates.length);

  async function load(agent = agentId) {
    if (!agent) return;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const [plan, snapshots, validation, retention, audit, preRestore] = await Promise.all([
        fetchJson<ControlCenterSnapshotPlan>(`/api/agents/${agent}/snapshot-plan`),
        fetchJson<SnapshotListResponse>(`/api/agents/${agent}/snapshots`),
        fetchJson<ControlCenterSnapshotValidation>(`/api/agents/${agent}/snapshot-validation`),
        fetchJson<ControlCenterSnapshotRetentionPlan>(`/api/agents/${agent}/snapshot-retention`),
        fetchJson<ControlCenterSnapshotAuditResponse>(`/api/agents/${agent}/snapshot-audit`),
        fetchJson<ControlCenterPreRestoreContract>(`/api/agents/${agent}/pre-restore-contract`),
      ]);
      let compare: ControlCenterSnapshotCompare | undefined;
      try {
        compare = await fetchJson<ControlCenterSnapshotCompare>(`/api/agents/${agent}/snapshot-compare`);
      } catch {
        compare = undefined;
      }
      setState({ plan, snapshots, validation, compare, retention, audit, preRestore, loading: false });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Snapshot state unavailable" });
    }
  }

  async function runSnapshot(dryRun: boolean) {
    if (!agentId) return;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterSnapshotCreateResult>(`/api/agents/${agentId}/snapshot`, {
        method: "POST",
        body: JSON.stringify({
          dryRun,
          snapshotId: snapshotId.trim() || undefined,
          description: description.trim() || undefined,
          confirmationPhrase: confirmationPhrase.trim() || undefined,
        }),
      });
      await load(agentId);
      setState((current) => ({ ...current, result, loading: false }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Snapshot action failed" }));
    }
  }

  async function runRetention(dryRun: boolean) {
    if (!agentId) return;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterSnapshotRetentionResult>(`/api/agents/${agentId}/snapshot-retention`, {
        method: "POST",
        body: JSON.stringify({
          dryRun,
          confirmationPhrase: retentionPhrase.trim() || undefined,
        }),
      });
      await load(agentId);
      setState((current) => ({ ...current, retentionResult: result, loading: false }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Retention action failed" }));
    }
  }

  useEffect(() => {
    void load(agentId);
    setConfirmationPhrase("");
    setRetentionPhrase("");
  }, [agentId]);

  const snapshots = state.snapshots?.snapshots;
  const retention = snapshots?.retention;
  const snapshotCount = snapshots?.count || 0;
  const overRetention = typeof retention === "number" && snapshotCount > retention;

  return (
    <section className="dev-panel snapshot-ops-panel">
      <div className="panel-heading-row">
        <div>
          <h2>Snapshot Operations</h2>
          <p>Metadata-only snapshots, retention and restore gates. Rollback remains disabled.</p>
        </div>
        <button className="outline-button small" type="button" onClick={() => void load()} disabled={state.loading}>
          <RefreshCcw size={15} />
          Refresh
        </button>
      </div>

      <div className="snapshot-ops-grid">
        <div className="snapshot-control-card">
          <label className="snapshot-field">
            <span>Agent</span>
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              {agents.map((agent) => (
                <option value={agent.id} key={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <div className="snapshot-status-row">
            <span>
              <FileJson size={15} />
              Plan
            </span>
            <strong>{statusText(state.plan?.status)}</strong>
          </div>
          <div className="snapshot-status-row">
            <span>
              <ShieldCheck size={15} />
              Validation
            </span>
            <strong>{state.validation?.valid ? "Valid" : statusText(state.validation?.status)}</strong>
          </div>
          <div className="snapshot-status-row">
            <span>
              <GitCompareArrows size={15} />
              Compare
            </span>
            <strong>{summaryCount(state.compare)}</strong>
          </div>
          <div className="snapshot-status-row">
            <span>
              <Trash2 size={15} />
              Retention
            </span>
            <strong className={state.retention?.retention.status === "over_limit" ? "warn" : ""}>{retentionText(state.retention)}</strong>
          </div>
        </div>

        <div className="snapshot-control-card">
          <label className="snapshot-field">
            <span>Snapshot ID</span>
            <input value={snapshotId} onChange={(event) => setSnapshotId(event.target.value)} placeholder="optional-safe-id" />
          </label>
          <label className="snapshot-field">
            <span>Description</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Why this snapshot exists" />
          </label>
          <label className="snapshot-field">
            <span>Confirmation</span>
            <input value={confirmationPhrase} onChange={(event) => setConfirmationPhrase(event.target.value)} placeholder={requiredPhrase} />
          </label>
          <div className="snapshot-button-row">
            <button className="outline-button compact" type="button" onClick={() => void runSnapshot(true)} disabled={state.loading}>
              <FileJson size={16} />
              Dry-run
            </button>
            <button className="primary-danger-button compact" type="button" onClick={() => void runSnapshot(false)} disabled={!canWrite || state.loading}>
              <Save size={16} />
              Create Metadata
            </button>
          </div>
        </div>

        <div className="snapshot-control-card">
          <div className="snapshot-status-row">
            <span>
              <ClipboardList size={15} />
              Audit
            </span>
            <strong>{state.audit?.entries.length ? `${state.audit.entries.length} entries` : statusText(state.audit?.status)}</strong>
          </div>
          <div className="snapshot-status-row">
            <span>
              <LockKeyhole size={15} />
              Pre-restore
            </span>
            <strong>{state.preRestore?.blockers.length ? `${state.preRestore.blockers.length} blockers` : statusText(state.preRestore?.status)}</strong>
          </div>
          <label className="snapshot-field">
            <span>Retention Confirmation</span>
            <input value={retentionPhrase} onChange={(event) => setRetentionPhrase(event.target.value)} placeholder={requiredRetentionPhrase} />
          </label>
          <div className="snapshot-button-row">
            <button className="outline-button compact" type="button" onClick={() => void runRetention(true)} disabled={state.loading}>
              <Trash2 size={16} />
              Dry-run Prune
            </button>
            <button className="primary-danger-button compact" type="button" onClick={() => void runRetention(false)} disabled={!canPrune || state.loading}>
              <Trash2 size={16} />
              Prune Metadata
            </button>
          </div>
        </div>
      </div>

      {state.error ? <div className="snapshot-message error">{state.error}</div> : null}
      {state.result ? (
        <div className={`snapshot-message ${state.result.ok ? "ok" : "error"}`}>
          {state.result.mode === "write" && state.result.wrote
            ? `Wrote ${state.result.wrote.metadataPath}`
            : `${state.result.mode}: ${statusText(state.result.status)}`}
        </div>
      ) : null}
      {state.retentionResult ? (
        <div className={`snapshot-message ${state.retentionResult.ok ? "ok" : "error"}`}>
          {state.retentionResult.mode === "write"
            ? `Pruned ${state.retentionResult.pruned.length} metadata snapshots`
            : `${state.retentionResult.mode}: ${state.retentionResult.candidates.length} candidates`}
        </div>
      ) : null}

      <div className="snapshot-detail-grid">
        <div className="snapshot-detail-block">
          <h3>Preflight</h3>
          <div className="snapshot-check-list">
            {state.plan?.checks.map((check) => (
              <div className={`snapshot-check ${check.status}`} key={check.id}>
                <CheckIcon status={check.status} />
                <span>{check.label}</span>
                <small>{check.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="snapshot-detail-block">
          <h3>Snapshot List</h3>
          <div className="snapshot-retention-row">
            <span>{snapshotCount} snapshots</span>
            <strong className={overRetention ? "warn" : ""}>{retention ? `${retention} retention` : "No retention"}</strong>
          </div>
          <div className="snapshot-list">
            {snapshots?.items?.length ? (
              snapshots.items.map((item) => (
                <div className="snapshot-list-row" key={item.path}>
                  <FileJson size={15} />
                  <span>{item.id}</span>
                  <small>{item.created || "unknown date"}</small>
                </div>
              ))
            ) : (
              <div className="snapshot-empty">No snapshot metadata files yet.</div>
            )}
          </div>
        </div>

        <div className="snapshot-detail-block">
          <h3>Validation</h3>
          <div className="snapshot-list">
            {state.validation?.files.length ? (
              state.validation.files.map((file) => (
                <div className={`snapshot-list-row ${file.status}`} key={file.path}>
                  <FileJson size={15} />
                  <span>{file.snapshotId || file.path}</span>
                  <small>{file.status}</small>
                </div>
              ))
            ) : (
              <div className="snapshot-empty">{state.validation?.warnings[0] || "No validation data."}</div>
            )}
          </div>
        </div>

        <div className="snapshot-detail-block">
          <h3>Compare</h3>
          <div className="snapshot-list">
            {state.compare?.differences.length ? (
              state.compare.differences.slice(0, 8).map((diff) => (
                <div className={`snapshot-list-row ${diff.type}`} key={`${diff.type}-${diff.path}`}>
                  <GitCompareArrows size={15} />
                  <span>{diff.path}</span>
                  <small>{diff.type}</small>
                </div>
              ))
            ) : (
              <div className="snapshot-empty">{state.compare?.warnings[0] || state.compare?.errors[0] || "No compare base yet."}</div>
            )}
          </div>
        </div>

        <div className="snapshot-detail-block">
          <h3>Retention Plan</h3>
          <div className="snapshot-retention-row">
            <span>{state.retention?.candidates.length || 0} prune candidates</span>
            <strong className={state.retention?.retention.status === "over_limit" ? "warn" : ""}>
              {state.retention?.retention.configured !== undefined ? `${state.retention.retention.configured} retention` : "No retention"}
            </strong>
          </div>
          <div className="snapshot-list">
            {state.retention?.candidates.length ? (
              state.retention.candidates.map((candidate) => (
                <div className="snapshot-list-row removed" key={candidate.path}>
                  <Trash2 size={15} />
                  <span>{candidate.id}</span>
                  <small>{candidate.reason}</small>
                </div>
              ))
            ) : (
              <div className="snapshot-empty">{state.retention?.warnings[0] || "No retention pruning needed."}</div>
            )}
          </div>
        </div>

        <div className="snapshot-detail-block">
          <h3>Audit Trail</h3>
          <div className="snapshot-list">
            {state.audit?.entries.length ? (
              state.audit.entries.slice(0, 6).map((entry) => (
                <div className={`snapshot-list-row ${entry.result === "ok" ? "valid" : entry.result === "derived" ? "changed" : "invalid"}`} key={entry.id}>
                  <ClipboardList size={15} />
                  <span>{entry.action}</span>
                  <small>{entry.source === "audit-log" ? entry.timestamp : "derived"}</small>
                </div>
              ))
            ) : (
              <div className="snapshot-empty">{state.audit?.warnings[0] || "No audit entries yet."}</div>
            )}
          </div>
        </div>

        <div className="snapshot-detail-block">
          <h3>Pre-restore Contract</h3>
          <div className="snapshot-list">
            {state.preRestore?.requirements.length ? (
              state.preRestore.requirements.map((requirement) => (
                <div className={`snapshot-list-row ${requirement.status}`} key={requirement.id}>
                  <LockKeyhole size={15} />
                  <span>{requirement.label}</span>
                  <small>{requirement.detail}</small>
                </div>
              ))
            ) : (
              <div className="snapshot-empty">No pre-restore contract available.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
