import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "https://www.afterroar.store",
    screenshot: "off",
    trace: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth-setup\.ts/,
    },
    {
      name: "public-desktop",
      use: {
        viewport: { width: 1280, height: 800 },
      },
      grep: /public/,
      testMatch: /visual-qa\.spec\.ts/,
    },
    {
      name: "public-tablet",
      use: {
        viewport: { width: 768, height: 1024 },
      },
      grep: /public/,
      testMatch: /visual-qa\.spec\.ts/,
    },
    {
      name: "auth-desktop",
      use: {
        viewport: { width: 1280, height: 800 },
        storageState: "tests/.auth/state.json",
      },
      grep: /authenticated/,
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "auth-tablet",
      use: {
        viewport: { width: 768, height: 1024 },
        storageState: "tests/.auth/state.json",
      },
      grep: /authenticated/,
      testMatch: /visual-qa\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
});
