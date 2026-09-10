import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const port = Number(process.env.PRITHA_CONTROL_CENTER_PORT),
  root = process.env.TECHSCOPE_ROOT,
  state = process.env.PRITHA_STATE_ROOT;
if (
  process.env.PRITHA_INSTANCE_ID !== "search-test" ||
  !root ||
  !state ||
  path.resolve(root) === path.resolve(state) ||
  !Number.isInteger(port) ||
  port < 10000
)
  throw new Error("Isolated search-test environment required");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/search-e2e",
  workers: 1,
  timeout: 45000,
  use: { baseURL, trace: "retain-on-failure" },
  outputDir: path.join(state, "artifacts", "playwright"),
  webServer: {
    command: "npm run start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
    env: { ...process.env, PRITHA_CONTROL_CENTER_PORT: String(port) },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
