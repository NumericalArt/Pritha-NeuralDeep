import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  isPrithaCodeCheckout,
  resolvePrithaAgentMemoryRoot,
  resolvePrithaAgentParent,
  resolvePrithaStatePath,
  resolvePrithaStateRoot,
  resolveTechscopeRoot,
} from "../pritha-paths";
import type {
  CapabilityStatus,
  ControlCenterAgentCredentials,
  ControlCenterAgentCredentialsResponse,
  ControlCenterAgentControl,
  ControlCenterCommandReadiness,
  ControlCenterAgent,
  ControlCenterCapabilities,
  ControlCenterDiagnostics,
  ControlCenterFleetManualAuditResult,
  ControlCenterOperatorAction,
  ControlCenterOperatorActionCheck,
  ControlCenterOperatorActivityEntry,
  ControlCenterOperatorActivityResponse,
  ControlCenterOperatorActionPlan,
  ControlCenterOperatorActionPlanStatus,
  ControlCenterOperatorActionResult,
  ControlCenterPreRestoreContract,
  ControlCenterRestorePlan,
  ControlCenterRollbackPlan,
  ControlCenterSecretBrowserExposure,
  ControlCenterSecretDefinition,
  ControlCenterSecretMutationResult,
  ControlCenterSecretProvider,
  ControlCenterSecretReadiness,
  ControlCenterSecretValidationMethod,
  ControlCenterSecretValidationResult,
  ControlCenterSnapshotAuditEntry,
  ControlCenterSnapshotAuditResponse,
  ControlCenterSnapshotCreateRequest,
  ControlCenterSnapshotCreateResult,
  ControlCenterSnapshotCompare,
  ControlCenterSnapshotPlan,
  ControlCenterSnapshotRetentionPlan,
  ControlCenterSnapshotRetentionRequest,
  ControlCenterSnapshotRetentionResult,
  ControlCenterSnapshotValidation,
  ControlCenterStatus,
} from "./types";
import { getPrithaRealtimeStatus } from "../realtime/pritha-runtime";
import { runAsyncProbe, createProbeCache, sharedProbeCache } from "../../../../../scripts/lib/async-probe.mjs";
import { projectAgentCardIdentity } from "../../../../../scripts/agents-mother/card-projection.mjs";
import { deliveryStateView } from "./delivery-state";
import { readAgentCatalog, findCatalogAgent, currentAgentMission, readCatalogArtifact, readIdentityEvidence, agentOperationsApplicability, type CatalogAgent } from "../../../../../scripts/agents-mother/identity.mjs";

import { outcomeDocumentLock as currentOutcomeDocumentLock } from "../../../../../scripts/agents-mother/outcome-lock.mjs";
import { readAgentResultReadinessAsync } from "../../../../../scripts/agents-mother/result-readiness-async.mjs";
import { readProjectMetadataAsync, unavailableProjectMetadata, type ProjectMetadata, type ProjectMetadataFile } from "../../../../../scripts/agents-mother/project-metadata-async.mjs";

type RegistryRecord = CatalogAgent & { routeAliases: string[] };

type OperationsCommand =
  | string
  | {
      command?: string;
      argv?: string[];
      cwd?: string;
      env_allowlist?: string[];
      timeout_ms?: number;
      success_exit_codes?: number[];
      background?: boolean;
      readiness?: {
        kind?: "health_url" | "pid" | "none";
        url?: string;
        pid_file?: string;
        timeout_ms?: number;
      };
      control_center_managed?: boolean;
    };

type OperationsCredentialDefinition = {
  name?: string;
  variable?: string;
  label?: string;
  provider?: ControlCenterSecretProvider;
  required?: boolean;
  validation?: ControlCenterSecretValidationMethod;
  storage_target?: string;
  browser_exposure?: ControlCenterSecretBrowserExposure;
  note?: string;
};

type OperationsManifest = {
  agent?: string;
  display_name?: string;
  version?: string | number;
  agent_version?: string | number;
  app_version?: string | number;
  assigned_version?: string | number;
  service_mode?: string;
  autostart?: string;
  control_center_managed?: boolean;
  control_center_contract?: {
    confirmation_required?: boolean;
  };
  service_label?: string;
  launch_agent_path?: string;
  control_center_runtime?: {
    manager?: string;
    launchd_label?: string;
    launch_agent_path?: string;
    screen_session?: string;
    pid_file?: string;
    health_url?: string;
  };
  start_command?: OperationsCommand;
  stop_command?: OperationsCommand;
  run_command?: OperationsCommand;
  worker_command?: OperationsCommand;
  schedule_command?: OperationsCommand;
  local_upstream_url?: string;
  tailscale_public_url?: string;
  health_url?: string;
  healthcheck_command?: string;
  external_url?: string;
  tool_server?: boolean;
  adapter_type?: string;
  job_runner_command?: string;
  job_runner_mode?: string;
  proactivity?: {
    mode?: string;
    schedule?: string;
  };
  credentials?: OperationsCredentialDefinition[];
};

type TailscaleServeStatusJson = {
  Web?: Record<
    string,
    {
      Handlers?: Record<
        string,
        {
          Proxy?: string;
        }
      >;
    }
  >;
};

type AccessLinkState = {
  localhost: string;
  lanUrl?: string;
  lanReady: boolean;
  lanBindHost: string;
  lanReason: string;
  tailscaleUrl?: string;
  tailscaleVoiceUrl?: string;
  tailscaleServeConfigured: boolean;
  tailscaleDnsName?: string;
  tailscaleServeStatusJson: TailscaleServeStatusJson | null;
};

type AgentHealthProbe = {
  status: "ok" | "failed" | "unknown" | "not_checked";
  checkedUrl?: string;
  detail?: string;
};

type LifecycleMetadata = ControlCenterAgent["lifecycle"] & {
  version: string;
  versionStatus: ControlCenterAgent["versionStatus"];
  versionSource?: string;
};

type SnapshotRecord = {
  id: string;
  created?: string;
  path: string;
  schemaVersion?: string;
  restoreMode?: string;
};

type SnapshotJson = {
  schema_version?: string;
  snapshot_id?: string;
  id?: string;
  agent_id?: string;
  agent_name?: string;
  created_at?: string;
  created?: string;
  source_profile?: string;
  source_contract?: string;
  agent_folder?: string;
  restore?: {
    mode?: string;
    requires_confirmation?: boolean;
    target?: string;
    overwrite_existing_folder?: boolean;
  };
  privacy?: {
    secrets_included?: boolean;
    private_memory_included?: boolean;
    runtime_queues_included?: boolean;
    logs_included?: boolean;
  };
  contents?: {
    includes?: unknown;
    excludes?: unknown;
    hashes?: unknown;
  };
};

type SnapshotCompareOptions = {
  base?: string;
  target?: string;
};

type SnapshotRetentionCandidate = SnapshotRecord & {
  absolutePath: string;
  removalPath: string;
  reason: string;
};

type OperatorActionAuditEntry = {
  id: string;
  timestamp: string;
  actor: "pritha-control-center";
  agentId: string;
  agentName: string;
  action: ControlCenterOperatorAction;
  result: "passed" | "warnings" | "failed" | "planned-only" | "blocked" | "pending_confirmation" | "executing" | "running" | "stopped" | "degraded";
  target: string;
  checks: {
    passed: number;
    warnings: number;
    failed: number;
  };
};

const APP_PORT = Number(process.env.PRITHA_CONTROL_CENTER_PORT || 3420);
const APP_HOST = process.env.PRITHA_CONTROL_CENTER_HOST || "127.0.0.1";
const SNAPSHOT_SCHEMA_VERSION = "pritha_child_agent_snapshot_v1";
const APP_STARTED_AT = new Date();
const accessLinksCache = createProbeCache({ ttlMs: 120_000 });

function slug(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function compactKey(value: string) {
  return slug(value).replace(/-/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeVersion(value: string | number | undefined | null) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!/^v?\d+(?:\.\d+){0,2}$/i.test(raw)) return null;
  return raw.toLowerCase().startsWith("v") ? raw : `v${raw}`;
}

function relativePath(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function snapshotAuditLogPath(root: string) {
  return resolvePrithaStatePath("audit", "child-agent-snapshot-actions.jsonl");
}

function snapshotAuditLogRelativePath(root: string) {
  return relativePath(resolvePrithaStateRoot(root), snapshotAuditLogPath(root));
}

function operatorActionAuditLogPath(root: string) {
  return resolvePrithaStatePath("audit", "child-agent-operator-actions.jsonl");
}

function operatorActionAuditLogRelativePath(root: string) {
  return relativePath(resolvePrithaStateRoot(root), operatorActionAuditLogPath(root));
}

function firstLanIPv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return undefined;
}

async function tailscaleSelfDnsName() {
  const result = await runAsyncProbe("tailscale", ["status", "--json"], {
    policy: "privateAccess",
  });
  if (result.status !== 0 || !result.stdout.trim()) return undefined;
  try {
    const parsed = JSON.parse(result.stdout) as { Self?: { DNSName?: string } };
    return parsed.Self?.DNSName?.replace(/\.$/, "");
  } catch {
    return undefined;
  }
}

async function tailscaleServeStatusOutput() {
  const result = await runAsyncProbe("tailscale", ["serve", "status"], {
    policy: "privateAccess",
  });
  if (result.status !== 0) return "";
  return result.stdout;
}

async function tailscaleServeStatusJson() {
  const result = await runAsyncProbe("tailscale", ["serve", "status", "--json"], {
    policy: "privateAccess",
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout) as TailscaleServeStatusJson;
  } catch {
    return null;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tailscaleServeEndpointBlock(tailscaleUrl: string, serveStatus: string) {
  const pattern = new RegExp(`${escapeRegex(tailscaleUrl)}(?: \\(tailnet only\\))?\\n[\\s\\S]*?(?=\\n\\n|$)`);
  return serveStatus.match(pattern)?.[0] || "";
}

function tailscaleServeConfigured(tailscaleUrl: string, serveStatus: string) {
  return tailscaleServeEndpointBlock(tailscaleUrl, serveStatus).includes(`http://127.0.0.1:${APP_PORT}`);
}

function canonicalTailscaleServeConfigured(dnsName: string, serveStatus: string) {
  const canonicalUrl = `https://${dnsName}`;
  return tailscaleServeEndpointBlock(canonicalUrl, serveStatus).includes(`http://127.0.0.1:${APP_PORT}`);
}

async function accessLinks(fresh = false): Promise<AccessLinkState> {
  const cacheKey = `${APP_PORT}:${process.env.PRITHA_CONTROL_CENTER_TAILSCALE_HOST || "auto"}`;
  return accessLinksCache.get(cacheKey, async () => {
  const lanIp = firstLanIPv4();
  const lanReady = false;
  const configuredHost = process.env.PRITHA_CONTROL_CENTER_TAILSCALE_HOST || process.env.PRITHA_TAILNET_HOSTNAME;
  const distribution = existsSync(path.join(resolveTechscopeRoot(), "distribution", "manifest.json"));
  const dnsName = configuredHost || (distribution ? undefined : await tailscaleSelfDnsName());
  const [serveStatus, serveStatusJson] = dnsName ? await Promise.all([tailscaleServeStatusOutput(), tailscaleServeStatusJson()]) : ["", null];
  const explicitTailscaleUrl = dnsName ? `https://${dnsName}:${APP_PORT}` : undefined;
  const canonicalTailscaleUrl = dnsName ? `https://${dnsName}` : undefined;
  const canonicalConfigured = dnsName ? canonicalTailscaleServeConfigured(dnsName, serveStatus) : false;
  const explicitConfigured = explicitTailscaleUrl ? tailscaleServeConfigured(explicitTailscaleUrl, serveStatus) : false;
  const tailscaleUrl = canonicalConfigured ? canonicalTailscaleUrl : explicitTailscaleUrl;
  const serveConfigured = canonicalConfigured || explicitConfigured;
  const value: AccessLinkState = {
    localhost: `http://127.0.0.1:${APP_PORT}`,
    lanUrl: lanIp ? `http://${lanIp}:${APP_PORT}` : undefined,
    lanReady,
    lanBindHost: APP_HOST,
    lanReason: "LAN access is disabled by policy. Use Tailscale Serve for phone or trusted peer access.",
    tailscaleUrl,
    tailscaleVoiceUrl: tailscaleUrl ? `${tailscaleUrl}/voice` : undefined,
    tailscaleServeConfigured: serveConfigured,
    tailscaleDnsName: dnsName,
    tailscaleServeStatusJson: serveStatusJson,
  };
  return value;
  }, { fresh });
}

function appStatus() {
  const pkg = readJson<{ version?: string }>(path.join(process.cwd(), "package.json"));
  return {
    version: pkg?.version ? `v${pkg.version}` : "v?",
    startedAt: APP_STARTED_AT.toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - APP_STARTED_AT.getTime()) / 1000)),
  };
}

type SelfTestBaseline = {
  schema?: string;
  status?: "pass" | "fail";
  created_at?: string;
  warnings?: Array<{
    id?: string;
    severity?: string;
    message?: string;
  }>;
  memory_stats?: {
    documents?: number;
    chunks?: number;
    entities?: number;
    relations?: number;
    embeddings?: number;
  };
  quality_gate?: {
    status?: string;
    failed?: number;
  };
};

type MemoryStats = ControlCenterStatus["selfTest"]["memoryStats"];

function relativeAgeLabel(value?: string) {
  if (!value) return "Never";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function emptyMemoryStats(): MemoryStats {
  return {
    documents: 0,
    chunks: 0,
  };
}

async function sqliteMemoryStats(root: string): Promise<MemoryStats | null> {
  const databasePath = resolvePrithaStatePath("memory", "techscope.sqlite");
  if (!existsSync(databasePath)) return null;
  const result = await runAsyncProbe(
    "sqlite3",
    [
      "-json",
      databasePath,
      `
SELECT 'documents' AS name, COUNT(*) AS count FROM documents
UNION ALL SELECT 'chunks', COUNT(*) FROM chunks
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'relations', COUNT(*) FROM relations
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings;
`,
    ],
    {
      policy: "workspaceRead",
    },
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const rows = JSON.parse(result.stdout) as Array<{ name?: string; count?: number }>;
    return {
      documents: Number(rows.find((row) => row.name === "documents")?.count || 0),
      chunks: Number(rows.find((row) => row.name === "chunks")?.count || 0),
      entities: Number(rows.find((row) => row.name === "entities")?.count || 0),
      relations: Number(rows.find((row) => row.name === "relations")?.count || 0),
      embeddings: Number(rows.find((row) => row.name === "embeddings")?.count || 0),
    };
  } catch {
    return null;
  }
}

async function selfTestStatus(root: string): Promise<ControlCenterStatus["selfTest"]> {
  const baseline = readJson<SelfTestBaseline>(resolvePrithaStatePath("memory", "last-self-test.json"));
  const sqliteStats = await sqliteMemoryStats(root);
  const baselineStats = baseline?.memory_stats;
  const memoryStats = sqliteStats || {
    documents: Number(baselineStats?.documents || 0),
    chunks: Number(baselineStats?.chunks || 0),
    entities: Number(baselineStats?.entities || 0),
    relations: Number(baselineStats?.relations || 0),
    embeddings: Number(baselineStats?.embeddings || 0),
  };

  if (baseline?.schema !== "techscope-self-test-v1") {
    return {
      status: "unknown",
      ageLabel: "Never",
      failed: 0,
      memoryStats: sqliteStats || emptyMemoryStats(),
      warnings: [],
    };
  }

  return {
    status: baseline.status || "unknown",
    createdAt: baseline.created_at,
    ageLabel: relativeAgeLabel(baseline.created_at),
    failed: Number(baseline.quality_gate?.failed || 0),
    memoryStats,
    qualityGateStatus: baseline.quality_gate?.status,
    warnings: Array.isArray(baseline.warnings)
      ? baseline.warnings
          .map((warning) => ({
            id: String(warning.id || ""),
            severity: String(warning.severity || "warning"),
            message: String(warning.message || "").trim(),
          }))
          .filter((warning) => warning.message)
      : [],
  };
}

async function launchdRootWarnings(root: string) {
  const auditScript = path.join(/* turbopackIgnore: true */ root, "scripts", "launchd-root-audit.mjs");
  const result = await runAsyncProbe(process.execPath, [auditScript, "status", "--json"], {
    cwd: root,
    // The full operator audit may take 30 seconds. Page reads use the shorter
    // runtime budget and explicitly show unavailable diagnostics on expiry.
    policy: "runtimeRead",
    env: { ...process.env, TECHSCOPE_ROOT: root },
  });
  if (result.error) {
    const timedOut = "code" in result.error && result.error.code === "ETIMEDOUT";
    return [`Launchd root audit unavailable: ${timedOut ? "probe timed out" : "probe failed"}`];
  }
  const text = String(result.stdout || "").trim();
  if (!text) return result.status === 0 ? [] : [`Launchd root audit unavailable: ${String(result.stderr || "no output").trim()}`];
  try {
    const payload = JSON.parse(text) as { ok?: boolean; jobs?: Array<{ label?: string; status?: string }> };
    if (payload.ok) return [];
    return (payload.jobs || [])
      .filter((job) => job.status && job.status !== "ok")
      .map((job) => `Launchd root drift: ${job.label || "unknown"} is ${job.status}`);
  } catch {
    return [`Launchd root audit returned invalid JSON: ${String(result.stderr || "").trim()}`];
  }
}

function markdownFiles(root: string, segments: string[]) {
  const directory = path.join(root, ...segments);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(directory, entry))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a), undefined, { numeric: true, sensitivity: "base" }));
}

function readText(filePath: string) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function frontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] || "";
}

function scalarValue(text: string, key: string) {
  const match = text.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}

