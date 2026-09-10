import { spawn } from "node:child_process";
import path from "node:path";
import { resolveTechscopeRoot } from "@/lib/pritha-paths";

export type NeuralDeepUsageRange = "24h" | "7d" | "30d";

function safeEnvironment(root: string) {
  const environment: NodeJS.ProcessEnv = { ...process.env, TECHSCOPE_ROOT: root };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  return environment;
}

export async function getNeuralDeepUsageSummary(range: NeuralDeepUsageRange) {
  const root = resolveTechscopeRoot();
  const runner = path.join(root, "scripts", "neuraldeep-codex.mjs");
  const child = spawn(process.execPath, [runner, "usage-summary", "--range", range], {
    cwd: root,
    env: safeEnvironment(root),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let overflow = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > 4 * 1024 * 1024) {
      overflow = true;
      child.kill("SIGTERM");
      return;
    }
    stdout += chunk;
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 10_000);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => clearTimeout(timer));
  if (overflow || code !== 0) throw new Error("neuraldeep_usage_unavailable");
  const payload = JSON.parse(stdout) as Record<string, unknown>;
  if (payload.schema !== "pritha-neuraldeep-usage-summary-v1") throw new Error("invalid_neuraldeep_usage_summary");
  return payload;
}
