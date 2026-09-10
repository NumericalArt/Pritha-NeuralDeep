#!/usr/bin/env node
import { parseLongArgsWithEquals as parseArgs } from "./lib/cli-args.mjs";

import { existsSync } from "node:fs";
import { prepareDistributionInstance } from "./lib/distribution-instance.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = resolveTechscopeRoot({ cwd: path.resolve(SCRIPT_DIR, "..") });
loadPrithaRuntimeEnv({ root: ROOT });
const PHASES = new Set(["plan", "prepare", "install", "verify", "start"]);
const PROFILES = {
  neuraldeep: { pythonCore: true, pythonMacos: true, controlCenter: true, webSearch: false, tailscale: false, neuraldeep: true },
  minimal: {
    pythonCore: false,
    pythonMacos: false,
    controlCenter: false,
    webSearch: false,
    tailscale: false,
  },
  local: {
    pythonCore: true,
    pythonMacos: true,
    controlCenter: false,
    webSearch: true,
    tailscale: false,
  },
  "control-center": {
    pythonCore: true,
    pythonMacos: true,
    controlCenter: true,
    webSearch: true,
    tailscale: false,
  },
  "control-center-tailscale": {
    pythonCore: true,
    pythonMacos: true,
    controlCenter: true,
    webSearch: true,
    tailscale: true,
  },
};