function numberValue(text: string, key: string) {
  const raw = scalarValue(text, key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function sha256(value: string | Buffer) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function currentContractFingerprint(text: string) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const normalized = source.replace(/^---\n([\s\S]*?)\n---\n/, (_match, rawFrontmatter: string) => {
    const stableFrontmatter = rawFrontmatter
      .split("\n")
      .filter((line) => !/^(?:status|updated|review_status):\s*/.test(line))
      .join("\n");
    return `---\n${stableFrontmatter}\n---\n`;
  }).trimEnd();
  return sha256(normalized);
}

function outcomeApprovalIntegrity(root: string, outcomePath: string, fallbackContractPath: string | null, outcomeText: string): { valid: boolean; reason?: string; approvalId?: string } {
  const outcomeFront = frontmatter(outcomeText);
  if (scalarValue(outcomeFront, "outcome_spec_status") !== "approved" || scalarValue(outcomeFront, "approved_by") !== "user") {
    return { valid: false, reason: "Outcome Spec is not independently approved" };
  }
  const semanticLock = scalarValue(outcomeFront, "outcome_semantic_lock");
  const documentLock = scalarValue(outcomeFront, "outcome_document_lock");
  if (!semanticLock?.startsWith("sha256:") || documentLock !== currentOutcomeDocumentLock(outcomeText)) {
    return { valid: false, reason: "Outcome Spec content locks are missing or stale" };
  }

  const boundContractValue = scalarValue(outcomeFront, "contract_path");
  const boundContractPath = boundContractValue
    ? (path.isAbsolute(boundContractValue) ? path.resolve(boundContractValue) : path.resolve(root, boundContractValue))
    : fallbackContractPath;
  if (!boundContractPath || !fallbackContractPath || path.resolve(boundContractPath) !== path.resolve(fallbackContractPath)) {
    return { valid: false, reason: "The Outcome Spec contract binding is unavailable" };
  }
  const contractText = readIdentityEvidence(boundContractPath, resolvePrithaAgentMemoryRoot(root));
  const contractFront = frontmatter(contractText);
  const contractFingerprint = scalarValue(outcomeFront, "contract_fingerprint");
  if (
    scalarValue(contractFront, "type") !== "agent-contract"
    || scalarValue(contractFront, "status") !== "accepted"
    || currentContractFingerprint(contractText) !== contractFingerprint
  ) {
    return { valid: false, reason: "The accepted contract changed after Outcome approval" };
  }

  const evidencePath = resolvePrithaStatePath("audit", "outcome-approvals.jsonl");
  if (!existsSync(evidencePath) || statSync(evidencePath).size > 5_000_000) {
    return { valid: false, reason: "Host approval evidence is missing or unreadable" };
  }
  const events = readIdentityEvidence(evidencePath, resolvePrithaStateRoot(root), 5_000_000).split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return null;
    }
  }).filter((event): event is Record<string, unknown> => Boolean(event));
  const matched = events.reverse().find((event) => (
    event.schema === "pritha-outcome-approval-v1"
    && event.spec_path === relativePath(root, outcomePath)
    && event.spec_id === scalarValue(outcomeFront, "id")
    && event.contract_fingerprint === contractFingerprint
    && event.semantic_lock === semanticLock
    && event.document_lock === documentLock
    && event.approved_by === "user"
    && typeof event.approval_id === "string" && event.approval_id.length > 0
  ));
  return matched
    ? { valid: true, reason: undefined, approvalId: String(matched.approval_id) }
    : { valid: false, reason: "Host approval evidence does not match the current Outcome Spec" };
}

function bodyFieldValue(text: string, field: string) {
  const match = text.match(new RegExp(`^-\\s*${escapeRegExp(field)}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim().replace(/`/g, "");
}

function explicitVersionFromText(text: string, agentName: string) {
  const versionPattern = "\\bv\\d+(?:\\.\\d+){0,2}\\b";
  const agentPattern = escapeRegExp(agentName);
  const front = frontmatter(text);
  const candidates = [
    scalarValue(front, "assigned_version"),
    scalarValue(front, "agent_version"),
    scalarValue(front, "version"),
    bodyFieldValue(text, "Assigned version"),
    bodyFieldValue(text, "Agent version"),
    bodyFieldValue(text, "Version"),
  ];

  for (const candidate of candidates) {
    const version = normalizeVersion(candidate);
    if (version) return version;
  }

  const evidenceLines = [
    scalarValue(front, "source_version"),
    scalarValue(front, "valid_for"),
    ...text.split(/\r?\n/).filter((line) => new RegExp(agentPattern, "i").test(line) && new RegExp(versionPattern, "i").test(line)),
  ].filter(Boolean) as string[];

  for (const line of evidenceLines) {
    const version = line.match(new RegExp(versionPattern, "i"))?.[0];
    if (version) return normalizeVersion(version);
  }

  return null;
}

function findProfile(_root: string, agent: RegistryRecord) {
  return agent.artifacts.find((artifact) => artifact.type === "child-agent-profile")?.path || null;
}

function findContract(_root: string, agent: RegistryRecord) {
  return agent.artifacts.find((artifact) => artifact.type === "agent-contract")?.path || null;
}

function findOutcomeSpec(_root: string, agent: RegistryRecord) {
  return agent.artifacts.find((artifact) => artifact.type === "agent-outcome-spec")?.path || null;
}

function findDeliveryReport(_root: string, agent: RegistryRecord) {
  return agent.artifacts.find((artifact) => artifact.type === "agent-delivery-report" && artifact.attribution !== "legacy")?.path || null;
}

function findLiveDeliveryState(root: string, agent: RegistryRecord) {
  const buildsRoot = resolvePrithaStatePath("builds");
  if (!existsSync(buildsRoot)) return null;
  if (!agent.projectPath || agent.identityStatus === "conflict") return null;
  const contractPath = findContract(root, agent);
  if (!contractPath) return null;
  const contractFingerprint = currentContractFingerprint(readCatalogArtifact(agent, contractPath, { root }));
  const outcomePath = findOutcomeSpec(root, agent);
  const outcomeText = outcomePath ? readCatalogArtifact(agent, outcomePath, { root }) : "";
  const outcomeFront = frontmatter(outcomeText);
  const approval = outcomePath ? outcomeApprovalIntegrity(root, outcomePath, contractPath, outcomeText) : null;
  if (!approval?.valid) return null;
  const candidates: Array<NonNullable<ReturnType<typeof deliveryStateView>>> = [];
  for (const agentDir of readdirSync(buildsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== ".targets").slice(0, 1_000)) {
    const directory = path.join(buildsRoot, agentDir.name);
    for (const runDir of readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).slice(0, 1_000)) {
      const statePath = path.join(directory, runDir.name, "build-state.json");
      let state: Record<string, unknown> | null = null;
      try { state = JSON.parse(readIdentityEvidence(statePath, resolvePrithaStateRoot(root))); } catch { continue; }
      const view = deliveryStateView(state);
      if (!state || !view) continue;
      if (typeof state.source_project !== "string" || path.resolve(state.source_project) !== agent.projectPath) continue;
      const spec = state.spec as { id?: string; contract_fingerprint?: string; document_lock?: string; semantic_lock?: string; approval_id?: string } | undefined;
      if (spec?.contract_fingerprint !== contractFingerprint
        || spec?.id !== scalarValue(outcomeFront, "id")
        || spec?.document_lock !== currentOutcomeDocumentLock(outcomeText)
        || spec?.semantic_lock !== scalarValue(outcomeFront, "outcome_semantic_lock")
        || spec?.approval_id !== approval.approvalId) continue;
      candidates.push({ ...view, runId: view.runId || runDir.name });
    }
  }
  return candidates.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))[0] || null;
}

function findReports(_root: string, agent: RegistryRecord) {
  return agent.artifacts.filter((artifact) => artifact.type.endsWith("report")).slice(0, 8).map((artifact) => artifact.path);
}

function resolveProfilePath(root: string, value: string | undefined) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function resolveRelativePath(root: string, value: string | undefined) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function metadataPathForSnapshot(root: string, storePath: string, snapshotId: string) {
  const stateRoot = resolvePrithaStateRoot(root);
  const configuredStore = stateRoot === root
    ? String(storePath || "")
    : String(storePath || "").replace(/^\.snapshots(?:\/|$)/, "snapshots/");
  return path.join(resolveRelativePath(stateRoot, configuredStore) || resolvePrithaStatePath("snapshots", "child-agents"), snapshotId, "snapshot.json");
}

function profileSnapshotStore(agent: ControlCenterAgent) {
  return agent.lifecycle.snapshots.storePath || `.snapshots/child-agents/${agent.id}`;
}

function defaultSnapshotId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function safeSnapshotId(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(trimmed)) return null;
  return trimmed;
}

function projectRelativeAgentFolder(agent: ControlCenterAgent) {
  const folderName = agent.folder.name || agent.name.replace(/\s+/g, "");
  return `../${folderName}`;
}

function snapshotIncludeCandidates(root: string, agent: ControlCenterAgent) {
  if (!agent.folder.name) return [];
  const folderPath = path.join(resolvePrithaAgentParent(root), agent.folder.name);
  const candidates = [
    "AGENTS.md",
    "README.md",
    ".env.example",
    "package.json",
    "interfaces/manifest.json",
    "memory/manifest.json",
    "tools/manifest.json",
    "operations/manifest.json",
  ];

  return candidates
    .map((candidate) => ({ candidate, absolutePath: path.join(folderPath, candidate) }))
    .filter((candidate) => existsSync(candidate.absolutePath))
    .map((candidate) => `${projectRelativeAgentFolder(agent)}/${candidate.candidate}`);
}

function snapshotPlanStatus(agent: ControlCenterAgent): ControlCenterAgent["lifecycle"]["snapshotPlan"] {
  if (agent.folder.status !== "present") {
    return {
      status: "unavailable",
      endpoint: `/api/agents/${agent.id}/snapshot-plan`,
      reason: "Cannot plan a snapshot for a missing child-agent folder",
    };
  }
  if (agent.lifecycle.profile.status !== "ready") {
    return {
      status: "unavailable",
      endpoint: `/api/agents/${agent.id}/snapshot-plan`,
      reason: "Cannot plan a snapshot without a canonical child-agent profile",
    };
  }
  return {
    status: "manual_only",
    endpoint: `/api/agents/${agent.id}/snapshot-plan`,
    reason: "Read-only snapshot draft can be generated; writing requires a future confirmation gate",
  };
}

function snapshotValidationStatus(agent: ControlCenterAgent): ControlCenterAgent["lifecycle"]["snapshotValidation"] {
  if (agent.lifecycle.snapshots.status === "unavailable") {
    return {
      status: "unavailable",
      endpoint: `/api/agents/${agent.id}/snapshot-validation`,
      valid: false,
      issueCount: 1,
      checkedFiles: 0,
      reason: agent.lifecycle.snapshots.reason || "Snapshot metadata store is not present",
    };
  }

  return {
    status: "ready",
    endpoint: `/api/agents/${agent.id}/snapshot-validation`,
    valid: true,
    issueCount: 0,
    checkedFiles: agent.lifecycle.snapshots.count,
    reason: agent.lifecycle.snapshots.count ? "Snapshot metadata files can be validated" : "Snapshot metadata store is empty",
  };
}

function snapshotsForAgent(root: string, agentId: string, profileFrontmatter = "", legacyIds: string[] = []): ControlCenterAgent["lifecycle"]["snapshots"] {
  const stateRoot = resolvePrithaStateRoot(root);
  const configuredStoreRaw = scalarValue(profileFrontmatter, "snapshot_store");
  const configuredStore = stateRoot === root
    ? configuredStoreRaw
    : configuredStoreRaw?.replace(/^\.snapshots(?:\/|$)/, "snapshots/");
  const profileStore = resolveProfilePath(stateRoot, configuredStore || undefined);
  const retention = numberValue(profileFrontmatter, "snapshot_retention");
  const candidates = [
    ...(profileStore ? [profileStore] : []),
    resolvePrithaStatePath("snapshots", "child-agents", agentId),
    resolvePrithaStatePath("snapshots", "child-agents", compactKey(agentId)),
    ...legacyIds.flatMap((id) => [resolvePrithaStatePath("snapshots", "child-agents", id), resolvePrithaStatePath("snapshots", "child-agents", compactKey(id))]),
  ];
  const store = candidates.find((candidate) => existsSync(candidate));
  if (!store) {
    return {
      status: "unavailable",
      count: 0,
      retention,
      storePath: profileStore ? relativePath(stateRoot, profileStore) : undefined,
      reason: "Snapshot metadata store is not present",
    };
  }

  const snapshots: SnapshotRecord[] = [];
  for (const entry of readdirSync(store)) {
    const entryPath = path.join(store, entry);
    const stat = statSync(entryPath);
    const metadataPath = stat.isDirectory() ? path.join(entryPath, "snapshot.json") : entryPath;
    if (!metadataPath.endsWith(".json") || !existsSync(metadataPath)) continue;
    const metadata = readJson<{
      id?: string;
      snapshot_id?: string;
      created?: string;
      created_at?: string;
      schema_version?: string;
      restore?: {
        mode?: string;
      };
    }>(metadataPath);
    snapshots.push({
      id: metadata?.snapshot_id || metadata?.id || path.basename(entryPath, ".json"),
      created: metadata?.created || metadata?.created_at || stat.mtime.toISOString(),
      path: relativePath(root, metadataPath),
      schemaVersion: metadata?.schema_version,
      restoreMode: metadata?.restore?.mode,
    });
  }

  snapshots.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));

  return {
    status: "ready",
    count: snapshots.length,
    retention,
    storePath: relativePath(root, store),
    latestId: snapshots[0]?.id,
    latestCreated: snapshots[0]?.created,
    reason: snapshots.length ? undefined : "Snapshot metadata store is empty",
    items: snapshots,
  };
}

function lifecycleForAgent(root: string, agent: RegistryRecord, manifest: OperationsManifest | null, folderPresent: boolean): LifecycleMetadata {
  const profilePath = findProfile(root, agent);
  const profileText = profilePath ? readCatalogArtifact(agent, profilePath, { root }) : "";
  const profileFront = frontmatter(profileText);
  const contractPath = findContract(root, agent);
  const outcomePath = findOutcomeSpec(root, agent);
  const outcomeText = outcomePath ? readCatalogArtifact(agent, outcomePath, { root }) : "";
  const outcomeFront = frontmatter(outcomeText);
  const rawOutcomeStatus = scalarValue(outcomeFront, "outcome_spec_status") || scalarValue(outcomeFront, "status") || "unknown";
  const outcomeStatus: ControlCenterAgent["lifecycle"]["outcome"]["status"] =
    (["draft", "approved", "superseded"] as const).find((value) => value === rawOutcomeStatus) || "unknown";
  const outcomeApproval = outcomePath
    ? outcomeApprovalIntegrity(root, outcomePath, contractPath, outcomeText)
    : { valid: false, reason: "No separate Outcome Spec found" };
  const outcomeApproved = outcomeStatus === "approved" && outcomeApproval.valid;
  const deliveryPath = findDeliveryReport(root, agent);
  const deliveryText = deliveryPath ? readCatalogArtifact(agent, deliveryPath, { root }) : "";
  const rawDeliveryStatus = scalarValue(frontmatter(deliveryText), "status") || "unknown";
  const deliveryStatus: ControlCenterAgent["lifecycle"]["delivery"]["status"] = (
    ["running", "blocked", "verified", "awaiting_acceptance", "accepted", "failed", "abandoned", "cancelled"] as const
  ).find((value) => value === rawDeliveryStatus) || "unknown";
  const liveDelivery = findLiveDeliveryState(root, agent);
  const reportPaths = findReports(root, agent);
  const readableVersionSources = [
    ...(profilePath ? [profilePath] : []),
    ...reportPaths,
    ...(contractPath ? [contractPath] : []),
  ];

  let version: string | null = normalizeVersion(manifest?.assigned_version || manifest?.agent_version || manifest?.app_version);
  let versionSource = version ? "operations/manifest.json" : undefined;

  for (const file of readableVersionSources) {
    if (version) break;
    const candidate = explicitVersionFromText(file === profilePath ? profileText : readCatalogArtifact(agent, file, { root }), agent.name);
    if (candidate) {
      version = candidate;
      versionSource = relativePath(root, file);
    }
  }

  const snapshots = snapshotsForAgent(root, agent.id, profileFront, agent.routeAliases);
  const hasRollbackCapableSnapshot = snapshots.items?.some((item) => item.restoreMode && item.restoreMode !== "metadata-only") || false;
  const rollback =
    hasRollbackCapableSnapshot
      ? {
          status: "ready" as const,
          planAvailable: true,
          reason: "Rollback-capable snapshot metadata is available; rollback still requires confirmation endpoint",
        }
      : snapshots.count > 0
        ? {
            status: "unavailable" as const,
            planAvailable: false,
            reason: "Only metadata-only snapshots are available; rollback is not enabled",
          }
      : {
          status: "unavailable" as const,
          planAvailable: false,
          reason: snapshots.reason || "No snapshots available for rollback",
        };
  const restorePlan =
    !folderPresent && contractPath
      ? {
          status: "ready" as const,
          endpoint: `/api/agents/${agent.id}/restore-plan`,
          reason: "Missing folder can be reconstructed from contract and lifecycle reports after confirmation",
        }
      : folderPresent
        ? {
            status: "unavailable" as const,
            reason: "Folder is present; restore is not applicable",
          }
        : {
            status: "unavailable" as const,
            reason: "No contract found for guided restore",
        };
  const baseLifecycle = {
    profile: profilePath
      ? { status: "ready" as const, path: relativePath(root, profilePath) }
      : { status: "unavailable" as const, reason: "No child agent profile found" },
    contract: contractPath
      ? { status: "ready" as const, path: relativePath(root, contractPath) }
      : { status: "unavailable" as const, reason: "No agent contract found" },
    outcome: outcomePath
      ? {
          status: outcomeStatus,
          path: relativePath(root, outcomePath),
          approved: outcomeApproved,
          reason: outcomeApproved ? undefined : outcomeApproval.reason,
        }
      : {
          status: "missing" as const,
          approved: false,
          reason: "No separate Outcome Spec found",
        },
    delivery: liveDelivery
      ? {
          status: liveDelivery.status,
          runId: liveDelivery.runId,
          phase: liveDelivery.phase,
          blockerCount: liveDelivery.blockerCount,
          budget: liveDelivery.budget,
          updatedAt: liveDelivery.updatedAt,
          source: "live-ledger" as const,
        }
      : deliveryPath
      ? {
          status: deliveryStatus,
          path: relativePath(root, deliveryPath),
          source: "delivery-report" as const,
          reason: deliveryStatus === "unknown" ? "Delivery report has an unknown lifecycle status" : undefined,
        }
      : {
          status: "not_started" as const,
          reason: "No outcome delivery report found",
        },
    reports: {
      status: reportPaths.length ? ("ready" as const) : ("unavailable" as const),
      count: reportPaths.length,
      latest: reportPaths[0] ? relativePath(root, reportPaths[0]) : undefined,
      paths: reportPaths.map((file) => relativePath(root, file)),
    },
    snapshots,
    rollback,
    restorePlan,
  };
  const agentForLifecycleStatus = {
    id: agent.id,
    name: agent.name,
    folder: { status: folderPresent ? ("present" as const) : ("missing" as const) },
    lifecycle: baseLifecycle,
  } as ControlCenterAgent;

  return {
    version: version || "v?",
    versionStatus: version ? "ready" : "unavailable",
    versionSource,
    ...baseLifecycle,
    snapshotPlan: snapshotPlanStatus(agentForLifecycleStatus),
    snapshotValidation: snapshotValidationStatus(agentForLifecycleStatus),
  };
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function isSecretName(value: string) {
  return /^[A-Z_][A-Z0-9_]{1,100}$/.test(value);
}

function providerForSecretName(name: string): ControlCenterSecretProvider {
  if (name.startsWith("OPENAI_")) return "openai";
  if (name.startsWith("TELEGRAM_")) return "telegram";
  if (name.startsWith("ANTHROPIC_")) return "anthropic";
  if (name.startsWith("WHATSAPP_")) return "whatsapp";
  if (name.startsWith("CODEX_")) return "codex_external";
  return "generic";
}

function isCredentialLikeName(name: string) {
  if (!isSecretName(name)) return false;
  if (name.startsWith("CODEX_")) return false;
  return /(?:API_KEY|BOT_TOKEN|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|WEBHOOK_SECRET|SECRET|PASSWORD|TOKEN)$/.test(name);
}

function defaultSecretLabel(name: string) {
  const acronyms: Record<string, string> = {
    API: "API",
    ID: "ID",
    URL: "URL",
    OPENAI: "OpenAI",
    TELEGRAM: "Telegram",
    ANTHROPIC: "Anthropic",
    WHATSAPP: "WhatsApp",
  };
  const displayName = name.replace(/^TECHSCOPE_TELEGRAM_/, "TELEGRAM_").replace(/^TECHSCOPE_/, "");
  return displayName
    .split("_")
    .map((part) => acronyms[part] || part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function defaultSecretValidation(provider: ControlCenterSecretProvider): ControlCenterSecretValidationMethod {
  if (provider === "codex_external") return "manual";
  if (provider === "generic") return "none";
  return "format";
}

function defaultBrowserExposure(provider: ControlCenterSecretProvider): ControlCenterSecretBrowserExposure {
  return provider === "openai" ? "ephemeral_only" : "server_only";
}

function defaultRequiredForSecret(name: string) {
  if (name === "OPENAI_API_KEY") return true;
  return /(?:API_KEY|BOT_TOKEN|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|WEBHOOK_SECRET)$/.test(name);
}

type SecretDefinitionBase = Omit<ControlCenterSecretDefinition, "status" | "configured" | "maskedValue" | "lastUpdated" | "canWrite" | "canRemove">;

function secretDefinitionFromManifest(definition: OperationsCredentialDefinition): SecretDefinitionBase | null {
  const name = (definition.name || definition.variable || "").trim().toUpperCase();
  if (!isSecretName(name)) return null;
  const provider = definition.provider || providerForSecretName(name);
  return {
    name,
    label: definition.label || defaultSecretLabel(name),
    provider,
    required: definition.required ?? defaultRequiredForSecret(name),
    validation: definition.validation || defaultSecretValidation(provider),
    storageTarget: definition.storage_target || ".env.local",
    browserExposure: definition.browser_exposure || defaultBrowserExposure(provider),
    source: "operations_manifest",
    note: definition.note,
  };
}

function envExampleSecretNames(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/)?.[1])
    .filter((name): name is string => Boolean(name && isCredentialLikeName(name)));
}

function secretDefinitionFromEnvExample(name: string): SecretDefinitionBase {
  const provider = providerForSecretName(name);
  return {
    name,
    label: defaultSecretLabel(name),
    provider,
    required: defaultRequiredForSecret(name),
    validation: defaultSecretValidation(provider),
    storageTarget: ".env.local",
    browserExposure: defaultBrowserExposure(provider),
    source: "env_example",
  };
}

function mergeSecretDefinitions(manifest: OperationsManifest | null, envExampleText: string) {
  const definitions = new Map<string, SecretDefinitionBase>();
  for (const definition of manifest?.credentials || []) {
    const normalized = secretDefinitionFromManifest(definition);
    if (normalized) definitions.set(normalized.name, normalized);
  }
  for (const name of envExampleSecretNames(envExampleText)) {
    if (!definitions.has(name)) definitions.set(name, secretDefinitionFromEnvExample(name));
  }
  return [...definitions.values()].sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name));
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const body = trimmed.slice(1, -1);
    return trimmed.startsWith('"') ? body.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : body;
  }
  return trimmed.replace(/\s+#.*$/, "");
}

