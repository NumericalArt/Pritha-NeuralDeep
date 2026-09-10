#!/usr/bin/env node
import { exists, printStatus, readJson } from "./status-lib.mjs";

const manifest = readJson("tools/manifest.json");
const profiles = Array.isArray(manifest.profiles) ? manifest.profiles : [];
const items = [];
for (const profile of profiles) {
  for (const tool of profile.tools || []) {
    items.push({
      name: `${profile.name}:${tool}`,
      status: exists(tool) ? "present" : "missing",
      detail: profile.boundary || "",
    });
  }
}

const status = {
  name: "tools",
  ok: items.length > 0 && items.every((item) => item.status === "present"),
  agent: manifest.agent || "unknown",
  profiles: profiles.length,
  items,
};

printStatus(status);
if (!status.ok) process.exit(1);
