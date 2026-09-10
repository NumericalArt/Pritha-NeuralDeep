import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type VoiceCodexThreadRole = "control" | "task" | "worktree"

export type VoiceCodexThreadEntry = {
  projectRoot: string
  projectSlug: string
  branch: string
  role: VoiceCodexThreadRole
  threadName: string
  threadId: string
  sessionId: string | null
  updatedAt: string
}

type VoiceCodexRegistryFile = {
  version: 1
  threads: Record<string, VoiceCodexThreadEntry>
}

export function defaultVoiceCodexRegistryPath() {
  const configured = process.env.VOICE_CODEX_REGISTRY_PATH?.trim()
  if (configured) {
    return configured
  }
  return path.join(os.homedir(), ".config", "voice-codex", "projects.json")
}

export function projectSlug(projectRoot: string) {
  const base = path.basename(projectRoot).trim() || "project"
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function controlThreadName(projectRoot: string, branch: string) {
  return `VC · ${projectSlug(projectRoot)} · ${branch || "main"} · control`
}

export function registryKey(input: {
  projectRoot: string
  branch: string
  role: VoiceCodexThreadRole
}) {
  return `${path.resolve(input.projectRoot)}::${input.branch || "main"}::${input.role}`
}

export function readVoiceCodexRegistry(registryPath = defaultVoiceCodexRegistryPath()) {
  if (!fs.existsSync(registryPath)) {
    return { version: 1, threads: {} } satisfies VoiceCodexRegistryFile
  }
  try {
    const parsed = JSON.parse(
      fs.readFileSync(registryPath, "utf8"),
    ) as Partial<VoiceCodexRegistryFile>
    return {
      version: 1,
      threads: parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {},
    } satisfies VoiceCodexRegistryFile
  } catch {
    return { version: 1, threads: {} } satisfies VoiceCodexRegistryFile
  }
}

export function getVoiceCodexThread(
  input: {
    projectRoot: string
    branch: string
    role: VoiceCodexThreadRole
  },
  registryPath = defaultVoiceCodexRegistryPath(),
) {
  return readVoiceCodexRegistry(registryPath).threads[registryKey(input)] || null
}

export function saveVoiceCodexThread(
  entry: VoiceCodexThreadEntry,
  registryPath = defaultVoiceCodexRegistryPath(),
) {
  const registry = readVoiceCodexRegistry(registryPath)
  registry.threads[
    registryKey({
      projectRoot: entry.projectRoot,
      branch: entry.branch,
      role: entry.role,
    })
  ] = {
    ...entry,
    updatedAt: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8")
  return entry
}
