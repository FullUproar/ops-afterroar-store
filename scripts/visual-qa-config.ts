import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "https://www.afterroar.store";

export default defineConfig({
  testDir: "./scripts",
  testMatch: "visual-qa.ts",
  outputDir: "./scripts/visual-qa-output",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    screenshot: "off",
    trace: "off",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7)"] },
    },
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    },
    {
      name: "pos-terminal",
      use: {
        viewport: { width: 1024, height: 768 },
        userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
        isMobile: false,
        hasTouch: true,
      },
    },
  ],
});
