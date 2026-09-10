import { spawn } from "node:child_process";
import path from "node:path";
import { resolveTechscopeRoot } from "@/lib/pritha-paths";
import type { NeuralDeepAccountSnapshot } from "./neuraldeep-account";

const ACCOUNT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MEMORY_TTL_MS = 30_000;

let memoryCache: { expiresAt: number; value: NeuralDeepAccountSnapshot } | null = null;
let inFlight: Promise<NeuralDeepAccountSnapshot> | null = null;

function safeEnvironment(root: string) {
  const environment: NodeJS.ProcessEnv = { ...process.env, TECHSCOPE_ROOT: root };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  return environment;
}

function unavailableSnapshot(): NeuralDeepAccountSnapshot {
  return {
    schema: "pritha-neuraldeep-account-snapshot-v1",
    checkedAt: new Date().toISOString(),
    source: "unavailable",
    stale: false,
    sections: {
      limits: { available: false, stale: false, fetchedAt: null },
      public: { available: false, stale: false, fetchedAt: null },
    },
    limits: null,
    walletPrices: [],
    tierLimits: null,
    freeTier: null,
    paymentsStatus: null,
    failures: [{ class: "outage", code: "account_snapshot_unavailable", status: null, retryAfter: null }],
  };
}

async function runAccountCommand() {
  const root = resolveTechscopeRoot();
  const runner = path.join(root, "scripts", "neuraldeep-codex.mjs");
  const child = spawn(process.execPath, [runner, "account"], {
    cwd: root,
    env: safeEnvironment(root),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let overflow = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > MAX_OUTPUT_BYTES) {
      overflow = true;
      child.kill("SIGTERM");
      return;
    }
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2_000); });
  const timer = setTimeout(() => child.kill("SIGTERM"), ACCOUNT_TIMEOUT_MS);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => clearTimeout(timer));
  if (overflow) throw new Error("neuraldeep_account_snapshot_too_large");
  if (code !== 0) {
    if (/neuraldeep_key_missing/i.test(stderr)) throw new Error("neuraldeep_key_missing");
    throw new Error("neuraldeep_account_snapshot_unavailable");
  }
  const payload = JSON.parse(stdout) as NeuralDeepAccountSnapshot;
  if (payload?.schema !== "pritha-neuraldeep-account-snapshot-v1") throw new Error("invalid_neuraldeep_account_snapshot");
  return payload;
}

export async function getNeuralDeepAccountSnapshot(options: { force?: boolean } = {}) {
  if (!options.force && memoryCache && Date.now() < memoryCache.expiresAt) return memoryCache.value;
  if (inFlight) return inFlight;
  inFlight = runAccountCommand().catch(() => memoryCache?.value || unavailableSnapshot());
  try {
    const value = await inFlight;
    memoryCache = { expiresAt: Date.now() + MEMORY_TTL_MS, value };
    return value;
  } finally {
    inFlight = null;
  }
}
