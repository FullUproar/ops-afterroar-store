/**
 * Run this once to create a saved auth session for the visual QA tests.
 *
 *   npx playwright test tests/auth-setup.ts --project=public-desktop
 *
 * It logs in with the bot-owner credentials and saves browser state to
 * tests/.auth/state.json so the "authenticated" tests can reuse it.
 */
import { test as setup } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth", "state.json");

setup("authenticate as bot-owner", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });

  // Fill credentials
  await page.getByLabel("Email").fill("bot-owner@afterroar.store");
  await page.getByLabel("Password").fill("bot1234!");

  // Click sign in
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  // Wait for redirect to dashboard (auth complete)
  await page.waitForURL("**/dashboard**", { timeout: 15_000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Save signed-in state
  await page.context().storageState({ path: AUTH_FILE });
});
