export type VoiceState = "idle" | "connecting" | "listening" | "muted" | "working" | "decision_required" | "error";

export type VoiceTask = {
  id: string;
  title: string;
  target: "Codex" | "Pritha" | "Child Agent";
  status: "queued" | "working" | "decision_required" | "done" | "failed";
  progress?: number;
  summary?: string;
};

export type VoiceDecision = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "approved" | "declined";
};

export type VoiceContext = {
  memoryFocus: string;
  description: string;
  activeTools: string[];
};

export type VoiceConnection = {
  realtime: "connected" | "connecting" | "disconnected" | "failed";
  server: "local" | "lan" | "tailscale" | "unavailable";
  latencyMs?: number;
  quality: "good" | "degraded" | "bad" | "unknown";
};

export type VoiceMockState = {
  state: VoiceState;
  model: string;
  elapsedSec: number;
  context: VoiceContext;
  task: VoiceTask;
  decision: VoiceDecision;
  connection: VoiceConnection;
};

export const voiceMock: VoiceMockState = {
  state: "idle",
  model: "Realtime backend not installed",
  elapsedSec: 0,
  context: {
    memoryFocus: "General (Global)",
    description: "Voice tools are planned. No realtime session is active.",
    activeTools: [],
  },
  task: {
    id: "task-none",
    title: "No active task",
    target: "Codex",
    status: "done",
    progress: 0,
    summary: "Codex task bridge is planned for a later milestone.",
  },
  decision: {
    id: "decision-none",
    title: "No approval needed",
    description: "No pending decision",
    severity: "low",
    status: "declined",
  },
  connection: {
    realtime: "disconnected",
    server: "unavailable",
    quality: "unknown",
  },
};

export type DevCapabilityStatus = "ready" | "not_installed" | "none" | "failed" | "unknown";

export type DevModule = {
  id: string;
  label: string;
  status: DevCapabilityStatus;
};

export type RegistryRow = {
  id: string;
  agent: string;
  version: string;
  mission: string;
  interface: string;
  deployment: string;
  status: "alive" | "missing" | "unknown" | "needs_check";
  updated: string;
};

export type FolderScanRow = {
  path: string;
  status: "ok" | "not_found" | "manifest_issue" | "ignored";
  updated?: string;
};

export type LogLine = {
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
};

export type LatestReport = {
  path: string;
  title: string;
  updated: string;
  type: "self_test" | "evolution" | "audit" | "recovery" | "registry";
};

export type DevPageState = {
  modules: DevModule[];
  registry: RegistryRow[];
  folders: FolderScanRow[];
  logs: LogLine[];
  warnings: string[];
  environment: {
    platform: string;
    node: string;
    appPort: number;
    dataPath: string;
    timezone: string;
    git: string;
  };
  voiceDiagnostics: {
    connection: "good" | "degraded" | "bad" | "unknown";
    model: string;
    latencyMs?: number;
    turnDetection: string;
    lastSession: string;
  };
  memoryIndex: {
    status: "up_to_date" | "stale" | "failed" | "unknown";
    documents: number;
    chunks: number;
    lastUpdated: string;
  };
  reports: LatestReport[];
};

