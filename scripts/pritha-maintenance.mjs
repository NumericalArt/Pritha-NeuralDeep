#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { rebuildRegistry } from "./agents-mother/registry.mjs";
import { maintenanceContracts } from "./lib/maintenance-contract.mjs";
import { now, today } from "./lib/date.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith("-")) || "status";
const jsonMode = argv.includes("--json");
const yesMode = argv.includes("--yes");
const noFetchMode = argv.includes("--no-fetch");

function run(commandName, commandArgs = [], options = {}) {
  const result = runSyncProbe(commandName, commandArgs, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 30000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function git(args, options = {}) {
  return run("git", args, options);
}

function check(id, status, detail, required = true) {
  return { id, status, required, detail };
}

function parseAheadBehind(output) {
  const [behindRaw = "0", aheadRaw = "0"] = String(output || "").trim().split(/\s+/);
  return {
    behind: Number.parseInt(behindRaw, 10) || 0,
    ahead: Number.parseInt(aheadRaw, 10) || 0,
  };
}

function parseGitHubRemote(remoteUrl) {
  const match = String(remoteUrl || "").match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    fullName: `${match[1]}/${match[2]}`,
    url: `https://github.com/${match[1]}/${match[2]}`,
  };
}

function curatedUntracked(statusOutput) {
  const curatedPrefixes = [
    "00_inbox/",
    "01_sources/",
    "02_briefs/",
    "03_reviews/",
    "04_standards/",
    "05_decisions/",
    "06_subagents/",
    "07_workflows/",
    "08_templates/",
    "09_archive/",
    "10_wiki/",
    "11_agents/",
    "12_marketing/",
    "docs/",
    "interfaces/",
    "operations/",
    "scripts/",
    "tests/",
  ];
  return String(statusOutput || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3))
    .filter((file) => curatedPrefixes.some((prefix) => file.startsWith(prefix)));
}

function githubCheck(options = {}) {
  const fetchRemote = options.fetch ?? true;
  const checks = [];
  const gitRoot = git(["rev-parse", "--show-toplevel"]);
  if (!gitRoot.ok) {
    checks.push(check("git-repository", "fail", gitRoot.stderr || "not a Git repository"));
    return {
      schema: "pritha-github-update-check-v1",
      generatedAt: now(),
      root: ROOT,
      status: "unavailable",
      updateNeeded: false,
      safeToUpdate: false,
      remote: null,
      branch: "unknown",
      local: null,
      origin: null,
      ahead: 0,
      behind: 0,
      checks,
    };
  }
  checks.push(check("git-repository", "pass", gitRoot.stdout));

  const remoteUrl = git(["remote", "get-url", "origin"]);
  const remote = remoteUrl.ok ? parseGitHubRemote(remoteUrl.stdout) : null;
  checks.push(check("origin-remote", remoteUrl.ok ? "pass" : "fail", remoteUrl.ok ? remoteUrl.stdout : remoteUrl.stderr));
  checks.push(check("github-remote-metadata", remote ? "pass" : "warn", remote ? remote.fullName : "origin is not a GitHub URL or could not be parsed", false));

  if (fetchRemote && remoteUrl.ok) {
    const fetch = git(["fetch", "--prune", "origin"], { timeoutMs: 60000 });
    checks.push(check("origin-fetch", fetch.ok ? "pass" : "fail", fetch.ok ? "origin fetched" : fetch.stderr || fetch.stdout));
  } else {
    checks.push(check("origin-fetch", "skipped", fetchRemote ? "origin unavailable" : "skipped by --no-fetch", false));
  }

  const branch = git(["branch", "--show-current"]);
  const branchName = branch.ok ? branch.stdout || "detached" : "unknown";
  checks.push(check("main-branch", branchName === "main" ? "pass" : "fail", branchName));

  const local = git(["rev-parse", "--verify", "main"]);
  const origin = git(["rev-parse", "--verify", "origin/main"]);
  checks.push(check("local-main", local.ok ? "pass" : "fail", local.ok ? local.stdout : local.stderr));
  checks.push(check("origin-main", origin.ok ? "pass" : "fail", origin.ok ? origin.stdout : origin.stderr));

  let ahead = 0;
  let behind = 0;
  if (local.ok && origin.ok) {
    const counts = git(["rev-list", "--left-right", "--count", "origin/main...main"]);
    if (counts.ok) {
      ({ behind, ahead } = parseAheadBehind(counts.stdout));
      checks.push(check("ahead-behind", "pass", `behind=${behind}; ahead=${ahead}`));
    } else {
      checks.push(check("ahead-behind", "fail", counts.stderr || counts.stdout));
    }
  } else {
    checks.push(check("ahead-behind", "fail", "main or origin/main is unavailable"));
  }

  const trackedStatus = git(["status", "--porcelain", "--untracked-files=no"]);
  checks.push(check("tracked-working-tree-clean", trackedStatus.ok && !trackedStatus.stdout ? "pass" : "fail", trackedStatus.stdout || trackedStatus.stderr || "no tracked changes"));

  const allStatus = git(["status", "--porcelain", "--untracked-files=all"]);
  const curated = curatedUntracked(allStatus.stdout);
  checks.push(check("curated-untracked", curated.length ? "warn" : "pass", curated.length ? curated.slice(0, 12).join(", ") : "no untracked curated files", false));

  checks.push(check("local-commits-preserved", ahead === 0 ? "pass" : "fail", ahead === 0 ? "local main is not ahead of origin/main" : `local main has ${ahead} commit(s) ahead of origin/main`));
  checks.push(check("fast-forward-only", behind >= 0 && ahead === 0 ? "pass" : "fail", ahead === 0 ? `fast-forward candidate; behind=${behind}` : "history diverged or local commits exist"));

  const requiredPass = checks.filter((item) => item.required).every((item) => item.status === "pass");
  const safeToUpdate = requiredPass && branchName === "main" && ahead === 0 && behind > 0 && curated.length === 0;
  const updateNeeded = behind > 0;
  const status = safeToUpdate ? "update_available" : requiredPass && !updateNeeded ? "up_to_date" : "blocked";

  return {
    schema: "pritha-github-update-check-v1",
    generatedAt: now(),
    root: ROOT,
    status,
    updateNeeded,
    safeToUpdate,
    remote,
    branch: branchName,
    local: local.ok ? local.stdout : null,
    origin: origin.ok ? origin.stdout : null,
    ahead,
    behind,
    curatedUntracked: curated,
    checks,
  };
}

