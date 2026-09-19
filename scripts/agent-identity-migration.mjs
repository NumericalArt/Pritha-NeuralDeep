#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLongArgs } from "./lib/cli-args.mjs";
import { readBoundedRegularFile } from "./lib/safe-file-read.mjs";
import { applyAgentIdentityMigration, planAgentIdentityMigration } from "./agents-mother/identity-migration.mjs";

function main() {
  const args = parseLongArgs(process.argv.slice(2));
  const options = { root: args.root, stateRoot: args["state-root"], memoryRoot: args["memory-root"], legacyRoots: args["legacy-roots"] ? JSON.parse(args["legacy-roots"]) : [] };
  if (!Array.isArray(options.legacyRoots) || options.legacyRoots.some(value => typeof value !== "string" || !path.isAbsolute(value))) throw new Error("--legacy-roots must be a JSON array of verified absolute roots");
  if (args._[0] === "plan") console.log(JSON.stringify(planAgentIdentityMigration(options), null, 2));
  else if (args._[0] === "apply") {
    if (!args.plan || !args["plan-lock"]) throw new Error("apply requires --plan <reviewed-json> --plan-lock <sha256>");
    const plan = JSON.parse(readBoundedRegularFile(path.resolve(args.plan), { maxBytes: 2_000_000 }).text);
    console.log(JSON.stringify(applyAgentIdentityMigration(plan, { ...options, planLock: args["plan-lock"], approvedBy: args["approved-by"], authorizationBasis: args["authorization-basis"] }), null, 2));
  } else throw new Error("Use plan [--legacy-roots '[absolute roots]'] or apply --plan <reviewed-json> --plan-lock <sha256> --approved-by user|codex-operator [--authorization-basis <text>]. Plans and mappings are private, attribution-only data.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