function parseEnvValues(text: string) {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) values.set(match[1], unquoteEnvValue(match[2]));
  }
  return values;
}

function quoteEnvValue(value: string) {
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function upsertEnvValue(text: string, name: string, value: string) {
  const lines = text ? text.split(/\r?\n/) : [];
  let found = false;
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
    if (match?.[1] !== name) return line;
    found = true;
    return `${name}=${quoteEnvValue(value)}`;
  });

  if (!found) {
    if (nextLines.length && nextLines[nextLines.length - 1] !== "") nextLines.push("");
    if (!nextLines.includes("# Managed by Pritha Control Center credentials drawer")) {
      nextLines.push("# Managed by Pritha Control Center credentials drawer");
    }
    nextLines.push(`${name}=${quoteEnvValue(value)}`);
  }

  return `${nextLines.join("\n").replace(/\n+$/, "")}\n`;
}

function removeEnvValue(text: string, name: string) {
  return `${text
    .split(/\r?\n/)
    .filter((line) => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/)?.[1] !== name)
    .join("\n")
    .replace(/\n+$/, "")}\n`;
}

function envLocalPath(folderPath: string) {
  return path.join(folderPath, ".env.local");
}

function envBackupDir(folderPath: string) {
  return path.join(folderPath, ".env.local.backups");
}

function ensurePrivateGitExclude(folderPath: string) {
  const excludePath = path.join(folderPath, ".git", "info", "exclude");
  if (!existsSync(path.dirname(excludePath))) return;
  const entry = ".env.local.backups/";
  const current = readText(excludePath);
  if (current.split(/\r?\n/).includes(entry)) return;
  appendFileSync(excludePath, `${current.endsWith("\n") || !current ? "" : "\n"}${entry}\n`, "utf8");
}

function writePrivateFileAtomic(filePath: string, text: string) {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(temporaryPath, text, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
}

function writeEnvBackup(folderPath: string) {
  const filePath = envLocalPath(folderPath);
  if (!existsSync(filePath)) return undefined;
  ensurePrivateGitExclude(folderPath);
  const backupDir = envBackupDir(folderPath);
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  chmodSync(backupDir, 0o700);
  const backupName = `.env.local.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  const backupPath = path.join(backupDir, backupName);
  writeFileSync(backupPath, readFileSync(filePath, "utf8"), { encoding: "utf8", mode: 0o600 });
  chmodSync(backupPath, 0o600);

  const backups = readdirSync(backupDir)
    .filter((entry) => entry.startsWith(".env.local.") && entry.endsWith(".bak"))
    .sort()
    .reverse();
  for (const oldBackup of backups.slice(5)) rmSync(path.join(backupDir, oldBackup), { force: true });
  return backupPath;
}

function maskSecretValue(value: string | undefined) {
  if (!value) return undefined;
  const suffix = value.slice(-4);
  return suffix ? `••••${suffix}` : "••••";
}

function credentialStorage(root: string, folderPath: string, file: ProjectMetadataFile): ControlCenterAgentCredentials["storage"] {
  const filePath = envLocalPath(folderPath);
  const backupPath = envBackupDir(folderPath);
  if (file.status !== "read") {
    return {
      status: file.status === "missing" ? "manual_only" : "unavailable",
      target: ".env.local",
      relativePath: relativePath(root, filePath),
      backupRelativePath: relativePath(root, backupPath),
    };
  }
  return {
    status: "ready",
    target: ".env.local",
    relativePath: relativePath(root, filePath),
    mode: file.mode || undefined,
    backupRelativePath: relativePath(root, backupPath),
  };
}

function credentialsForAgent(root: string, folder: { absolutePath: string } | null, manifest: OperationsManifest | null, metadata: ProjectMetadata): ControlCenterAgentCredentials {
  if (!folder) {
    return {
      status: "unavailable",
      required: 0,
      configuredRequired: 0,
      missingRequired: 0,
      optional: 0,
      configuredOptional: 0,
      definitions: [],
      storage: {
        status: "unavailable",
        target: ".env.local",
      },
      warnings: ["Child-agent folder is missing; credentials cannot be configured."],
    };
  }

  const definitionBases = mergeSecretDefinitions(manifest, metadata.envExample.text);
  const envValues = parseEnvValues(metadata.envLocal.text);
  const lastUpdated = metadata.envLocal.mtime || undefined;
  const storage = credentialStorage(root, folder.absolutePath, metadata.envLocal);
  const unavailable = metadata.envExample.status === "unavailable" || metadata.envLocal.status === "unavailable";
  const definitions: ControlCenterSecretDefinition[] = definitionBases.map((definition) => {
    const value = envValues.get(definition.name);
    const configured = Boolean(value);
    const status: ControlCenterSecretReadiness = configured ? "configured" : definition.required ? "missing" : "optional";
    return {
      ...definition,
      status,
      configured,
      maskedValue: maskSecretValue(value),
      lastUpdated: configured ? lastUpdated : undefined,
      canWrite: !unavailable && definition.storageTarget === ".env.local" && definition.provider !== "codex_external",
      canRemove: !unavailable && configured && definition.storageTarget === ".env.local" && definition.provider !== "codex_external",
      note:
        definition.note ||
        (definition.provider === "codex_external"
          ? "Codex App/CLI auth is configured outside child-agent secret storage."
          : definition.browserExposure === "ephemeral_only"
            ? "Keep this server-side; browsers should receive only ephemeral credentials."
            : undefined),
    };
  });

  const required = definitions.filter((definition) => definition.required).length;
  const configuredRequired = definitions.filter((definition) => definition.required && definition.configured).length;
  const optional = definitions.filter((definition) => !definition.required).length;
  const configuredOptional = definitions.filter((definition) => !definition.required && definition.configured).length;
  const missingRequired = required - configuredRequired;

  return {
    status: unavailable ? "unavailable" : missingRequired ? "pending_auth" : definitions.length ? "ready" : "unavailable",
    required,
    configuredRequired,
    missingRequired,
    optional,
    configuredOptional,
    definitions,
    storage,
    warnings: unavailable ? ["Child-project credential metadata could not be read within the host policy."] : definitions.length ? [] : ["No credential definitions were found in operations manifest or .env.example."],
  };
}

function resolveAgentFolderPath(status: ControlCenterStatus, agent: ControlCenterAgent) {
  if (agent.folder.status !== "present" || !agent.folder.relativePath) return null;
  const folderPath = path.resolve(status.root, agent.folder.relativePath);
  const allowedParent = path.dirname(status.root);
  if (folderPath !== status.root && (folderPath === allowedParent || isPathInside(allowedParent, folderPath))) return folderPath;
  return null;
}

function findCredential(agent: ControlCenterAgent, name: string) {
  const normalized = name.trim().toUpperCase();
  if (!isSecretName(normalized)) return null;
  return agent.credentials.definitions.find((definition) => definition.name === normalized) || null;
}

function safeSecretInput(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\0") || /[\r\n]/.test(trimmed) || trimmed.length > 4096) return null;
  return trimmed;
}

function validateSecretFormat(definition: ControlCenterSecretDefinition, value: string | undefined): ControlCenterOperatorActionCheck[] {
  if (!value) {
    return [
      {
        id: "configured",
        label: "Configured value",
        status: "fail",
        detail: "Secret is not configured.",
      },
    ];
  }

  const checks: ControlCenterOperatorActionCheck[] = [
    {
      id: "configured",
      label: "Configured value",
      status: "pass",
      detail: "A value is present in the private agent store.",
    },
  ];

  if (definition.validation === "none" || definition.validation === "manual") {
    checks.push({
      id: "validation-method",
      label: "Validation method",
      status: "warn",
      detail: "No provider-safe automated validation is configured.",
    });
    return checks;
  }

  const patterns: Partial<Record<ControlCenterSecretProvider, RegExp>> = {
    openai: /^sk-[A-Za-z0-9_-]{16,}$/,
    telegram: /^\d+:[A-Za-z0-9_-]{20,}$/,
    anthropic: /^sk-ant-[A-Za-z0-9_-]{16,}$/,
    whatsapp: /^[A-Za-z0-9_.:-]{20,}$/,
  };
  const pattern = patterns[definition.provider];
  checks.push({
    id: "format",
    label: "Format",
    status: pattern && !pattern.test(value) ? "fail" : "pass",
    detail: pattern ? "Provider key shape checked locally; no network request was made." : "Generic secret accepted; no provider pattern is available.",
  });
  return checks;
}

function auditEntryId(timestamp: string, agentId: string, action: string) {
  return `${timestamp.replace(/[:.]/g, "-")}-${agentId}-${action}`;
}

function appendSnapshotAuditEntry(root: string, entry: ControlCenterSnapshotAuditEntry) {
  const logPath = snapshotAuditLogPath(root);
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function appendOperatorActionAuditEntry(root: string, entry: OperatorActionAuditEntry) {
  const logPath = operatorActionAuditLogPath(root);
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function readOperatorActionAuditEntries(root: string, limit = 12): { entries: ControlCenterOperatorActivityEntry[]; corruptLines: number; exists: boolean } {
  const logPath = operatorActionAuditLogPath(root);
  if (!existsSync(logPath)) return { entries: [], corruptLines: 0, exists: false };

  let corruptLines = 0;
  const entries = readText(logPath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-250)
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line) as OperatorActionAuditEntry;
        return [
          {
            id: entry.id,
            timestamp: entry.timestamp,
            agentId: entry.agentId,
            agentName: entry.agentName,
            action: entry.action,
            result: entry.result,
            target: entry.target,
            checks: entry.checks,
          },
        ];
      } catch {
        corruptLines += 1;
        return [];
      }
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);

  return { entries, corruptLines, exists: true };
}

function readSnapshotAuditEntries(root: string, agent: ControlCenterAgent, limit = 20) {
  const logPath = snapshotAuditLogPath(root);
  const entries: ControlCenterSnapshotAuditEntry[] = [];
  if (existsSync(logPath)) {
    const lines = readText(logPath)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-250);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ControlCenterSnapshotAuditEntry;
        if (entry.agentId === agent.id) entries.push(entry);
      } catch {
        // Corrupt audit lines are ignored here and surfaced as a warning by the reader.
      }
    }
  }

  const explicitTargets = new Set(entries.map((entry) => entry.target));
  const derivedEntries = snapshotItems(agent)
    .filter((item) => !explicitTargets.has(item.path))
    .map<ControlCenterSnapshotAuditEntry>((item) => ({
      id: `derived-${agent.id}-${item.id}`,
      timestamp: item.created || new Date(0).toISOString(),
      actor: "pritha-control-center",
      agentId: agent.id,
      agentName: agent.name,
      action: "snapshot-create",
      mode: "derived",
      result: "derived",
      target: item.path,
      source: "snapshot-metadata",
      details: {
        snapshotId: item.id,
        note: "Snapshot metadata existed before the operator audit log was enabled.",
      },
    }));

  return [...entries, ...derivedEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

function parseTableLine(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseRegistry(root: string, fresh = false) {
  const catalog = readAgentCatalog({ root, fresh });
  const records: RegistryRecord[] = catalog.agents.map((agent) => {
    const legacyId = slug(agent.name);
    const unique = catalog.agents.filter((candidate) => slug(candidate.name) === legacyId).length === 1;
    return { ...agent, routeAliases: unique && agent.identityStatus !== "conflict" ? [legacyId] : [] };
  });
  return { registryPath: catalog.registryPath, records };
}

function liveRegistryRecords(_root: string, records: RegistryRecord[]) {
  return records;
}

function findSiblingFolder(root: string, agentId: string) {
  const agent = findCatalogAgent(readAgentCatalog({ root, fresh: true }), agentId);
  return agent?.projectPath && agent.identityStatus !== "conflict"
    ? { name: path.basename(agent.projectPath), absolutePath: agent.projectPath } : null;
}

function localHealthUrls(manifest: OperationsManifest | null) {
  const urls = new Set<string>();
  if (manifest?.health_url) urls.add(manifest.health_url);
  if (manifest?.local_upstream_url) {
    const base = manifest.local_upstream_url.replace(/\/$/, "");
    urls.add(`${base}/api/health`);
    urls.add(`${base}/health`);
    urls.add(base);
  }
  return [...urls].filter((url) => /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(url));
}

async function probeHealth(manifest: OperationsManifest | null) {
  const urls = localHealthUrls(manifest);
  if (urls.length === 0) return { status: "unknown" as const, detail: "No local health URL available" };

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(650),
      });
      if (response.ok) return { status: "ok" as const, checkedUrl: url, detail: `HTTP ${response.status}` };
    } catch {
      // Try the next health candidate.
    }
  }

  return { status: "failed" as const, checkedUrl: urls[0], detail: "Local endpoint did not respond" };
}

function operationsStatus(manifest: OperationsManifest | null): CapabilityStatus {
  if (!manifest) return "not_installed";
  if (
    !manifest.start_command &&
    !manifest.stop_command &&
    !manifest.run_command &&
    !manifest.worker_command &&
    !manifest.schedule_command &&
    !manifest.job_runner_command &&
    !manifest.local_upstream_url
  ) {
    return "failed";
  }
  return "ready";
}

function commandText(command: OperationsCommand | undefined) {
  if (!command) return "";
  if (typeof command === "string") return command;
  return command.argv?.join(" ") || command.command || "";
}

function classifyCommandReadiness(command: OperationsCommand | undefined): ControlCenterCommandReadiness {
  if (!command) return "missing";
  if (typeof command !== "string") {
    return command.control_center_managed && Array.isArray(command.argv) && command.argv.length ? "structured_executable" : "legacy_declared";
  }

  const text = command.toLowerCase();
  if (/\bctrl-?c\b/.test(text) || /\bterminate\b/.test(text) || /\bmanual\b/.test(text) || /\bor\b/.test(text)) {
    return "human_instruction";
  }
  return "legacy_declared";
}

function readinessLabel(readiness: ControlCenterCommandReadiness) {
  if (readiness === "structured_executable") return "structured executable";
  if (readiness === "human_instruction") return "human instruction";
  if (readiness === "legacy_declared") return "legacy declared";
  return "missing";
}

type StructuredOperationsCommand = Extract<OperationsCommand, { argv?: string[] }>;

function hasShellMetacharacter(value: string) {
  return /[;&|<>`$\\\n\r]/.test(value);
}

