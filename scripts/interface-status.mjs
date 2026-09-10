#!/usr/bin/env node
import { printStatus, readJson } from "./status-lib.mjs";

const manifest = readJson("interfaces/manifest.json");
const adapters = Array.isArray(manifest.adapters) ? manifest.adapters : [];
const status = {
  name: "interfaces",
  ok: adapters.length > 0 && adapters.every((item) => item.status),
  agent: manifest.agent || "unknown",
  primary_interface: manifest.primary_interface || "unknown",
  telegram_mode: manifest.telegram_mode || "unknown",
  items: adapters.map((adapter) => ({
    name: adapter.name || "unnamed",
    status: adapter.status || "unknown",
    detail: adapter.mode || "",
  })),
};

printStatus(status);
if (!status.ok) process.exit(1);
