import { searchIntent } from "../../../../../scripts/search/intent.mjs";
import { neuralDeepRuntimeIdentity } from "../../../../../scripts/neuraldeep/runtime-identity.mjs";
import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { getCodexModelCatalog } from "@/lib/settings/codex-model-catalog-server";
import type { RuntimeCapabilityMap, RuntimeStatus, RuntimeProviderView } from "./types";

const MAX_COMMAND_OUTPUT = 2 * 1024 * 1024;
const PROBE_TTL_MS = 15_000;

export type ProviderProbe = {
  ok: boolean;
  provider: "neuraldeep";
  state: "available" | "rate_limited" | "unavailable" | "auth_required" | "billing_required" | "access_denied";
  statusCode: number | null;
  retryAfter: string | null;
  limits?: unknown;
};

export type CliTurnOptions = {
  model: string;
  effort: string | null;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  cwd: string;
  executionCodeRoot?: string;
  prompt: string;
  searchUserText?: string;
  searchOwner?: string;
  searchTurn?: string;
  resume: string | null;
  network: boolean;
  usageSource?: "codex-chat" | "agent-mother" | "child-agent";
  workloadId?: string;
  outputLastMessage?: string;
  additionalWritableDirs?: string[];
  images?: string[];
  attachmentManifest?: string;
  admission?: { attemptId: string; ownerToken: string };
};

const CAPABILITIES: RuntimeCapabilityMap = {
  fullChat: true,
  nativeHistory: false,
  listThreads: false,
  readThread: false,
  forkThread: false,
  archiveThread: false,
  unarchiveThread: false,
  renameThread: false,
  pinThread: false,
  steerTurn: false,
  interruptTurn: true,
  commandApprovals: false,
  fileChangeApprovals: false,
  permissionApprovals: false,
  requestUserInput: false,
  historyPagination: true,
  audioInput: false,
};

function processEnvironment(root: string) {
  const environment: NodeJS.ProcessEnv = { ...process.env, TECHSCOPE_ROOT: root };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  return environment;
}

async function runJsonCommand(root: string, command: "status" | "probe", timeoutMs = 15_000) {
  const runner = path.join(root, "scripts", "neuraldeep-codex.mjs");
  const args = command === "status" ? [runner, "status", "--json"] : [runner, "probe"];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: processEnvironment(root),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > MAX_COMMAND_OUTPUT) { child.kill("SIGKILL"); return; }
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));
  let payload: Record<string, unknown> | null = null;
  try { payload = JSON.parse(stdout) as Record<string, unknown>; } catch { /* handled below */ }
  return { ...result, payload, stderr };
}

export class NeuralDeepCliRuntime {
  readonly root = resolveTechscopeRoot();
  readonly stateRoot = resolvePrithaStateRoot(this.root);
  readonly runner = path.join(this.root, "scripts", "neuraldeep-codex.mjs");
  private probeCache: { expiresAt: number; value: ProviderProbe } | null = null;
  private probeInFlight: Promise<ProviderProbe> | null = null;
  private localStatusInFlight: ReturnType<typeof runJsonCommand> | null = null;
  private children = new WeakMap<ChildProcessWithoutNullStreams, { closed: boolean; stopping: boolean; timer: ReturnType<typeof setTimeout> | null }>();

  async probe(force = false): Promise<ProviderProbe> {
    // A refresh already in progress is newer than any cached observation.
    if (this.probeInFlight) return this.probeInFlight;
    if (!force && this.probeCache && Date.now() < this.probeCache.expiresAt) return this.probeCache.value;
    const pending = this.readProbe();
    this.probeInFlight = pending;
    try {
      const value = await pending;
      // An invalidated request must not replace a newer observation.
      if (this.probeInFlight === pending) this.probeCache = { expiresAt: Date.now() + PROBE_TTL_MS, value };
      return value;
    } finally {
      if (this.probeInFlight === pending) this.probeInFlight = null;
    }
  }

  private async readProbe(): Promise<ProviderProbe> {
    const result = await runJsonCommand(this.root, "probe").catch(() => null);
    const payload = result?.payload || {};
    const state = ["available", "rate_limited", "unavailable", "auth_required", "billing_required", "access_denied"].includes(String(payload.state))
      ? payload.state as ProviderProbe["state"]
      : "unavailable";
    const value: ProviderProbe = {
      ok: payload.ok === true && result?.code === 0,
      provider: "neuraldeep",
      state,
      statusCode: payload.statusCode == null
        ? null
        : Number.isSafeInteger(Number(payload.statusCode))
          ? Number(payload.statusCode)
          : null,
      retryAfter: typeof payload.retryAfter === "string" ? payload.retryAfter : null,
      ...(payload.limits !== undefined ? { limits: payload.limits } : {}),
    };
    return value;
  }

  invalidateProbe() {
    this.probeCache = null;
    this.probeInFlight = null;
  }

  private async localStatus() {
    // Share only overlapping reads; the next read still checks the live CLI.
    const pending = this.localStatusInFlight || runJsonCommand(this.root, "status");
    this.localStatusInFlight = pending;
    try {
      return await pending;
    } finally {
      if (this.localStatusInFlight === pending) this.localStatusInFlight = null;
    }
  }

