#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import {
  containsForbiddenText,
  isForbiddenRawPath,
  isMemorySnapshotPath,
  isPrivacyTextTarget,
  isTextLikePath,
} from "./lib/privacy.mjs";

const ROOT = resolveTechscopeRoot();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict");

function git(commandArgs, options = {}) {
  const result = spawnSync("git", commandArgs, {
    cwd: ROOT,
    encoding: options.encoding || "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer || 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${commandArgs.join(" ")} failed`);
  }
  return String(result.stdout || "");
}

function trackedFiles() {
  return git(["ls-files", "-z"], { maxBuffer: 100 * 1024 * 1024 }).split("\0").filter(Boolean);
}

function shouldScanContent(relPath) {
  return isPrivacyTextTarget(relPath)
    || isMemorySnapshotPath(relPath)
    || (isTextLikePath(relPath) && relPath.endsWith(".md"));
}

function readPossiblyBinary(filePath) {
  const buffer = readFileSync(filePath);
  return buffer.toString("utf8");
}

function audit() {
  const files = trackedFiles();
  const findings = [];

  for (const file of files) {
    if (isForbiddenRawPath(file)) {
      findings.push({
        id: "tracked-raw-source",
        file,
        line: 0,
        text: "",
        description: "raw source/transcript/media artifacts must not be tracked",
      });
    }
  }

  for (const file of files) {
    const fullPath = path.join(ROOT, file);
    if (!existsSync(fullPath)) continue;
    if (!shouldScanContent(file)) continue;
    let text = "";
    try {
      text = readPossiblyBinary(fullPath);
    } catch {
      continue;
    }
    findings.push(...containsForbiddenText(file, text));
  }

  return {
    schema: "pritha-privacy-audit-v1",
    root: ROOT,
    strict: strictMode,
    status: findings.length === 0 ? "pass" : "fail",
    findings,
  };
}

try {
  const payload = audit();
  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Pritha privacy audit: ${payload.status}`);
    console.log(`Root: ${payload.root}`);
    if (payload.findings.length === 0) {
      console.log("- no raw/provenance retention findings");
    } else {
      console.log(`- findings: ${payload.findings.length}`);
      for (const finding of payload.findings.slice(0, 80)) {
        const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        console.log(`- ${finding.id} ${where}${finding.text ? `: ${finding.text}` : ""}`);
      }
      const remaining = payload.findings.length - 80;
      if (remaining > 0) console.log(`- ... ${remaining} more finding(s)`);
    }
  }
  if (payload.findings.length > 0 || (strictMode && payload.status !== "pass")) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