function safeExecutionText(value: unknown, maxChars = 1_500) {
  const text = String(value || "")
    .replace(/(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function countChecks(checks: ControlCenterOperatorActionCheck[]) {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    failed: checks.filter((check) => check.status === "fail").length,
  };
}

function processIsAlive(pid: unknown) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

function validateStructuredOperationsCommand(params: {
  root: string;
  folderPath: string;
  manifest: OperationsManifest | null;
  agent: ControlCenterAgent;
  action: Extract<ControlCenterOperatorAction, "start" | "stop">;
}) {
  const command = params.action === "start" ? params.manifest?.start_command : params.manifest?.stop_command;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (params.agent.control.ownership !== "managed") errors.push("Agent is not control_center_managed.");
  if (!command || typeof command === "string" || !Array.isArray(command.argv) || !command.argv.length) {
    errors.push(`${params.action} command is not a structured argv command.`);
    return { ok: false, errors, warnings, command: null as StructuredOperationsCommand | null, cwd: params.folderPath, env: {} as Record<string, string>, timeoutMs: 30_000 };
  }
  if (!command.control_center_managed) errors.push(`${params.action} command is not marked control_center_managed.`);
  if (command.command) warnings.push("Legacy command field is ignored; only argv is executable.");

  const argv = command.argv.map((item) => String(item || "").trim());
  if (argv.some((item) => !item)) errors.push("argv contains an empty item.");
  for (const item of argv) {
    if (hasShellMetacharacter(item)) errors.push(`argv item contains forbidden shell metacharacters: ${item}`);
  }

  const cwdValue = String(command.cwd || ".").trim() || ".";
  if (hasShellMetacharacter(cwdValue)) errors.push("cwd contains forbidden shell metacharacters.");
  const cwd = path.resolve(params.folderPath, cwdValue);
  const relative = path.relative(params.folderPath, cwd);
  if (relative.startsWith("..") || path.isAbsolute(relative)) errors.push("cwd must stay inside the child-agent folder.");
  if (!existsSync(cwd)) errors.push("cwd does not exist.");

  const env: Record<string, string> = {};
  const allowlist = Array.isArray(command.env_allowlist) ? command.env_allowlist.map((item) => String(item || "").trim()).filter(Boolean) : [];
  for (const name of allowlist) {
    if (!/^[A-Z_][A-Z0-9_]{0,100}$/.test(name)) {
      errors.push(`Invalid env allowlist name: ${name}`);
      continue;
    }
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }

  if (params.action === "start" && command.background) {
    const readiness = command.readiness;
    const hasHealth = Boolean(readiness?.kind === "health_url" && (readiness.url || params.manifest?.health_url || params.manifest?.local_upstream_url));
    const hasPid = Boolean(readiness?.kind === "pid" && readiness.pid_file);
    if (!hasHealth && !hasPid) errors.push("background start requires readiness.kind health_url or pid.");
  }

  const timeoutMs = Number.isFinite(Number(command.timeout_ms)) ? Math.max(1_000, Math.min(Number(command.timeout_ms), 120_000)) : 30_000;
  return { ok: errors.length === 0, errors, warnings, command: { ...command, argv }, cwd, env, timeoutMs };
}

function isLocalUrl(url: string | undefined) {
  return !url || /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(url);
}

function validTailscalePublicUrl(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return undefined;
    if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net")) return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function loopbackEquivalent(hostname: string) {
  return hostname === "localhost" ? "127.0.0.1" : hostname;
}

function sameLocalProxyOrigin(proxy: string | undefined, localUrl: string | undefined) {
  if (!proxy || !localUrl) return false;
  try {
    const proxyUrl = new URL(proxy);
    const local = new URL(localUrl);
    return (
      proxyUrl.protocol === local.protocol &&
      loopbackEquivalent(proxyUrl.hostname) === loopbackEquivalent(local.hostname) &&
      (proxyUrl.port || defaultPort(proxyUrl.protocol)) === (local.port || defaultPort(local.protocol))
    );
  } catch {
    return false;
  }
}

function defaultPort(protocol: string) {
  if (protocol === "https:") return "443";
  if (protocol === "http:") return "80";
  return "";
}

function tailscaleWebUrl(webHost: string, handlerPath: string) {
  try {
    const rawHost = webHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const url = new URL(`https://${rawHost}`);
    if (url.port === "443") url.port = "";
    const pathPrefix = handlerPath === "/" ? "" : handlerPath.replace(/\/$/, "");
    url.pathname = pathPrefix || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function servedTailscaleUrlForLocalUrl(localUrl: string | undefined, access: AccessLinkState) {
  if (!localUrl || !access.tailscaleDnsName || !access.tailscaleServeStatusJson?.Web) return undefined;

  for (const [webHost, endpoint] of Object.entries(access.tailscaleServeStatusJson.Web)) {
    const normalizedHost = webHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!normalizedHost.startsWith(access.tailscaleDnsName)) continue;
    for (const [handlerPath, handler] of Object.entries(endpoint.Handlers || {})) {
      if (!sameLocalProxyOrigin(handler.Proxy, localUrl)) continue;
      return tailscaleWebUrl(normalizedHost, handlerPath);
    }
  }

  return undefined;
}

function agentTailscaleUrl(manifest: OperationsManifest | null, localUrl: string | undefined, access: AccessLinkState) {
  if (!manifest?.tailscale_public_url) return undefined;
  const servedUrl = servedTailscaleUrlForLocalUrl(localUrl, access);
  if (servedUrl) return servedUrl;
  const declaredUrl = validTailscalePublicUrl(manifest?.tailscale_public_url);
  return access.tailscaleServeStatusJson ? undefined : declaredUrl;
}

function expandUserPath(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  return raw.replace(/^~(?=\/|$)/, os.homedir());
}

function operationalRuntimeManager(manifest: OperationsManifest | null) {
  return String(manifest?.control_center_runtime?.manager || manifest?.service_mode || "").trim();
}

async function launchdRuntimeState(manifest: OperationsManifest | null) {
  const manager = operationalRuntimeManager(manifest);
  if (manager !== "launchd") return null;
  const label = String(manifest?.control_center_runtime?.launchd_label || manifest?.service_label || "").trim();
  const launchAgentPath = expandUserPath(manifest?.control_center_runtime?.launch_agent_path || manifest?.launch_agent_path);
  const installed = Boolean(launchAgentPath && existsSync(launchAgentPath));
  const uid = process.getuid ? process.getuid() : undefined;
  const target = label && uid !== undefined ? `gui/${uid}/${label}` : label;
  const loaded =
    Boolean(target) &&
    (await runAsyncProbe("launchctl", ["print", target], {
      policy: "runtimeRead",
    })).status === 0;

  return {
    label,
    launchAgentPath,
    installed,
    loaded,
  };
}

async function screenSessionRunning(session: string | undefined) {
  if (!session) return false;
  const result = await runAsyncProbe("screen", ["-ls"], {
    policy: "runtimeRead",
  });
  if (result.error) return false;
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return output.split(/\r?\n/).some((line) => line.includes(`.${session}`) || line.trim() === session);
}

async function operationalReadiness(params: {
  folderPresent: boolean;
  applicability?: ControlCenterAgent["operations"]["applicability"];
  manifestIssue?: string | null;
  manifest: OperationsManifest | null;
  operations: CapabilityStatus;
  health: AgentHealthProbe;
  localUrl?: string;
  tailscaleUrl?: string;
  access: AccessLinkState;
}): Promise<ControlCenterAgent["readiness"]> {
  const { folderPresent, manifest, operations, health, localUrl, tailscaleUrl, access } = params;
  const checks: ControlCenterOperatorActionCheck[] = [];
  const blockers: string[] = [];
  const nextActions: string[] = [];
  const manager = operationalRuntimeManager(manifest);
  let unmanagedLocalRuntime = false;
  let runtime: ControlCenterAgent["readiness"]["runtime"] = {
    manager: manager || undefined,
    status: "not_applicable",
    detail: manager ? `Runtime manager: ${manager}` : "No runtime manager declared",
  };

  if (!folderPresent) {
    return {
      status: "missing",
      summary: "Child-agent folder is missing.",
      runtime,
      access: {
        localhost: "unavailable",
        tailscale: "unavailable",
        detail: "No local runtime can be checked while the folder is missing.",
      },
      checks,
      blockers: ["Child-agent folder is missing."],
      nextActions: ["Use Restore Plan or recreate the agent folder from its contract."],
    };
  }

  if (!manifest && params.applicability?.manifestRequired === false && !params.manifestIssue) {
    return {
      status: "ready", summary: "The accepted contract selects no managed operations; a service manifest is not required.",
      runtime: { status: "not_applicable", detail: "No persistent local runtime is selected; Outcome verification is separate." },
      access: { localhost: "unavailable", tailscale: "not_configured", detail: "No local service access is selected." },
      checks, blockers, nextActions,
    };
  }
  if (!manifest || params.applicability?.status === "invalid-contract" || params.manifestIssue) {
    const reason = params.applicability?.status === "invalid-contract" ? "Agent type metadata needs contract schema review."
      : params.manifestIssue ? "operations/manifest.json is invalid or unsafe to read."
      : params.applicability?.status === "unknown" ? "Operations applicability needs an accepted contract or operations metadata."
      : "operations/manifest.json is missing for the selected operations.";
    return {
      status: "blocked",
      summary: reason,
      runtime,
      access: {
        localhost: "unavailable",
        tailscale: "unavailable",
        detail: "No local runtime can be checked without operations metadata.",
      },
      checks,
      blockers: [reason],
      nextActions: ["Review the selected operations contract and prepare only its required metadata."],
    };
  }

  if (operations === "failed") {
    blockers.push("Operations manifest is present but does not declare a usable runtime, command or local URL.");
  }

  const launchd = await launchdRuntimeState(manifest);
  if (launchd) {
    runtime = {
      manager: "launchd",
      status: launchd.installed ? (launchd.loaded || health.status === "ok" ? "ready" : "installable") : "service_install_required",
      serviceLabel: launchd.label || undefined,
      launchAgentPath: launchd.launchAgentPath,
      loaded: launchd.loaded,
      installed: launchd.installed,
      detail: launchd.installed
        ? launchd.loaded
          ? `Launchd service is loaded: ${launchd.label || "unknown label"}`
          : `LaunchAgent plist exists but service is not loaded: ${launchd.launchAgentPath || "unknown path"}`
        : `LaunchAgent plist is missing: ${launchd.launchAgentPath || "unknown path"}`,
    };
    checks.push({
      id: "runtime-service",
      label: "Runtime service",
      status: launchd.installed ? (launchd.loaded || health.status === "ok" ? "pass" : "warn") : "fail",
      detail: runtime.detail,
    });
    if (!launchd.installed && health.status !== "ok") {
      blockers.push("LaunchAgent plist is missing; install the service with explicit operator approval before Start.");
      nextActions.push("Run the agent deploy/install service action after reviewing its plan and confirmation gate.");
    }
  } else if (manager === "screen") {
    const session = manifest.control_center_runtime?.screen_session;
    const running = await screenSessionRunning(session);
    unmanagedLocalRuntime = Boolean(session && !running && health.status === "ok");
    const detail = session
      ? unmanagedLocalRuntime
        ? `Local health is ok, but screen session ${session} is not running.`
        : `Screen session ${session} ${running ? "is running" : "is not running"}`
      : "Screen manager has no session name";
    runtime = {
      manager: "screen",
      status: running ? "ready" : unmanagedLocalRuntime ? "unmanaged" : "installable",
      detail,
    };
    checks.push({
      id: "runtime-service",
      label: "Runtime service",
      status: session ? (running ? "pass" : "warn") : "warn",
      detail: runtime.detail,
    });
    if (unmanagedLocalRuntime) {
      nextActions.push("Restart this agent through the managed runtime or add a narrow fallback_stop_process rule for orphaned local processes.");
    }
  } else if (manager) {
    runtime = {
      manager,
      status: health.status === "ok" ? "ready" : "unknown",
      detail: `Runtime manager ${manager} is declared; readiness depends on the health probe.`,
    };
    checks.push({
      id: "runtime-service",
      label: "Runtime service",
      status: health.status === "ok" ? "pass" : "warn",
      detail: runtime.detail,
    });
  }

  const accessReady: ControlCenterAgent["readiness"]["access"] = {
    localhost: health.status === "ok" && localUrl ? "ready" : localUrl ? "pending" : "unavailable",
    tailscale: "unavailable",
    tailscaleUrl,
    localUrl,
    detail: localUrl ? `Local upstream: ${localUrl}` : "No local upstream URL declared.",
  };

  if (!localUrl) {
    accessReady.tailscale = "not_configured";
  } else if (tailscaleUrl) {
    accessReady.tailscale = "ready";
    accessReady.detail = `Tailscale route is served: ${tailscaleUrl}`;
    checks.push({
      id: "tailscale-route",
      label: "Tailscale route",
      status: "pass",
      detail: accessReady.detail,
    });
  } else if (access.tailscaleDnsName && access.tailscaleServeStatusJson && health.status === "ok") {
    accessReady.tailscale = "pending_serve";
    accessReady.detail = `Local runtime is ready, but no Tailscale Serve route points to ${localUrl}.`;
    checks.push({
      id: "tailscale-route",
      label: "Tailscale route",
      status: "warn",
      detail: accessReady.detail,
    });
    nextActions.push("Approve a Tailscale Serve action for this local upstream if trusted-device access is required.");
  } else if (access.tailscaleDnsName && access.tailscaleServeStatusJson) {
    accessReady.tailscale = "waiting_for_local";
    accessReady.detail = "Tailscale can be checked after the local runtime becomes healthy.";
    checks.push({
      id: "tailscale-route",
      label: "Tailscale route",
      status: "warn",
      detail: accessReady.detail,
    });
  } else {
    accessReady.tailscale = "not_configured";
    accessReady.detail = "Tailscale status is unavailable or not authenticated for route verification.";
  }

  if (blockers.length > 0) {
    return {
      status: blockers.some((item) => item.includes("LaunchAgent plist")) ? "service_install_required" : "blocked",
      summary: blockers[0],
      runtime,
      access: accessReady,
      checks,
      blockers,
      nextActions,
    };
  }

  if (health.status === "ok" && accessReady.tailscale === "pending_serve") {
    return {
      status: unmanagedLocalRuntime ? "unmanaged_local" : "tailscale_pending",
      summary: unmanagedLocalRuntime
        ? "Local runtime is healthy, but the declared runtime does not own it; Tailscale route is pending."
        : "Local runtime is ready; Tailscale route is pending.",
      runtime,
      access: accessReady,
      checks,
      blockers,
      nextActions,
    };
  }

  if (health.status === "ok") {
    return {
      status: unmanagedLocalRuntime ? "unmanaged_local" : accessReady.tailscale === "ready" ? "ready" : "local_ready",
      summary: unmanagedLocalRuntime
        ? "Local runtime is healthy, but the declared runtime does not own it."
        : accessReady.tailscale === "ready"
          ? "Local and Tailscale access are ready."
          : "Local runtime is ready.",
      runtime,
      access: accessReady,
      checks,
      blockers,
      nextActions,
    };
  }

  return {
    status: "blocked",
    summary: health.checkedUrl || health.detail || "Local runtime is not ready.",
    runtime,
    access: accessReady,
    checks,
    blockers,
    nextActions,
  };
}

function isExternalDeployment(record: RegistryRecord, manifest: OperationsManifest | null) {
  const deployment = `${record.deployment} ${manifest?.external_url || ""}`.toLowerCase();
  return /\b(vps|cloud|external|remote|hosted)\b/.test(deployment) || !isLocalUrl(manifest?.health_url);
}

function hasAgentHarness(folder: { absolutePath: string } | null) {
  return Boolean(folder && (existsSync(path.join(folder.absolutePath, "AGENTS.md")) || existsSync(path.join(folder.absolutePath, "CLAUDE.md"))));
}

function hasScheduledWork(record: RegistryRecord, manifest: OperationsManifest | null) {
  const text = `${record.proactivity} ${manifest?.proactivity?.mode || ""} ${manifest?.proactivity?.schedule || ""} ${manifest?.job_runner_mode || ""}`.toLowerCase();
  return Boolean(manifest?.schedule_command || manifest?.job_runner_command || /\b(cron|schedule|scheduled|queue-watcher|heartbeat)\b/.test(text));
}

function classifyRuntime(
  record: RegistryRecord,
  folder: { absolutePath: string } | null,
  manifest: OperationsManifest | null,
  lifecycle: LifecycleMetadata,
): ControlCenterAgentControl["runtimeKind"] {
  if (isExternalDeployment(record, manifest)) return "external_service";
  if (!folder && (lifecycle.profile.status === "ready" || lifecycle.contract.status === "ready")) return "scaffold";
  if (manifest?.local_upstream_url) return "web_service";
  if (manifest?.tool_server || /\bmcp\b|\btool\b/.test(record.interface.toLowerCase())) return "tool_server";
  if (manifest?.adapter_type || /\btelegram\b|\bvoice adapter\b|\bemail\b/.test(record.interface.toLowerCase())) return "interface_adapter";
  if (hasScheduledWork(record, manifest) && !manifest?.local_upstream_url) return "scheduled_job";
  if (manifest?.worker_command || manifest?.run_command || manifest?.job_runner_command) return "cli_worker";
  if (hasAgentHarness(folder) || /\bcodex\b/.test(`${record.runtime} ${record.interface}`.toLowerCase())) return "codex_project";
  return "unknown";
}

function controlOwnership(runtimeKind: ControlCenterAgentControl["runtimeKind"], folderPresent: boolean, manifest: OperationsManifest | null): ControlCenterAgentControl["ownership"] {
  if (runtimeKind === "external_service") return "external";
  if (!folderPresent || runtimeKind === "scaffold") return "none";
  if (manifest?.control_center_managed) return "managed";
  if (manifest?.local_upstream_url || manifest?.start_command || manifest?.stop_command) return "adoptable";
  return "unmanaged";
}

function agentUiState(folderPresent: boolean, manifest: OperationsManifest | null, healthStatus: "ok" | "failed" | "unknown" | "not_checked") {
  if (!folderPresent) return { state: "missing" as const, activity: "unknown" as const };
  if (!manifest || operationsStatus(manifest) === "failed") return { state: "needs-check" as const, activity: "unknown" as const };
  return { state: "alive" as const, activity: healthStatus === "ok" ? ("active" as const) : ("inactive" as const) };
}

function buildAgentControl(
  record: RegistryRecord,
  folder: { absolutePath: string } | null,
  manifest: OperationsManifest | null,
  lifecycle: LifecycleMetadata,
  state: ControlCenterAgent["ui"]["state"],
  activity: ControlCenterAgent["ui"]["activity"],
  readiness: ControlCenterAgent["readiness"],
): ControlCenterAgentControl {
  const runtimeKind = classifyRuntime(record, folder, manifest, lifecycle);
  const commandReadiness = {
    start: classifyCommandReadiness(manifest?.start_command),
    stop: classifyCommandReadiness(manifest?.stop_command),
  };
  const ownership = controlOwnership(runtimeKind, Boolean(folder), manifest);
  const base = {
    runtimeKind,
    ownership,
    executionMode: "plan_only" as const,
    confirmationRequired: manifest?.control_center_contract?.confirmation_required !== false,
    commandReadiness,
  };
  const canExecuteStart = ownership === "managed" && commandReadiness.start === "structured_executable";
  const canExecuteStop = ownership === "managed" && commandReadiness.stop === "structured_executable";

  if (state === "missing" || runtimeKind === "scaffold") {
    return {
      ...base,
      primaryCardAction: "restore_plan",
      planAction: "restore",
      label: "Restore Plan",
      reason: "Folder is missing or scaffold-only; restore remains a read-only plan.",
    };
  }
  if (state === "needs-check") {
    return {
      ...base,
      primaryCardAction: "run_check",
      planAction: "check",
      executionMode: "executable",
      label: "Run Check",
      reason: "Operations metadata needs review before runtime controls can be planned.",
    };
  }
  if (runtimeKind === "codex_project") {
    return {
      ...base,
      primaryCardAction: "run_check",
      planAction: "check",
      executionMode: "executable",
      label: "Run Check",
      reason: "Codex-native project agents use diagnostics or Codex tasks, not generic Start/Stop.",
    };
  }
  if (runtimeKind === "scheduled_job") {
    return {
      ...base,
      primaryCardAction: "run_now",
      planAction: "check",
      executionMode: "executable",
      label: "Run Now",
      reason: "Scheduled agents should expose run/pause/resume controls instead of generic Start/Stop.",
    };
  }
  if (runtimeKind === "web_service" && activity === "active") {
    return {
      ...base,
      primaryCardAction: "stop_plan",
      planAction: "stop",
      executionMode: canExecuteStop ? "executable" : "plan_only",
      label: canExecuteStop ? "Stop" : "Stop Plan",
      reason: canExecuteStop
        ? "A managed structured stop command is available for Control Center execution."
        : "A local service is active; stop requires a managed structured command.",
    };
  }
  if (runtimeKind === "web_service" && readiness.status === "service_install_required") {
    return {
      ...base,
      primaryCardAction: "start_plan",
      planAction: "start",
      executionMode: "plan_only",
      label: "Service Required",
      reason: readiness.summary,
    };
  }
  if (runtimeKind === "web_service") {
    return {
      ...base,
      primaryCardAction: "start_plan",
      planAction: "start",
      executionMode: canExecuteStart ? "executable" : "plan_only",
      label: canExecuteStart ? "Start" : "Start Plan",
      reason: canExecuteStart
        ? "A managed structured start command is available for Control Center execution."
        : "A local service manifest exists; start requires a managed structured command.",
    };
  }
  return {
    ...base,
    primaryCardAction: "run_check",
    planAction: "check",
    executionMode: "executable",
    label: "Run Check",
    reason: "Runtime class is unknown or unmanaged; only diagnostics are enabled.",
  };
}

function legacyPlanAction(control: ControlCenterAgentControl): ControlCenterAgent["ui"]["primaryAction"] {
  return control.planAction || "check";
}

function issueText(folderPresent: boolean, manifest: OperationsManifest | null, healthStatus: "ok" | "failed" | "unknown" | "not_checked") {
  if (!folderPresent) return "Folder not found";
  if (!manifest) return "Operations manifest not installed";
  if (operationsStatus(manifest) === "failed") return "Manifest is missing required operation fields";
  if (healthStatus === "failed") return "Healthcheck endpoint unavailable";
  if (healthStatus === "unknown") return "No local health endpoint";
  return undefined;
}

function readinessIssueText(readiness: ControlCenterAgent["readiness"]) {
  if (readiness.status === "service_install_required") return "Service install required";
  if (readiness.status === "unmanaged_local") return "Unmanaged local process";
  if (readiness.status === "tailscale_pending") return "Tailscale route pending";
  if (readiness.status === "local_ready") return "Local only";
  return undefined;
}

async function buildAgent(root: string, record: RegistryRecord, access: AccessLinkState): Promise<ControlCenterAgent> {
  const folder = record.projectPath ? { name: path.basename(record.projectPath), absolutePath: record.projectPath } : null;
  const [projectMetadata, resultReadiness] = await Promise.all([
    folder && record.identityStatus !== "conflict"
      ? readProjectMetadataAsync(folder.absolutePath, { codeRoot: root }) : unavailableProjectMetadata(),
    readAgentResultReadinessAsync(record.id, {
      root, codeRoot: root, stateRoot: resolvePrithaStateRoot(root), agentParent: resolvePrithaAgentParent(root),
    }),
  ]);
  const manifestRead = projectMetadata.manifest;
  const manifest = manifestRead.manifest as OperationsManifest | null;
  const applicability = agentOperationsApplicability(record, manifest, { root });
  const noRuntimeRequired = Boolean(folder && !manifest && applicability.manifestRequired === false && !manifestRead.issue);
  const health = folder ? await probeHealth(manifest) : { status: "not_checked" as const, detail: "Missing folder" };
  const uiState = noRuntimeRequired ? { state: "alive" as const, activity: "unknown" as const } : agentUiState(Boolean(folder), manifest, health.status);
  const operations = operationsStatus(manifest);
  const localUrl = manifest?.local_upstream_url;
  const tailscaleUrl = agentTailscaleUrl(manifest, localUrl, access);
  const lifecycle = lifecycleForAgent(root, record, manifest, Boolean(folder));
  const readiness = await operationalReadiness({
    folderPresent: Boolean(folder),
    applicability, manifestIssue: manifestRead.issue,
    manifest,
    operations,
    health,
    localUrl,
    tailscaleUrl,
    access,
  });
  const control = buildAgentControl(record, folder, manifest, lifecycle, uiState.state, uiState.activity, readiness);
  const credentials = credentialsForAgent(root, folder, manifest, projectMetadata);

  return {
    ...projectAgentCardIdentity(record, currentAgentMission(record, { root }).text),
    resultReadiness,
    runtime: record.runtime,
    interface: record.interface,
    deployment: record.deployment,
    proactivity: record.proactivity,
    evidence: record.evidence,
    version: lifecycle.version,
    versionStatus: lifecycle.versionStatus,
    versionSource: lifecycle.versionSource,
    folder: folder
      ? {
          status: "present",
          name: folder.name,
          relativePath: path.relative(root, folder.absolutePath),
        }
      : { status: "missing" },
    operations: {
      status: noRuntimeRequired ? "disabled" : operations,
      applicability,
      serviceMode: manifest?.service_mode,
      autostart: manifest?.autostart,
      startAvailable: Boolean(manifest?.start_command),
      stopAvailable: Boolean(manifest?.stop_command),
      localUrl,
      healthcheckCommand: manifest?.healthcheck_command,
      issue: operations === "failed" ? "Manifest is missing required operation fields" : undefined,
    },
    readiness,
    health,
    url: localUrl || tailscaleUrl
      ? { status: "available", local: localUrl, tailscale: tailscaleUrl }
      : { status: "unavailable", reason: folder ? "No local URL in operations manifest" : "Missing folder" },
    ui: {
      ...uiState,
      primaryAction: legacyPlanAction(control),
      actionEnabled: control.executionMode === "executable",
      actionDisabledReason: control.reason,
      issueText: record.identityStatus === "conflict" ? "Contract and project identity need review" : noRuntimeRequired ? undefined : readinessIssueText(readiness) || issueText(Boolean(folder), manifest, health.status),
      updateStatus: "none",
    },
    control,
    lifecycle,
    credentials,
  };
}

function snapshotsStatus(root: string): CapabilityStatus {
  return existsSync(resolvePrithaStatePath("snapshots", "child-agents")) ? "ready" : "unavailable";
}

type VoiceRuntimeStatus = ReturnType<typeof getPrithaRealtimeStatus>;

function voiceRealtimeCapability(voiceRuntime: VoiceRuntimeStatus): CapabilityStatus {
  return (voiceRuntime.voice_key_configured ?? voiceRuntime.openai_key_configured) ? "ready" : "pending_auth";
}

function capabilities(root: string, registryReady: boolean, agents: ControlCenterAgent[], voiceRuntime: VoiceRuntimeStatus): ControlCenterCapabilities {
  const anyOperationsReady = agents.some((agent) => agent.operations.status === "ready");
  const anyStartStopExecutable = agents.some(
    (agent) =>
      agent.control.ownership === "managed" &&
      (agent.control.commandReadiness.start === "structured_executable" || agent.control.commandReadiness.stop === "structured_executable"),
  );
  const anyRestorePlan = agents.some((agent) => agent.lifecycle.restorePlan.status === "ready");
  const anyRollbackPlan = agents.some((agent) => agent.lifecycle.rollback.planAvailable);
  const memoryToolReady = voiceRuntime.memory.sqlite || voiceRuntime.memory.sqlite_cli;
  return {
    agents_registry: registryReady ? "ready" : "not_installed",
    sibling_scan: "ready",
    operations_manifest: anyOperationsReady ? "ready" : "not_installed",
    start_stop: anyStartStopExecutable ? "ready" : "planned",
    restore: anyRestorePlan ? "manual_only" : "planned",
    snapshots: snapshotsStatus(root),
    rollback: anyRollbackPlan ? "manual_only" : "unavailable",
    update_suggestions: "planned",
    voice_realtime: voiceRealtimeCapability(voiceRuntime),
    voice_tools: memoryToolReady ? "ready" : "failed",
    codex_bridge: voiceRuntime.codex.available ? "ready" : "manual_only",
    codex_limits: "unavailable",
    api_usage: "unavailable",
    proactivity: "manual_only",
    cron_adapter: "not_installed",
    phone_access_lan: "unavailable",
    phone_access_tailscale: "pending_auth",
    developer_diagnostics: "ready",
  };
}

function latestReports(root: string) {
  const reportsDir = path.join(resolvePrithaAgentMemoryRoot(root), "reports");
  if (!existsSync(reportsDir)) return [];
  return readdirSync(reportsDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => {
      const absolutePath = path.join(reportsDir, entry);
      const stat = statSync(absolutePath);
      return {
        title: entry,
        path: path.relative(resolvePrithaStateRoot(root), absolutePath),
        updated: stat.mtime.toISOString(),
        type: entry.includes("self-test")
          ? "self_test"
          : entry.includes("evolution") || entry.includes("post-creation")
            ? "evolution"
            : entry.includes("audit")
              ? "audit"
              : entry.includes("recovery")
                ? "recovery"
                : "registry",
      };
    })
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 8);
}

const statusReadCache = sharedProbeCache("control-center-status-v1", { ttlMs: 1_000, maxEntries: 8 });

export async function getControlCenterStatus(options: { freshIdentity?: boolean } = {}): Promise<ControlCenterStatus> {
  const root = resolveTechscopeRoot();
  const key = JSON.stringify([root, resolvePrithaStateRoot(root), resolvePrithaAgentParent(root), process.env.PRITHA_INSTANCE_ID, process.env.PRITHA_CONTROL_CENTER_PORT]);
  return statusReadCache.get(key, () => readControlCenterStatus(options), { fresh: options.freshIdentity });
}

async function readControlCenterStatus(options: { freshIdentity?: boolean } = {}): Promise<ControlCenterStatus> {
  const root = resolveTechscopeRoot();
  const registry = parseRegistry(root, options.freshIdentity);
  const records = liveRegistryRecords(root, registry.records);
  const accessPromise = accessLinks(options.freshIdentity);
  const [access, selfTest, launchdWarnings, allAgents] = await Promise.all([
    accessPromise, selfTestStatus(root), launchdRootWarnings(root),
    accessPromise.then(access => Promise.all(records.map(record => buildAgent(root, record, access)))),
  ]);
  const childAgents = allAgents.filter((agent) => agent.name !== "Techscope" && agent.name !== "Pritha");
  const voiceRuntime = getPrithaRealtimeStatus();
  const caps = capabilities(root, records.length > 0, childAgents, voiceRuntime);
  const warnings = [
    ...childAgents.flatMap((agent) => (agent.ui.issueText ? [`${agent.name}: ${agent.ui.issueText}`] : [])),
    ...(selfTest.warnings || []).map((warning) => `Self-test: ${warning.message}`),
    ...launchdWarnings,
  ];

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    root,
    registryPath: registry.registryPath,
    app: appStatus(),
    selfTest,
    capabilities: caps,
    pritha: {
      status: caps.agents_registry === "ready" && caps.developer_diagnostics === "ready" ? "ready" : "failed",
      summary: caps.agents_registry === "ready" ? "Registry and read-only diagnostics available" : "Registry unavailable",
    },
    counts: {
      registryAgents: allAgents.length,
      childAgents: childAgents.length,
      alive: childAgents.filter((agent) => agent.ui.state === "alive").length,
      missing: childAgents.filter((agent) => agent.ui.state === "missing").length,
      needsCheck: childAgents.filter((agent) => agent.ui.state === "needs-check").length,
      active: childAgents.filter((agent) => agent.ui.activity === "active").length,
    },
    access: {
      localhost: access.localhost,
      lan: access.lanReady ? "ready" : "unavailable",
      lanUrl: access.lanUrl,
      lanReason: access.lanReason,
      lanBindHost: access.lanBindHost,
      tailscale: access.tailscaleServeConfigured ? "ready" : access.tailscaleUrl ? "pending_auth" : "unavailable",
      tailscaleUrl: access.tailscaleUrl,
      tailscaleVoiceUrl: access.tailscaleVoiceUrl,
      tailscaleServeConfigured: access.tailscaleServeConfigured,
      qr: access.tailscaleServeConfigured && access.tailscaleVoiceUrl ? "ready" : "unavailable",
    },
    proactivity: {
      status: "manual_only",
      mode: "manual",
      cronAdapter: "not_installed",
      manualChecks: "manual_only",
    },
    voice: {
      realtime: voiceRealtimeCapability(voiceRuntime),
      tools: voiceRuntime.memory.sqlite || voiceRuntime.memory.sqlite_cli ? "ready" : "failed",
      codexBridge: voiceRuntime.codex.available ? "ready" : "manual_only",
    },
    childAgents,
    allRegistryAgents: allAgents,
    latestReports: latestReports(root),
    operatorActivity: readOperatorActionAuditEntries(root, 8).entries,
    warnings,
  };
}

export function controlCenterStatusForClient(status: ControlCenterStatus): ControlCenterStatus {
  return {
    ...status,
    allRegistryAgents: [],
  };
}

function selectAgent(agents: ControlCenterAgent[], id: string) {
  const exact = agents.find((agent) => agent.id === id);
  if (exact) return exact;
  const legacy = agents.filter((agent) => agent.identity?.routeAliases.includes(id));
  return legacy.length === 1 ? legacy[0] : null;
}

export async function getControlCenterAgent(agentId: string) {
  const status = await getControlCenterStatus({ freshIdentity: true });
  return { status, agent: selectAgent(status.childAgents, agentId) || selectAgent(status.allRegistryAgents, agentId) };
}

export async function getAgentCredentials(agentId: string): Promise<ControlCenterAgentCredentialsResponse | null> {
  const status = await getControlCenterStatus({ freshIdentity: true });
  const agent = selectAgent(status.childAgents, agentId);
  if (!agent) return null;

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
      folderStatus: agent.folder.status,
    },
    credentials: agent.credentials,
  };
}