function commandString(command, args) {
  return [command, ...args].join(" ");
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function effectiveConfig(profile, startTarget) {
  const config = cloneConfig(PROFILES[profile]);
  if (startTarget === "control-center") {
    config.controlCenter = true;
  }
  return config;
}

function step(id, phase, label, command, args, options = {}) {
  return {
    id,
    phase,
    label,
    kind: "command",
    command,
    args,
    commandText: commandString(command, args),
    writes: Boolean(options.writes),
    startsForegroundProcess: Boolean(options.startsForegroundProcess),
    required: options.required !== false,
    timeoutMs: options.timeoutMs ?? 180000,
  };
}

function note(id, phase, label, detail) {
  return {
    id,
    phase,
    label,
    kind: "note",
    detail,
    writes: false,
    startsForegroundProcess: false,
    required: false,
  };
}

function setupArgs(options) {
  const args = [
    "scripts/setup.mjs",
    "--non-interactive",
    "--config",
    "tests/fixtures/setup-minimal.json",
    "--skip-quality",
    "--json",
  ];
  if (options.state) args.push("--state", path.resolve(options.state));
  if (options.env) args.push("--env", path.resolve(options.env));
  return args;
}

function envProfile(profile, config) {
  if (config.tailscale) return "control-center-tailscale";
  if (config.controlCenter) return "control-center";
  return profile === "minimal" ? "minimal" : "local";
}

function instancePython(config) {
  return config.neuraldeep ? path.join(process.env.PRITHA_STATE_ROOT || path.join(ROOT, ".private"), "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python") : "python3";
}
function memoryBuildSteps(config) {
  const steps = [
    step("memory-rebuild", "install", "Build local SQLite memory index", "node", [
      "scripts/rebuild-memory.mjs",
    ], { writes: true, timeoutMs: 300000 }),
  ];
  if (config.pythonCore) {
    steps.push(step("memory-embeddings", "install", "Build local semantic embeddings", instancePython(config), [
      "scripts/embed-memory.py",
    ], { writes: true, timeoutMs: 900000 }));
  } else {
    steps.push(note(
      "memory-embeddings-deferred",
      "install",
      "Semantic embeddings need the local Python profile",
      "Run node scripts/bootstrap.mjs prepare --profile local to install Python dependencies and build the full semantic memory index.",
    ));
  }
  return steps;
}

function installSteps(profile, config, options) {
  const steps = [
    step("setup-state", "install", "Create local setup state", "node", setupArgs(options), {
      writes: true,
      timeoutMs: 240000,
    }),
  ];
  if (config.controlCenter) {
    steps.push(step("search-runtime-npm-ci", "install", "Install shared Search runtime dependencies from lockfile", "npm", ["ci", "--ignore-scripts"], { writes: true, timeoutMs: 900000 }));
  }
  if (config.neuraldeep) steps.push(step("python-venv", "install", "Create isolated Python environment", "python3", ["-m", "venv", path.dirname(path.dirname(instancePython(config)))], { writes: true }));
  if (config.pythonCore) {
    steps.push(step("python-core", "install", "Install portable Python dependencies", instancePython(config), [
      "-m",
      "pip",
      "install",
      ...(config.neuraldeep ? [] : ["--user"]),
      "-r",
      "requirements-core.txt",
    ], { writes: true, timeoutMs: 900000 }));
  }
  if (config.pythonMacos && process.platform === "darwin") {
    steps.push(step("python-macos", "install", "Install macOS transcription dependencies", instancePython(config), [
      "-m",
      "pip",
      "install",
      ...(config.neuraldeep ? [] : ["--user"]),
      "-r",
      "requirements-macos.txt",
    ], { writes: true, timeoutMs: 900000 }));
  }
  if (config.controlCenter) {

    steps.push(step("control-center-npm-ci", "install", "Install Control Center dependencies from lockfile", "npm", [
      "--prefix",
      "interfaces/control-center",
      "ci",
      "--ignore-scripts",
    ], { writes: true, timeoutMs: 900000 }));
  }
  if (config.neuraldeep) {
    steps.push(step("neuraldeep-config", "install", "Configure isolated NeuralDeep runtime", "node", ["scripts/neuraldeep-codex.mjs", "setup"], {writes:true}));
    steps.push(step("brief-desk-seed", "install", "Install bundled Brief Desk ND", "node", ["scripts/install-brief-desk.mjs"], {writes:true}));
  }
  steps.push(...memoryBuildSteps(config));
  if (config.webSearch) {
    steps.push(step("web-search-searxng-install", "install", "Install local SearXNG web search backend", "node", [
      "scripts/web-search-tools.mjs",
      "install",
      "searxng",
      "--yes",
      "--json",
    ], { writes: true, timeoutMs: 1800000 }));
  }
  if (config.tailscale) {
    steps.push(note(
      "tailscale-install-deferred",
      "install",
      "Tailscale install is operator-approved only",
      "Bootstrap detects Tailscale readiness but does not install or configure host networking. Use scripts/tailscale-setup.mjs plan/status/plan-agents/install for the approved flow.",
    ));
  }
  return steps;
}

function verifySteps(profile, config) {
  const steps = [
    step("env-doctor", "verify", "Check environment prerequisites", "node", [
      "scripts/env-doctor.mjs",
      "--profile",
      envProfile(profile, config),
      "--json",
    ]),
    step("validate-memory", "verify", "Validate authored Markdown memory", "node", [
      "scripts/validate-memory.mjs",
    ], { timeoutMs: 240000 }),
    step("memory-stats", "verify", "Check local memory index stats", "node", [
      "scripts/query-memory.mjs",
      "stats",
    ], { timeoutMs: 120000 }),
  ];
  if (config.pythonCore) {
    steps.push(step("semantic-search-sanity", "verify", "Check semantic memory search", "node", [
      "scripts/query-memory.mjs",
      "semantic",
      "agent factory",
    ], { timeoutMs: 120000 }));
  }
  if (config.controlCenter) {
    steps.push(step("control-center-typecheck", "verify", "Typecheck Control Center", "npm", [
      "--prefix",
      "interfaces/control-center",
      "run",
      "typecheck",
    ], { timeoutMs: 240000 }));
    steps.push(step("control-center-build", "verify", "Build Control Center", "npm", [
      "--prefix",
      "interfaces/control-center",
      "run",
      "build",
    ], { timeoutMs: 600000 }));
  }
  if (config.webSearch) {
    steps.push(step("web-search-searxng-status", "verify", "Check local SearXNG install status", "node", [
      "scripts/web-search-tools.mjs",
      "status",
      "--require-installed",
      "--json",
    ], { timeoutMs: 60000 }));
  }
  if (config.tailscale) {
    steps.push(step("tailscale-status", "verify", "Read Tailscale readiness", "node", [
      "scripts/tailscale-setup.mjs",
      "status",
      "--app",
      "control-center",
      "--json",
    ], { required: false, timeoutMs: 30000 }));
  }
  return steps;
}

function startSteps(startTarget, config) {
  if (!startTarget || startTarget === true) startTarget = "control-center";
  if (startTarget !== "control-center") {
    throw new Error(`Unknown start target: ${startTarget}`);
  }
  const steps = [];
  if (config.webSearch) {
    steps.push(step("web-search-searxng-start", "start", "Start local SearXNG web search backend", "node", [
      "scripts/web-search-tools.mjs",
      "start",
      "searxng",
      "--yes",
      "--json",
    ], { writes: true, timeoutMs: 1800000 }));
  }
  steps.push(
    step("control-center-dev", "start", "Start Control Center in the foreground", "npm", [
      "--prefix",
      "interfaces/control-center",
      "run",
      config.neuraldeep ? "start" : "dev",
    ], { startsForegroundProcess: true, timeoutMs: 0 }),
  );
  return steps;
}

function assertControlCenterHostPolicy(sequence) {
  if (!sequence.includes("start")) return;
  const host = String(process.env.PRITHA_CONTROL_CENTER_HOST || "").trim();
  if (!host) return;
  const allowed = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!allowed.has(host.toLowerCase())) {
    throw new Error(`PRITHA_CONTROL_CENTER_HOST=${host} is disabled in this build (localhost + Tailscale only).`);
  }
}

