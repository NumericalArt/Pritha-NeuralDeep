#!/usr/bin/env node

console.error([
  "Deprecated: the standalone Pritha Voice Control experiment on port 3401 has been retired.",
  "Use the Control Center voice runtime instead:",
  "  npm run control-center",
  "  open http://127.0.0.1:3420/voice",
].join("\n"));

process.exitCode = 1;