export async function setAgentCredentialSecret(
  agentId: string,
  name: string,
  value: unknown,
  options: { dryRun?: boolean } = {},
): Promise<ControlCenterSecretMutationResult | null> {
  const status = await getControlCenterStatus({ freshIdentity: true });
  const agent = selectAgent(status.childAgents, agentId);
  if (!agent) return null;
  const definition = findCredential(agent, name);
  if (!definition) throw new Error("unknown_secret");
  if (!definition.canWrite) throw new Error("secret_not_writable");
  const secretValue = safeSecretInput(value);
  if (!secretValue) throw new Error("invalid_secret_value");
  const folderPath = resolveAgentFolderPath(status, agent);
  if (!folderPath) throw new Error("agent_folder_unavailable");

  const filePath = envLocalPath(folderPath);
  if (!options.dryRun) {
    const current = existsSync(filePath) ? readText(filePath) : "";
    writeEnvBackup(folderPath);
    writePrivateFileAtomic(filePath, upsertEnvValue(current, definition.name, secretValue));
  }

  const refreshed = options.dryRun ? agent : (await getControlCenterAgent(agentId)).agent;
  const refreshedDefinition = refreshed ? findCredential(refreshed, definition.name) : null;
  const generatedAt = new Date().toISOString();
  return {
    ok: true,
    generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    secret: {
      name: definition.name,
      status: options.dryRun ? "configured" : refreshedDefinition?.status || "configured",
      configured: true,
      maskedValue: options.dryRun ? maskSecretValue(secretValue) : refreshedDefinition?.maskedValue,
    },
    dryRun: options.dryRun || undefined,
    storage: options.dryRun ? agent.credentials.storage : refreshed?.credentials.storage || agent.credentials.storage,
    warnings: options.dryRun
      ? ["Dry run completed; no .env.local file was written."]
      : ["Secret was written to the child agent private .env.local store. The value is not returned by this API."],
  };
}

export async function removeAgentCredentialSecret(
  agentId: string,
  name: string,
  options: { dryRun?: boolean } = {},
): Promise<ControlCenterSecretMutationResult | null> {
  const status = await getControlCenterStatus({ freshIdentity: true });
  const agent = selectAgent(status.childAgents, agentId);
  if (!agent) return null;
  const definition = findCredential(agent, name);
  if (!definition) throw new Error("unknown_secret");
  if (!definition.storageTarget || definition.storageTarget !== ".env.local") throw new Error("secret_not_removable");
  const folderPath = resolveAgentFolderPath(status, agent);
  if (!folderPath) throw new Error("agent_folder_unavailable");

  const filePath = envLocalPath(folderPath);
  if (!options.dryRun && existsSync(filePath)) {
    const current = readText(filePath);
    writeEnvBackup(folderPath);
    writePrivateFileAtomic(filePath, removeEnvValue(current, definition.name));
  }

  const refreshed = options.dryRun ? agent : (await getControlCenterAgent(agentId)).agent;
  const refreshedDefinition = refreshed ? findCredential(refreshed, definition.name) : null;
  const generatedAt = new Date().toISOString();
  return {
    ok: true,
    generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    secret: {
      name: definition.name,
      status: options.dryRun ? "missing" : refreshedDefinition?.status || (definition.required ? "missing" : "optional"),
      configured: false,
      maskedValue: undefined,
    },
    dryRun: options.dryRun || undefined,
    storage: options.dryRun ? agent.credentials.storage : refreshed?.credentials.storage || agent.credentials.storage,
    warnings: options.dryRun
      ? ["Dry run completed; no .env.local file was changed."]
      : ["Secret was removed from the child agent private .env.local store. No secret value was written to audit logs."],
  };
}

export async function validateAgentCredentialSecret(agentId: string, name: string): Promise<ControlCenterSecretValidationResult | null> {
  const status = await getControlCenterStatus({ freshIdentity: true });
  const agent = selectAgent(status.childAgents, agentId);
  if (!agent) return null;
  const definition = findCredential(agent, name);
  if (!definition) throw new Error("unknown_secret");
  const folderPath = resolveAgentFolderPath(status, agent);
  if (!folderPath) throw new Error("agent_folder_unavailable");

  const filePath = envLocalPath(folderPath);
  const values = existsSync(filePath) ? parseEnvValues(readText(filePath)) : new Map<string, string>();
  const value = values.get(definition.name);
  const checks = validateSecretFormat(definition, value);
  const failed = checks.some((check) => check.status === "fail");
  const warnings = checks.some((check) => check.status === "warn");

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    agent: {
      id: agent.id,
      name: agent.name,
    },
    secret: {
      name: definition.name,
      provider: definition.provider,
      validation: definition.validation,
      status: failed ? "failed" : warnings ? "warnings" : "passed",
      configured: Boolean(value),
      maskedValue: maskSecretValue(value),
    },
    checks,
    warnings: ["Validation is local and provider-safe; no secret value was sent over the network."],
  };
}

export async function getAgentRestorePlan(agentId: string): Promise<ControlCenterRestorePlan | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  const folderName = agent.folder.name || agent.name.replace(/\s+/g, "");
  const reportSources = agent.lifecycle.reports.paths.slice(0, 5);
  const selectedModules = [
    agent.lifecycle.contract.status === "ready" ? "contract" : null,
    agent.lifecycle.reports.count ? "lifecycle-reports" : null,
    agent.runtime || null,
    agent.interface || null,
    agent.operations.status === "ready" ? "operations-manifest" : null,
  ].filter(Boolean) as string[];
  const restoreReady = agent.lifecycle.restorePlan.status === "ready";

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
      folderStatus: agent.folder.status,
    },
    status: agent.lifecycle.restorePlan.status,
    actionEnabled: false,
    requiresConfirmation: true,
    target: {
      folderName,
      relativeToPritha: `../${folderName}`,
      willCreateFolder: agent.folder.status === "missing",
      willOverwriteExistingFolder: false,
    },
    sources: {
      contract: agent.lifecycle.contract.path,
      latestReports: reportSources,
      profile: agent.lifecycle.profile.path,
    },
    selectedModules,
    steps: restoreReady
      ? [
          "Review contract and latest lifecycle reports",
          "Prepare target sibling folder scaffold",
          "Recreate selected harness, interface, memory and operations modules",
          "Run healthcheck/self-test before marking restored",
        ]
      : ["No restore action is available for the current lifecycle state"],
    risks: restoreReady
      ? [
          "Restore would recreate code from authored knowledge, not from a complete filesystem backup",
          "Secrets, .env files, private memory, logs and runtime queues must not be copied automatically",
          "A separate confirmation gate is required before any write action",
        ]
      : ["Restore is read-only here and cannot mutate the project"],
    warnings: [
      agent.lifecycle.restorePlan.reason || "Restore plan is informational only",
      "This endpoint does not create folders, install services, start processes or copy secrets",
    ],
  };
}