function plannedSteps(sequence, profile, config, options) {
  const steps = [];
  for (const phase of sequence) {
    if (phase === "plan") {
      steps.push(...installSteps(profile, config, options));
      steps.push(...verifySteps(profile, config));
      if (options.start) steps.push(...startSteps(options.start, config));
    } else if (phase === "install") {
      steps.push(...installSteps(profile, config, options));
    } else if (phase === "verify") {
      steps.push(...verifySteps(profile, config));
    } else if (phase === "start") {
      steps.push(...startSteps(options.start, config));
    }
  }
  return steps;
}

function compact(text, max = 1000) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function runStep(item, options) {
  if (item.kind === "note") {
    return { ...item, status: "planned", exitCode: 0 };
  }
  if (options.dryRun || options.planOnly) {
    return { ...item, status: "planned", exitCode: 0 };
  }
  const startsForegroundProcess = item.startsForegroundProcess;
  const result = spawnSync(item.command, item.args, { killSignal: "SIGKILL",
    cwd: ROOT,
    encoding: startsForegroundProcess ? undefined : "utf8",
    stdio: startsForegroundProcess ? "inherit" : ["ignore", "pipe", "pipe"],
    timeout: item.timeoutMs || undefined,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  const ok = result.status === 0;
  return {
    ...item,
    status: ok ? "pass" : item.required ? "fail" : "warn",
    exitCode: result.status ?? 1,
    stdout: startsForegroundProcess ? "" : compact(result.stdout),
    stderr: startsForegroundProcess ? "" : compact(result.stderr),
    error: result.error ? result.error.message : undefined,
  };
}

function printHuman(payload) {
  console.log(`Pritha bootstrap: ${payload.status}`);
  console.log(`Profile: ${payload.profile}`);
  if (payload.startTarget) console.log(`Start target: ${payload.startTarget}`);
  for (const item of payload.steps) {
    const marker = item.status ? item.status.toUpperCase() : "PLAN";
    const command = item.commandText ? `: ${item.commandText}` : "";
    console.log(`- ${marker} ${item.label}${command}`);
    if (item.detail) console.log(`  ${item.detail}`);
    if (item.status === "fail" || item.status === "warn") {
      if (item.stderr) console.log(`  stderr: ${item.stderr}`);
      if (item.stdout) console.log(`  stdout: ${item.stdout}`);
      if (item.error) console.log(`  error: ${item.error}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  node scripts/bootstrap.mjs plan --profile minimal
  node scripts/bootstrap.mjs prepare --profile local
  node scripts/bootstrap.mjs install --profile local
  node scripts/bootstrap.mjs verify --profile control-center
  node scripts/bootstrap.mjs start --profile control-center
  node scripts/bootstrap.mjs --profile local --start control-center

Profiles: neuraldeep, minimal, local, control-center, control-center-tailscale

Safety: bootstrap never installs launchd, cron, durable services, Tailscale, or
credentials. The local web search backend is installed under ignored .tools and
the configured PRITHA_STATE_ROOT private directory. The Control Center start
command runs in the foreground.`);
    return;
  }

  const phase = PHASES.has(options._[0]) ? options._[0] : null;
  if (options._[0] && !phase) {
    throw new Error(`Unknown bootstrap phase: ${options._[0]}`);
  }
  const profile = options.profile || (options.start ? "local" : "minimal");
  if (!PROFILES[profile]) throw new Error(`Unknown bootstrap profile: ${profile}`);
  const startTarget = phase === "start" && !options.start ? "control-center" : options.start;
  const sequence = phase === "prepare" ? ["install", "verify"] : phase ? [phase] : startTarget ? ["install", "verify", "start"] : ["plan"];
  assertControlCenterHostPolicy(sequence);
  if (profile === "neuraldeep" && !options["dry-run"] && sequence.includes("install")) await prepareDistributionInstance(ROOT);
  if (profile === "neuraldeep" && process.env.PRITHA_STATE_ROOT) process.env.PATH = `${path.dirname(instancePython({neuraldeep:true}))}${path.delimiter}${process.env.PATH}`;
  const config = effectiveConfig(profile, startTarget);
  const steps = plannedSteps(sequence, profile, config, { ...options, start: startTarget });
  const planOnly = sequence.length === 1 && sequence[0] === "plan";
  const results = [];
  for (const item of steps) { const result = runStep(item, { dryRun: options["dry-run"], planOnly }); results.push(result); if (result.status === "fail") break; }
  const failed = results.filter((item) => item.status === "fail");
  const warned = results.filter((item) => item.status === "warn");
  const payload = {
    schema: "pritha-bootstrap-v1",
    root: ROOT,
    profile,
    phases: sequence,
    startTarget: startTarget || null,
    status: failed.length > 0 ? "fail" : warned.length > 0 ? "pass-with-warnings" : planOnly || options["dry-run"] ? "planned" : "pass",
    dryRun: Boolean(options["dry-run"]),
    steps: results,
  };

  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
