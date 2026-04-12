import { defineConfig, devices } from "@playwright/test";
import * as path from "path";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "https://www.afterroar.store";

export default defineConfig({
  testDir: __dirname,
  testMatch: "site-audit.ts",
  outputDir: path.join(__dirname, "site-audit-output"),
  timeout: 300_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    screenshot: "off",
    trace: "off",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7)"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
