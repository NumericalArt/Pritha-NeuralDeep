#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const root = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root });

await import("./agents-mother/index.mjs");
