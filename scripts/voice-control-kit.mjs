#!/usr/bin/env node
import { parseLongArgs as parseArgs } from "./lib/cli-args.mjs";

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { resolvePrithaAgentParent, resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const KIT_REL = "11_agents/reference-implementations/fespa26-voice-control";
const KIT_DIR = path.join(ROOT, KIT_REL);
const MANIFEST_PATH = path.join(KIT_DIR, "manifest.json");

function manifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function walkFiles(dir, prefix = "") {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const fullPath = path.join(dir, name);
    const rel = path.join(prefix, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath, rel));
    } else {
      files.push({ path: rel, bytes: stat.size });
    }
  }
  return files;
}

function usage() {
  console.log(`Usage:
  node scripts/voice-control-kit.mjs plan
  node scripts/voice-control-kit.mjs list
  node scripts/voice-control-kit.mjs copy --target <child-agent> [--force]
  node scripts/voice-control-kit.mjs copy --target sibling:<agent-slug> [--force]

Pritha alias:
  node scripts/pritha.mjs voice-kit plan
  node scripts/pritha.mjs voice-kit copy --target sibling:child-agent`);
}

function plan() {
  const data = manifest();
  console.log("Pritha voice-control kit");
  console.log(`Reference: ${KIT_REL}`);
  console.log(`Status: ${data.status}`);
  console.log(`Source: ${data.source_version}`);
  console.log("");
  console.log("Use when:");
  for (const item of data.use_when) console.log(`- ${item}`);
  console.log("");
  console.log("Lanes:");
  for (const item of data.lanes) console.log(`- ${item}`);
  console.log("");
  console.log("Adaptation checklist:");
  for (const item of data.required_adaptation) console.log(`- ${item}`);
  console.log("");
  console.log("Commands:");
  for (const [name, command] of Object.entries(data.commands)) {
    console.log(`- ${name}: ${command}`);
  }
}

function list() {
  const files = walkFiles(KIT_DIR);
  for (const file of files) {
    console.log(`${file.path}\t${file.bytes}`);
  }
}

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function prepareTargetRoot(requestedPath) {
  const requested = path.resolve(requestedPath);
  if (existsSync(requested)) {
    const targetStat = lstatSync(requested);
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      throw new Error(`Target must be a regular directory and not a symlink: ${requestedPath}`);
    }
    return realpathSync(requested);
  }

  let ancestor = path.dirname(requested);
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const ancestorStat = lstatSync(ancestor);
  if (!ancestorStat.isDirectory() || ancestorStat.isSymbolicLink()) {
    throw new Error(`Target has an unsafe nearest existing ancestor: ${ancestor}`);
  }
  const canonicalAncestor = realpathSync(ancestor);
  const tail = path.relative(ancestor, requested).split(path.sep).filter(Boolean);
  if (tail.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Target path is unsafe: ${requestedPath}`);
  }

  let current = canonicalAncestor;
  for (const segment of tail) {
    const next = path.join(current, segment);
    if (!existsSync(next)) mkdirSync(next);
    const nextStat = lstatSync(next);
    if (!nextStat.isDirectory() || nextStat.isSymbolicLink()) {
      throw new Error(`Target path contains an unsafe component: ${requestedPath}`);
    }
    const canonicalNext = realpathSync(next);
    if (!isWithin(canonicalAncestor, canonicalNext)) {
      throw new Error(`Target path escapes its canonical ancestor: ${requestedPath}`);
    }
    current = canonicalNext;
  }
  return current;
}

function ensureSafeDirectory(root, segments) {
  const canonicalRoot = realpathSync(root);
  let current = canonicalRoot;
  for (const segment of segments) {
    const next = path.join(current, segment);
    if (!existsSync(next)) mkdirSync(next);
    const nextStat = lstatSync(next);
    if (!nextStat.isDirectory() || nextStat.isSymbolicLink()) {
      throw new Error(`Destination path contains an unsafe component: ${next}`);
    }
    const canonicalNext = realpathSync(next);
    if (!isWithin(canonicalRoot, canonicalNext)) {
      throw new Error(`Destination path escapes target root: ${next}`);
    }
    current = canonicalNext;
  }
  return current;
}

function copyToTarget(options) {
  const target = String(options.target || "").trim();
  if (!target) {
    throw new Error("Missing --target <child-agent>");
  }
  let targetRoot;
  if (target.startsWith("sibling:")) {
    const agentSlug = target.slice("sibling:".length);
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/.test(agentSlug) || agentSlug === "." || agentSlug === "..") {
      throw new Error("Invalid sibling agent slug");
    }
    const agentParent = prepareTargetRoot(resolvePrithaAgentParent({ root: ROOT }));
    targetRoot = prepareTargetRoot(path.join(agentParent, agentSlug));
  } else {
    targetRoot = prepareTargetRoot(path.resolve(ROOT, target));
  }
  const voiceRoot = ensureSafeDirectory(targetRoot, ["interfaces", "realtime-voice"]);
  const destination = path.join(voiceRoot, "fespa26-reference");
  const readmePath = path.join(voiceRoot, "README.md");
  if (existsSync(destination)) {
    const destinationStat = lstatSync(destination);
    if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
      throw new Error(`Destination must be a regular directory and not a symlink: ${destination}`);
    }
    if (!options.force) {
      throw new Error(`Destination already exists: ${destination}. Pass --force to replace it.`);
    }
  }
  if (existsSync(readmePath)) {
    const readmeStat = lstatSync(readmePath);
    if (!readmeStat.isFile() || readmeStat.isSymbolicLink()) {
      throw new Error(`Interface README must be a regular file and not a symlink: ${readmePath}`);
    }
    if (!options.force) {
      throw new Error(`Interface README already exists: ${readmePath}. Pass --force to replace it.`);
    }
  }
  if (existsSync(destination)) rmSync(destination, { recursive: true, force: false });
  cpSync(KIT_DIR, destination, { recursive: true, force: false, errorOnExist: true });
  writeFileSync(
    readmePath,
    `# Realtime Voice Interface

This interface was initialized from Pritha's FESPA26 voice-control reference pack.

Start here:

- \`fespa26-reference/README.md\`
- \`fespa26-reference/manifest.json\`
- \`fespa26-reference/source/\`

Adapt the reference before wiring it into runtime code. Replace FESPA-specific
repositories, env prefixes, prompts and tool schemas with this agent's contract.
`,
    { flag: options.force ? "w" : "wx" },
  );
  console.log(`Copied voice-control reference to ${path.relative(ROOT, destination)}`);
}

function main() {
  const command = process.argv[2] || "plan";
  const options = parseArgs(process.argv.slice(3));
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Voice-control kit manifest not found: ${MANIFEST_PATH}`);
  }
  if (command === "help") {
    usage();
    return;
  }
  if (command === "plan") {
    plan();
    return;
  }
  if (command === "list") {
    list();
    return;
  }
  if (command === "copy" || command === "init") {
    copyToTarget(options);
    return;
  }
  throw new Error(`Unknown voice-control-kit command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
