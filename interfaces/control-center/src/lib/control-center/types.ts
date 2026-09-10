import type { AgentKindView, OperationsApplicability } from "../../../../../scripts/agents-mother/agent-kind.mjs";
import type { ResultReadiness } from "../../../../../scripts/agents-mother/result-readiness.mjs";

export type CapabilityStatus =
  | "ready"
  | "disabled"
  | "manual_only"
  | "planned"
  | "not_installed"
  | "unavailable"
  | "pending_auth"
  | "failed";

export type ControlCenterCapabilities = {
  agents_registry: CapabilityStatus;
  sibling_scan: CapabilityStatus;
  operations_manifest: CapabilityStatus;
  start_stop: CapabilityStatus;
  restore: CapabilityStatus;
  snapshots: CapabilityStatus;
  rollback: CapabilityStatus;
  update_suggestions: CapabilityStatus;
  voice_realtime: CapabilityStatus;
  voice_tools: CapabilityStatus;
  codex_bridge: CapabilityStatus;
  codex_limits: CapabilityStatus;
  api_usage: CapabilityStatus;
  proactivity: CapabilityStatus;
  cron_adapter: CapabilityStatus;
  phone_access_lan: CapabilityStatus;
  phone_access_tailscale: CapabilityStatus;
  developer_diagnostics: CapabilityStatus;
};

export type ControlCenterOperatorAction = "start" | "stop" | "check" | "restore";

export type ControlCenterOperatorActionPlanStatus =
  | "ready"
  | "needs_confirmation"
  | "plan_only"
  | "blocked"
  | "unavailable"
  | "manual_only";

export type ControlCenterAgentRuntimeKind =
  | "web_service"
  | "scheduled_job"
  | "codex_project"
  | "cli_worker"
  | "interface_adapter"
  | "tool_server"
  | "external_service"
  | "scaffold"
  | "unknown";

export type ControlCenterActionExecutionMode = "executable" | "plan_only" | "manual_only" | "codex_plan" | "unavailable";

export type ControlCenterCardAction =
  | "start_plan"
  | "stop_plan"
  | "run_check"
  | "restore_plan"
  | "open_codex"
  | "run_now"
  | "pause_schedule"
  | "resume_schedule";

export type ControlCenterCommandReadiness = "missing" | "legacy_declared" | "human_instruction" | "structured_executable";

export type ControlCenterSecretProvider = "openai" | "telegram" | "anthropic" | "whatsapp" | "generic" | "codex_external";

export type ControlCenterSecretValidationMethod = "format" | "manual" | "none";

export type ControlCenterSecretBrowserExposure = "server_only" | "ephemeral_only" | "client_allowed" | "never";

export type ControlCenterSecretReadiness = "configured" | "missing" | "optional" | "unavailable";

export type ControlCenterSecretDefinition = {
  name: string;
  label: string;
  provider: ControlCenterSecretProvider;
  required: boolean;
  validation: ControlCenterSecretValidationMethod;
  storageTarget: string;
  browserExposure: ControlCenterSecretBrowserExposure;
  source: "operations_manifest" | "env_example" | "contract_inferred" | "default";
  status: ControlCenterSecretReadiness;
  configured: boolean;
  maskedValue?: string;
  lastUpdated?: string;
  canWrite: boolean;
  canRemove: boolean;
  note?: string;
};

export type ControlCenterAgentCredentials = {
  status: CapabilityStatus;
  required: number;
  configuredRequired: number;
  missingRequired: number;
  optional: number;
  configuredOptional: number;
  definitions: ControlCenterSecretDefinition[];
  storage: {
    status: CapabilityStatus;
    target: string;
    relativePath?: string;
    mode?: string;
    backupRelativePath?: string;
  };
  warnings: string[];
};

export type ControlCenterAgentControl = {
  runtimeKind: ControlCenterAgentRuntimeKind;
  ownership: "managed" | "adoptable" | "unmanaged" | "external" | "none";
  primaryCardAction: ControlCenterCardAction;
  planAction?: ControlCenterOperatorAction;
  executionMode: ControlCenterActionExecutionMode;
  label: string;
  reason: string;
  confirmationRequired?: boolean;
  commandReadiness: {
    start: ControlCenterCommandReadiness;
    stop: ControlCenterCommandReadiness;
  };
};

export type ControlCenterOperatorActionCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type ControlCenterAgentOperationalReadinessStatus =
  | "ready"
  | "local_ready"
  | "tailscale_pending"
  | "unmanaged_local"
  | "service_install_required"
  | "blocked"
  | "missing";

export type ControlCenterAgentRuntimeReadiness = {
  manager?: string;
  status: "ready" | "installable" | "service_install_required" | "unmanaged" | "not_applicable" | "unknown";
  serviceLabel?: string;
  launchAgentPath?: string;
  loaded?: boolean;
  installed?: boolean;
  detail: string;
};

export type ControlCenterAgentAccessReadiness = {
  localhost: "ready" | "pending" | "unavailable";
  tailscale: "ready" | "pending_serve" | "waiting_for_local" | "not_configured" | "unavailable";
  tailscaleUrl?: string;
  localUrl?: string;
  detail: string;
};

export type ControlCenterAgentOperationalReadiness = {
  status: ControlCenterAgentOperationalReadinessStatus;
  summary: string;
  runtime: ControlCenterAgentRuntimeReadiness;
  access: ControlCenterAgentAccessReadiness;
  checks: ControlCenterOperatorActionCheck[];
  blockers: string[];
  nextActions: string[];
};

export type ControlCenterAgent = {
  id: string;
  agentKind?: AgentKindView;
  resultReadiness?: ResultReadiness;
  identity?: { agentId: string | null; instanceKey: string; status: "identified" | "legacy" | "conflict"; diagnostics: string[]; routeAliases: string[] };
  name: string;
  mission: string;
  runtime: string;
  interface: string;
  deployment: string;
  proactivity: string;
  evidence: string;
  version: string;
  versionStatus: "ready" | "unavailable";
  versionSource?: string;
  folder: {
    status: "present" | "missing";
    name?: string;
    relativePath?: string;
  };
  operations: {
    status: CapabilityStatus;
    applicability?: OperationsApplicability;
    serviceMode?: string;
    autostart?: string;
    startAvailable: boolean;
    stopAvailable: boolean;
    localUrl?: string;
    healthcheckCommand?: string;
    issue?: string;
  };
  readiness: ControlCenterAgentOperationalReadiness;
  health: {
    status: "ok" | "failed" | "unknown" | "not_checked";
    checkedUrl?: string;
    detail?: string;
  };
  url: {
    status: "available" | "unavailable";
    local?: string;
    tailscale?: string;
    reason?: string;
  };
  ui: {
    state: "alive" | "missing" | "needs-check" | "unknown";
    activity: "active" | "inactive" | "unknown";
    primaryAction: "start" | "stop" | "restore" | "check";
    actionEnabled: boolean;
    actionDisabledReason: string;
    issueText?: string;
    updateStatus: "available" | "up-to-date" | "review-needed" | "none";
  };
  control: ControlCenterAgentControl;
  lifecycle: {
    profile: {
      status: CapabilityStatus;
      path?: string;
      reason?: string;
    };
    contract: {
      status: CapabilityStatus;
      path?: string;
      reason?: string;
    };
    outcome: {
      status: "missing" | "draft" | "approved" | "superseded" | "unknown";
      path?: string;
      approved: boolean;
      reason?: string;
    };
    delivery: {
      status:
        | "not_started"
        | "created"
        | "preparing"
        | "building"
        | "verifying"
        | "correcting"
        | "paused"
        | "running"
        | "blocked"
        | "verified"
        | "awaiting_acceptance"
        | "accepted"
        | "failed"
        | "abandoned"
        | "cancelled"
        | "unknown";
      path?: string;
      runId?: string;
      phase?: string;
      blockerCount?: number;
      budget?: import("./delivery-state").DeliveryBudgetView;
      updatedAt?: string;
      source?: "live-ledger" | "delivery-report";
      reason?: string;
    };
    reports: {
      status: CapabilityStatus;
      count: number;
      latest?: string;
      paths: string[];
    };
    snapshots: {
      status: CapabilityStatus;
      count: number;
      retention?: number;
      storePath?: string;
      latestId?: string;
      latestCreated?: string;
      reason?: string;
      items?: Array<{
        id: string;
        created?: string;
        path: string;
        schemaVersion?: string;
        restoreMode?: string;
      }>;
    };
    snapshotPlan: {
      status: CapabilityStatus;
      endpoint?: string;
      reason?: string;
    };
    snapshotValidation: {
      status: CapabilityStatus;
      endpoint?: string;
      valid?: boolean;
      issueCount?: number;
      checkedFiles?: number;
      reason?: string;
    };
    rollback: {
      status: CapabilityStatus;
      planAvailable: boolean;
      reason: string;
    };
    restorePlan: {
      status: CapabilityStatus;
      endpoint?: string;
      reason?: string;
    };
  };
  credentials: ControlCenterAgentCredentials;
};