function backupBranchName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `backup/pritha-pre-github-update-${stamp}-${process.pid}`;
}

function githubUpdate() {
  const plan = {
    schema: "pritha-github-update-plan-v1",
    generatedAt: now(),
    action: "github-update",
    requiresConfirmation: true,
    confirmation: "--yes",
    steps: [
      "Fetch origin/main.",
      "Confirm current branch is main.",
      "Confirm tracked working tree is clean.",
      "Confirm local main has no commits ahead of origin/main.",
      "Create a backup branch at current HEAD.",
      "Run git pull --ff-only origin main.",
    ],
  };
  const checkResult = githubCheck({ fetch: true });
  if (!yesMode) {
    return {
      ...plan,
      ok: true,
      status: checkResult.safeToUpdate ? "ready_for_confirmation" : checkResult.status,
      actionEnabled: checkResult.safeToUpdate,
      github: checkResult,
    };
  }
  if (!checkResult.updateNeeded && checkResult.status === "up_to_date") {
    return {
      ...plan,
      ok: true,
      status: "up_to_date",
      actionEnabled: false,
      github: checkResult,
      result: "no update available",
    };
  }
  if (!checkResult.safeToUpdate) {
    return {
      ...plan,
      ok: false,
      status: "blocked",
      actionEnabled: false,
      github: checkResult,
      result: "safe update preconditions are not satisfied",
    };
  }

  const branchName = backupBranchName();
  const backup = git(["branch", branchName, "HEAD"]);
  if (!backup.ok) {
    return {
      ...plan,
      ok: false,
      status: "failed",
      actionEnabled: false,
      github: checkResult,
      result: backup.stderr || backup.stdout || "backup branch creation failed",
    };
  }

  const pull = git(["pull", "--ff-only", "origin", "main"], { timeoutMs: 120000 });
  return {
    ...plan,
    ok: pull.ok,
    status: pull.ok ? "updated" : "failed",
    actionEnabled: false,
    backupBranch: branchName,
    github: checkResult,
    result: pull.ok ? pull.stdout || "fast-forward update applied" : pull.stderr || pull.stdout || "git pull failed",
  };
}

