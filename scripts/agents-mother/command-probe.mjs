import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { resolvePrithaStatePathFrom, resolveTechscopeRoot } from "../lib/paths.mjs";
import { redactStructuredText, redactSensitiveText } from "../lib/redaction.mjs";
import { timeoutPolicy } from "../lib/timeout-policy.mjs";
import { readAgentCatalog, findCatalogAgent, readCatalogArtifact, readIdentityEvidence, readAgentOperationsManifest } from "./identity.mjs";
import { contractFingerprint } from "./contract.mjs";
import { LocalExecBackend, normalizeRequest } from "./execution-backends.mjs";
import { workspaceRevision } from "./workspace-revision.mjs";

const hash = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const active = new Set();
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function safeProjectPath(root, value) {
  if (typeof value !== "string" || path.isAbsolute(value) || value.includes("\\") || value.split("/").some(part => part === "..")) fail("probe_path_unsafe");
  let current = root;
  for (const part of value.split("/").filter(part => part && part !== ".")) {
    current = path.join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) fail("probe_path_symlink"); }
    catch (error) { if (error.code === "ENOENT") break; throw error; }
  }
  return current;
}

export function planAgentCommandProbe(target, options = {}) {
  const root = path.resolve(options.root || resolveTechscopeRoot());
  const purpose = options.purpose || "health";
  if (!["health", "test"].includes(purpose)) fail("probe_purpose_invalid");
  const timeoutMs = timeoutPolicy(purpose === "test" ? "childTest" : "healthCommand", { env: options.env || process.env, value: options.timeoutMs });
  const agent = findCatalogAgent(readAgentCatalog({ ...options, root, fresh: true }), target);
  if (!agent?.agentId || !agent.projectPath || agent.identityStatus === "conflict") fail("probe_agent_identity_unavailable");
  const contract = readCatalogArtifact(agent, agent.contractSource, { ...options, root });
  if (!/^status: accepted$/m.test(contract)) fail("probe_accepted_contract_required");
  const operation = readAgentOperationsManifest(agent);
  if (operation.issue) fail("probe_operations_manifest_invalid");
  const manifestPath = path.join(agent.projectPath, purpose === "test" ? "package.json" : operation.present ? "operations/manifest.json" : "interfaces/manifest.json");
  const text = readIdentityEvidence(manifestPath, agent.projectPath, 128_000);
  let manifest;
  try { manifest = JSON.parse(text); } catch { fail("probe_manifest_unavailable"); }
  if (purpose === "test" && (typeof manifest.scripts?.test !== "string" || !manifest.scripts.test.trim())) fail("probe_test_command_missing");
  if (purpose === "health" && !operation.present && manifest.schema !== "pritha-cli-interface-v1") fail("probe_healthcheck_argv_missing");
  const cwd = safeProjectPath(agent.projectPath, purpose === "test" ? "." : manifest.healthcheck_cwd || ".");
  // Approval locks the whole package (including pre/post hooks) and revision.
  const request = normalizeRequest({ argv: purpose === "test" ? ["npm", "test"] : manifest.healthcheck_argv, cwd, timeoutMs, outputBytesCap: 64_000 });
  if (redactSensitiveText(JSON.stringify(request.argv)) !== JSON.stringify(request.argv)) fail("probe_command_contains_sensitive_material");
  for (const [index, token] of request.argv.entries()) {
    if (index === 0 && path.isAbsolute(token)) {
      if (token.startsWith(`${agent.projectPath}/`)) safeProjectPath(agent.projectPath, path.relative(agent.projectPath, token));
      continue;
    }
    if (token.startsWith("-") || (!token.includes("/") && !existsSync(path.join(cwd, token)))) continue;
    // Path-shaped command arguments stay in the reviewed project. Inline
    // programs and URLs require a separate integration path, not this probe.
    safeProjectPath(cwd, token);
  }
  const plan = { schema: "pritha-agent-command-probe-v1", purpose, scope: purpose === "test" ? "child-engineering-tests-only" : "command-runnability-only", agentId: agent.agentId,
    instanceKey: agent.instanceKey, projectPath: agent.projectPath, contractFingerprint: contractFingerprint(contract),
    manifestPath, manifestHash: hash(text), argv: request.argv, cwd, timeoutMs, outputBytesCap: request.outputBytesCap,
    revision: workspaceRevision(agent.projectPath, { requireComplete: true }), isolation: "none", environment: "host-safe-allowlist" };
  return { ...plan, planLock: hash(plan), approvalRequired: true, executesCommands: false };
}

export async function runAgentCommandProbe(target, options = {}) {
  if (options.approvedBy !== "user" || !/^sha256:[a-f0-9]{64}$/.test(options.planLock || "")) fail("probe_explicit_plan_approval_required");
  const plan = planAgentCommandProbe(target, options);
  if (plan.planLock !== options.planLock) fail("probe_plan_changed");
  if (active.size >= 4 || active.has(plan.projectPath)) fail("probe_busy");
  active.add(plan.projectPath);
  try {
    const execution = await new LocalExecBackend().execute({ argv: plan.argv, cwd: plan.cwd, timeoutMs: plan.timeoutMs, outputBytesCap: plan.outputBytesCap });
    const unchanged = plan.purpose !== "test" || hash(workspaceRevision(plan.projectPath, { requireComplete: true })) === hash(plan.revision);
    const result = { schema: "pritha-agent-command-probe-result-v1", id: randomUUID(), at: new Date().toISOString(),
      agentId: plan.agentId, planLock: plan.planLock, scope: plan.scope,
      status: !unchanged ? "revision-changed" : execution.timedOut ? "timeout" : execution.exitCode === 0 ? "runnable" : "failed", execution };
    const root = path.resolve(options.root || resolveTechscopeRoot());
    const report = resolvePrithaStatePathFrom({ ...options, root }, "audit", "agent-probes", `${result.id}.json`);
    const safe = redactStructuredText(result, { ...options, root, projectRoot: plan.projectPath });
    mkdirSync(path.dirname(report), { recursive: true }); atomicWriteFile(report, `${JSON.stringify(safe, null, 2)}\n`);
    if (plan.purpose === "test") atomicWriteFile(path.join(path.dirname(report), `${plan.planLock.slice(7)}-test.json`), `${JSON.stringify(safe, null, 2)}\n`);
    return { ...safe, reportPath: report };
  } finally { active.delete(plan.projectPath); }
}

// A handoff/GET reads evidence; it never silently runs a project's npm hooks.
export function readAgentTestResult(target, options = {}) {
  try {
    const plan = planAgentCommandProbe(target, { ...options, purpose: "test" });
    const directory = resolvePrithaStatePathFrom(options, "audit", "agent-probes");
    const text = readIdentityEvidence(path.join(directory, `${plan.planLock.slice(7)}-test.json`), directory, 256_000);
    const saved = text ? JSON.parse(text) : null;
    if (saved?.planLock === plan.planLock && saved.agentId === plan.agentId && saved.scope === plan.scope) {
      return { status: saved.status === "runnable" ? "pass" : saved.status, planLock: plan.planLock, at: saved.at };
    }
    return { status: "not-run", planLock: plan.planLock, warning: "An exact reviewed test plan is required; this does not block handoff." };
  } catch (error) {
    return { status: error.code === "probe_test_command_missing" ? "missing" : "unavailable", warning: "Test command or exact project identity is unavailable; this does not block handoff." };
  }
}