export type ControlCenterOperatorActionPlan = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
    folderStatus: "present" | "missing";
  };
  action: ControlCenterOperatorAction;
  status: ControlCenterOperatorActionPlanStatus;
  actionEnabled: boolean;
  requiresConfirmation: boolean;
  confirmation?: {
    requiredPhrase: string;
    accepted: false;
  };
  target: {
    kind: "process" | "healthcheck" | "restore" | "none";
    commandAvailable: boolean;
    localUrl?: string;
    healthUrl?: string;
    willStartProcess: boolean;
    willStopProcess: boolean;
    willCreateFolder: boolean;
    willOverwriteExistingFolder: false;
  };
  control: ControlCenterAgentControl;
  checks: ControlCenterOperatorActionCheck[];
  steps: string[];
  blockers: string[];
  risks: string[];
  warnings: string[];
};

export type ControlCenterOperatorActionResult = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  action: ControlCenterOperatorAction;
  status: "passed" | "warnings" | "failed" | "blocked" | "pending_confirmation" | "executing" | "running" | "stopped" | "degraded";
  actionEnabled: false;
  audit: {
    path: string;
    entryId: string;
  };
  checks: ControlCenterOperatorActionCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
  warnings: string[];
  errors: string[];
  execution?: {
    status: "blocked" | "pending_confirmation" | "executing" | "running" | "stopped" | "failed" | "degraded";
    target: "process" | "healthcheck" | "restore" | "none";
    command?: string[];
    exitCode?: number | null;
    signal?: string | null;
    pid?: number;
    stdout?: string;
    stderr?: string;
    readiness?: {
      status: "ok" | "failed" | "unknown";
      detail: string;
      checkedUrl?: string;
    };
  };
};

export type ControlCenterFleetManualAuditResult = {
  ok: boolean;
  generatedAt: string;
  action: "fleet-manual-audit";
  status: "passed" | "warnings" | "failed";
  actionEnabled: false;
  audit: {
    path: string;
    entryIds: string[];
  };
  summary: {
    agents: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  results: ControlCenterOperatorActionResult[];
  warnings: string[];
  errors: string[];
};

export type ControlCenterAgentCredentialsResponse = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
    folderStatus: "present" | "missing";
  };
  credentials: ControlCenterAgentCredentials;
};

export type ControlCenterSecretMutationResult = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  secret: {
    name: string;
    status: ControlCenterSecretReadiness;
    configured: boolean;
    maskedValue?: string;
  };
  dryRun?: boolean;
  storage: ControlCenterAgentCredentials["storage"];
  warnings: string[];
};

export type ControlCenterSecretValidationResult = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  secret: {
    name: string;
    provider: ControlCenterSecretProvider;
    validation: ControlCenterSecretValidationMethod;
    status: "passed" | "warnings" | "failed";
    configured: boolean;
    maskedValue?: string;
  };
  checks: ControlCenterOperatorActionCheck[];
  warnings: string[];
};

export type ControlCenterOperatorActivityEntry = {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  action: ControlCenterOperatorAction | "fleet-manual-audit";
  result: "passed" | "warnings" | "failed" | "planned-only" | "blocked" | "pending_confirmation" | "executing" | "running" | "stopped" | "degraded";
  target: string;
  checks: {
    passed: number;
    warnings: number;
    failed: number;
  };
};

