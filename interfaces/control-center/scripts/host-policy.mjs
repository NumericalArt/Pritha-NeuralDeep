#!/usr/bin/env node

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const value = String(process.env.PRITHA_CONTROL_CENTER_HOST || "").trim();

if (value && !LOOPBACK_HOSTS.has(value.toLowerCase())) {
  console.error(`${value ? `PRITHA_CONTROL_CENTER_HOST=${value}` : "PRITHA_CONTROL_CENTER_HOST"} is disabled in this build (localhost + Tailscale only).`);
  process.exit(1);
}