function siblingAgentCandidates() {
  const parent = path.dirname(ROOT);
  const rootBase = path.basename(ROOT);
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== rootBase && !entry.name.startsWith("."))
    .map((entry) => {
      const absolutePath = path.join(parent, entry.name);
      return {
        name: entry.name,
        relativePath: path.relative(ROOT, absolutePath),
        markers: [
          existsSync(path.join(absolutePath, "AGENTS.md")) ? "AGENTS.md" : "",
          existsSync(path.join(absolutePath, "operations", "manifest.json")) ? "operations/manifest.json" : "",
          existsSync(path.join(absolutePath, "package.json")) ? "package.json" : "",
        ].filter(Boolean),
      };
    })
    .filter((entry) => entry.markers.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rebuildFromGithubPlan() {
  const status = git(["status", "--short"]);
  const current = githubCheck({ fetch: false });
  const plan = {
    schema: "pritha-rebuild-from-github-plan-v1",
    generatedAt: now(),
    action: "rebuild-from-github",
    ok: !yesMode,
    status: yesMode ? "blocked" : "plan_only",
    actionEnabled: false,
    destructivePotential: true,
    requiresConfirmation: true,
    confirmation: "not implemented in this safety pass",
    root: ROOT,
    github: current,
    localStatus: status.stdout || "clean",
    siblingAgentCandidates: siblingAgentCandidates(),
    preservedByDesign: [
      "Sibling child-agent folders next to Pritha",
      ".private/",
      ".memory-private/",
      ".queue/",
      ".logs/",
      "Any local files outside the checkout root",
    ],
    blockedReason: yesMode
      ? "The current implementation intentionally does not execute rebuild-from-GitHub. Build the reviewed plan first, then add a separate gated executor."
      : undefined,
    steps: [
      "Export an explicit local audit of tracked changes and ignored/private state.",
      "Create a timestamped backup of the current checkout root or verify an existing backup.",
      "Clone NumericalArt/Pritha into a fresh temporary directory.",
      "Run bootstrap prepare in the fresh checkout.",
      "Swap the checkout only after validation and operator confirmation.",
      "Re-scan sibling child agents and rebuild generated local indexes.",
    ],
  };
  return plan;
}

function refreshAgents() {
  const captured = [];
  const originalLog = console.log;
  try {
    console.log = (...parts) => captured.push(parts.join(" "));
    rebuildRegistry();
    const registryPath = path.join(AGENT_MEMORY_ROOT, "registry.md");
    return {
      schema: "pritha-refresh-agents-result-v1",
      generatedAt: now(),
      action: "refresh-agents",
      ok: true,
      status: "updated",
      registryPath: path.relative(ROOT, registryPath),
      records: readRegistryCount(),
      output: captured,
    };
  } finally {
    console.log = originalLog;
  }
}

function readRegistryCount() {
  const registryPath = path.join(AGENT_MEMORY_ROOT, "registry.md");
  if (!existsSync(registryPath)) return 0;
  const text = readFileSync(registryPath, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => /^\|\s*[^|-]/.test(line) && line.includes("|"))
    .filter((line) => !/^\|\s*Project\s*\|/i.test(line) && !/^\|\s*Repo\s*\|/i.test(line)).length;
}

function uniqueArtifactPath(relativePath) {
  const parsed = path.parse(relativePath);
  let candidate = relativePath;
  let index = 2;
  while (existsSync(path.join(ROOT, candidate))) {
    candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function uniqueSelfKnowledgeTarget(date) {
  const baseId = `${date}-pritha-self-knowledge-refresh`;
  const targetRoot = STATE_ROOT === ROOT ? path.join(ROOT, "03_reviews") : path.join(AGENT_MEMORY_ROOT, "reports");
  let absolutePath = path.join(targetRoot, `${baseId}.md`);
  let artifactId = baseId;
  let index = 2;
  while (existsSync(absolutePath)) {
    artifactId = `${baseId}-${index}`;
    absolutePath = path.join(targetRoot, `${artifactId}.md`);
    index += 1;
  }
  return { absolutePath, artifactId };
}

function refreshSelfKnowledge() {
  const date = today();
  const gitBranch = git(["branch", "--show-current"]);
  const gitCommit = git(["rev-parse", "--short", "HEAD"]);
  const gitStatus = git(["status", "--short"]);
  const contracts = maintenanceContracts();
  const { absolutePath, artifactId } = uniqueSelfKnowledgeTarget(date);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const body = `---
id: ${artifactId}
type: review
status: draft
created: ${date}
updated: ${date}
topics:
  - pritha-self
  - maintenance
  - cron-placeholder
tools:
  - git
  - github
sources:
  - AGENTS.md
  - scripts/pritha-maintenance.mjs
related:
  workflows: []
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha
privacy: project
retention: durable
review_status: draft
confidence: medium
---

# Pritha Self-Knowledge Refresh

Generated: ${now()}

## Local State

- Root: \`${ROOT}\`
- Branch: \`${gitBranch.ok ? gitBranch.stdout : "unknown"}\`
- Commit: \`${gitCommit.ok ? gitCommit.stdout : "unknown"}\`
- Working tree: ${gitStatus.stdout ? "has local changes" : "clean"}
- Registry rows: ${readRegistryCount()}

## Maintenance Surface

The current maintenance layer is manual-first. Cron/scheduled execution is a placeholder and remains disabled until a separate operations decision enables it.

${contracts.actions.map((action) => `- \`${action.id}\`: ${action.summary} Status: \`${action.status}\`.`).join("\n")}

## Safety Notes

- GitHub update execution is restricted to clean fast-forward updates on \`main\`.
- Rebuild from GitHub is plan-only in this implementation.
- GitHub Knowledge Radar stores candidate links and review metadata only; it does not clone or execute third-party repositories.

## Follow-Up

- Review this draft before turning any observation into a standard or decision.
- Run \`node scripts/self-test.mjs\` after applying maintenance changes.
`;
  writeFileSync(absolutePath, body);
  return {
    schema: "pritha-self-knowledge-refresh-result-v1",
    generatedAt: now(),
    action: "refresh-self-knowledge",
    ok: true,
    status: "created",
    artifactPath: path.relative(STATE_ROOT, absolutePath),
  };
}

function radarStatus() {
  const result = run("node", ["scripts/github-knowledge-radar.mjs", "status", "--json"], { timeoutMs: 30000 });
  if (!result.ok) {
    return {
      ok: false,
      status: "failed",
      detail: result.stderr || result.stdout || "GitHub Knowledge Radar status failed",
    };
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function maintenanceStatus() {
  const contracts = maintenanceContracts();
  return {
    schema: "pritha-maintenance-status-v1",
    generatedAt: now(),
    root: ROOT,
    cronAdapter: contracts.cronAdapter,
    github: githubCheck({ fetch: !noFetchMode }),
    radar: radarStatus(),
    actions: contracts.actions,
  };
}

function printPayload(payload, exitCode = 0) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${payload.schema || "pritha-maintenance"}\n`);
    process.stdout.write(`status: ${payload.status || (payload.ok === false ? "failed" : "ok")}\n`);
    if (payload.action) process.stdout.write(`action: ${payload.action}\n`);
    if (payload.root) process.stdout.write(`root: ${payload.root}\n`);
    if (payload.result) process.stdout.write(`result: ${payload.result}\n`);
    if (payload.artifactPath) process.stdout.write(`artifact: ${payload.artifactPath}\n`);
  }
  process.exitCode = exitCode;
}

let payload;
let exitCode = 0;

try {
  switch (command) {
    case "status":
      payload = maintenanceStatus();
      break;
    case "github-check":
      payload = githubCheck({ fetch: !noFetchMode });
      exitCode = payload.status === "blocked" || payload.status === "unavailable" ? 1 : 0;
      break;
    case "github-update":
      payload = githubUpdate();
      exitCode = payload.ok ? 0 : 2;
      break;
    case "rebuild-from-github":
      payload = rebuildFromGithubPlan();
      exitCode = payload.ok ? 0 : 2;
      break;
    case "refresh-agents":
      payload = refreshAgents();
      break;
    case "refresh-self-knowledge":
      payload = refreshSelfKnowledge();
      break;
    case "github-knowledge-radar":
      payload = {
        schema: "pritha-maintenance-action-v1",
        generatedAt: now(),
        action: "github-knowledge-radar",
        ok: true,
        status: "manual_only",
        radar: radarStatus(),
        commands: [
          "node scripts/github-knowledge-radar.mjs search --topic agent-harness --json",
          "node scripts/github-knowledge-radar.mjs register --repo https://github.com/OWNER/REPO --topics agent-harness --why \"reason\" --json",
        ],
      };
      break;
    default:
      payload = {
        schema: "pritha-maintenance-error-v1",
        generatedAt: now(),
        ok: false,
        status: "unknown_command",
        command,
        availableCommands: ["status", "github-check", "github-update", "rebuild-from-github", "refresh-agents", "refresh-self-knowledge", "github-knowledge-radar"],
      };
      exitCode = 1;
  }
} catch (error) {
  payload = {
    schema: "pritha-maintenance-error-v1",
    generatedAt: now(),
    ok: false,
    status: "failed",
    command,
    detail: error instanceof Error ? error.message : String(error),
  };
  exitCode = 1;
}

printPayload(payload, exitCode);