export type ControlCenterOperatorActivityResponse = {
  ok: boolean;
  generatedAt: string;
  status: CapabilityStatus;
  actionEnabled: false;
  logPath: string;
  entries: ControlCenterOperatorActivityEntry[];
  warnings: string[];
};

export type ControlCenterSnapshotPlan = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
    folderStatus: "present" | "missing";
  };
  status: CapabilityStatus;
  actionEnabled: false;
  requiresConfirmation: true;
  target: {
    snapshotId: string;
    storePath: string;
    metadataPath: string;
    willCreateStore: boolean;
    willOverwriteExistingSnapshot: false;
  };
  draft?: Record<string, unknown>;
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
  risks: string[];
  warnings: string[];
};

export type ControlCenterSnapshotValidation = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  status: CapabilityStatus;
  actionEnabled: false;
  valid: boolean;
  store: {
    path?: string;
    exists: boolean;
    fileCount: number;
  };
  files: Array<{
    path: string;
    status: "valid" | "invalid";
    snapshotId?: string;
    schemaVersion?: string;
    createdAt?: string;
    errors: string[];
    warnings: string[];
  }>;
  errors: string[];
  warnings: string[];
};

export type ControlCenterSnapshotCreateRequest = {
  dryRun?: boolean;
  snapshotId?: string;
  description?: string;
  confirmationPhrase?: string;
};

export type ControlCenterSnapshotCreateResult = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  action: "snapshot-create";
  mode: "dry-run" | "write";
  status: CapabilityStatus;
  actionEnabled: boolean;
  requiresConfirmation: true;
  confirmation: {
    requiredPhrase: string;
    accepted: boolean;
  };
  target: ControlCenterSnapshotPlan["target"];
  draft?: Record<string, unknown>;
  wrote?: {
    metadataPath: string;
    bytes: number;
  };
  checks: ControlCenterSnapshotPlan["checks"];
  errors: string[];
  warnings: string[];
};

export type ControlCenterSnapshotCompare = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  status: CapabilityStatus;
  actionEnabled: false;
  base?: {
    id: string;
    path: string;
  };
  target: {
    id: string;
    kind: "draft" | "snapshot";
    path?: string;
  };
  ignoredFields: string[];
  differences: Array<{
    path: string;
    type: "added" | "removed" | "changed";
    base?: unknown;
    target?: unknown;
  }>;
  summary: {
    changed: number;
    added: number;
    removed: number;
  };
  errors: string[];
  warnings: string[];
};

export type ControlCenterSnapshotRetentionRequest = {
  dryRun?: boolean;
  confirmationPhrase?: string;
};

export type ControlCenterSnapshotRetentionPlan = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  status: CapabilityStatus;
  actionEnabled: false;
  requiresConfirmation: true;
  confirmation: {
    requiredPhrase: string;
    accepted: boolean;
  };
  retention: {
    status: "not_configured" | "within_limit" | "over_limit";
    configured?: number;
    count: number;
    overflow: number;
    storePath?: string;
  };
  candidates: Array<{
    id: string;
    created?: string;
    path: string;
    restoreMode?: string;
    reason: string;
  }>;
  protected: Array<{
    id: string;
    path: string;
    reason: string;
  }>;
  warnings: string[];
  errors: string[];
};

export type ControlCenterSnapshotRetentionResult = ControlCenterSnapshotRetentionPlan & {
  action: "snapshot-retention";
  mode: "dry-run" | "write";
  pruned: Array<{
    id: string;
    path: string;
  }>;
};

export type ControlCenterSnapshotAuditEntry = {
  id: string;
  timestamp: string;
  actor: "pritha-control-center";
  agentId: string;
  agentName: string;
  action: "snapshot-create" | "snapshot-retention-prune";
  mode: "write" | "derived";
  result: "ok" | "failed" | "derived";
  target: string;
  source: "audit-log" | "snapshot-metadata";
  details?: Record<string, unknown>;
};

