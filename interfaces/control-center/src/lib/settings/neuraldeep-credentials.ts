import { providerCredentialStatus, storeProviderCredential } from "../../../../../scripts/lib/provider-credential.mjs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { resolveTechscopeRoot } from "@/lib/pritha-paths";

const DEFAULT_SERVICE = "pritha-neuraldeep";

function serviceName() {
  const value = String(process.env.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE || DEFAULT_SERVICE);
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : DEFAULT_SERVICE;
}

function safeEnvironment(root: string) {
  const environment: NodeJS.ProcessEnv = { ...process.env, TECHSCOPE_ROOT: root };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  return environment;
}

export function getNeuralDeepCredentialStatus() { return providerCredentialStatus(serviceName()); }
export async function saveNeuralDeepCredential(value: string) { await storeProviderCredential(value, {service:serviceName()}); return getNeuralDeepCredentialStatus(); }

export async function probeNeuralDeepCredential() {
  const root = resolveTechscopeRoot();
  const runner = path.join(root, "scripts", "neuraldeep-codex.mjs");
  const child = spawn(process.execPath, [runner, "probe"], {
    cwd: root,
    env: safeEnvironment(root),
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk}`;
    if (Buffer.byteLength(stdout) > 2 * 1024 * 1024) child.kill("SIGTERM");
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  }).finally(() => clearTimeout(timer));
  try {
    const payload = JSON.parse(stdout) as Record<string, unknown>;
    return {
      ok: payload.ok === true,
      provider: "neuraldeep",
      state: String(payload.state || "unavailable"),
      statusCode: Number(payload.statusCode) || null,
      retryAfter: typeof payload.retryAfter === "string" ? payload.retryAfter : null,
      limits: payload.ok === true ? payload.limits : undefined,
    };
  } catch {
    return { ok: false, provider: "neuraldeep", state: "unavailable", statusCode: null, retryAfter: null };
  }
}
