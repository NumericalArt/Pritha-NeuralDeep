import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const script = path.resolve("interfaces/control-center/scripts/build-preflight.mjs");

function runPreflight(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.resolve("."),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("close", (status) => resolve({ status, stderr }));
  });
}

test("build preflight blocks live .next mutation but allows an isolated staging build", async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service: "pritha-control-center" }));
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const live = await runPreflight({ PRITHA_CONTROL_CENTER_PORT: String(port), PRITHA_CONTROL_CENTER_DIST_DIR: ".next" });
    assert.equal(live.status, 1);
    assert.match(live.stderr, /Refusing to run next build/);

    const staged = await runPreflight({
      PRITHA_CONTROL_CENTER_PORT: String(port),
      PRITHA_CONTROL_CENTER_DIST_DIR: ".next-pritha-staging",
    });
    assert.equal(staged.status, 0, staged.stderr);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
