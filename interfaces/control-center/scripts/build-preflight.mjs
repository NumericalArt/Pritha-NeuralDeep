const host = process.env.PRITHA_CONTROL_CENTER_HOST && process.env.PRITHA_CONTROL_CENTER_HOST !== "0.0.0.0" ? process.env.PRITHA_CONTROL_CENTER_HOST : "127.0.0.1";
const allowLiveBuild = process.env.PRITHA_CONTROL_CENTER_ALLOW_LIVE_BUILD === "1";
const distDir = String(process.env.PRITHA_CONTROL_CENTER_DIST_DIR || ".next").trim();
const configuredPort = Number(process.env.PRITHA_CONTROL_CENTER_PORT || 3420);
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
