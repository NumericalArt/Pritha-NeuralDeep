// Shared host policies. Callers may select a class, never an unbounded timeout.
const TIMEOUT_POLICIES = Object.freeze({
  childTest: Object.freeze({ defaultMs: 120_000, minMs: 50, maxMs: 900_000, env: "PRITHA_CHILD_TEST_TIMEOUT_MS" }),
  releaseReady: Object.freeze({ defaultMs: 45_000, minMs: 100, maxMs: 300_000, env: "PRITHA_UPDATE_HEALTH_TIMEOUT_MS" }),
  releaseRollback: Object.freeze({ defaultMs: 30_000, minMs: 100, maxMs: 300_000, env: "PRITHA_UPDATE_ROLLBACK_HEALTH_TIMEOUT_MS" }),
  releaseRequest: Object.freeze({ defaultMs: 8_000, minMs: 50, maxMs: 60_000, env: "PRITHA_UPDATE_HEALTH_REQUEST_TIMEOUT_MS" }),
  releaseStrict: Object.freeze({ defaultMs: 180_000, minMs: 100, maxMs: 600_000, env: "PRITHA_UPDATE_STRICT_HEALTH_TIMEOUT_MS" }),
  workspaceRead: Object.freeze({ defaultMs: 5_000, minMs: 50, maxMs: 30_000, env: "PRITHA_WORKSPACE_READ_TIMEOUT_MS" }),
  resultReadiness: Object.freeze({ defaultMs: 5_000, minMs: 100, maxMs: 30_000, env: "PRITHA_RESULT_READINESS_TIMEOUT_MS" }),
  healthCommand: Object.freeze({ defaultMs: 5_000, minMs: 50, maxMs: 30_000, env: "PRITHA_HEALTH_COMMAND_TIMEOUT_MS" }),
  privateAccess: Object.freeze({ defaultMs: 1_000, minMs: 50, maxMs: 10_000, env: "PRITHA_PRIVATE_ACCESS_TIMEOUT_MS" }),
  runtimeRead: Object.freeze({ defaultMs: 2_500, minMs: 50, maxMs: 30_000, env: "PRITHA_RUNTIME_READ_TIMEOUT_MS" }),
  launchdAudit: Object.freeze({ defaultMs: 30_000, minMs: 100, maxMs: 60_000, env: "PRITHA_LAUNCHD_AUDIT_TIMEOUT_MS" }),
  diagnostic: Object.freeze({ defaultMs: 8_000, minMs: 50, maxMs: 30_000, env: "PRITHA_DIAGNOSTIC_TIMEOUT_MS" }),
});

export function timeoutPolicy(name, { env = process.env, value } = {}) {
  const policy = TIMEOUT_POLICIES[name];
  if (!policy) throw new Error("Unknown timeout policy");
  const raw = value === undefined ? env[policy.env] : value;
  if (raw === undefined) return policy.defaultMs;
  const milliseconds = typeof raw === "number" ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < policy.minMs || milliseconds > policy.maxMs) {
    throw new Error(`${policy.env} must be an integer between ${policy.minMs} and ${policy.maxMs} milliseconds`);
  }
  return milliseconds;
}
