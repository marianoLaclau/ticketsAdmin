import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL } from "./support/environment";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./scripts/global-setup.ts",
  outputDir: "./artifacts/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { open: "never", outputFolder: "artifacts/html-report" }],
      ]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
