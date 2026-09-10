import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function existsAll(root, files) {
  const missing = files.filter((file) => !existsSync(path.join(root, file)));
  return { ok: missing.length === 0, missing };
}

function countDirEntries(dirPath) {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath).length;
  } catch {
    return 0;
  }
}

function codexMcpServers(homeDir) {
  const configPath = path.join(homeDir, ".codex", "config.toml");
  if (!existsSync(configPath)) return [];
  const text = readFileSync(configPath, "utf8");
  return [...text.matchAll(/^\[mcp_servers\.([^\]]+)\]/gm)].map((match) => match[1]);
}

export function moduleReadiness(root, options = {}) {
  const homeDir = options.homeDir || process.env.HOME || "";
  const harness = existsAll(root, [
    "AGENTS.md",
    "package.json",
    "scripts/pritha.mjs",
    "scripts/quality-gate.mjs",
    "scripts/smoke-test.mjs",
    "scripts/setup-status.mjs",
  ]);
  const memory = existsAll(root, [
    ".memory/README.md",
    "scripts/validate-memory.mjs",
    "scripts/rebuild-memory.mjs",
    "scripts/query-memory.mjs",
    "scripts/memory-status.mjs",
  ]);
  const data = existsAll(root, [
    "00_inbox",
    "01_sources",
    "02_briefs",
    "03_reviews",
    "04_standards",
    "05_decisions",
    "07_workflows",
    "08_templates",
    "10_wiki",
    "11_agents",
  ]);
  const skillsDir = homeDir ? path.join(homeDir, ".codex", "skills") : "";
  const skillCount = skillsDir ? countDirEntries(skillsDir) : 0;
  const mcpServers = homeDir ? codexMcpServers(homeDir) : [];

  return {
    harness: {
      status: harness.ok ? "configured" : "failed",
      detail: harness.ok ? "core Pritha harness files present" : `missing: ${harness.missing.join(", ")}`,
    },
    memory: {
      status: memory.ok ? "configured" : "failed",
      detail: memory.ok ? "Markdown memory and rebuild/query scripts present" : `missing: ${memory.missing.join(", ")}`,
    },
    data: {
      status: data.ok ? "configured" : "failed",
      detail: data.ok ? "curated knowledge directories present" : `missing: ${data.missing.join(", ")}`,
    },
    skills: {
      status: skillCount > 0 ? "configured-externally" : "skipped",
      detail: skillCount > 0 ? `Codex skills directory available (${skillCount} entries)` : "no project-required skills selected",
    },
    mcp: {
      status: mcpServers.length > 0 ? "configured-externally" : "skipped",
      detail: mcpServers.length > 0 ? `Codex MCP servers: ${mcpServers.join(", ")}` : "no project-required MCP servers selected",
    },
  };
}
