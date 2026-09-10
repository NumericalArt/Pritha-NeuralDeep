import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync, copyFileSync } from "node:fs";
import path from "node:path";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";

export type EnvSecretSource = "process_env" | "control_center_env_file" | "root_env_local" | "root_env" | "unknown";

type EnvEntry = {
  value: string;
  source: EnvSecretSource;
  filePath?: string;
  lastUpdated?: string;
};

function controlCenterEnvFile() {
  const configured = process.env.PRITHA_CONTROL_CENTER_ENV_FILE?.trim();
  if (configured) return path.resolve(configured);

  const root = resolveTechscopeRoot();
  for (const envPath of [path.join(root, ".env.local"), path.join(root, ".env")]) {
    const value = readEnvFile(envPath).get("PRITHA_CONTROL_CENTER_ENV_FILE")?.trim();
    if (value) return path.resolve(root, value);
  }
  const stateRoot = resolvePrithaStateRoot(root);
  if (stateRoot !== root) return path.join(stateRoot, "config", "runtime.env");
  return "";
}

export function envStoreTargetPath() {
  return controlCenterEnvFile() || path.join(resolveTechscopeRoot(), ".env.local");
}

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return new Map<string, string>();
  const entries = new Map<string, string>();
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    entries.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
  }
  return entries;
}

function fileUpdatedAt(filePath: string) {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return undefined;
  }
}

export function findEnvSecret(name: string): EnvEntry {
  const envValue = process.env[name];
  if (envValue) return { value: envValue, source: "process_env" };

  const root = resolveTechscopeRoot();
  const candidates: Array<{ filePath: string; source: EnvSecretSource }> = [
    ...(controlCenterEnvFile() ? [{ filePath: controlCenterEnvFile(), source: "control_center_env_file" as const }] : []),
    { filePath: path.join(root, ".env.local"), source: "root_env_local" },
    { filePath: path.join(root, ".env"), source: "root_env" },
  ];

  for (const candidate of candidates) {
    const value = readEnvFile(candidate.filePath).get(name);
    if (value) {
      return {
        value,
        source: candidate.source,
        filePath: candidate.filePath,
        lastUpdated: fileUpdatedAt(candidate.filePath),
      };
    }
  }

  return { value: "", source: "unknown" };
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

function backupEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const backupDir = `${filePath}.backups`;
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(filePath, path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`));
}

export function writeEnvSecret(name: string, value: string) {
  const targetPath = envStoreTargetPath();
  mkdirSync(path.dirname(targetPath), { recursive: true });
  backupEnvFile(targetPath);

  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const nextLines: string[] = [];
  let replaced = false;
  const assignment = `${name}=${quoteEnvValue(value)}`;

  for (const line of lines) {
    if (line.match(new RegExp(`^\\s*${name}=`))) {
      if (!replaced) nextLines.push(assignment);
      replaced = true;
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced) {
    if (nextLines.length && nextLines[nextLines.length - 1] !== "") nextLines.push("");
    if (!nextLines.includes("# Managed by Pritha Control Center settings")) {
      nextLines.push("# Managed by Pritha Control Center settings");
    }
    nextLines.push(assignment);
  }

  const content = `${nextLines.join("\n").replace(/\n+$/g, "")}\n`;
  writeFileSync(targetPath, content, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(targetPath, 0o600);
  } catch {
    // Best-effort on filesystems that support POSIX permissions.
  }
  process.env[name] = value;
  appendSettingsEvent("env_secret_updated", { name, target: path.relative(resolveTechscopeRoot(), targetPath) || path.basename(targetPath) });
  return { targetPath, lastUpdated: fileUpdatedAt(targetPath) };
}

function appendSettingsEvent(kind: string, payload: Record<string, unknown>) {
  try {
    const root = resolveTechscopeRoot();
    const eventDir = resolvePrithaStatePath("private", "interface-lab", "pritha-control-center", "settings");
    mkdirSync(eventDir, { recursive: true });
    writeFileSync(
      path.join(eventDir, "events.jsonl"),
      `${JSON.stringify({ timestamp: new Date().toISOString(), kind, ...payload })}\n`,
      { encoding: "utf8", flag: "a", mode: 0o600 },
    );
  } catch {
    // Audit logging must not block a settings save.
  }
}

export function maskSecret(value: string) {
  if (!value) return undefined;
  const suffix = value.slice(-4);
  return `configured ...${suffix}`;
}
