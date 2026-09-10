#!/usr/bin/env node

import process from "node:process";
import { FORBIDDEN_RAW_GLOBS, FORBIDDEN_RAW_PATHS } from "./lib/privacy.mjs";

const args = new Set(process.argv.slice(2));
const filterRepoArgs = args.has("--filter-repo-args");

const pathspecs = [
  ...FORBIDDEN_RAW_PATHS,
  ...FORBIDDEN_RAW_GLOBS,
];

if (filterRepoArgs) {
  const parts = [];
  for (const spec of pathspecs) {
    if (spec.includes("*")) {
      parts.push("--path-glob", spec);
    } else {
      parts.push("--path", spec);
    }
  }
  parts.push("--invert-paths");
  console.log(parts.map((part) => JSON.stringify(part)).join(" "));
} else {
  console.log(pathspecs.join("\n"));
}