export type ControlCenterSnapshotAuditResponse = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  status: CapabilityStatus;
  actionEnabled: false;
  logPath: string;
  entries: ControlCenterSnapshotAuditEntry[];
  warnings: string[];
};

export type ControlCenterPreRestoreContract = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  status: CapabilityStatus;
  actionEnabled: false;
  restoreEnabled: false;
  selectedSnapshot?: {
    id: string;
    path: string;
    restoreMode?: string;
  };
  requirements: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
  confirmationGates: Array<{
    id: string;
    phrase: string;
    status: "future" | "required";
  }>;
  blockers: string[];
  warnings: string[];
};

export type ControlCenterRestorePlan = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
    folderStatus: "present" | "missing";
  };
  status: CapabilityStatus;
  actionEnabled: false;
  requiresConfirmation: true;
  target: {
    folderName: string;
    relativeToPritha: string;
    willCreateFolder: boolean;
    willOverwriteExistingFolder: false;
  };
  sources: {
    contract?: string;
    latestReports: string[];
    profile?: string;
  };
  selectedModules: string[];
  steps: string[];
  risks: string[];
  warnings: string[];
};

export type ControlCenterRollbackPlan = {
  ok: boolean;
  generatedAt: string;
  agent: {
    id: string;
    name: string;
  };
  status: CapabilityStatus;
  actionEnabled: false;
  requiresConfirmation: true;
  snapshots: ControlCenterAgent["lifecycle"]["snapshots"];
  reason: string;
};

export type ControlCenterStatus = {
  ok: boolean;
  generatedAt: string;
  root: string;
  registryPath?: string;
  app: {
    version: string;
    startedAt: string;
    uptimeSeconds: number;
  };
  selfTest: {
    status: "pass" | "fail" | "unknown";
    createdAt?: string;
    ageLabel: string;
    failed: number;
    memoryStats: {
      documents: number;
      chunks: number;
      entities?: number;
      relations?: number;
      embeddings?: number;
    };
    qualityGateStatus?: string;
    warnings?: Array<{
      id?: string;
      severity?: string;
      message: string;
    }>;
  };
  capabilities: ControlCenterCapabilities;
  pritha: {
    status: CapabilityStatus;
    summary: string;
  };
  counts: {
    registryAgents: number;
    childAgents: number;
    alive: number;
    missing: number;
    needsCheck: number;
    active: number;
  };
  access: {
    localhost: string;
    lan: CapabilityStatus;
    lanUrl?: string;
    lanReason?: string;
    lanBindHost?: string;
    tailscale: CapabilityStatus;
    tailscaleUrl?: string;
    tailscaleVoiceUrl?: string;
    tailscaleServeConfigured?: boolean;
    qr: CapabilityStatus;
  };
  proactivity: {
    status: CapabilityStatus;
    mode: "disabled" | "manual" | "planned";
    cronAdapter: CapabilityStatus;
    manualChecks: CapabilityStatus;
  };
  voice: {
    realtime: CapabilityStatus;
    tools: CapabilityStatus;
    codexBridge: CapabilityStatus;
  };
  childAgents: ControlCenterAgent[];
  allRegistryAgents: ControlCenterAgent[];
  latestReports: Array<{
    title: string;
    path: string;
    updated: string;
    type: string;
  }>;
  operatorActivity: ControlCenterOperatorActivityEntry[];
  warnings: string[];
};

export type ControlCenterDiagnostics = {
  status: ControlCenterStatus;
  modules: Array<{
    id: string;
    label: string;
    status: CapabilityStatus;
  }>;
  registry: Array<{
    id: string;
    agent: string;
    version: string;
    versionSource?: string;
    mission: string;
    interface: string;
    deployment: string;
    status: "alive" | "missing" | "unknown" | "needs_check";
    updated: string;
  }>;
  folders: Array<{
    path: string;
    status: "ok" | "not_found" | "manifest_issue" | "ignored";
    updated?: string;
  }>;
  logs: Array<{
    time: string;
    level: "INFO" | "WARN" | "ERROR";
    message: string;
  }>;
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
  reports: Array<{
    path: string;
    title: string;
    updated: string;
    type: "self_test" | "evolution" | "audit" | "recovery" | "registry";
  }>;
};
