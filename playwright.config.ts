import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    env: { API_PROXY_TARGET: "http://127.0.0.1:3001" },
    url: "http://127.0.0.1:5173/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
