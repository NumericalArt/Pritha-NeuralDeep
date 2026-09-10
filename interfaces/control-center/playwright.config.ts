import { defineConfig, devices } from "@playwright/test";

const port = process.env.PRITHA_CONTROL_CENTER_PORT || "3420";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      PRITHA_CONTROL_CENTER_HOST: "127.0.0.1",
      PRITHA_CONTROL_CENTER_PORT: port,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
