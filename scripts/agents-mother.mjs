#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

if (!process.env.PRITHA_SUPPRESS_DEPRECATION_NOTE) {
  console.error("Deprecation notice: Agents Mother is now Pritha. Use `node scripts/pritha.mjs <command>`; this alias remains for compatibility.");
}

const root = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root });

await import("./agents-mother/index.mjs");
