import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const host = process.env.PRITHA_CONTROL_CENTER_HOST && process.env.PRITHA_CONTROL_CENTER_HOST !== "0.0.0.0" ? process.env.PRITHA_CONTROL_CENTER_HOST : "127.0.0.1";
const allowLiveBuild = process.env.PRITHA_CONTROL_CENTER_ALLOW_LIVE_BUILD === "1";
const distDir = String(process.env.PRITHA_CONTROL_CENTER_DIST_DIR || ".next").trim();

function instancePort() {
  if (process.env.PRITHA_CONTROL_CENTER_PORT) return Number(process.env.PRITHA_CONTROL_CENTER_PORT);
  let dir = process.cwd();
  for (let index = 0; index < 6; index += 1) {
    const pointer = path.join(dir, ".pritha-instance.json");
    if (existsSync(pointer)) {
      try {
        const parsed = JSON.parse(readFileSync(pointer, "utf8"));
        const port = Number(parsed.port);
        if (Number.isFinite(port)) return port;
      } catch {
        break;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 3420;
}

const configuredPort = instancePort();
const ports = [configuredPort].filter(Number.isFinite);

if (allowLiveBuild || distDir !== ".next") process.exit(0);

async function runningControlCenterUrl(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);

  try {
    const url = `http://${host}:${port}`;
    const response = await fetch(`${url}/api/health`, { signal: controller.signal });
    if (!response.ok) return null;

    const health = await response.json().catch(() => null);
    return health?.service === "pritha-control-center" ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const runningUrl = (await Promise.all(ports.map((port) => runningControlCenterUrl(port)))).find(Boolean);

if (runningUrl) {
  console.error(
    [
      `Refusing to run next build while Pritha Control Center is already running at ${runningUrl}.`,
      "Rebuilding .next under a live next start process can leave pages referencing stale JavaScript chunks.",
      "Stop and restart Control Center around the build, or set PRITHA_CONTROL_CENTER_ALLOW_LIVE_BUILD=1 if this is intentional.",
    ].join("\n"),
  );
  process.exit(1);
}
