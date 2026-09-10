import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

export const ROOT = resolveTechscopeRoot({ cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });
loadPrithaRuntimeEnv({ root: ROOT });

export function readJson(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

export function exists(relPath) {
  return existsSync(path.join(ROOT, relPath));
}

export function executable(relPath) {
  try {
    const mode = statSync(path.join(ROOT, relPath)).mode;
    return Boolean(mode & 0o111);
  } catch {
    return false;
  }
}

export function run(command, args, options = {}) {
  try {
    const output = execFileSync(command, args, { killSignal: "SIGKILL",
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout || 30000,
      env: { ...process.env, TECHSCOPE_ROOT: ROOT },
    }).trim();
    return { ok: true, output };
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    return { ok: false, output };
  }
}

export function printStatus(status) {
  const json = process.argv.includes("--json");
  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`${status.name}: ${status.ok ? "ok" : "attention"}`);
  for (const [key, value] of Object.entries(status)) {
    if (key === "name" || key === "ok") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      console.log(`${key}: ${value}`);
    }
  }
  if (Array.isArray(status.items)) {
    for (const item of status.items) {
      console.log(`- ${item.name}: ${item.status}${item.detail ? ` (${item.detail})` : ""}`);
    }
  }
}