export const devMock: DevPageState = {
  modules: [
    { id: "harness", label: "Harness", status: "ready" },
    { id: "memory", label: "Memory", status: "ready" },
    { id: "tools", label: "Tools", status: "ready" },
    { id: "interfaces", label: "Interfaces", status: "ready" },
    { id: "operations", label: "Operations", status: "ready" },
    { id: "voice", label: "Voice", status: "ready" },
    { id: "proactivity", label: "Proactivity", status: "not_installed" },
    { id: "connectors", label: "Connectors", status: "none" },
  ],
  registry: [
    {
      id: "funny-teacher",
      agent: "Funny Teacher",
      version: "v1.3",
      mission: "Voice learning agent for kids and parents",
      interface: "Voice + Web",
      deployment: "Local (3001)",
      status: "alive",
      updated: "2h ago",
    },
    {
      id: "fespa26",
      agent: "FESPA26",
      version: "v1.1",
      mission: "Event & media processing workbench",
      interface: "Web",
      deployment: "Local (3002)",
      status: "alive",
      updated: "5h ago",
    },
    {
      id: "research-helper",
      agent: "Research Helper",
      version: "v0.9.4",
      mission: "Academic research assistant",
      interface: "Web",
      deployment: "Local (3003)",
      status: "alive",
      updated: "3h ago",
    },
    {
      id: "market-scout",
      agent: "Market Scout",
      version: "v0.8.0",
      mission: "Market analysis and monitoring",
      interface: "Web",
      deployment: "-",
      status: "missing",
      updated: "1d ago",
    },
    {
      id: "code-auditor",
      agent: "Code Auditor",
      version: "v1.0.0",
      mission: "Security and code quality audit",
      interface: "CLI",
      deployment: "-",
      status: "unknown",
      updated: "8h ago",
    },
  ],
  folders: [
    { path: "funny-teacher/", status: "ok", updated: "Mar 26, 10:12" },
    { path: "fespa26/", status: "ok", updated: "Mar 26, 10:11" },
    { path: "research-helper/", status: "ok", updated: "Mar 26, 10:11" },
    { path: "market-scout/", status: "not_found" },
    { path: "code-auditor/", status: "manifest_issue", updated: "Mar 26, 09:58" },
    { path: "archive/ (ignored)", status: "ignored" },
  ],
  logs: [
    { time: "10:21:08", level: "INFO", message: "Voice server: connected (codec: opus, 24kHz)" },
    { time: "10:21:10", level: "INFO", message: "Memory index: loaded (12345 entries)" },
    { time: "10:21:12", level: "INFO", message: "Registry: parsed 5 agents" },
    { time: "10:21:13", level: "INFO", message: "Sibling scan: 5 found, 1 missing" },
    { time: "10:21:15", level: "WARN", message: "Code Auditor: manifest missing \"start\"" },
    { time: "10:21:16", level: "INFO", message: "Healthcheck Funny Teacher: http://localhost:3021 OK" },
    { time: "10:21:17", level: "INFO", message: "Healthcheck FESPA26: http://localhost:3022 OK" },
    { time: "10:21:18", level: "INFO", message: "Healthcheck Research Helper: http://localhost:3023 OK" },
    { time: "10:21:20", level: "INFO", message: "Self-test: all core modules healthy" },
  ],
  warnings: [
    "Code Auditor: operations/manifest.json is missing required fields (start).",
    "Proactivity module is not installed. Scheduled jobs are disabled.",
  ],
  environment: {
    platform: "macOS 14.4 (arm64)",
    node: "v20.11.1",
    appPort: 3420,
    dataPath: ".pritha/data",
    timezone: "Europe/Moscow",
    git: "main (a1b2c3d)",
  },
  voiceDiagnostics: {
    connection: "good",
    model: "gpt-4o-realtime-preview",
    latencyMs: 28,
    turnDetection: "Server VAD",
    lastSession: "Today, 10:19",
  },
  memoryIndex: {
    status: "up_to_date",
    documents: 1234,
    chunks: 12345,
    lastUpdated: "2h ago",
  },
  reports: [
    { path: "11_agents/reports/self-test-2025-03-26-10-19.md", title: "self-test-2025-03-26-10-19.md", updated: "2h ago", type: "self_test" },
    { path: "11_agents/reports/evolution-funny-teacher-v1.3.md", title: "evolution-funny-teacher-v1.3.md", updated: "3h ago", type: "evolution" },
    { path: "11_agents/reports/audit-research-helper-2025-03-26.md", title: "audit-research-helper-2025-03-26.md", updated: "5h ago", type: "audit" },
    { path: "11_agents/reports/recovery-fespa26-v1.1.md", title: "recovery-fespa26-v1.1.md", updated: "1d ago", type: "recovery" },
    { path: "11_agents/reports/registry-snapshot-2025-03-26.md", title: "registry-snapshot-2025-03-26.md", updated: "1d ago", type: "registry" },
  ],
};
