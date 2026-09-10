#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict");
const onlineMode = args.has("--online");
const skipPrePushAudit = args.has("--skip-pre-push-audit");
const skipWorkingTreeCheck = args.has("--skip-working-tree-check");

function run(command, commandArgs = [], options = {}) {
  const result = runSyncProbe(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout || 30000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function commandExists(command) {
  const result = run("sh", ["-lc", `command -v ${command}`]);
  return result.ok ? result.stdout : "";
}

function check(id, status, detail, required = true) {
  return { id, status, required, detail };
}

function filesExist(files) {
  const missing = files.filter((file) => !existsSync(path.join(ROOT, file)));
  return missing.length ? { ok: false, missing } : { ok: true, missing: [] };
}

function parseRemote(remoteUrl) {
  const match = remoteUrl.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

function firstHash(output) {
  return String(output || "").trim().split(/\s+/)[0] || "";
}

function remoteTagHash(output) {
  const lines = String(output || "").trim().split("\n").filter(Boolean);
  const peeled = lines.find((line) => line.includes("refs/tags/v0.1.0^{}"));
  const exact = lines.find((line) => /\srefs\/tags\/v0\.1\.0$/.test(line));
  return firstHash(peeled || exact || "");
}

function prePushAuditCheck() {
  if (skipPrePushAudit) {
    return check("pre-push-audit", "skipped", "skipped by --skip-pre-push-audit", false);
  }
  const result = run("node", ["scripts/pre-push-audit.mjs", "--json"], { timeout: 60000 });
  if (!result.ok) {
    return check("pre-push-audit", "fail", result.stderr || result.stdout || "pre-push audit failed");
  }
  try {
    const payload = JSON.parse(result.stdout);
    return check(
      "pre-push-audit",
      payload.failed === 0 ? "pass" : "fail",
      `status=${payload.status}; failed=${payload.failed}; warnings=${payload.warnings}`,
    );
  } catch {
    return check("pre-push-audit", "fail", "pre-push audit did not return JSON");
  }
}

const checks = [];
const gitRoot = run("git", ["rev-parse", "--show-toplevel"]);
checks.push(check("git-repository", gitRoot.ok ? "pass" : "fail", gitRoot.ok ? gitRoot.stdout : gitRoot.stderr));

const branch = run("git", ["branch", "--show-current"]);
checks.push(check("main-branch", branch.stdout === "main" ? "pass" : "warn", branch.stdout || "unknown branch", false));

const trackedStatus = run("git", ["status", "--porcelain", "--untracked-files=no"]);
checks.push(skipWorkingTreeCheck
  ? check("tracked-working-tree-clean", "skipped", "skipped by --skip-working-tree-check", false)
  : check(
    "tracked-working-tree-clean",
    trackedStatus.stdout ? "fail" : "pass",
    trackedStatus.stdout || "no tracked changes",
  ));

const requiredDocs = filesExist([
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "docs/release.md",
  "docs/getting-started.md",
]);
checks.push(check(
  "release-docs",
  requiredDocs.ok ? "pass" : "fail",
  requiredDocs.ok ? "required release docs present" : `missing: ${requiredDocs.missing.join(", ")}`,
));

const workflows = filesExist([
  ".github/workflows/quality-gate.yml",
  ".github/workflows/memory-validate.yml",
  ".github/workflows/setup-wizard-smoke.yml",
  ".github/dependabot.yml",
]);
checks.push(check(
  "github-workflows",
  workflows.ok ? "pass" : "fail",
  workflows.ok ? "GitHub workflow files present" : `missing: ${workflows.missing.join(", ")}`,
));

checks.push(prePushAuditCheck());

const origin = run("git", ["remote", "get-url", "origin"]);
const remote = origin.ok ? parseRemote(origin.stdout) : null;
checks.push(check(
  "origin-remote",
  remote ? "pass" : "missing",
  origin.ok ? origin.stdout : "origin remote is not configured",
));
checks.push(check(
  "remote-repo-name",
  remote?.repo?.toLowerCase() === "pritha" ? "pass" : remote ? "warn" : "missing",
  remote ? `detected ${remote.fullName}` : "origin remote is not configured",
  false,
));

const ghPath = commandExists("gh");
checks.push(check("github-cli", ghPath ? "pass" : "missing", ghPath || "GitHub CLI is not installed", false));
if (ghPath) {
  const ghAuth = run("gh", ["auth", "status"], { timeout: 15000 });
  checks.push(check(
    "github-cli-auth",
    ghAuth.ok ? "pass" : "warn",
    ghAuth.ok ? "GitHub CLI is authenticated" : (ghAuth.stderr || ghAuth.stdout || "GitHub CLI is not authenticated"),
    false,
  ));
}

const localTag = run("git", ["rev-parse", "-q", "--verify", "refs/tags/v0.1.0"]);
checks.push(check("local-v0.1.0-tag", localTag.ok ? "pass" : "missing", localTag.ok ? localTag.stdout : "local tag v0.1.0 not found"));

if (onlineMode && remote) {
  const localHead = run("git", ["rev-parse", "HEAD"]);
  const remoteMain = run("git", ["ls-remote", "--heads", "origin", "main"], { timeout: 60000 });
  checks.push(check("remote-main-branch", remoteMain.stdout ? "pass" : "missing", remoteMain.stdout || remoteMain.stderr || "remote main not found"));
  const remoteMainHash = firstHash(remoteMain.stdout);
  checks.push(check(
    "remote-main-matches-head",
    remoteMainHash && localHead.ok && remoteMainHash === localHead.stdout ? "pass" : "fail",
    remoteMainHash
      ? `remote=${remoteMainHash}; local=${localHead.stdout || "unknown"}`
      : "remote main hash unavailable",
  ));

  const remoteTag = run("git", ["ls-remote", "--tags", "origin", "v0.1.0"], { timeout: 60000 });
  checks.push(check("remote-v0.1.0-tag", remoteTag.stdout ? "pass" : "missing", remoteTag.stdout || remoteTag.stderr || "remote tag v0.1.0 not found"));
  const localTagCommit = run("git", ["rev-parse", "v0.1.0^{}"]);
  const remoteTagCommit = remoteTagHash(remoteTag.stdout);
  checks.push(check(
    "remote-v0.1.0-matches-local",
    remoteTagCommit && localTagCommit.ok && remoteTagCommit === localTagCommit.stdout ? "pass" : "fail",
    remoteTagCommit
      ? `remote=${remoteTagCommit}; local=${localTagCommit.stdout || "unknown"}`
      : "remote v0.1.0 tag hash unavailable",
  ));
} else {
  checks.push(check("remote-main-branch", "not-checked", onlineMode ? "origin remote is missing" : "run with --online after configuring origin", true));
  checks.push(check("remote-main-matches-head", "not-checked", onlineMode ? "origin remote is missing" : "run with --online after configuring origin", true));
  checks.push(check("remote-v0.1.0-tag", "not-checked", onlineMode ? "origin remote is missing" : "run with --online after configuring origin", true));
  checks.push(check("remote-v0.1.0-matches-local", "not-checked", onlineMode ? "origin remote is missing" : "run with --online after configuring origin", true));
}

checks.push(check(
  "live-ci-and-release",
  "not-checked",
  "verify live GitHub Actions, branch protection, GitHub Release and fresh public clone after pushing",
  true,
));

const failed = checks.filter((item) => item.status === "fail");
const missingRequired = checks.filter((item) => item.required && (item.status === "missing" || item.status === "not-checked"));
const warnings = checks.filter((item) => item.status === "warn" || (!item.required && item.status === "missing"));
const status = failed.length ? "fail" : missingRequired.length ? "pending-external" : "pass";

const payload = {
  schema: "pritha-github-release-status-v1",
  root: ROOT,
  status,
  online: onlineMode,
  strict: strictMode,
  failed: failed.length,
  missing_required: missingRequired.length,
  warnings: warnings.length,
  remote: remote || null,
  checks,
};

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Pritha GitHub release status: ${status}`);
  if (remote) console.log(`Remote: ${remote.fullName}`);
  for (const item of checks) {
    console.log(`- ${item.status.toUpperCase()} ${item.id}`);
    console.log(`  ${item.detail}`);
  }
}

if (failed.length > 0 || (strictMode && status !== "pass")) {
  process.exitCode = 1;
}
