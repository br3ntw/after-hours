import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests for the GitHub Pages browser demo: the static export (`npm run build:pages`)
 * served under /after-hours/, with the API and simulation running in the page.
 * Run with `npm run e2e:pages` after building.
 */
export default defineConfig({
  testDir: "./e2e-pages",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4174/after-hours/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e-pages/serve.mjs 4174",
    url: "http://127.0.0.1:4174/after-hours/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
