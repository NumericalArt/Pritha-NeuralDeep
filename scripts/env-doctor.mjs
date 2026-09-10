#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict") || process.env.TECHSCOPE_ENV_DOCTOR_STRICT === "1";
const isDarwin = process.platform === "darwin";
const ROOT = resolveTechscopeRoot();
const argv = process.argv.slice(2);
const profileIndex = argv.indexOf("--profile");
const profile = profileIndex >= 0 ? argv[profileIndex + 1] || "" : "full";
const profileConfig = {
  minimal: {
    pythonPackages: false,
    macosTranscription: false,
    controlCenter: false,
    tailscale: false,
  },
  local: {
    pythonPackages: true,
    macosTranscription: true,
    controlCenter: false,
    tailscale: false,
  },
  "control-center": {
    pythonPackages: true,
    macosTranscription: true,
    controlCenter: true,
    tailscale: false,
  },
  "control-center-tailscale": {
    pythonPackages: true,
    macosTranscription: true,
    controlCenter: true,
    tailscale: true,
  },
  full: {
    pythonPackages: true,
    macosTranscription: true,
    controlCenter: true,
    tailscale: false,
  },
};
if (!profileConfig[profile]) {
  console.error(`Unknown env-doctor profile: ${profile}`);
  process.exit(1);
}
const simulatedMissing = new Set(
  [...args]
    .filter((arg) => arg.startsWith("--simulate-missing="))
    .flatMap((arg) => arg.slice("--simulate-missing=".length).split(","))
    .map((item) => item.trim())
    .filter(Boolean),
);

const checks = [];

function run(command, commandArgs, options = {}) {
  if (simulatedMissing.has(command) || simulatedMissing.has(options.id)) {
    return { status: 127, stdout: "", stderr: "simulated missing dependency" };
  }
  return runSyncProbe(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 20000,
    env: process.env,
  });
}

function add(id, label, level, ok, detail, hint = "") {
  checks.push({ id, label, level, ok: Boolean(ok), detail, hint });
}

function parseVersion(text) {
  const match = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function versionAtLeast(actual, expected) {
  if (!actual) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if ((actual[i] || 0) > expected[i]) return true;
    if ((actual[i] || 0) < expected[i]) return false;
  }
  return true;
}

function checkNode() {
  const actual = parseVersion(process.versions.node);
  add(
    "node",
    "Node.js >= 20",
    "critical",
    versionAtLeast(actual, [20, 0, 0]),
    `current ${process.versions.node}`,
    "Install Node 20+ with the official installer, nvm, fnm, or Homebrew.",
  );
}

function checkPackageManifestPins() {
  const manifestPath = path.join(ROOT, "interfaces", "control-center", "package.json");
  const lockPath = path.join(ROOT, "interfaces", "control-center", "package-lock.json");
  if (!existsSync(manifestPath)) {
    add(
      "control-center-package",
      "Control Center package manifest",
      "critical",
      false,
      "interfaces/control-center/package.json not found",
      "Restore the Control Center package manifest before running bootstrap.",
    );
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const floating = [];
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(manifest[section] || {})) {
      if (String(version).trim() === "latest") floating.push(`${section}.${name}=latest`);
    }
  }
  add(
    "control-center-package-lock",
    "Control Center package-lock",
    "critical",
    existsSync(lockPath),
    existsSync(lockPath) ? "interfaces/control-center/package-lock.json" : "missing",
    "Run `npm --prefix interfaces/control-center install --package-lock-only --ignore-scripts`.",
  );
  add(
    "control-center-pinned-deps",
    "Control Center has no latest dependencies",
    "critical",
    floating.length === 0,
    floating.length === 0 ? "no latest ranges found" : floating.join(", "),
    "Pin install-critical dependencies to concrete versions and update package-lock.json.",
  );
}

function checkCommand(id, label, command, commandArgs, versionPattern, hint, level = "critical") {
  const result = run(command, commandArgs, { id });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const ok = result.status === 0 && (!versionPattern || versionPattern.test(output));
  add(id, label, level, ok, ok ? output.split("\n")[0] : output || `${command} not found`, hint);
}

function checkPython() {
  const result = run("python3", ["--version"], { id: "python3" });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const actual = parseVersion(output);
  const hasCompatPython = result.status === 0 && versionAtLeast(actual, [3, 9, 0]);
  add(
    "python3",
    "Python >= 3.9 compatibility floor",
    "critical",
    hasCompatPython,
    output || "python3 not found",
    "Install Python 3.10+ with python.org, pyenv, or Homebrew.",
  );
  add(
    "python3-recommended",
    "Python >= 3.10 recommended baseline",
    strictMode ? "critical" : "warning",
    result.status === 0 && versionAtLeast(actual, [3, 10, 0]),
    output || "python3 not found",
    "New Techscope setups should use Python 3.10+; current 3.9 support is transitional.",
  );
}

function pythonSnippet(moduleName, distributionName) {
  return `
import importlib.util
try:
    from importlib import metadata
except ImportError:
    import importlib_metadata as metadata
module_name = ${JSON.stringify(moduleName)}
distribution_name = ${JSON.stringify(distributionName)}
if importlib.util.find_spec(module_name) is None:
    raise SystemExit(f"{module_name} import not found")
try:
    print(metadata.version(distribution_name))
except Exception:
    print("version unknown")
`;
}

