import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const PRITHA_STATE_LAYOUT = Object.freeze({
  config: "config",
  setup: "setup",
  memory: "memory",
  private: "private",
  queue: "queue",
  logs: "logs",
  audit: "audit",
  snapshots: "snapshots",
  voiceDrafts: "voice-drafts",
  agents: "agents",
  builds: "builds",
  releases: "releases",
});

const LEGACY_STATE_LAYOUT = Object.freeze({
  config: "",
  setup: "",
  memory: ".memory",
  private: ".private",
  queue: ".queue",
  logs: ".logs",
  audit: path.join(".snapshots", "audit"),
  snapshots: ".snapshots",
  voiceDrafts: "03_reviews",
  agents: path.join(".private", "agents"),
  builds: path.join(".private", "builds"),
  releases: path.join(".snapshots", "releases"),
});

function gitRootFromCwd(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function resolveTechscopeRoot(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  if (process.env.TECHSCOPE_ROOT) {
    const envRoot = path.resolve(process.env.TECHSCOPE_ROOT);
    if (existsSync(envRoot)) return envRoot;
  }
  return existsSync(path.join(cwd, "distribution", "manifest.json")) ? cwd : gitRootFromCwd(cwd) || cwd;
}

export function resolvePrithaStateRoot(options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  const configured = options.stateRoot || process.env.PRITHA_STATE_ROOT;
  return configured ? path.resolve(configured) : root;
}

export function resolvePrithaAgentParent(options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  const configured = options.agentParent || process.env.PRITHA_AGENT_PARENT;
  return configured ? path.resolve(configured) : (existsSync(path.join(root, "distribution", "manifest.json")) ? path.join(root, ".private", "child-projects") : path.dirname(root));
}

export function resolvePrithaAgentMemoryRoot(options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  const stateRoot = resolvePrithaStateRoot({ ...options, root });
  if (stateRoot !== root) return path.join(stateRoot, PRITHA_STATE_LAYOUT.agents);
  return existsSync(path.join(root, ".git")) || existsSync(path.join(root, "distribution", "manifest.json"))
    ? path.join(root, LEGACY_STATE_LAYOUT.agents) : path.join(root, "11_agents");
}

export function isPrithaCodeCheckout(candidate) {
  const directory = path.resolve(candidate);
  return existsSync(path.join(directory, "11_agents"))
    && existsSync(path.join(directory, "scripts", "pritha.mjs"))
    && existsSync(path.join(directory, "interfaces", "control-center"));
}

export function resolvePrithaStatePathFrom(options, kind, ...segments) {
  if (!Object.hasOwn(PRITHA_STATE_LAYOUT, kind)) {
    throw new Error(`Unknown Pritha state path kind: ${kind}`);
  }
  const root = options?.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  const stateRoot = resolvePrithaStateRoot({ ...options, root });
  const directory = stateRoot === root ? LEGACY_STATE_LAYOUT[kind] : PRITHA_STATE_LAYOUT[kind];
  return path.join(stateRoot, directory, ...segments);
}

export function resolvePrithaStatePath(kind, ...segments) {
  return resolvePrithaStatePathFrom({}, kind, ...segments);
}



export function prithaInstanceConfig(options = {}) {
  const codeRoot = options.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  const stateRoot = resolvePrithaStateRoot({ ...options, root: codeRoot });
  const agentParent = resolvePrithaAgentParent({ ...options, root: codeRoot });
  return {
    codeRoot,
    stateRoot,
    agentParent,
    instanceId: String(options.instanceId || process.env.PRITHA_INSTANCE_ID || path.basename(codeRoot)).trim(),
    instanceRole: String(options.instanceRole || process.env.PRITHA_INSTANCE_ROLE || "developer").trim(),
    controlCenterPort: Number(options.controlCenterPort || process.env.PRITHA_CONTROL_CENTER_PORT || 3420),
  };
}

export function resolveSiblingAgentPath(name, options = {}) {
  if (options.overridePath) {
    return path.resolve(options.overridePath);
  }
  if (!name || typeof name !== "string") {
    throw new Error("resolveSiblingAgentPath(name) requires a non-empty agent name.");
  }
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  return path.join(resolvePrithaAgentParent({ ...options, root }), name);
}

export function pathFromRoot(...segments) {
  return path.join(resolveTechscopeRoot(), ...segments);
}