function commandCheck(id: string, label: string, readiness: ControlCenterCommandReadiness, command: OperationsCommand | undefined): ControlCenterOperatorActionCheck {
  const text = commandText(command);
  const labelText = readinessLabel(readiness);
  const detail =
    readiness === "structured_executable"
      ? "Structured executable command is declared; execution is confirmation-gated."
      : readiness === "human_instruction"
        ? `${labelText} in operations manifest, not an executable contract${text ? `: ${text}` : ""}`
        : readiness === "legacy_declared"
          ? `${labelText} command string is declared for planning only${text ? `: ${text}` : ""}`
          : "Command is not declared in operations manifest";
  return {
    id,
    label,
    status: readiness === "structured_executable" ? "pass" : "warn",
    detail,
  };
}

function baseOperatorChecks(agent: ControlCenterAgent): ControlCenterOperatorActionCheck[] {
  return [
    {
      id: "folder",
      label: "Child folder",
      status: agent.folder.status === "present" ? "pass" : "fail",
      detail: agent.folder.name ? `../${agent.folder.name}` : "Folder missing",
    },
    {
      id: "operations",
      label: "Operations manifest",
      status: agent.operations.status === "ready" ? "pass" : agent.operations.status === "failed" ? "fail" : "warn",
      detail: agent.operations.status === "ready" ? "operations/manifest.json ready" : agent.operations.issue || String(agent.operations.status),
    },
    {
      id: "health",
      label: "Health probe",
      status: agent.health.status === "ok" ? "pass" : agent.health.status === "failed" ? "fail" : "warn",
      detail: agent.health.checkedUrl || agent.health.detail || String(agent.health.status),
    },
    {
      id: "profile",
      label: "Canonical profile",
      status: agent.lifecycle.profile.status === "ready" ? "pass" : "warn",
      detail: agent.lifecycle.profile.path || agent.lifecycle.profile.reason || "Profile unavailable",
    },
    {
      id: "contract",
      label: "Source contract",
      status: agent.lifecycle.contract.status === "ready" ? "pass" : "warn",
      detail: agent.lifecycle.contract.path || agent.lifecycle.contract.reason || "Contract unavailable",
    },
    ...agent.readiness.checks,
  ];
}

function operatorActionPhrase(agent: ControlCenterAgent, action: ControlCenterOperatorAction) {
  return `${action.toUpperCase()} ${agent.id}`;
}

function controlForAction(agent: ControlCenterAgent, action: ControlCenterOperatorAction): ControlCenterAgentControl {
  if (agent.control.planAction === action) return agent.control;
  if (action === "check") {
    return {
      ...agent.control,
      primaryCardAction: "run_check",
      planAction: "check",
      executionMode: "executable",
      label: "Run Check",
      reason: "Run Check reads metadata and probes health without mutating runtime state.",
    };
  }
  if (action === "start") {
    return {
      ...agent.control,
      primaryCardAction: "start_plan",
      planAction: "start",
      executionMode: "plan_only",
      label: "Start Plan",
      reason: "Start is available as a plan unless the current state and structured managed command allow execution.",
    };
  }
  if (action === "stop") {
    return {
      ...agent.control,
      primaryCardAction: "stop_plan",
      planAction: "stop",
      executionMode: "plan_only",
      label: "Stop Plan",
      reason: "Stop is available as a plan unless the current state and structured managed command allow execution.",
    };
  }
  return {
    ...agent.control,
    primaryCardAction: "restore_plan",
    planAction: "restore",
    executionMode: "plan_only",
    label: "Restore Plan",
    reason: "Restore is available only as a read-only plan until a dedicated restore executor is implemented.",
  };
}

function buildOperatorActionPlan(status: ControlCenterStatus, agent: ControlCenterAgent, action: ControlCenterOperatorAction): ControlCenterOperatorActionPlan {
  const planControl = controlForAction(agent, action);
  const checks =
    action === "restore"
      ? baseOperatorChecks(agent).map((check) =>
          check.id === "folder"
            ? {
                id: check.id,
                label: check.label,
                status: agent.folder.status === "missing" ? ("pass" as const) : ("warn" as const),
                detail:
                  agent.folder.status === "missing"
                    ? "Folder is missing; guided restore can be planned"
                    : "Folder is present; restore would require a separate replacement policy",
              }
            : check,
        )
      : baseOperatorChecks(agent);
  const localUrl = agent.url.local;
  const healthUrl = agent.health.checkedUrl || (localUrl ? `${localUrl.replace(/\/$/, "")}/api/health` : undefined);
  const actionCommandReadiness =
    action === "start" ? agent.control.commandReadiness.start : action === "stop" ? agent.control.commandReadiness.stop : "missing";
  const commandAvailable =
    action === "start"
      ? actionCommandReadiness === "structured_executable"
      : action === "stop"
        ? actionCommandReadiness === "structured_executable"
        : action === "restore"
          ? agent.lifecycle.restorePlan.status === "ready"
          : Boolean(agent.operations.healthcheckCommand || healthUrl);

  if (action === "start") checks.push(commandCheck("start-command", "Start command", agent.control.commandReadiness.start, undefined));
  if (action === "stop") checks.push(commandCheck("stop-command", "Stop command", agent.control.commandReadiness.stop, undefined));
  if (action === "restore") {
    checks.push({
      id: "restore-plan",
      label: "Restore plan",
      status: agent.lifecycle.restorePlan.status === "ready" ? "pass" : "fail",
      detail: agent.lifecycle.restorePlan.reason || "Restore plan unavailable",
    });
  }

  const failedChecks = checks.filter((check) => {
    if (check.status !== "fail") return false;
    if (action === "start" && check.id === "health" && agent.control.runtimeKind === "web_service") {
      return false;
    }
    return true;
  });
  const startStopAction = action === "start" || action === "stop";
  const unavailableBlockers =
    startStopAction
      ? [
          agent.control.runtimeKind === "external_service" ? "External services cannot be started or stopped by Control Center." : "",
          agent.control.runtimeKind === "scaffold" || agent.folder.status !== "present" ? "Agent folder is missing or scaffold-only." : "",
        ].filter(Boolean)
      : [];
  const runtimeBlockers =
    startStopAction
      ? [
          agent.control.ownership !== "managed" ? "Agent is not control_center_managed; start/stop execution is disabled." : "",
          actionCommandReadiness !== "structured_executable" ? `${action.toUpperCase()} requires a structured executable argv command in operations/manifest.json.` : "",
        ].filter(Boolean)
      : [];
  const actionBackendMissing =
    action === "restore" ? "Restore backend is planned-only; Control Center will not create folders yet" : "";
  const plannedOnlyBlockers = actionBackendMissing ? [actionBackendMissing] : [];
  const blockers =
    action === "check"
      ? []
      : [...unavailableBlockers, ...runtimeBlockers, ...plannedOnlyBlockers, ...failedChecks.map((check) => `${check.label}: ${check.detail}`)];
  const startStopEnabled = startStopAction && blockers.length === 0;
  const requiresConfirmation =
    action !== "check" &&
    !(startStopEnabled && startStopAction && planControl.confirmationRequired === false);
  const planStatus: ControlCenterOperatorActionPlanStatus =
    action === "check"
      ? "manual_only"
      : startStopEnabled
        ? requiresConfirmation
          ? "needs_confirmation"
          : "ready"
        : unavailableBlockers.length > 0
          ? "unavailable"
          : plannedOnlyBlockers.length > 0 && blockers.length === plannedOnlyBlockers.length
            ? "plan_only"
            : "blocked";
  const effectiveControl: ControlCenterAgentControl =
    startStopEnabled
      ? {
          ...planControl,
          executionMode: "executable",
          label: action === "start" ? "Start" : "Stop",
          reason: planControl.confirmationRequired === false
            ? "Structured managed command is available for Control Center execution."
            : "Structured managed command is available behind confirmation.",
        }
      : planControl;

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
      folderStatus: agent.folder.status,
    },
    action,
    status: planStatus,
    actionEnabled: action === "check" || startStopEnabled,
    requiresConfirmation,
    confirmation:
      !requiresConfirmation
        ? undefined
        : {
            requiredPhrase: operatorActionPhrase(agent, action),
            accepted: false,
          },
    target: {
      kind: action === "check" ? "healthcheck" : action === "restore" ? "restore" : "process",
      commandAvailable,
      localUrl,
      healthUrl,
      willStartProcess: action === "start" && startStopEnabled,
      willStopProcess: action === "stop" && startStopEnabled,
      willCreateFolder: false,
      willOverwriteExistingFolder: false,
    },
    control: effectiveControl,
    checks,
    steps:
      action === "check"
        ? [
            "Read child-agent profile, contract and operations manifest",
            "Probe local health endpoint when configured",
            "Return structured diagnostics and append operator audit entry on execution",
          ]
        : [
            "Review plan, preflight checks and blockers",
            startStopEnabled && requiresConfirmation
              ? `Enter the required confirmation phrase to ${action} the managed agent runtime`
              : startStopEnabled
                ? `Run the ${action} action for the managed agent runtime`
                : "Resolve blockers before execution is enabled",
            startStopEnabled ? "Control Center executes only the structured argv command without a shell" : "Use Dev diagnostics or Codex for remediation or manifest upgrade planning",
          ],
    blockers,
    risks:
      action === "check"
        ? ["Health probes can report stale local state if the child-agent server is changing while the check runs"]
        : startStopEnabled
          ? requiresConfirmation
            ? ["This action mutates local runtime state and is gated by explicit operator confirmation."]
            : ["This action mutates only this child agent's local runtime state using the structured argv contract."]
          : ["This action would mutate runtime state and remains disabled until the managed structured contract is complete."],
    warnings: [
      action === "check"
        ? "Manual check does not start, stop, restore, install, remove or schedule anything."
        : startStopEnabled
          ? requiresConfirmation
            ? "Confirmation-gated action. No shell strings, secrets, launchd install, cron enablement or external service mutation is allowed."
            : "Executable managed action. No shell strings, secrets, launchd install, cron enablement or external service mutation is allowed."
          : "Plan-only action. No process, folder, service, snapshot or memory mutation is available from this endpoint.",
    ],
  };
}

export async function getAgentOperatorActionPlan(agentId: string, action: ControlCenterOperatorAction): Promise<ControlCenterOperatorActionPlan | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  return buildOperatorActionPlan(status, agent, action);
}

function buildManualCheckResult(status: ControlCenterStatus, agent: ControlCenterAgent, generatedAt: string): ControlCenterOperatorActionResult {
  const plan = buildOperatorActionPlan(status, agent, "check");
  const passed = plan.checks.filter((check) => check.status === "pass").length;
  const warnings = plan.checks.filter((check) => check.status === "warn").length;
  const failed = plan.checks.filter((check) => check.status === "fail").length;
  const resultStatus: ControlCenterOperatorActionResult["status"] = failed ? "failed" : warnings ? "warnings" : "passed";
  const entryId = auditEntryId(generatedAt, agent.id, "operator-check");

  return {
    ok: true,
    generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    action: "check",
    status: resultStatus,
    actionEnabled: false,
    audit: {
      path: operatorActionAuditLogRelativePath(status.root),
      entryId,
    },
    checks: plan.checks,
    summary: {
      passed,
      warnings,
      failed,
    },
    warnings: [
      "Manual check completed without mutating agent runtime state.",
      "No start, stop, restore, install, uninstall, launchd or scheduled action was executed.",
    ],
    errors: [],
  };
}

function appendManualCheckAudit(status: ControlCenterStatus, result: ControlCenterOperatorActionResult) {
  const agent = status.childAgents.find((item) => item.id === result.agent.id) || status.allRegistryAgents.find((item) => item.id === result.agent.id);
  appendOperatorActionAuditEntry(status.root, {
    id: result.audit.entryId,
    timestamp: result.generatedAt,
    actor: "pritha-control-center",
    agentId: result.agent.id,
    agentName: result.agent.name,
    action: result.action,
    result: result.status,
    target: result.execution?.command?.join(" ") || agent?.health.checkedUrl || agent?.url.local || agent?.folder.relativePath || result.agent.id,
    checks: result.summary,
  });
}

export async function runAgentManualCheck(agentId: string): Promise<ControlCenterOperatorActionResult | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  const result = buildManualCheckResult(status, agent, new Date().toISOString());
  appendManualCheckAudit(status, result);
  return result;
}

function blockedOperatorActionResult(params: {
  status: ControlCenterStatus;
  agent: ControlCenterAgent;
  action: Extract<ControlCenterOperatorAction, "start" | "stop">;
  plan: ControlCenterOperatorActionPlan;
  generatedAt: string;
  errors: string[];
  warnings?: string[];
  resultStatus?: ControlCenterOperatorActionResult["status"];
}): ControlCenterOperatorActionResult {
  const checks = params.plan.checks;
  const summary = countChecks(checks);
  return {
    ok: true,
    generatedAt: params.generatedAt,
    agent: {
      id: params.agent.id,
      name: params.agent.name,
    },
    action: params.action,
    status: params.resultStatus || "blocked",
    actionEnabled: false,
    audit: {
      path: operatorActionAuditLogRelativePath(params.status.root),
      entryId: auditEntryId(params.generatedAt, params.agent.id, `operator-${params.action}`),
    },
    checks,
    summary,
    warnings: params.warnings || params.plan.warnings,
    errors: params.errors,
    execution: {
      status: params.resultStatus === "pending_confirmation" ? "pending_confirmation" : "blocked",
      target: params.plan.target.kind,
    },
  };
}

function operationManifestForAgent(root: string, agent: ControlCenterAgent) {
  const folder = findSiblingFolder(root, agent.id);
  if (!folder) return { folder: null, manifest: null };
  return {
    folder,
    manifest: readJson<OperationsManifest>(path.join(folder.absolutePath, "operations", "manifest.json")),
  };
}

async function waitForRuntimeReadiness(params: {
  manifest: OperationsManifest | null;
  command: StructuredOperationsCommand;
  cwd: string;
  pid?: number;
  timeoutMs: number;
}) {
  const started = Date.now();
  const readiness = params.command.readiness;
  const url = readiness?.url || params.manifest?.health_url || (params.manifest?.local_upstream_url ? `${params.manifest.local_upstream_url.replace(/\/$/, "")}/api/health` : undefined);
  const canCheckPid = Boolean(readiness?.kind === "pid" && readiness.pid_file);
  const canCheckHealth = Boolean(url);
  const canCheckProcess = Boolean(params.pid);
  if (!canCheckPid && !canCheckHealth && !canCheckProcess) {
    return { status: "unknown" as const, detail: "No readiness source declared for this command.", checkedUrl: url };
  }
  while (Date.now() - started <= params.timeoutMs) {
    if (readiness?.kind === "pid" && readiness.pid_file) {
      const pidFile = path.resolve(params.cwd, readiness.pid_file);
      const relative = path.relative(params.cwd, pidFile);
      if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
        try {
          const pid = Number(readFileSync(pidFile, "utf8").trim());
          if (processIsAlive(pid)) return { status: "ok" as const, detail: `pid ${pid} is alive` };
        } catch {
          // The process may not have written its pid file yet.
        }
      }
    } else if (url) {
      const probe = await probeHealth({ ...params.manifest, health_url: url });
      if (probe.status === "ok") return probe;
    } else if (params.pid && processIsAlive(params.pid)) {
      return { status: "ok" as const, detail: `pid ${params.pid} is alive` };
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { status: "failed" as const, detail: "Readiness did not pass before timeout", checkedUrl: url };
}

async function executeStructuredAgentCommand(params: {
  action: Extract<ControlCenterOperatorAction, "start" | "stop">;
  manifest: OperationsManifest | null;
  command: StructuredOperationsCommand;
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}) {
  const argv = params.command.argv || [];
  const successExitCodes = Array.isArray(params.command.success_exit_codes) ? params.command.success_exit_codes : [0];
  if (params.command.background && params.action === "start") {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: params.cwd,
      env: { ...process.env, ...params.env },
      detached: true,
      stdio: "ignore",
      shell: false,
    });
    const spawnError = await new Promise<Error | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 100);
      child.once("error", (error) => {
        clearTimeout(timer);
        resolve(error instanceof Error ? error : new Error(String(error)));
      });
    });
    if (spawnError) {
      return {
        status: "failed" as const,
        exitCode: null,
        signal: null,
        pid: child.pid,
        stdout: "",
        stderr: safeExecutionText(spawnError.message),
        readiness: {
          status: "failed" as const,
          detail: "Process failed to spawn.",
        },
      };
    }
    child.unref();
    const readiness = await waitForRuntimeReadiness({
      manifest: params.manifest,
      command: params.command,
      cwd: params.cwd,
      pid: child.pid,
      timeoutMs: Math.min(Number(params.command.readiness?.timeout_ms || params.timeoutMs), params.timeoutMs),
    });
    return {
      status: readiness.status === "ok" ? ("running" as const) : ("degraded" as const),
      exitCode: null,
      signal: null,
      pid: child.pid,
      stdout: "",
      stderr: "",
      readiness,
    };
  }

  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: params.cwd,
    env: { ...process.env, ...params.env },
    encoding: "utf8",
    timeout: params.timeoutMs,
    shell: false,
  });
  const exitOk = result.status !== null && successExitCodes.includes(result.status);
  const stderr = safeExecutionText(result.stderr || result.error?.message || "");
  const readiness =
    params.action === "start"
      ? await waitForRuntimeReadiness({ manifest: params.manifest, command: params.command, cwd: params.cwd, timeoutMs: Math.min(params.timeoutMs, 8_000) })
      : await probeHealth(params.manifest);
  const status =
    params.action === "stop"
      ? exitOk && params.manifest?.health_url && readiness.status === "ok"
        ? "failed"
        : exitOk
          ? "stopped"
          : "failed"
      : exitOk && (readiness.status === "ok" || readiness.status === "unknown" || !params.manifest?.health_url)
        ? "running"
        : exitOk
          ? "degraded"
          : "failed";

  return {
    status: status as "running" | "stopped" | "failed" | "degraded",
    exitCode: result.status,
    signal: result.signal,
    stdout: safeExecutionText(result.stdout),
    stderr,
    readiness,
  };
}

