import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function boundedIdentity(value: string | undefined, fallback: string, pattern: RegExp) {
  const normalized = String(value || "").trim();
  return pattern.test(normalized) ? normalized.slice(0, 80) : fallback;
}

function buildId() {
  const configured = String(process.env.PRITHA_CONTROL_CENTER_BUILD_ID || "").trim();
  if (configured) return configured.slice(0, 200);
  const candidate = path.join(process.cwd(), ".next", "BUILD_ID");
  try {
    return existsSync(candidate) ? readFileSync(candidate, "utf8").trim().slice(0, 200) : "unknown";
  } catch {
    return "unknown";
  }
}

export function GET() {
  const instanceId = boundedIdentity(process.env.PRITHA_INSTANCE_ID, "main", /^[a-z0-9][a-z0-9._-]*$/i);
  const role = boundedIdentity(process.env.PRITHA_INSTANCE_ROLE, "developer", /^[a-z0-9][a-z0-9._-]*$/i);
  const configuredPort = Number(process.env.PRITHA_CONTROL_CENTER_PORT || 3420);
  const port = Number.isSafeInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
    ? configuredPort
    : 3420;
  const commit = boundedIdentity(
    process.env.PRITHA_CONTROL_CENTER_RELEASE_COMMIT,
    "unknown",
    /^(?:[a-f0-9]{7,40}|unknown)$/i,
  ).slice(0, 12);

  return Response.json({
    schema: "pritha-control-center-health-v2",
    ok: true,
    service: "pritha-control-center",
    status: "ready",
    instance: {
      id: instanceId,
      role,
      port,
    },
    release: {
      commit,
      buildId: buildId(),
    },
    timestamp: new Date().toISOString(),
  });
}