  historyProvider(): RuntimeProviderView {
    return { providerId: "neuraldeep_cli", label: "NeuralDeep local history", availability: "ready", version: null,
      protocol: "exec_resume", locationLabel: "NeuralDeep Codex CLI", stateIdentityHash: neuralDeepRuntimeIdentity(this.stateRoot).stateIdentityHash,
      capabilities: { ...CAPABILITIES }, warning: null };
  }

  async status(selection: { model: string; effort: string | null }): Promise<RuntimeStatus> {
    const [local, provider, catalog] = await Promise.all([
      this.localStatus().catch(() => null),
      this.probe().catch(() => ({ ok: false, provider: "neuraldeep" as const, state: "unavailable" as const, statusCode: null, retryAfter: null })),
      getCodexModelCatalog(),
    ]);
    const localReady = local?.payload?.ok === true && local.code === 0;
    // Runtime readiness and upstream availability are deliberately separate: a healthy
    // local CLI accepts turns while NeuralDeep is down and the gateway queues them.
    const availability: "ready" | "degraded" | "unavailable" = localReady ? "ready" : "unavailable";
    const codexVersion = typeof local?.payload?.codexVersion === "string" ? local.payload.codexVersion : null;
    const providerView = {
      providerId: "neuraldeep_cli" as const,
      label: "NeuralDeep through isolated Codex CLI",
      availability,
      version: codexVersion,
      protocol: "exec_resume" as const,
      locationLabel: "NeuralDeep Codex CLI" as const,
      stateIdentityHash: neuralDeepRuntimeIdentity(this.stateRoot).stateIdentityHash,
      capabilities: { ...CAPABILITIES },
      warning: provider.state === "auth_required"
        ? "NeuralDeep credentials must be replaced in Settings."
        : provider.state === "billing_required"
          ? "The selected NeuralDeep request requires a compatible tariff or wallet balance."
          : provider.state === "access_denied"
            ? "NeuralDeep denied this request without identifying it as a credentials failure."
        : provider.ok
          ? null
          : "NeuralDeep is unavailable; new turns will wait without changing provider.",
      providerState: provider.state,
    };
    const selectedModel = catalog.models.find((model) => model.id === selection.model);
    return {
      preferredProvider: "neuraldeep_cli",
      effectiveProvider: localReady ? "neuraldeep_cli" : null,
      effectiveProtocol: localReady ? "exec_resume" : null,
      availability,
      fallbackEnabled: false,
      providers: [providerView],
      models: catalog.models.map((model) => ({
        id: model.id,
        label: model.label,
        effortIds: model.supportedReasoningEfforts.map((effort) => effort.id),
        serviceTierIds: [],
        defaultEffortId: model.defaultReasoningEffort,
      })),
      selected: {
        modelId: selectedModel?.id || selection.model,
        effortId: selection.effort,
        serviceTierId: null,
        sandboxMode: "workspace_write",
        approvalMode: "never",
      },
      probedAt: new Date().toISOString(),
      provider: "neuraldeep",
      providerState: provider.state,
    };
  }

  startTurn(options: CliTurnOptions): ChildProcessWithoutNullStreams {
    const args = [this.runner, "exec-json", "--model", options.model, "--sandbox", options.sandbox, "--cwd", options.cwd];
    if (options.effort && options.effort !== "none") args.push("--effort", options.effort);
    if (options.resume) args.push("--resume", options.resume);
    if (options.executionCodeRoot) args.push("--execution-code-root",options.executionCodeRoot);
    args.push("--network", options.network ? "enabled" : "disabled");
    args.push("--usage-source", options.usageSource || "codex-chat");
    if (options.workloadId) args.push("--workload-id", options.workloadId);
    if (options.outputLastMessage) args.push("--output-last-message", options.outputLastMessage);
    for (const directory of options.additionalWritableDirs || []) args.push("--add-dir", directory);
    for (const file of options.images || []) args.push("--image", file);
    if (options.attachmentManifest) args.push("--attachment-manifest", options.attachmentManifest);
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: { ...processEnvironment(this.root), PRITHA_SEARCH_INTENT:JSON.stringify(searchIntent(options.searchUserText||"")),PRITHA_SEARCH_OWNER:options.searchOwner||options.workloadId||"standalone",PRITHA_SEARCH_TURN:options.searchTurn||options.workloadId||"standalone", PRITHA_NEURALDEEP_ADMISSION_RECEIPT: options.admission ? JSON.stringify(options.admission) : "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lifecycle = { closed: false, stopping: false, timer: null as ReturnType<typeof setTimeout> | null };
    this.children.set(child,lifecycle);
    const closed = () => { lifecycle.closed = true; if (lifecycle.timer) clearTimeout(lifecycle.timer); };
    child.once("exit",closed); child.once("close",closed);
    child.stdin.on("error",() => { /* The runner records the owning process failure. */ });
    child.stdin.end(options.prompt);
    return child;
  }

  interrupt(child: ChildProcessWithoutNullStreams) {
    const lifecycle = this.children.get(child);
    if (!lifecycle || lifecycle.closed || lifecycle.stopping || child.exitCode !== null || child.signalCode !== null) return;
    lifecycle.stopping = true;
    child.kill("SIGTERM");
    lifecycle.timer = setTimeout(() => {
      if (!lifecycle.closed && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 5_000);
    lifecycle.timer.unref();
  }
}