export async function runAgentRuntimeAction(
  agentId: string,
  action: Extract<ControlCenterOperatorAction, "start" | "stop">,
  confirmation: string,
): Promise<ControlCenterOperatorActionResult | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  const generatedAt = new Date().toISOString();
  const plan = buildOperatorActionPlan(status, agent, action);
  const requiredPhrase = plan.confirmation?.requiredPhrase || operatorActionPhrase(agent, action);

  if (!plan.actionEnabled) {
    const result = blockedOperatorActionResult({
      status,
      agent,
      action,
      plan,
      generatedAt,
      errors: plan.blockers.length ? plan.blockers : ["Action is not executable for this agent."],
    });
    appendManualCheckAudit(status, result);
    return result;
  }

  if (plan.confirmation && confirmation.trim() !== requiredPhrase) {
    const result = blockedOperatorActionResult({
      status,
      agent,
      action,
      plan,
      generatedAt,
      resultStatus: "pending_confirmation",
      errors: [`Confirmation phrase mismatch. Required phrase: ${requiredPhrase}`],
      warnings: ["No runtime command was executed."],
    });
    appendManualCheckAudit(status, result);
    return result;
  }

  const { folder, manifest } = operationManifestForAgent(status.root, agent);
  if (!folder) {
    const result = blockedOperatorActionResult({ status, agent, action, plan, generatedAt, errors: ["Child-agent folder is missing."] });
    appendManualCheckAudit(status, result);
    return result;
  }
  const validation = validateStructuredOperationsCommand({
    root: status.root,
    folderPath: folder.absolutePath,
    manifest,
    agent,
    action,
  });
  if (!validation.ok || !validation.command) {
    const result = blockedOperatorActionResult({
      status,
      agent,
      action,
      plan,
      generatedAt,
      errors: validation.errors,
      warnings: validation.warnings.length ? validation.warnings : ["No runtime command was executed."],
    });
    appendManualCheckAudit(status, result);
    return result;
  }

  const execution = await executeStructuredAgentCommand({
    action,
    manifest,
    command: validation.command,
    cwd: validation.cwd,
    env: validation.env,
    timeoutMs: validation.timeoutMs,
  });
  const checks = plan.checks;
  const summary = countChecks(checks);
  const result: ControlCenterOperatorActionResult = {
    ok: execution.status !== "failed",
    generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    action,
    status: execution.status,
    actionEnabled: false,
    audit: {
      path: operatorActionAuditLogRelativePath(status.root),
      entryId: auditEntryId(generatedAt, agent.id, `operator-${action}`),
    },
    checks,
    summary,
    warnings: [
      ...validation.warnings,
      "Runtime action used a structured argv command without shell execution.",
      "Secrets and long process output were redacted before returning to the UI.",
    ],
    errors: execution.status === "failed" ? [execution.stderr || execution.readiness.detail || `Command failed for ${action}.`] : [],
    execution: {
      status: execution.status,
      target: "process",
      command: validation.command.argv,
      exitCode: execution.exitCode,
      signal: execution.signal,
      pid: execution.pid,
      stdout: execution.stdout,
      stderr: execution.stderr,
      readiness: execution.readiness,
    },
  };
  appendManualCheckAudit(status, result);
  return result;
}

export async function runFleetManualAudit(): Promise<ControlCenterFleetManualAuditResult> {
  const status = await getControlCenterStatus();
  const generatedAt = new Date().toISOString();
  const results = status.childAgents.map((agent) => buildManualCheckResult(status, agent, generatedAt));

  for (const result of results) appendManualCheckAudit(status, result);

  const failed = results.filter((result) => result.status === "failed").length;
  const warnings = results.filter((result) => result.status === "warnings").length;
  const passed = results.filter((result) => result.status === "passed").length;
  const auditStatus: ControlCenterFleetManualAuditResult["status"] = failed ? "failed" : warnings ? "warnings" : "passed";

  return {
    ok: true,
    generatedAt,
    action: "fleet-manual-audit",
    status: auditStatus,
    actionEnabled: false,
    audit: {
      path: operatorActionAuditLogRelativePath(status.root),
      entryIds: results.map((result) => result.audit.entryId),
    },
    summary: {
      agents: results.length,
      passed,
      warnings,
      failed,
    },
    results,
    warnings: [
      "Fleet manual audit completed without mutating agent runtime state.",
      "No start, stop, restore, install, uninstall, launchd or scheduled action was executed.",
    ],
    errors: [],
  };
}

export async function getOperatorActivity(limit = 12): Promise<ControlCenterOperatorActivityResponse> {
  const status = await getControlCenterStatus();
  const activity = readOperatorActionAuditEntries(status.root, limit);

  return {
    ok: true,
    generatedAt: status.generatedAt,
    status: activity.exists || activity.entries.length ? "ready" : "unavailable",
    actionEnabled: false,
    logPath: operatorActionAuditLogRelativePath(status.root),
    entries: activity.entries,
    warnings: [
      ...(activity.exists ? [] : ["Operator action audit log has not been created yet."]),
      ...(activity.corruptLines ? [`${activity.corruptLines} operator audit log lines could not be parsed.`] : []),
    ],
  };
}

export async function getAgentSnapshots(agentId: string) {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    snapshots: agent.lifecycle.snapshots,
  };
}

export async function getAgentSnapshotRetention(agentId: string): Promise<ControlCenterSnapshotRetentionPlan | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  return buildSnapshotRetentionPlan(status, agent);
}

