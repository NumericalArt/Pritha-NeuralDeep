#!/usr/bin/env node
import { readProviderCredential, storeProviderCredential } from "./lib/provider-credential.mjs";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { runSyncProbe } from "./lib/sync-probe.mjs";
import { appendFileSync, chmodSync, existsSync, mkdirSync, realpathSync, lstatSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { neuralDeepRuntimeIdentity } from "./neuraldeep/runtime-identity.mjs";
import { inspectNativeSession } from "./neuraldeep/native-history-proof.mjs";
import { loadAttachmentDispatch } from "./neuraldeep/attachment-transport.mjs";
import { readJsonlLines } from "./neuraldeep/jsonl-reader.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { atomicWriteFile } from "./lib/atomic-file.mjs";
import { closeNeuralDeepAdapter, listenNeuralDeepAdapter } from "./neuraldeep/responses-adapter.mjs";
import { loadNeuralDeepAccountSnapshot, billingContextForModel, sanitizeNeuralDeepLimits } from "./neuraldeep/account-snapshot.mjs";
import { classifyNeuralDeepProviderError } from "./neuraldeep/provider-error.mjs";
import { neuralDeepUsageKnown, recordNeuralDeepRun, summarizeNeuralDeepUsage } from "./neuraldeep/usage-ledger.mjs";
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "./neuraldeep/coordination-store.mjs";
import { spawnSupervisedCli } from "./neuraldeep/process-supervisor.mjs";
import { processSnapshot } from "./neuraldeep/process-snapshot.mjs";
import { acquireRuntimeAdmission } from "./neuraldeep/runtime-admission.mjs";
import { assertNeuralDeepDispatchAllowed } from "./neuraldeep/release-maintenance.mjs";

import { flattenSearchTools, restoreSearchToolsStream } from "./search/responses-bridge.mjs";
import { searchMcpConfig, searchMcpArgs, searchRuntimeContext } from "./search/runtime-config.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadPrithaRuntimeEnv({ root: PROJECT_ROOT });
const DEFAULT_STATE_ROOT = path.join(path.dirname(PROJECT_ROOT), `${path.basename(PROJECT_ROOT)}-state`, "main");
const DEFAULT_MODEL = "kimi-k2.6";
const DEFAULT_PORT = 17861;
const DEFAULT_KEYCHAIN_SERVICE = "pritha-neuraldeep";
const DEFAULT_UPSTREAM_ORIGIN = "https://api.neuraldeep.ru";
// The adapter may buffer a response for 930 seconds before forwarding it.
const STREAM_IDLE_TIMEOUT_MS = 960_000;
function tomlString(value) {
  return JSON.stringify(String(value));
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid adapter port: ${value}`);
  return port;
}

function safeModelId(value, fallback = DEFAULT_MODEL) {
  const model = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(model)) return fallback;
  return model;
}

function safeSandbox(value, fallback = "workspace-write") {
  return ["read-only", "workspace-write", "danger-full-access"].includes(String(value)) ? String(value) : fallback;
}

function safeReasoningEffort(value) {
  const effort = String(value || "").trim();
  if (!effort || effort === "none") return null;
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(effort)) throw new Error("invalid_reasoning_effort");
  return effort;
}

function safeMetadataId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id) ? id : null;
}

function loopbackHost(value) {
  const host = String(value || "127.0.0.1");
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("PRITHA_NEURALDEEP_ADAPTER_HOST must be a loopback host");
  }
  return host;
}

function upstreamOrigin(value) {
  const url = new URL(String(value || DEFAULT_UPSTREAM_ORIGIN));
  if (url.protocol !== "https:") throw new Error("NeuralDeep upstream must use HTTPS");
  return url.origin;
}

export function resolveNeuralDeepPaths(environment = process.env) {
  const stateRoot = path.resolve(environment.PRITHA_STATE_ROOT || DEFAULT_STATE_ROOT);
  const codexHome = path.resolve(environment.PRITHA_NEURALDEEP_CODEX_HOME || path.join(stateRoot, "codex-home"));
  return {
    projectRoot: PROJECT_ROOT,
    stateRoot,
    codexHome,
    configPath: path.join(codexHome, "config.toml"),
    provenancePath: path.join(stateRoot, "logs", "neuraldeep-runtime.jsonl"),
  };
}

export function neuralDeepRuntimeConfig(environment = process.env) {
  const paths = resolveNeuralDeepPaths(environment);
  return {
    ...paths,
    host: loopbackHost(environment.PRITHA_NEURALDEEP_ADAPTER_HOST),
    port: parsePort(environment.PRITHA_NEURALDEEP_ADAPTER_PORT || DEFAULT_PORT),
    model: safeModelId(environment.PRITHA_NEURALDEEP_MODEL),
    keychainService: environment.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE || DEFAULT_KEYCHAIN_SERVICE,
    codexBin: environment.PRITHA_CODEX_BIN || environment.CODEX_BIN || "codex",
    upstreamOrigin: upstreamOrigin(environment.PRITHA_NEURALDEEP_UPSTREAM_ORIGIN),
    instanceId: String(environment.PRITHA_INSTANCE_ID || "neuraldeep-main"),
  };
}

export function renderCodexConfig(runtime = neuralDeepRuntimeConfig(), options = {}) {
  const adapterPort = options.adapterPort || runtime.port;
  const baseUrl = `http://${runtime.host}:${adapterPort}/v1`;
  return [
    "# Generated by scripts/neuraldeep-codex.mjs. Do not add secrets here.",
    `model = ${tomlString(runtime.model)}`,
    'model_provider = "neuraldeep"',
    'approval_policy = "never"',
    'sandbox_mode = "workspace-write"',
    'default_permissions = ":workspace"',
    "check_for_update_on_startup = false",
    "project_doc_max_bytes = 65536",
    "",
    "[analytics]",
    "enabled = false",
    "",
    "[features]",
    "remote_plugin = false",
    "plugins = false",
    "plugin_sharing = false",
    "apps = false",
    "",
    "[otel]",
    'exporter = "none"',
    "log_user_prompt = false",
    "",
    "[model_providers.neuraldeep]",
    'name = "NeuralDeep via Pritha adapter"',
    `base_url = ${tomlString(baseUrl)}`,
    'wire_api = "responses"',
    "request_max_retries = 0",
    "stream_max_retries = 0",
    `stream_idle_timeout_ms = ${STREAM_IDLE_TIMEOUT_MS}`,
    "supports_websockets = false",
    "",
    "[model_providers.neuraldeep.auth]",
    `command = ${tomlString(process.execPath)}`,
    `args = [${tomlString(path.join(PROJECT_ROOT, "scripts", "neuraldeep-credential.mjs"))}, ${tomlString(runtime.keychainService)}]`,
    "timeout_ms = 5000",
    "refresh_interval_ms = 0",
    "",
    searchMcpConfig(runtime.projectRoot),
    `[projects.${tomlString(runtime.projectRoot)}]`,
    'trust_level = "trusted"',
    "",
  ].join("\n");
}

export function setupNeuralDeepCodex(environment = process.env) {
  const runtime = neuralDeepRuntimeConfig(environment);
  mkdirSync(runtime.stateRoot, { recursive: true, mode: 0o700 });
  mkdirSync(runtime.codexHome, { recursive: true, mode: 0o700 });
  chmodSync(runtime.stateRoot, 0o700);
  chmodSync(runtime.codexHome, 0o700);
  atomicWriteFile(runtime.configPath, renderCodexConfig(runtime));
  chmodSync(runtime.configPath, 0o600);
  return runtime;
}

export function readNeuralDeepCredential(service = DEFAULT_KEYCHAIN_SERVICE) { return readProviderCredential(service); }
export function keychainHasCredential(service = DEFAULT_KEYCHAIN_SERVICE) { return Boolean(readNeuralDeepCredential(service)); }
export async function saveNeuralDeepCredential(value, options = {}) { return storeProviderCredential(value, options); }

function codexVersion(codexBin) {
  const result = runSyncProbe(codexBin, ["--version"], { encoding: "utf8", timeout: 5_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function sanitizedCodexEnvironment(runtime, environment = process.env, executionCodeRoot = null) {
  const childEnvironment = { ...environment };
  for (const key of Object.keys(childEnvironment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete childEnvironment[key];
  }
  childEnvironment.CODEX_HOME = runtime.codexHome;
  delete childEnvironment.PRITHA_NEURALDEEP_ADMISSION_RECEIPT;
  childEnvironment.TECHSCOPE_ROOT = executionCodeRoot || runtime.projectRoot;
  childEnvironment.PRITHA_STATE_ROOT = runtime.stateRoot;
  childEnvironment.PRITHA_INSTANCE_ID = runtime.instanceId;
  childEnvironment.NO_PROXY = childEnvironment.NO_PROXY || "127.0.0.1,localhost";
  childEnvironment.no_proxy = childEnvironment.no_proxy || childEnvironment.NO_PROXY;
  return childEnvironment;
}

function appendProvenance(runtime, event, { includeCodexVersion = true } = {}) {
  mkdirSync(path.dirname(runtime.provenancePath), { recursive: true, mode: 0o700 });
  appendFileSync(runtime.provenancePath, `${JSON.stringify({
    schema: "pritha-neuraldeep-runtime-provenance-v1",
    timestamp: new Date().toISOString(),
    provider: "neuraldeep",
    upstream: runtime.upstreamOrigin,
    codex_version: includeCodexVersion ? codexVersion(runtime.codexBin) : undefined,
    instance_id: runtime.instanceId,
    ...event,
  })}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(runtime.provenancePath, 0o600);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function runtimeConfigArgs(runtime, adapterPort) {
  return [
    "-c", `model_provider=${tomlString("neuraldeep")}`,
    "-c", `model_providers.neuraldeep.base_url=${tomlString(`http://${runtime.host}:${adapterPort}/v1`)}`,
    "-c", "model_providers.neuraldeep.request_max_retries=0",
    "-c", "model_providers.neuraldeep.stream_max_retries=0",
    "-c", `model_providers.neuraldeep.stream_idle_timeout_ms=${STREAM_IDLE_TIMEOUT_MS}`,
    "-c", "analytics.enabled=false",
    "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
    "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=false",
    "--disable", "remote_plugin",
    "--disable", "plugins",
    "--disable", "plugin_sharing",
    "--disable", "apps",
  ];
}

function injectRuntimeArgs(args, runtime, adapterPort) {
  if (args.some(value => /^(?:-c|--config=)?model_providers?(?:[.=]|$)/.test(String(value)))) throw new Error("neuraldeep_provider_override_forbidden");
  const next = [...args];
  const insertion = next[0] === "exec" && next[1] === "resume" ? 2 : next[0] === "exec" ? 1 : 0;
  next.splice(insertion, 0, ...runtimeConfigArgs(runtime, adapterPort));
  return next;
}

export function buildCodexExecArgs(options = {}) {
  const model = safeModelId(options.model);
  const sandbox = safeSandbox(options.sandbox);
  const cwd = path.resolve(options.cwd || PROJECT_ROOT);
  const common = ["--json", "--strict-config", "--skip-git-repo-check", "-m", model];
  if (options.images !== undefined && (!Array.isArray(options.images) || options.images.length > 10 || options.images.some(file => typeof file !== "string" || !file || file.includes("\0")))) throw new Error("invalid_codex_images");
  for (const file of options.images || []) common.push("--image", path.resolve(file));
  const effort = safeReasoningEffort(options.effort);
  if (effort) common.push("-c", `model_reasoning_effort=${tomlString(effort)}`);
  if (options.outputSchema) common.push("--output-schema", path.resolve(options.outputSchema));
  if (options.outputLastMessage) common.push("-o", path.resolve(options.outputLastMessage));
  if (options.network !== undefined) {
    const network = options.network === true || options.network === "enabled";
    if (sandbox === "read-only" && network) throw new Error("network_requires_workspace_write_sandbox");
    if (sandbox === "danger-full-access" && !network) throw new Error("network_cannot_be_disabled_in_danger_full_access");
    if (sandbox === "workspace-write") common.push("-c", `sandbox_workspace_write.network_access=${network ? "true" : "false"}`);
  }
  if (options.addDirs!==undefined && (!Array.isArray(options.addDirs) || options.addDirs.length>16 || options.addDirs.some(value=>typeof value!=="string" || !value || value.includes("\0"))))throw new Error("execution_writable_roots_invalid");
  if (sandbox === "workspace-write") common.push("-c",`sandbox_workspace_write.writable_roots=${JSON.stringify([cwd,...(options.addDirs || []).map(value=>path.resolve(value))])}`);
  if (options.ephemeral) common.push("--ephemeral");
  if (options.resume) {
    const sessionId = String(options.resume);
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(sessionId)) throw new Error("invalid_codex_session_id");
    return ["exec", "resume", ...common, "-c", `sandbox_mode=${tomlString(sandbox)}`, sessionId, "-"];
  }
  return [
    "exec",
    ...common,
    "--color", "never",
    "-s", sandbox,
    "-C", cwd,
    ...(Array.isArray(options.addDirs) ? options.addDirs.flatMap((directory) => ["--add-dir", path.resolve(directory)]) : []),
    "-",
  ];
}

export async function runCodexWithNeuralDeep(runtime, codexArgs, options = {}) {
  assertNeuralDeepDispatchAllowed(runtime.stateRoot);
  if(options.executionCodeRoot && ![path.resolve(runtime.projectRoot),path.resolve(options.cwd || runtime.projectRoot)].includes(path.resolve(options.executionCodeRoot)))throw new Error("execution_code_root_unverified");
  const runId = options.runId || `nd_${randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(runId)) throw new Error("neuraldeep_run_id_invalid");
  const journal = new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(runtime.stateRoot, runtime.projectRoot));
  let admission;
  let server;
  let spawned = false;
  let processExited = false;
  let adapterClosed = false;
  let processEvidence = null;
  let outcome = "failed";
  let attachmentDispatch;
  let receiptCreated = false;
  try {
  attachmentDispatch = loadAttachmentDispatch(runtime, options);
  if(options.resume) {
    const identity=neuralDeepRuntimeIdentity(runtime.stateRoot,{PRITHA_NEURALDEEP_CODEX_HOME:runtime.codexHome,PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:runtime.upstreamOrigin});
    const proof=inspectNativeSession({providerId:"neuraldeep_cli",nativeThreadId:options.resume,stateIdentityHash:identity.stateIdentityHash,profileIdentity:identity.profileIdentity,workspacePath:path.resolve(options.cwd || runtime.projectRoot)},
      {stateRoot:runtime.stateRoot,codeRoot:runtime.projectRoot,env:{PRITHA_NEURALDEEP_CODEX_HOME:runtime.codexHome,PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:runtime.upstreamOrigin}});
    if(!proof.available)throw new Error(proof.code);
  }
  const worker = processSnapshot().find(row => row.pid === process.pid);
  if (!worker) throw new Error("process_worker_identity_unavailable");
  journal.beginRuntimeRun({ runId,
    requestHash: createHash("sha256").update(JSON.stringify([codexArgs, options.input ?? null, options.cwd || runtime.projectRoot, options.model || runtime.model])).digest("hex"),
    receipt: { model: options.model || runtime.model, provider: "neuraldeep", workload_id: safeMetadataId(options.workloadId),
      resumed_session: options.resume || null, worker_pid: process.pid, worker_started: worker.started,
      process_protocol: 1, dispatch_authorized: false, process_exited: false, usage_ledger_recorded: false } });
  receiptCreated = true;
  const temporaryParent=path.join(runtime.stateRoot,"tmp","neuraldeep-runs");
  for(const directory of [runtime.stateRoot,path.dirname(temporaryParent),temporaryParent]) {
    if(existsSync(directory) && (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()))throw new Error("runtime_temporary_root_unverified");
    mkdirSync(directory,{recursive:true,mode:0o700});
  }
  const temporaryPath=path.join(temporaryParent,runId);
  mkdirSync(temporaryPath,{mode:0o700});
  journal.updateRuntimeRun(runId,{temporary_path:temporaryPath});
  admission = await acquireRuntimeAdmission(journal, runtime, options, runId, async () => {
    const account = await loadNeuralDeepAccountSnapshot({ stateRoot: runtime.stateRoot,
      token: readNeuralDeepCredential(runtime.keychainService), apiOrigin: runtime.upstreamOrigin });
    return account.sections?.limits?.stale === false ? account.limits?.parallelLimit : null;
  });
  let providerRequests = 0;
  let providerError = null;
  server = await listenNeuralDeepAdapter({ host: runtime.host, port: 0,
    transformResponsesRequest: flattenSearchTools, transformResponsesStream: restoreSearchToolsStream,
    upstreamOrigin: runtime.upstreamOrigin,
    validateResponsesRequest: async payload => { await attachmentDispatch?.validate(payload); await options.validateResponsesRequest?.(payload); },
    beforeResponsesDispatch: ({ requestHash, model, bytes }) => {
      providerRequests = journal.claimProviderRequest(runId, requestHash, { model, bytes });
    },
    onRequest: (requestEvent) => {
      if (requestEvent.path === "/v1/responses") {
        try {
          appendProvenance(runtime, { event: "provider_request_finished", run_id: runId,
            request_hash: requestEvent.requestHash, status: requestEvent.status, duration_ms: requestEvent.durationMs,
            timings: requestEvent.timings, error_code: requestEvent.error?.code || null,
          }, { includeCodexVersion: false });
        } catch {
          // Diagnostics must not turn a received provider response into a failed request.
          process.stderr.write("NeuralDeep request timing log unavailable.\n");
        }
      }
      if (requestEvent.error) {
        providerError = requestEvent.error;
        if (options.emitProviderEvents === true && options.passthrough !== "inherit") {
          process.stdout.write(`${JSON.stringify({ type: "pritha.provider_error", error: requestEvent.error })}\n`);
        }
      }
      options.onProviderRequest?.(requestEvent);
    },
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeNeuralDeepAdapter(server);
    throw new Error("neuraldeep_adapter_address_unavailable");
  }
  const args = injectRuntimeArgs(codexArgs, runtime, address.port);
  const searchInsert = args[0] === "exec" && args[1] === "resume" ? 2 : args[0] === "exec" ? 1 : 0;
  args.splice(searchInsert, 0, ...searchMcpArgs(runtime.projectRoot));
  const startedAt = new Date().toISOString();
  const selectedModel = options.model || runtime.model;
  const usageSource = ["codex-chat", "agent-mother", "child-agent", "embeddings"].includes(options.usageSource)
    ? options.usageSource
    : "unmetered";
  const workloadId = safeMetadataId(options.workloadId);
  const billingPromise = (async () => {
    try {
      const snapshot = await loadNeuralDeepAccountSnapshot({
        stateRoot: runtime.stateRoot,
        token: readNeuralDeepCredential(runtime.keychainService),
        apiOrigin: runtime.upstreamOrigin,
      });
      return billingContextForModel(snapshot, selectedModel);
    } catch {
      return { mode: "unknown", tier: null, price: null, capturedAt: new Date().toISOString() };
    }
  })();
  appendProvenance(runtime, {
    event: "run_started",
    run_id: runId,
    model: selectedModel,
    usage_source: usageSource,
    workload_id: workloadId,
    sandbox: options.sandbox || null,
    cwd: options.cwd ? path.relative(runtime.projectRoot, path.resolve(options.cwd)) || "." : ".",
    adapter: `http://${runtime.host}:${address.port}`,
    resumed_session: options.resume || null,
    ephemeral: options.ephemeral === true,
  });

  const owned = await spawnSupervisedCli(runtime.codexBin, args, {
    cwd: path.resolve(options.cwd || runtime.projectRoot),
    env: {...sanitizedCodexEnvironment(runtime,process.env,options.executionCodeRoot),TMPDIR:temporaryPath,TMP:temporaryPath,TEMP:temporaryPath,PRITHA_STATE_ROOT:runtime.stateRoot,PRITHA_SEARCH_CODE_ROOT:runtime.projectRoot,PRITHA_SEARCH_CONTEXT:JSON.stringify(searchRuntimeContext({...options,model:selectedModel},runId))},
    inherit: options.passthrough === "inherit",
    beforeStart: evidence => {
      journal.updateRuntimeRun(runId, { status: "running", process_evidence: evidence, child_pid: evidence.session,
        started_at: startedAt, dispatch_authorized: true });
      processEvidence = evidence;
      spawned = true;
    },
    onEvidence: evidence => { journal.updateRuntimeRun(runId, { process_evidence: evidence }); processEvidence = evidence; },
  });
  const child = owned.child;
  let sessionId = options.resume || null;
  let latestUsage = null;
  let stderrTail = "";
  let launchError = null;
  let stdoutWork = Promise.resolve(); let stderrWork = Promise.resolve();
  const forwardChunk = (destination, chunk) => new Promise((resolve, reject) => destination.write(chunk, error => error ? reject(error) : resolve()));
  if (options.passthrough !== "inherit") {
    child.stdin.on("error", (error) => { stderrTail = `${stderrTail}\n${error.message}`.slice(-4_000); });
    stdoutWork = (async () => {
      for await (const line of readJsonlLines(child.stdout, { onChunk: chunk => forwardChunk(process.stdout, chunk) })) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event?.type === "thread.started" && event.thread_id) {
          sessionId = String(event.thread_id);
          admission.bindSession(sessionId);
        }
        if (event?.type === "turn.completed" && event.usage) latestUsage = event.usage;
        await options.onEvent?.(event);
      }
    })().catch(error => { launchError ||= error; owned.stop(); });
    stderrWork = (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of child.stderr) {
        stderrTail = `${stderrTail}${decoder.decode(chunk, { stream: true })}`.slice(-4000);
        await forwardChunk(process.stderr, chunk);
      }
      stderrTail = `${stderrTail}${decoder.decode()}`.slice(-4000);
    })().catch(error => { launchError ||= error; owned.stop(); });
    if (options.input !== undefined) child.stdin.end(options.input);
    else process.stdin.pipe(child.stdin);
  }

  const forwardSignal = (signal) => owned.stop(signal);
  const forwardSigint = () => forwardSignal("SIGINT");
  const forwardSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", forwardSigint);
  process.once("SIGTERM", forwardSigterm);
  let result;
  try {
    if (options.emitProviderEvents === true && options.passthrough !== "inherit") {
      process.stdout.write(`${JSON.stringify({ type: "pritha.run_started", run_id: runId })}\n`);
    }
    result = await owned.completion;
    processExited = result.processTreeExited;
    processEvidence = result.evidence;
    if (result.error) launchError ||= Object.assign(new Error(result.error), { code: result.launchErrorCode || result.error });
    if (!processExited) launchError ||= new Error("admission_runtime_exit_unconfirmed");
  } finally {
    process.off("SIGINT", forwardSigint);
    process.off("SIGTERM", forwardSigterm);
    await Promise.all([stdoutWork, stderrWork]);
    await closeNeuralDeepAdapter(server);
    adapterClosed = true;
  }
  appendProvenance(runtime, {
    event: "run_finished",
    run_id: runId,
    model: selectedModel,
    session_id: sessionId,
    exit_code: result.code,
    signal: result.signal,
    error_class: launchError
      ? "runtime_launch_failed"
      : result.code === 0
        ? null
        : /429|rate.?limit/i.test(stderrTail)
          ? "provider_rate_limited"
          : "runtime_failed",
    launch_error_code: launchError && typeof launchError === "object" && "code" in launchError
      ? String(launchError.code || "unknown")
      : null,
    process_snapshot_failure: processEvidence?.snapshotFailure || null,
    started_at: startedAt,
  });
  let usageRecord = null;
  outcome = launchError ? "failed" : result.signal ? "cancelled" : result.code === 0 ? "completed" : "failed";
  const usageEvent = {
    profileIdentity: neuralDeepRuntimeIdentity(runtime.stateRoot, { PRITHA_NEURALDEEP_CODEX_HOME: runtime.codexHome, PRITHA_NEURALDEEP_UPSTREAM_ORIGIN: runtime.upstreamOrigin }).profileIdentity,
    stateRoot: runtime.stateRoot, runId, source: usageSource, workloadId, model: selectedModel, sessionId,
    status: outcome === "cancelled" ? "interrupted" : outcome,
    startedAt, finishedAt: new Date().toISOString(), providerRequests,
    usage: latestUsage, usageKnown: neuralDeepUsageKnown(latestUsage), cumulative: true, billing: await billingPromise,
    providerError: providerError ? { class: providerError.class, code: providerError.code } : null,
  };
  journal.updateRuntimeRun(runId, { status: processExited ? usageEvent.status : "resume_confirmation_required", session_id: sessionId,
    process_exited: processExited && adapterClosed, process_tree_exited: processExited, adapter_closed: adapterClosed, process_evidence: processEvidence,
    exit_code: result.code, signal: result.signal, supervisor_error: result.error || null,
    usage_status: usageEvent.usageKnown ? "measured" : "unknown", usage_event: usageEvent });
  try {
    usageRecord = recordNeuralDeepRun(usageEvent);
    journal.updateRuntimeRun(runId, { usage_ledger_recorded: true, usage_record: usageRecord });
  } catch {
    // The durable usage event remains available for an idempotent accounting retry.
    journal.updateRuntimeRun(runId, { usage_ledger_recorded: false, accounting_error: "usage_ledger_write_failed" });
  }
  if (options.emitProviderEvents === true && options.passthrough !== "inherit") {
    process.stdout.write(`${JSON.stringify({ type: "pritha.run_finished", run_id: runId, session_id: sessionId,
      process_exited: processExited && adapterClosed, usage_ledger_recorded: Boolean(usageRecord), usage_known: usageRecord?.usageKnown === true,
      usage: usageRecord?.usage || null })}\n`);
  }
  if (launchError) throw launchError;
  return { ...result, runId, sessionId, child, usageRecord, providerError };
  } finally {
    try {
      if (server) await closeNeuralDeepAdapter(server);
      if (receiptCreated && !spawned) journal.updateRuntimeRun(runId, {
        status: "failed", process_exited: true, process_tree_exited: true, adapter_closed: true, exit_evidence: "no_stock_dispatch",
      });
      if (!spawned || processExited) admission?.finish(outcome);
    } finally { attachmentDispatch?.close(); journal.close(); }
  }
}

export async function neuralDeepApiRequest(requestPath, runtime = neuralDeepRuntimeConfig(), options = {}) {
  const token = options.token || readNeuralDeepCredential(runtime.keychainService);
  if (!token) throw new Error("neuraldeep_key_missing");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10_000);
  try {
    const response = await (options.fetchImpl || globalThis.fetch)(new URL(requestPath, `${runtime.upstreamOrigin}/v1/`), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(`neuraldeep_http_${response.status}`);
      error.statusCode = response.status;
      error.retryAfter = response.headers.get("retry-after");
      error.providerError = classifyNeuralDeepProviderError({
        status: response.status,
        payload,
        retryAfter: error.retryAfter,
      });
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function serve(runtime) {
  const server = await listenNeuralDeepAdapter({
    host: runtime.host,
    port: runtime.port,
    upstreamOrigin: runtime.upstreamOrigin,
    onRequest: ({ method, path: requestPath, status, durationMs, timings }) => {
      console.error(`${method} ${requestPath} ${status} ${durationMs}ms ${JSON.stringify(timings)}`);
    },
  });
  console.error(`NeuralDeep adapter: http://${runtime.host}:${runtime.port}`);
  console.error("Остановить: Ctrl+C");
  const stop = async () => {
    await closeNeuralDeepAdapter(server);
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function parseExecJsonOptions(args) {
  const options = { add_dirs: [], images: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--ephemeral") options.ephemeral = true;
    else if (["--model", "--effort", "--sandbox", "--cwd", "--resume", "--output-schema", "--output-last-message", "--network", "--add-dir", "--usage-source", "--workload-id", "--run-id", "--image", "--attachment-manifest", "--execution-code-root"].includes(flag)) {
      const value = args[index + 1];
      if (!value) throw new Error(`Missing value for ${flag}`);
      if (flag === "--add-dir") options.add_dirs.push(value);
      else if (flag === "--image") options.images.push(value);
      else options[flag.slice(2).replaceAll("-", "_")] = value;
      index += 1;
    } else throw new Error(`Unknown exec-json option: ${flag}`);
  }
  return {
    runId: options.run_id,
    model: options.model,
    effort: options.effort,
    sandbox: options.sandbox,
    cwd: options.cwd,
    executionCodeRoot: options.execution_code_root,
    resume: options.resume,
    outputSchema: options.output_schema,
    outputLastMessage: options.output_last_message,
    network: options.network,
    addDirs: options.add_dirs,
    images: options.images,
    attachmentManifest: options.attachment_manifest,
    ephemeral: options.ephemeral === true,
    usageSource: options.usage_source,
    workloadId: options.workload_id,
  };
}

function printStatus(runtime, asJson = false) {
  const status = {
    ok: Boolean(codexVersion(runtime.codexBin) && keychainHasCredential(runtime.keychainService)),
    provider: "neuraldeep",
    model: runtime.model,
    codexVersion: codexVersion(runtime.codexBin),
    keychainConfigured: keychainHasCredential(runtime.keychainService),
    configReady: existsSync(runtime.configPath),
    instanceId: runtime.instanceId,
  };
  if (asJson) console.log(JSON.stringify(status));
  else {
    console.log(`Provider: ${status.provider}`);
    console.log(`Model: ${status.model}`);
    console.log(`Codex: ${status.codexVersion || "NOT FOUND"}`);
    console.log(`Keychain (${runtime.keychainService}): ${status.keychainConfigured ? "OK" : "NOT FOUND"}`);
    console.log(`Config: ${status.configReady ? "OK" : "NOT FOUND"}`);
  }
  if (!status.ok) process.exitCode = 1;
}

function usage() {
  console.log(`Usage:
  node scripts/neuraldeep-codex.mjs setup
  node scripts/neuraldeep-codex.mjs status [--json]
  node scripts/neuraldeep-codex.mjs models [--json]
  node scripts/neuraldeep-codex.mjs limits [--json]
  node scripts/neuraldeep-codex.mjs account
  node scripts/neuraldeep-codex.mjs usage-summary --range 24h|7d|30d
  node scripts/neuraldeep-codex.mjs probe
  node scripts/neuraldeep-codex.mjs credential-save
  node scripts/neuraldeep-codex.mjs serve
  node scripts/neuraldeep-codex.mjs exec-json [--model ID] [--effort EFFORT] [--sandbox MODE] [--cwd DIR] [--resume SESSION] [--ephemeral] [--network enabled|disabled] [--add-dir DIR] [--usage-source SOURCE] [--workload-id ID] [--output-last-message FILE]
  node scripts/neuraldeep-codex.mjs run -- [codex arguments]

Prompts and credentials are read from stdin so they do not appear in the process list.
`);
}

async function main() {
  const [command = "status", ...rest] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    usage();
    return;
  }
  let runtime = neuralDeepRuntimeConfig();
  if (command === "setup" || (["exec-json", "run", "serve"].includes(command) && !existsSync(runtime.configPath))) runtime = setupNeuralDeepCodex();
  if (command === "setup") {
    console.log(`NeuralDeep Codex config created: ${runtime.configPath}`);
  } else if (command === "status") {
    printStatus(runtime, rest.includes("--json"));
  } else if (command === "models" || command === "limits") {
    const payload = await neuralDeepApiRequest(command, runtime);
    console.log(JSON.stringify(payload));
  } else if (command === "account") {
    const snapshot = await loadNeuralDeepAccountSnapshot({
      stateRoot: runtime.stateRoot,
      token: readNeuralDeepCredential(runtime.keychainService),
      apiOrigin: runtime.upstreamOrigin,
    });
    console.log(JSON.stringify(snapshot));
  } else if (command === "usage-summary") {
    const rangeIndex = rest.indexOf("--range");
    const range = rangeIndex >= 0 ? rest[rangeIndex + 1] : "24h";
    console.log(JSON.stringify(summarizeNeuralDeepUsage({ stateRoot: runtime.stateRoot, range })));
  } else if (command === "probe") {
    try {
      const limits = await neuralDeepApiRequest("limits", runtime);
      const safeLimits = sanitizeNeuralDeepLimits(limits);
      const publicLimits = {
        tier: safeLimits.tier,
        decision: {
          scope: safeLimits.decision.scope,
          can_request: safeLimits.decision.canRequest,
          retry_after_sec: safeLimits.decision.retryAfterSec,
          blocker_count: safeLimits.decision.blockerCount,
          blocker_codes: safeLimits.decision.blockerCodes,
        },
        parallel_limit: safeLimits.parallelLimit,
        observed_at: safeLimits.observedAt,
      };
      if (publicLimits.decision.can_request === false) {
        const billingBlocked = publicLimits.decision.blocker_codes.some((code) => /(wallet|balance|billing|payment|entitlement|subscription|plan|tariff|credit|fund)/i.test(code));
        console.log(JSON.stringify({
          ok: false,
          provider: "neuraldeep",
          state: billingBlocked ? "billing_required" : "rate_limited",
          statusCode: billingBlocked ? 403 : 429,
          retryAfter: publicLimits.decision.retry_after_sec == null ? null : String(publicLimits.decision.retry_after_sec),
          limits: publicLimits,
        }));
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify({ ok: true, provider: "neuraldeep", state: "available", limits: publicLimits }));
      }
    } catch (error) {
      const statusCode = Number(error?.statusCode) || null;
      const classified = error?.providerError || classifyNeuralDeepProviderError({ status: statusCode, retryAfter: error?.retryAfter });
      const state = classified.class === "credentials"
        ? "auth_required"
        : classified.class === "billing"
          ? "billing_required"
          : classified.class === "access_denied"
            ? "access_denied"
            : statusCode === 429
          ? "rate_limited"
          : "unavailable";
      console.log(JSON.stringify({
        ok: false,
        provider: "neuraldeep",
        state,
        statusCode,
        retryAfter: error?.retryAfter || null,
        error: classified,
      }));
      process.exitCode = 1;
    }
  } else if (command === "credential-save") {
    await saveNeuralDeepCredential(await readStdin(), { service: runtime.keychainService });
    console.log(JSON.stringify({ ok: true, configured: true }));
  } else if (command === "serve") {
    await serve(runtime);
  } else if (command === "exec-json") {
    const options = parseExecJsonOptions(rest);
    const input = await readStdin();
    const args = buildCodexExecArgs({ ...options, model: options.model || runtime.model });
    const result = await runCodexWithNeuralDeep(runtime, args, { ...options, model: options.model || runtime.model, input, emitProviderEvents: true });
    if (result.signal) process.kill(process.pid, result.signal);
    else process.exitCode = result.code ?? 1;
  } else if (command === "run") {
    const codexArgs = rest[0] === "--" ? rest.slice(1) : rest;
    const result = await runCodexWithNeuralDeep(runtime, codexArgs, { passthrough: "inherit", model: runtime.model });
    if (result.signal) process.kill(process.pid, result.signal);
    else process.exitCode = result.code ?? 1;
  } else {
    usage();
    process.exitCode = 2;
  }
}

// Node canonicalizes import.meta.url; argv can still use /tmp or another symlink.
const isMain = process.argv[1] && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
