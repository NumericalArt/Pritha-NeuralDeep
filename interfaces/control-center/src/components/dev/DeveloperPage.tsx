import {
  Box,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Database,
  FileText,
  Folder,
  Info,
  Link,
  Mic,
  Orbit,
  Play,
  ScrollText,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import type { CapabilityStatus, ControlCenterDiagnostics } from "@/lib/control-center/types";
import { SnapshotOperationsPanel } from "./SnapshotOperationsPanel";

type DeveloperPageProps = {
  data: ControlCenterDiagnostics;
};

type RegistryRow = ControlCenterDiagnostics["registry"][number];
type FolderScanRow = ControlCenterDiagnostics["folders"][number];

function moduleStatusLabel(status: CapabilityStatus) {
  if (status === "not_installed") return "Not installed";
  if (status === "manual_only") return "Manual only";
  if (status === "pending_auth") return "Needs setup";
  return status[0].toUpperCase() + status.slice(1);
}

function ModuleIcon({ id }: { id: string }) {
  const props = { size: 19 };
  if (id === "harness") return <ShieldCheck {...props} />;
  if (id === "memory") return <Database {...props} />;
  if (id === "tools") return <Wrench {...props} />;
  if (id === "interfaces") return <TerminalSquare {...props} />;
  if (id === "operations") return <Settings {...props} />;
  if (id === "voice") return <Mic {...props} />;
  if (id === "proactivity") return <Orbit {...props} />;
  return <Link {...props} />;
}

function StatusPill({ status }: { status: RegistryRow["status"] }) {
  const label = status === "needs_check" ? "Needs check" : status[0].toUpperCase() + status.slice(1);
  return <span className={`status-pill ${status}`}>{label}</span>;
}

function folderStatusLabel(status: FolderScanRow["status"]) {
  if (status === "ok") return "OK";
  if (status === "not_found") return "Not found";
  if (status === "manifest_issue") return "Manifest issue";
  return "Ignored";
}

function SystemReadinessPanel({ data }: DeveloperPageProps) {
  const selfTest = data.status.selfTest;
  return (
    <section className="dev-panel readiness-panel">
      <div className="panel-heading-row">
        <h2>System Readiness (modules)</h2>
        <div className="panel-actions">
          <span title={selfTest.createdAt}>Last self-test: {selfTest.ageLabel}</span>
          <button className="outline-button small" type="button" aria-disabled="true" title="Run from CLI: node scripts/self-test.mjs">
            CLI Self-test
          </button>
        </div>
      </div>
      <div className="module-row">
        {data.modules.map((module) => (
          <div className="module-item" key={module.id}>
            <span className="module-icon">
              <ModuleIcon id={module.id} />
            </span>
            <span>
              <strong>{module.label}</strong>
              <small className={`module-status ${module.status}`}>{moduleStatusLabel(module.status)}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RegistrySummaryPanel({ data }: DeveloperPageProps) {
  return (
    <section className="dev-panel registry-panel">
      <div className="panel-heading-row">
        <div>
          <h2>Registry Summary</h2>
          <p>Parsed from the current instance registry</p>
        </div>
        <button className="outline-button small" type="button">
          View Raw
        </button>
      </div>
      <div className="table-scroll">
        <table className="registry-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Version</th>
              <th>Mission</th>
              <th>Interface</th>
              <th>Deployment</th>
              <th>Status</th>
              <th>Updated</th>
              <th aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {data.registry.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className={`registry-dot ${row.status}`} />
                  {row.agent}
                </td>
                <td title={row.versionSource ? `Source: ${row.versionSource}` : "Assigned version unavailable"}>{row.version}</td>
                <td>{row.mission}</td>
                <td>{row.interface}</td>
                <td>{row.deployment}</td>
                <td>
                  <StatusPill status={row.status} />
                </td>
                <td>{row.updated}</td>
                <td>
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiscoveredFoldersPanel({ data }: DeveloperPageProps) {
  return (
    <section className="dev-panel folders-panel">
      <div className="panel-heading-row">
        <div>
          <h2>Discovered Sibling Folders</h2>
          <p>Scanned in workspace root</p>
        </div>
        <button className="outline-button small" type="button" disabled>
          Rescan
        </button>
      </div>
      <div className="folder-list">
        {data.folders.map((folder) => (
          <div className="folder-row" key={folder.path}>
            <Folder size={17} />
            <strong>{folder.path}</strong>
            <span className={`folder-status ${folder.status}`}>{folderStatusLabel(folder.status)}</span>
            <time>{folder.updated || "-"}</time>
          </div>
        ))}
      </div>
      <div className="scan-path">Scan path: /Users/&lt;user&gt;/Pritha</div>
    </section>
  );
}

function RecentLogsPanel({ data }: DeveloperPageProps) {
  return (
    <section className="dev-panel logs-panel">
      <div className="panel-heading-row">
        <h2>Recent Logs <span>(last 100 lines)</span></h2>
        <button className="outline-button small" type="button">
          View Full Logs
        </button>
      </div>
      <div className="log-box" role="log" aria-label="Recent system logs">
        {data.logs.map((line) => (
          <div className="log-line" key={`${line.time}-${line.message}`}>
            <span>[{line.time}]</span> <span className={`log-level ${line.level.toLowerCase()}`}>{line.level}</span> {line.message}
          </div>
        ))}
      </div>
      <div className="log-filters">
        <span className="filter-on">☑ INFO</span>
        <span className="filter-on warn">☑ WARN</span>
        <span className="filter-off">☐ ERROR</span>
      </div>
    </section>
  );
}

function WarningsPanel({ data }: DeveloperPageProps) {
  return (
    <section className="dev-panel warning-panel">
      <div className="panel-heading-row">
        <h2>Warnings & Notices</h2>
        <span>{data.warnings.length} items ⌄</span>
      </div>
      <div className="warning-list">
        {data.warnings.map((warning, index) => (
          <div className={`warning-row ${index === 0 ? "critical" : ""}`} key={warning}>
            {index === 0 ? <span>⚠</span> : <Info size={17} />}
            <span>{warning}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentCard({ data }: DeveloperPageProps) {
  const env = data.environment;
  return (
    <section className="side-card dev-side-card">
      <h2>
        <TerminalSquare size={17} />
        Environment
      </h2>
      <dl className="compact-dl">
        <div>
          <dt>Platform</dt>
          <dd>{env.platform}</dd>
        </div>
        <div>
          <dt>Node.js</dt>
          <dd>{env.node}</dd>
        </div>
        <div>
          <dt>App Port</dt>
          <dd>{env.appPort}</dd>
        </div>
        <div>
          <dt>Data Path</dt>
          <dd>{env.dataPath}</dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{env.timezone}</dd>
        </div>
        <div>
          <dt>Git (Pritha)</dt>
          <dd>{env.git}</dd>
        </div>
      </dl>
      <button className="outline-button full" type="button">
        <Copy size={16} />
        Copy Info
      </button>
    </section>
  );
}

function VoiceDiagnosticsCard({ data }: DeveloperPageProps) {
  const voice = data.voiceDiagnostics;
  const connectionLabel = voice.connection === "good" ? "Good" : voice.connection === "degraded" ? "Degraded" : voice.connection === "bad" ? "Bad" : "Unknown";
  return (
    <section className="side-card dev-side-card">
      <div className="card-title-row">
        <h2>
          <Mic size={17} />
          Voice Diagnostics
        </h2>
        <button className="chip-button" type="button">
          Details
        </button>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Realtime Connection</dt>
          <dd className={voice.connection === "good" ? "good" : ""}>{connectionLabel}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{voice.model}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{voice.latencyMs} ms</dd>
        </div>
        <div>
          <dt>Turn Detection</dt>
          <dd>{voice.turnDetection}</dd>
        </div>
        <div>
          <dt>Last Session</dt>
          <dd>{voice.lastSession}</dd>
        </div>
      </dl>
    </section>
  );
}

function MemoryIndexCard({ data }: DeveloperPageProps) {
  const memory = data.memoryIndex;
  const statusLabel = memory.status === "up_to_date" ? "Up to date" : memory.status[0].toUpperCase() + memory.status.slice(1).replace(/_/g, " ");
  return (
    <section className="side-card dev-side-card">
      <div className="card-title-row">
        <h2>
          <Database size={17} />
          Memory Index
        </h2>
        <button className="chip-button" type="button">
          Details
        </button>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Status</dt>
          <dd className={memory.status === "up_to_date" ? "good" : ""}>{statusLabel}</dd>
        </div>
        <div>
          <dt>Documents</dt>
          <dd>{memory.documents.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Chunks</dt>
          <dd>{memory.chunks.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Last Updated</dt>
          <dd>{memory.lastUpdated}</dd>
        </div>
      </dl>
    </section>
  );
}

function LatestReportsCard({ data }: DeveloperPageProps) {
  return (
    <section className="side-card dev-side-card latest-reports-card" id="latest-reports">
      <div className="card-title-row">
        <h2>
          <ScrollText size={17} />
          Latest Reports
        </h2>
        <button className="chip-button" type="button" aria-disabled="true">
          Open Folder
        </button>
      </div>
      <div className="reports-list">
        {data.reports.map((report) => (
          <div className="report-row" key={report.path}>
            <FileText size={15} />
            <span>{report.title}</span>
            <time>{report.updated}</time>
            <ChevronRight size={15} />
          </div>
        ))}
      </div>
      <button className="view-all-link" type="button">
        View All Reports →
      </button>
    </section>
  );
}

export function DeveloperPage({ data }: DeveloperPageProps) {
  return (
    <>
      <div className="dev-desktop-content">
        <PageHeader title="Developer (Read-only)" subtitle="Diagnostics and internal state for advanced users." variant="dev" showCodexButton status={data.status} />
        <div className="dev-layout">
          <main className="dev-main">
            <SystemReadinessPanel data={data} />
            <RegistrySummaryPanel data={data} />
            <SnapshotOperationsPanel agents={data.status.childAgents} />
            <div className="dev-two-columns">
              <DiscoveredFoldersPanel data={data} />
              <RecentLogsPanel data={data} />
            </div>
            <WarningsPanel data={data} />
          </main>
          <aside className="dev-rail">
            <EnvironmentCard data={data} />
            <VoiceDiagnosticsCard data={data} />
            <MemoryIndexCard data={data} />
            <LatestReportsCard data={data} />
          </aside>
        </div>
      </div>
      <div className="mobile-dev-screen">
        <h1 className="mobile-page-title">Developer</h1>
        <SystemReadinessPanel data={data} />
        <RegistrySummaryPanel data={data} />
        <SnapshotOperationsPanel agents={data.status.childAgents} />
        <DiscoveredFoldersPanel data={data} />
        <RecentLogsPanel data={data} />
        <WarningsPanel data={data} />
        <EnvironmentCard data={data} />
        <VoiceDiagnosticsCard data={data} />
        <MemoryIndexCard data={data} />
        <LatestReportsCard data={data} />
      </div>
    </>
  );
}