export async function enforceAgentSnapshotRetention(
  agentId: string,
  request: ControlCenterSnapshotRetentionRequest = {},
): Promise<ControlCenterSnapshotRetentionResult | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  const dryRun = request.dryRun !== false;
  const plan = buildSnapshotRetentionPlan(status, agent, request.confirmationPhrase);
  const retention = retentionCandidates(status, agent);
  const errors = [...plan.errors];
  const warnings = [...plan.warnings];
  const pruned: ControlCenterSnapshotRetentionResult["pruned"] = [];

  if (!dryRun && !plan.confirmation.accepted) errors.push(`confirmationPhrase must be exactly: ${plan.confirmation.requiredPhrase}`);
  if (!dryRun && !retention.storeAbsolutePath) errors.push("Snapshot metadata store is unavailable.");

  if (dryRun || errors.length > 0) {
    return {
      ...plan,
      ok: errors.length === 0,
      action: "snapshot-retention",
      mode: dryRun ? "dry-run" : "write",
      status: errors.length ? "failed" : plan.status,
      pruned,
      errors,
      warnings: [
        ...warnings,
        dryRun ? "Dry-run only; no snapshot metadata was pruned." : "Retention write was blocked before filesystem mutation.",
      ],
    };
  }

  for (const candidate of retention.candidates) {
    if (!retention.storeAbsolutePath || !isPathInside(retention.storeAbsolutePath, candidate.removalPath)) {
      errors.push(`Refusing to prune outside snapshot store: ${candidate.path}`);
      continue;
    }
    if (!existsSync(candidate.removalPath)) {
      warnings.push(`Candidate already absent: ${candidate.path}`);
      continue;
    }
    try {
      rmSync(candidate.removalPath, { recursive: true, force: false });
      pruned.push({ id: candidate.id, path: candidate.path });
    } catch (error) {
      errors.push(`${candidate.path}: ${error instanceof Error ? error.message : "Failed to prune snapshot metadata"}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const refreshed = await getControlCenterAgent(agentId);
  const refreshedPlan = refreshed.agent
    ? buildSnapshotRetentionPlan(
        {
          ...refreshed.status,
          generatedAt,
        },
        refreshed.agent,
        request.confirmationPhrase,
      )
    : plan;
  const result: ControlCenterSnapshotRetentionResult = {
    ...refreshedPlan,
    ok: errors.length === 0,
    generatedAt,
    action: "snapshot-retention",
    mode: "write",
    status: errors.length ? "failed" : "ready",
    pruned,
    errors,
    warnings: [
      ...warnings,
      pruned.length ? "Only metadata-only snapshot metadata was pruned." : "No retention candidates were pruned.",
      "Agent folders, secrets, private memory, queues, logs and runtime caches were not touched.",
    ],
  };

  appendSnapshotAuditEntry(status.root, {
    id: auditEntryId(generatedAt, agent.id, "snapshot-retention-prune"),
    timestamp: generatedAt,
    actor: "pritha-control-center",
    agentId: agent.id,
    agentName: agent.name,
    action: "snapshot-retention-prune",
    mode: "write",
    result: errors.length ? "failed" : "ok",
    target: agent.lifecycle.snapshots.storePath || `.snapshots/child-agents/${agent.id}`,
    source: "audit-log",
    details: {
      pruned,
      retention: result.retention,
    },
  });

  return result;
}

export async function getAgentSnapshotAudit(agentId: string, limit = 20): Promise<ControlCenterSnapshotAuditResponse | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  const logPath = snapshotAuditLogPath(status.root);
  const entries = readSnapshotAuditEntries(status.root, agent, limit);
  const derivedCount = entries.filter((entry) => entry.source === "snapshot-metadata").length;

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    status: existsSync(logPath) || entries.length ? "ready" : "unavailable",
    actionEnabled: false,
    logPath: snapshotAuditLogRelativePath(status.root),
    entries,
    warnings: [
      ...(existsSync(logPath) ? [] : ["Audit log file has not been created by a post-C.8 write action yet."]),
      ...(derivedCount ? [`${derivedCount} entries are derived from snapshot metadata, not explicit operator audit lines.`] : []),
    ],
  };
}

function snapshotPlanChecks(root: string, agent: ControlCenterAgent, storePath: string): ControlCenterSnapshotPlan["checks"] {
  const storeAbsolutePath = resolveRelativePath(root, storePath);
  return [
    {
      id: "profile",
      label: "Canonical profile",
      status: agent.lifecycle.profile.status === "ready" ? "pass" : "fail",
      detail: agent.lifecycle.profile.path || agent.lifecycle.profile.reason || "Profile unavailable",
    },
    {
      id: "contract",
      label: "Source contract",
      status: agent.lifecycle.contract.status === "ready" ? "pass" : "warn",
      detail: agent.lifecycle.contract.path || agent.lifecycle.contract.reason || "Contract unavailable",
    },
    {
      id: "folder",
      label: "Child folder",
      status: agent.folder.status === "present" ? "pass" : "fail",
      detail: agent.folder.name ? `../${agent.folder.name}` : "Folder missing",
    },
    {
      id: "operations",
      label: "Operations manifest",
      status: agent.operations.status === "ready" ? "pass" : "warn",
      detail: agent.operations.status === "ready" ? "operations/manifest.json ready" : agent.operations.issue || String(agent.operations.status),
    },
    {
      id: "health",
      label: "Latest health probe",
      status: agent.health.status === "ok" ? "pass" : "warn",
      detail: agent.health.checkedUrl || agent.health.detail || String(agent.health.status),
    },
    {
      id: "snapshot-store",
      label: "Snapshot metadata store",
      status: storeAbsolutePath && existsSync(storeAbsolutePath) ? "pass" : "warn",
      detail: storeAbsolutePath && existsSync(storeAbsolutePath) ? storePath : `${storePath} is not present; planner will not create it`,
    },
  ];
}

export async function getAgentSnapshotPlan(agentId: string): Promise<ControlCenterSnapshotPlan | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  return buildAgentSnapshotPlan(status, agent);
}

function buildAgentSnapshotPlan(status: ControlCenterStatus, agent: ControlCenterAgent, options: { snapshotId?: string; description?: string } = {}): ControlCenterSnapshotPlan {
  const snapshotId = safeSnapshotId(options.snapshotId) || defaultSnapshotId(new Date(status.generatedAt));
  const storePath = profileSnapshotStore(agent);
  const metadataPath = relativePath(status.root, metadataPathForSnapshot(status.root, storePath, snapshotId));
  const storeAbsolutePath = resolveRelativePath(status.root, storePath);
  const checks = snapshotPlanChecks(status.root, agent, storePath);
  const canDraft = agent.lifecycle.snapshotPlan.status === "manual_only";
  const includes = snapshotIncludeCandidates(status.root, agent);
  const agentFolder = projectRelativeAgentFolder(agent);

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
      folderStatus: agent.folder.status,
    },
    status: agent.lifecycle.snapshotPlan.status,
    actionEnabled: false,
    requiresConfirmation: true,
    target: {
      snapshotId,
      storePath,
      metadataPath,
      willCreateStore: storeAbsolutePath ? !existsSync(storeAbsolutePath) : true,
      willOverwriteExistingSnapshot: false,
    },
    draft: canDraft
      ? {
          schema_version: SNAPSHOT_SCHEMA_VERSION,
          snapshot_id: snapshotId,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_version: agent.versionStatus === "ready" ? agent.version : undefined,
          created_at: status.generatedAt,
          created_by: "pritha",
          description: options.description || "Read-only snapshot metadata draft generated by Pritha Control Center.",
          source_profile: agent.lifecycle.profile.path,
          source_contract: agent.lifecycle.contract.path,
          agent_folder: agentFolder,
          restore: {
            mode: "metadata-only",
            requires_confirmation: true,
            target: agentFolder,
            overwrite_existing_folder: false,
          },
          privacy: {
            secrets_included: false,
            private_memory_included: false,
            runtime_queues_included: false,
            logs_included: false,
          },
          contents: {
            includes,
            excludes: [
              ".env",
              ".env.local",
              ".memory-private/",
              ".queue/",
              ".logs/",
              "logs/",
              "node_modules/",
              ".next/",
              "runtime caches",
              "private user memory",
            ],
          },
          checks,
        }
      : undefined,
    checks,
    risks: [
      "This is metadata planning only; no snapshot directory or file is created.",
      "A future write-capable snapshot action must require explicit confirmation.",
      "Snapshot metadata is not a byte-for-byte backup unless a future snapshot writer records concrete contents.",
    ],
    warnings: [
      agent.lifecycle.snapshotPlan.reason || "Snapshot planner is read-only.",
      "Secrets, private memory, queues, logs and runtime caches must remain excluded unless a separate retention decision allows them.",
    ],
  };
}

export async function createAgentSnapshot(agentId: string, request: ControlCenterSnapshotCreateRequest = {}): Promise<ControlCenterSnapshotCreateResult | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  const dryRun = request.dryRun !== false;
  const confirmationPhrase = `CREATE SNAPSHOT ${agent.id}`;
  const plan = buildAgentSnapshotPlan(status, agent, {
    snapshotId: request.snapshotId,
    description: request.description,
  });
  const failChecks = plan.checks.filter((check) => check.status === "fail");
  const errors: string[] = [];
  const warnings = [...plan.warnings];
  const confirmationAccepted = request.confirmationPhrase === confirmationPhrase;
  const metadataAbsolutePath = path.join(status.root, plan.target.metadataPath);
  const draftJson = plan.draft ? `${JSON.stringify(plan.draft, null, 2)}\n` : "";

  if (request.snapshotId && !safeSnapshotId(request.snapshotId)) errors.push("snapshotId must be a safe filename segment");
  if (plan.status !== "manual_only") errors.push(plan.warnings[0] || "Snapshot create is unavailable for this agent");
  for (const check of failChecks) errors.push(`${check.label}: ${check.detail}`);
  if (!dryRun && !confirmationAccepted) errors.push(`confirmationPhrase must be exactly: ${confirmationPhrase}`);
  if (!dryRun && existsSync(metadataAbsolutePath)) errors.push(`Snapshot metadata already exists: ${plan.target.metadataPath}`);

  if (dryRun || errors.length > 0) {
    return {
      ok: errors.length === 0,
      generatedAt: status.generatedAt,
      agent: {
        id: agent.id,
        name: agent.name,
      },
      action: "snapshot-create",
      mode: dryRun ? "dry-run" : "write",
      status: errors.length ? "failed" : plan.status,
      actionEnabled: false,
      requiresConfirmation: true,
      confirmation: {
        requiredPhrase: confirmationPhrase,
        accepted: confirmationAccepted,
      },
      target: plan.target,
      draft: plan.draft,
      checks: plan.checks,
      errors,
      warnings: [
        ...warnings,
        dryRun ? "Dry-run only; no snapshot metadata was written." : "Write was blocked before filesystem mutation.",
      ],
    };
  }

  mkdirSync(path.dirname(metadataAbsolutePath), { recursive: true });
  writeFileSync(metadataAbsolutePath, draftJson, { flag: "wx" });
  appendSnapshotAuditEntry(status.root, {
    id: auditEntryId(status.generatedAt, agent.id, "snapshot-create"),
    timestamp: status.generatedAt,
    actor: "pritha-control-center",
    agentId: agent.id,
    agentName: agent.name,
    action: "snapshot-create",
    mode: "write",
    result: "ok",
    target: plan.target.metadataPath,
    source: "audit-log",
    details: {
      snapshotId: plan.target.snapshotId,
      bytes: Buffer.byteLength(draftJson, "utf8"),
      restoreMode: "metadata-only",
    },
  });

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    action: "snapshot-create",
    mode: "write",
    status: "ready",
    actionEnabled: false,
    requiresConfirmation: true,
    confirmation: {
      requiredPhrase: confirmationPhrase,
      accepted: true,
    },
    target: plan.target,
    draft: plan.draft,
    wrote: {
      metadataPath: plan.target.metadataPath,
      bytes: Buffer.byteLength(draftJson, "utf8"),
    },
    checks: plan.checks,
    errors: [],
    warnings: [
      "Snapshot metadata was written. No agent files, secrets, logs, queues or runtime caches were copied.",
      "Rollback remains disabled for metadata-only snapshots.",
    ],
  };
}

function snapshotMetadataFiles(root: string, agent: ControlCenterAgent) {
  const storePath = profileSnapshotStore(agent);
  const storeAbsolutePath = resolveRelativePath(root, storePath);
  if (!storeAbsolutePath || !existsSync(storeAbsolutePath)) {
    return { storePath, storeAbsolutePath, files: [] as string[], exists: false };
  }

  const files = readdirSync(storeAbsolutePath)
    .flatMap((entry) => {
      const entryPath = path.join(storeAbsolutePath, entry);
      const stat = statSync(entryPath);
      const metadataPath = stat.isDirectory() ? path.join(entryPath, "snapshot.json") : entryPath;
      return metadataPath.endsWith(".json") && existsSync(metadataPath) ? [metadataPath] : [];
    })
    .sort((a, b) => b.localeCompare(a));

  return { storePath, storeAbsolutePath, files, exists: true };
}

function snapshotItems(agent: ControlCenterAgent) {
  return agent.lifecycle.snapshots.items || [];
}

function findSnapshotItem(agent: ControlCenterAgent, snapshotId: string | undefined) {
  const items = snapshotItems(agent);
  if (!items.length) return null;
  if (!snapshotId || snapshotId === "latest") return items[0] || null;
  return items.find((item) => item.id === snapshotId) || null;
}

function snapshotRetentionPhrase(agent: ControlCenterAgent) {
  return `PRUNE SNAPSHOTS ${agent.id}`;
}

function snapshotRemovalPath(metadataPath: string) {
  return path.basename(metadataPath) === "snapshot.json" ? path.dirname(metadataPath) : metadataPath;
}

function retentionCandidates(status: ControlCenterStatus, agent: ControlCenterAgent) {
  const snapshots = snapshotItems(agent);
  const snapshotStateRoot = resolvePrithaStateRoot(status.root);
  const snapshotStorePath = snapshotStateRoot === status.root
    ? agent.lifecycle.snapshots.storePath
    : agent.lifecycle.snapshots.storePath?.replace(/^\.snapshots(?:\/|$)/, "snapshots/");
  const storeAbsolutePath = snapshotStorePath ? resolveRelativePath(snapshotStateRoot, snapshotStorePath) : null;
  const retention = agent.lifecycle.snapshots.retention;
  const configured = typeof retention === "number" && retention >= 0;
  const overflow = configured ? Math.max(0, snapshots.length - retention) : 0;
  const protectedRecords: ControlCenterSnapshotRetentionPlan["protected"] = [];
  const candidates: SnapshotRetentionCandidate[] = [];

  if (!storeAbsolutePath || !configured || overflow <= 0) {
    return { configured, retention, overflow, candidates, protectedRecords, storeAbsolutePath };
  }

  snapshots.forEach((item, index) => {
    const absolutePath = path.join(status.root, item.path);
    const removalPath = snapshotRemovalPath(absolutePath);
    const underStore = isPathInside(storeAbsolutePath, removalPath);
    const isOverflow = index >= retention;
    const isMetadataOnly = item.restoreMode === "metadata-only";
    const record = {
      id: item.id,
      path: item.path,
      reason: !isOverflow
        ? "Within retention window"
        : !isMetadataOnly
          ? "Restore-capable or unknown snapshot is protected from metadata pruning"
          : !underStore
            ? "Snapshot path is outside the configured store"
            : "Older metadata-only snapshot exceeds retention",
    };

    if (isOverflow && isMetadataOnly && underStore) {
      candidates.push({
        ...item,
        absolutePath,
        removalPath,
        reason: record.reason,
      });
      return;
    }

    protectedRecords.push(record);
  });

  return { configured, retention, overflow, candidates, protectedRecords, storeAbsolutePath };
}

function buildSnapshotRetentionPlan(status: ControlCenterStatus, agent: ControlCenterAgent, confirmationPhrase = ""): ControlCenterSnapshotRetentionPlan {
  const retention = retentionCandidates(status, agent);
  const requiredPhrase = snapshotRetentionPhrase(agent);
  const accepted = confirmationPhrase === requiredPhrase;
  const warnings: string[] = [];
  const errors: string[] = [];
  const retentionStatus =
    !retention.configured ? "not_configured" : retention.overflow > 0 ? "over_limit" : ("within_limit" as const);

  if (agent.lifecycle.snapshots.status === "unavailable") warnings.push(agent.lifecycle.snapshots.reason || "Snapshot metadata store is not present.");
  if (!retention.configured) warnings.push("Snapshot retention is not configured in the child-agent profile.");
  if (retention.overflow > 0 && retention.candidates.length === 0) {
    warnings.push("Snapshots exceed retention, but no metadata-only candidate is safe to prune automatically.");
  }

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    status: retention.candidates.length ? "manual_only" : retention.configured ? "ready" : "unavailable",
    actionEnabled: false,
    requiresConfirmation: true,
    confirmation: {
      requiredPhrase,
      accepted,
    },
    retention: {
      status: retentionStatus,
      configured: retention.retention,
      count: agent.lifecycle.snapshots.count,
      overflow: retention.overflow,
      storePath: agent.lifecycle.snapshots.storePath,
    },
    candidates: retention.candidates.map((item) => ({
      id: item.id,
      created: item.created,
      path: item.path,
      restoreMode: item.restoreMode,
      reason: item.reason,
    })),
    protected: retention.protectedRecords,
    warnings,
    errors,
  };
}

function readSnapshotJson(filePath: string): { json?: SnapshotJson; error?: string } {
  try {
    return { json: JSON.parse(readFileSync(filePath, "utf8")) as SnapshotJson };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function flattenJson(value: unknown, prefix = "", output = new Map<string, unknown>()) {
  if (Array.isArray(value)) {
    output.set(prefix, value.map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : item)).join("\n"));
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenJson(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }

  output.set(prefix, value);
  return output;
}

function isIgnoredSnapshotComparePath(pathKey: string) {
  return (
    pathKey === "snapshot_id" ||
    pathKey === "id" ||
    pathKey === "created_at" ||
    pathKey === "created" ||
    pathKey === "created_by" ||
    pathKey === "description" ||
    pathKey === "checks"
  );
}

function compareSnapshotJson(base: unknown, target: unknown): ControlCenterSnapshotCompare["differences"] {
  const baseMap = flattenJson(base);
  const targetMap = flattenJson(target);
  const paths = [...new Set([...baseMap.keys(), ...targetMap.keys()])].filter((pathKey) => !isIgnoredSnapshotComparePath(pathKey)).sort();
  const differences: ControlCenterSnapshotCompare["differences"] = [];

  for (const pathKey of paths) {
    const baseHas = baseMap.has(pathKey);
    const targetHas = targetMap.has(pathKey);
    if (!baseHas && targetHas) {
      differences.push({ path: pathKey, type: "added", target: targetMap.get(pathKey) });
      continue;
    }
    if (baseHas && !targetHas) {
      differences.push({ path: pathKey, type: "removed", base: baseMap.get(pathKey) });
      continue;
    }
    const baseValue = baseMap.get(pathKey);
    const targetValue = targetMap.get(pathKey);
    if (JSON.stringify(baseValue) !== JSON.stringify(targetValue)) differences.push({ path: pathKey, type: "changed", base: baseValue, target: targetValue });
  }

  return differences;
}

export async function getAgentSnapshotCompare(agentId: string, options: SnapshotCompareOptions = {}): Promise<ControlCenterSnapshotCompare | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  const base = findSnapshotItem(agent, options.base);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!base) errors.push("No base snapshot metadata is available for comparison");

  const baseJson = base ? readSnapshotJson(path.join(status.root, base.path)) : {};
  if (baseJson.error) errors.push(`${base?.path}: ${baseJson.error}`);

  let target: ControlCenterSnapshotCompare["target"] = { id: "draft", kind: "draft" };
  let targetJson: unknown = buildAgentSnapshotPlan(status, agent).draft;
  if (options.target && options.target !== "draft") {
    const targetItem = findSnapshotItem(agent, options.target);
    if (!targetItem) {
      errors.push(`Target snapshot not found: ${options.target}`);
    } else {
      const readTarget = readSnapshotJson(path.join(status.root, targetItem.path));
      if (readTarget.error) errors.push(`${targetItem.path}: ${readTarget.error}`);
      target = { id: targetItem.id, kind: "snapshot", path: targetItem.path };
      targetJson = readTarget.json;
    }
  }

  if (!targetJson) errors.push("Target snapshot draft is unavailable");

  const differences = errors.length || !baseJson.json || !targetJson ? [] : compareSnapshotJson(baseJson.json, targetJson);
  const changed = differences.filter((item) => item.type === "changed").length;
  const added = differences.filter((item) => item.type === "added").length;
  const removed = differences.filter((item) => item.type === "removed").length;

  if (!differences.length && !errors.length) warnings.push("No meaningful metadata drift detected.");

  return {
    ok: errors.length === 0,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    status: errors.length ? "unavailable" : "ready",
    actionEnabled: false,
    base: base ? { id: base.id, path: base.path } : undefined,
    target,
    ignoredFields: ["snapshot_id", "id", "created_at", "created", "created_by", "description", "checks"],
    differences,
    summary: {
      changed,
      added,
      removed,
    },
    errors,
    warnings,
  };
}

function validateSnapshotMetadataFile(root: string, agent: ControlCenterAgent, filePath: string): ControlCenterSnapshotValidation["files"][number] {
  const relative = relativePath(root, filePath);
  const { json, error } = readSnapshotJson(filePath);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!json) {
    return {
      path: relative,
      status: "invalid",
      errors: [error || "Invalid JSON"],
      warnings,
    };
  }

  if (json.schema_version !== SNAPSHOT_SCHEMA_VERSION) errors.push(`schema_version must be ${SNAPSHOT_SCHEMA_VERSION}`);
  if (!json.snapshot_id && !json.id) errors.push("snapshot_id is required");
  const legacyIdentity = agent.identity?.routeAliases.includes(json.agent_id || "")
    && json.agent_folder === projectRelativeAgentFolder(agent)
    && json.source_contract === agent.lifecycle.contract.path;
  if (json.agent_id !== agent.id && !legacyIdentity) errors.push(`agent_id must be ${agent.id}`);
  if (json.agent_name !== agent.name) errors.push(`agent_name must be ${agent.name}`);
  if (!json.created_at && !json.created) errors.push("created_at is required");
  if (json.source_profile !== agent.lifecycle.profile.path) errors.push(`source_profile must be ${agent.lifecycle.profile.path || "defined"}`);
  if (!json.source_contract) errors.push("source_contract is required");
  if (json.source_contract && !existsSync(path.join(root, json.source_contract))) warnings.push(`source_contract does not exist in Pritha: ${json.source_contract}`);
  if (!json.agent_folder) errors.push("agent_folder is required");
  if (json.restore?.requires_confirmation !== true) errors.push("restore.requires_confirmation must be true");
  if (json.restore?.overwrite_existing_folder !== false) errors.push("restore.overwrite_existing_folder must be false");
  if (!json.restore?.target) errors.push("restore.target is required");
  if (json.privacy?.secrets_included !== false) errors.push("privacy.secrets_included must be false");
  if (json.privacy?.private_memory_included !== false) errors.push("privacy.private_memory_included must be false");
  if (json.privacy?.runtime_queues_included !== false) errors.push("privacy.runtime_queues_included must be false");
  if (json.privacy?.logs_included !== false) errors.push("privacy.logs_included must be false");

  return {
    path: relative,
    status: errors.length ? "invalid" : "valid",
    snapshotId: json.snapshot_id || json.id,
    schemaVersion: json.schema_version,
    createdAt: json.created_at || json.created,
    errors,
    warnings,
  };
}

export async function getAgentSnapshotValidation(agentId: string): Promise<ControlCenterSnapshotValidation | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  const metadata = snapshotMetadataFiles(status.root, agent);
  if (!metadata.exists) {
    return {
      ok: true,
      generatedAt: status.generatedAt,
      agent: {
        id: agent.id,
        name: agent.name,
      },
      status: "unavailable",
      actionEnabled: false,
      valid: false,
      store: {
        path: metadata.storePath,
        exists: false,
        fileCount: 0,
      },
      files: [],
      errors: [],
      warnings: ["Snapshot metadata store is not present; there are no snapshot files to validate."],
    };
  }

  const files = metadata.files.map((filePath) => validateSnapshotMetadataFile(status.root, agent, filePath));
  const errors = files.flatMap((file) => file.errors.map((message) => `${file.path}: ${message}`));
  const warnings = [
    ...(files.length ? [] : ["Snapshot metadata store is empty."]),
    ...files.flatMap((file) => file.warnings.map((message) => `${file.path}: ${message}`)),
  ];

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    status: errors.length ? "failed" : "ready",
    actionEnabled: false,
    valid: errors.length === 0,
    store: {
      path: metadata.storePath,
      exists: true,
      fileCount: files.length,
    },
    files,
    errors,
    warnings,
  };
}

export async function getAgentRollbackPlan(agentId: string): Promise<ControlCenterRollbackPlan | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;
  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    status: agent.lifecycle.rollback.status,
    actionEnabled: false,
    requiresConfirmation: true,
    snapshots: agent.lifecycle.snapshots,
    reason: agent.lifecycle.rollback.reason,
  };
}

export async function getAgentPreRestoreContract(agentId: string, snapshotId?: string): Promise<ControlCenterPreRestoreContract | null> {
  const { status, agent } = await getControlCenterAgent(agentId);
  if (!agent) return null;

  const selectedSnapshot = findSnapshotItem(agent, snapshotId);
  const snapshotJson = selectedSnapshot ? readSnapshotJson(path.join(status.root, selectedSnapshot.path)).json : undefined;
  const validation = await getAgentSnapshotValidation(agentId);
  const audit = await getAgentSnapshotAudit(agentId, 20);
  const hasExplicitAudit = Boolean(audit?.entries.some((entry) => entry.source === "audit-log" && entry.target === selectedSnapshot?.path));
  const hasContentManifest = Boolean(snapshotJson?.contents?.includes);
  const hasContentHashes = Boolean(snapshotJson?.contents?.hashes);
  const restoreMode = selectedSnapshot?.restoreMode || snapshotJson?.restore?.mode;
  const requirements: ControlCenterPreRestoreContract["requirements"] = [
    {
      id: "snapshot-selected",
      label: "Snapshot selected",
      status: selectedSnapshot ? "pass" : "fail",
      detail: selectedSnapshot ? selectedSnapshot.path : "No snapshot metadata is available",
    },
    {
      id: "restore-mode",
      label: "Restore-capable mode",
      status: restoreMode && restoreMode !== "metadata-only" ? "pass" : "fail",
      detail: restoreMode || "No restore mode recorded",
    },
    {
      id: "validation",
      label: "Snapshot validation",
      status: validation?.valid ? "pass" : "fail",
      detail: validation?.valid ? "Snapshot metadata validation is clean" : validation?.errors[0] || validation?.warnings[0] || "Validation unavailable",
    },
    {
      id: "content-manifest",
      label: "Content manifest",
      status: hasContentManifest && hasContentHashes ? "pass" : "fail",
      detail: hasContentManifest
        ? hasContentHashes
          ? "Snapshot records content manifest and hashes"
          : "Snapshot records included paths but no byte-level content hashes"
        : "Metadata-only snapshot does not contain a restorable content manifest",
    },
    {
      id: "privacy",
      label: "Privacy exclusions",
      status:
        snapshotJson?.privacy?.secrets_included === false &&
        snapshotJson.privacy.private_memory_included === false &&
        snapshotJson.privacy.runtime_queues_included === false &&
        snapshotJson.privacy.logs_included === false
          ? "pass"
          : "fail",
      detail: "Secrets, private memory, queues and logs must be explicitly excluded",
    },
    {
      id: "overwrite-policy",
      label: "Overwrite policy",
      status: snapshotJson?.restore?.overwrite_existing_folder === false ? "pass" : "fail",
      detail: "Restore must not overwrite an existing child-agent folder automatically",
    },
    {
      id: "audit",
      label: "Operator audit",
      status: hasExplicitAudit ? "pass" : audit?.entries.length ? "warn" : "fail",
      detail: hasExplicitAudit ? "Explicit audit log entry exists for the selected snapshot" : "Only derived or missing audit evidence is available",
    },
  ];
  const blockers = requirements.filter((requirement) => requirement.status === "fail").map((requirement) => `${requirement.label}: ${requirement.detail}`);

  return {
    ok: true,
    generatedAt: status.generatedAt,
    agent: {
      id: agent.id,
      name: agent.name,
    },
    status: blockers.length ? "planned" : "manual_only",
    actionEnabled: false,
    restoreEnabled: false,
    selectedSnapshot: selectedSnapshot
      ? {
          id: selectedSnapshot.id,
          path: selectedSnapshot.path,
          restoreMode,
        }
      : undefined,
    requirements,
    confirmationGates: [
      {
        id: "prepare",
        phrase: `PREPARE RESTORE ${agent.id}`,
        status: "future",
      },
      {
        id: "execute",
        phrase: selectedSnapshot ? `RESTORE ${agent.id} FROM ${selectedSnapshot.id}` : `RESTORE ${agent.id} FROM <snapshot-id>`,
        status: "future",
      },
    ],
    blockers,
    warnings: [
      "This contract is read-only and does not create restore-capable snapshots.",
      "A restore executor, byte-level content manifest and operator approval flow are still required before restore can be enabled.",
    ],
  };
}

function moduleList(status: ControlCenterStatus): ControlCenterDiagnostics["modules"] {
  const stateRoot = resolvePrithaStateRoot(status.root);
  return [
    { id: "harness", label: "Harness", status: "ready" },
    { id: "memory", label: "Memory", status: existsSync(resolvePrithaStatePath("memory")) ? "ready" : "unavailable" },
    { id: "tools", label: "Tools", status: existsSync(path.join(status.root, "tools", "manifest.json")) ? "ready" : "unavailable" },
    { id: "interfaces", label: "Interfaces", status: "ready" },
    { id: "operations", label: "Operations", status: existsSync(path.join(status.root, "operations", "manifest.json")) ? "ready" : "unavailable" },
    { id: "voice", label: "Voice", status: status.voice.realtime },
    { id: "proactivity", label: "Proactivity", status: status.proactivity.status },
    { id: "connectors", label: "Connectors", status: "unavailable" },
  ];
}

function agentToRegistryRow(agent: ControlCenterAgent): ControlCenterDiagnostics["registry"][number] {
  return {
    id: agent.id,
    agent: agent.name,
    version: agent.version,
    versionSource: agent.versionSource,
    mission: agent.mission,
    interface: agent.interface,
    deployment: agent.deployment,
    status: agent.ui.state === "needs-check" ? "needs_check" : agent.ui.state,
    updated: agent.health.checkedUrl ? "checked now" : "not checked",
  };
}

function agentToFolderRow(agent: ControlCenterAgent): ControlCenterDiagnostics["folders"][number] {
  return {
    path: agent.folder.name ? `${agent.folder.name}/` : `${agent.id}/`,
    status: agent.folder.status === "missing" ? "not_found" : agent.operations.status === "ready" ? "ok" : "manifest_issue",
    updated: agent.health.status === "ok" ? "checked now" : undefined,
  };
}

export async function getControlCenterDiagnostics(): Promise<ControlCenterDiagnostics> {
  const status = await getControlCenterStatus();
  const stateRoot = resolvePrithaStateRoot(status.root);
  const voiceRuntime = getPrithaRealtimeStatus();
  const reports = status.latestReports.map((report) => ({
    path: report.path,
    title: report.title,
    updated: new Date(report.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    type: report.type as "self_test" | "evolution" | "audit" | "recovery" | "registry",
  }));

  return {
    status: controlCenterStatusForClient(status),
    modules: moduleList(status),
    registry: status.allRegistryAgents.map(agentToRegistryRow),
    folders: status.childAgents.map(agentToFolderRow),
    logs: [
      { time: new Date().toLocaleTimeString("en-US", { hour12: false }), level: "INFO", message: "Control Center diagnostics read completed" },
      { time: new Date().toLocaleTimeString("en-US", { hour12: false }), level: "INFO", message: `Registry agents: ${status.counts.registryAgents}; child agents: ${status.counts.childAgents}` },
      { time: new Date().toLocaleTimeString("en-US", { hour12: false }), level: status.warnings.length ? "WARN" : "INFO", message: status.warnings.length ? `${status.warnings.length} warnings detected` : "No read-only warnings detected" },
    ],
    warnings: status.warnings.length ? status.warnings : ["Cron adapter is not installed. Proactivity remains manual-only."],
    environment: {
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      node: process.version,
      appPort: APP_PORT,
      dataPath: stateRoot,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      git: "unavailable",
    },
    voiceDiagnostics: {
      connection: status.voice.realtime === "ready" ? "good" : "unknown",
      model: voiceRuntime.model,
      turnDetection: "semantic_vad",
      lastSession: "unknown",
    },
    memoryIndex: {
      status: existsSync(resolvePrithaStatePath("memory", "techscope.sqlite")) ? "up_to_date" : "unknown",
      documents: status.selfTest.memoryStats.documents,
      chunks: status.selfTest.memoryStats.chunks,
      lastUpdated: status.selfTest.createdAt ? status.selfTest.ageLabel : "unknown",
    },
    reports,
  };
}
