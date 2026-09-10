#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = path.resolve(
  process.env.PRITHA_STATE_ROOT
  || path.join(path.dirname(projectRoot), `${path.basename(projectRoot)}-state`, "main"),
);
const agentRoot = path.resolve(
  process.env.PRITHA_AGENT_PARENT
  || path.join(path.dirname(projectRoot), `${path.basename(projectRoot)}-agents`),
);
const service = String(process.env.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE || "pritha-neuraldeep");
const excludedDirectories = new Set([
  ".git",
  ".next",
  ".next-pritha-staging",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const maximumFileBytes = 128 * 1024 * 1024;

if (!/^[A-Za-z0-9._:-]{1,128}$/.test(service)) throw new Error("invalid_keychain_service");
const credential = runSyncProbe("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  timeout: 5_000,
});
const secret = credential.status === 0 ? Buffer.from(String(credential.stdout || "").trim()) : Buffer.alloc(0);
if (!secret.length) {
  console.log(JSON.stringify({ ok: false, keyConfigured: false, scannedFiles: 0, exactSecretOccurrences: null }));
  process.exitCode = 1;
} else {
  let scannedFiles = 0;
  let skippedOversized = 0;
  let readErrors = 0;
  let exactSecretOccurrences = 0;

  function visit(target) {
    let stat;
    try { stat = lstatSync(target); } catch { readErrors += 1; return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      if (excludedDirectories.has(path.basename(target))) return;
      let entries;
      try { entries = readdirSync(target); } catch { readErrors += 1; return; }
      for (const entry of entries) visit(path.join(target, entry));
      return;
    }
    if (!stat.isFile()) return;
    if (stat.size > maximumFileBytes) { skippedOversized += 1; return; }
    try {
      const content = readFileSync(target);
      scannedFiles += 1;
      let offset = 0;
      while ((offset = content.indexOf(secret, offset)) >= 0) {
        exactSecretOccurrences += 1;
        offset += secret.length;
      }
    } catch {
      readErrors += 1;
    }
  }

  for (const root of [projectRoot, stateRoot, agentRoot]) visit(root);
  const ok = exactSecretOccurrences === 0 && readErrors === 0;
  console.log(JSON.stringify({
    ok,
    keyConfigured: true,
    scannedFiles,
    skippedOversized,
    readErrors,
    exactSecretOccurrences,
  }));
  if (!ok) process.exitCode = 1;
}