function checkPythonPackage(id, label, moduleName, distributionName, hint, level = "critical") {
  const result = run("python3", ["-c", pythonSnippet(moduleName, distributionName)], { id });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  add(id, label, level, result.status === 0, output || `${moduleName} not found`, hint);
}

function discoverPythonScript(scriptName) {
  const snippet = `
import os
import site
import sysconfig
script_name = ${JSON.stringify(scriptName)}
candidates = []
for key in ("scripts",):
    value = sysconfig.get_path(key)
    if value:
        candidates.append(os.path.join(value, script_name))
try:
    candidates.append(os.path.join(site.USER_BASE, "bin", script_name))
except Exception:
    pass
for candidate in candidates:
    if os.path.exists(candidate):
        print(candidate)
        raise SystemExit(0)
raise SystemExit(1)
`;
  const result = run("python3", ["-c", snippet], { id: `${scriptName}-python-bin` });
  return result.status === 0 ? String(result.stdout || "").trim().split("\n")[0] : "";
}

function commandExists(command) {
  const result = run("sh", ["-lc", `command -v ${command}`], { id: command });
  return result.status === 0 ? String(result.stdout || "").trim().split("\n")[0] : "";
}

function checkMlxWhisperExecutable() {
  const fromPath = commandExists("mlx_whisper");
  const fromPythonScripts = fromPath || discoverPythonScript("mlx_whisper");
  add(
    "mlx-whisper-bin",
    "mlx_whisper executable",
    isDarwin ? "critical" : "warning",
    Boolean(fromPythonScripts),
    fromPythonScripts || "not found in PATH or Python scripts directory",
    isDarwin
      ? "Install with `python3 -m pip install --user mlx-whisper` and add Python user bin to PATH, or set MLX_WHISPER_BIN."
      : "mlx-whisper is a local macOS transcription helper; Linux CI may skip it.",
  );
}

function checkOptionalTools() {
  const optional = [
    ["codex", "Codex CLI", "Install or sign into Codex if this machine will run Codex-native agent tasks."],
    ["rg", "ripgrep", "Install ripgrep for fast source search: brew install ripgrep."],
    ["ffmpeg", "system ffmpeg", "Optional because imageio-ffmpeg provides the binary used by media transcription."],
  ];
  for (const [command, label, hint] of optional) {
    const found = commandExists(command);
    add(command, label, "warning", Boolean(found), found || `${command} not found`, hint);
  }
}

checkNode();
checkCommand(
  "git",
  "Git CLI",
  "git",
  ["--version"],
  /^git version \d+\.\d+/,
  "Install Git. On macOS, `xcode-select --install` installs Apple Command Line Tools.",
);
checkCommand(
  "sqlite3",
  "sqlite3 CLI",
  "sqlite3",
  ["--version"],
  /^\d+\.\d+\.\d+/,
  "Install sqlite3 CLI. On macOS it is usually available with Command Line Tools or Homebrew.",
);
checkPython();
if (profileConfig[profile].pythonPackages) {
  checkPythonPackage(
    "sentence-transformers",
    "Python package sentence-transformers",
    "sentence_transformers",
    "sentence-transformers",
    "Install with `python3 -m pip install --user -r requirements-core.txt`.",
  );
  checkPythonPackage(
    "imageio-ffmpeg",
    "Python package imageio-ffmpeg",
    "imageio_ffmpeg",
    "imageio-ffmpeg",
    "Install with `python3 -m pip install --user -r requirements-core.txt`.",
  );
}
if (profileConfig[profile].macosTranscription) {
  checkPythonPackage(
    "mlx-whisper",
    "Python package mlx-whisper",
    "mlx_whisper",
    "mlx-whisper",
    isDarwin
      ? "Install with `python3 -m pip install --user -r requirements-macos.txt`."
      : "mlx-whisper is a local macOS transcription helper; Linux CI may skip it.",
    isDarwin ? "critical" : "warning",
  );
  checkMlxWhisperExecutable();
}
if (profileConfig[profile].controlCenter) {
  checkCommand(
    "npm",
    "npm CLI",
    "npm",
    ["--version"],
    /^\d+\.\d+\.\d+/,
    "Install npm with Node.js 20+.",
  );
  checkPackageManifestPins();
}
if (profileConfig[profile].tailscale) {
  const tailscale = commandExists("tailscale");
  add(
    "tailscale",
    "Tailscale CLI",
    "warning",
    Boolean(tailscale),
    tailscale || "tailscale not found",
    "Install the Tailscale client only when private device access is explicitly selected.",
  );
}
checkOptionalTools();

const failed = checks.filter((check) => check.level === "critical" && !check.ok);
const warnings = checks.filter((check) => check.level === "warning" && !check.ok);
const payload = {
  status: failed.length > 0 ? "fail" : "pass",
  profile,
  strict: strictMode,
  failed: failed.length,
  warnings: warnings.length,
  checks,
};

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Techscope env doctor: ${payload.status}${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}`);
  for (const check of checks) {
    const marker = check.ok ? "PASS" : check.level === "critical" ? "FAIL" : "WARN";
    console.log(`- ${marker} ${check.label}: ${check.detail}`);
    if (!check.ok && check.hint) {
      console.log(`  hint: ${check.hint}`);
    }
  }
}

if (failed.length > 0) {
  process.exitCode = 1;
}
