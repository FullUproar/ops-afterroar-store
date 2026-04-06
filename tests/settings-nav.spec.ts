/**
 * Settings Navigation Test
 *
 * Reproduces the hydration bug where navigating TO settings works,
 * but navigating AWAY is impossible (React tree dies).
 *
 * Run: npx playwright test tests/settings-nav.spec.ts --project=auth-desktop
 */
import { test, expect } from "@playwright/test";

test.describe("authenticated: settings navigation", () => {
  test("can navigate to settings and back to dashboard", async ({ page }) => {
    // Start at dashboard
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/dashboard/);

    // Navigate to settings — use direct navigation since sidebar scrolling
    // can have overlapping group headers at certain viewport sizes
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });

    // Wait for settings page to fully render (not just "Loading settings...")
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Now try to navigate away — this is what breaks
    // Use JS navigation to avoid sidebar overlap issues at test viewport size
    await page.evaluate(() => {
      const link = document.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;
      if (link) link.click();
    });

    // If we can reach dashboard URL, navigation works
    await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("can navigate to settings and to inventory", async ({ page }) => {
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });

    // Wait for settings to load
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Navigate to inventory via JS click (avoids sidebar overlap at test viewport)
    await page.evaluate(() => {
      const link = document.querySelector('a[href="/dashboard/inventory"]') as HTMLAnchorElement;
      if (link) link.click();
    });
    await page.waitForURL("**/dashboard/inventory**", { timeout: 10_000 });
    await expect(page).toHaveURL(/inventory/);
  });

  test("can switch settings tabs without breaking navigation", async ({ page }) => {
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Click through each tab
    for (const tab of ["Payments", "Staff", "Integrations", "Intelligence", "Operations", "Store"]) {
      await page.getByRole("button", { name: tab }).click();
      await page.waitForTimeout(500);
    }

    // Now navigate away via JS click
    await page.evaluate(() => {
      const link = document.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;
      if (link) link.click();
    });
    await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("no console errors on settings page", async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));

    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Wait a bit for any delayed errors
    await page.waitForTimeout(3000);

    // Log ALL errors and warnings for debugging
    console.log("=== CONSOLE ERRORS ===");
    errors.forEach((e) => console.log("  ERROR:", e.slice(0, 200)));
    console.log("=== CONSOLE WARNINGS ===");
    warnings.forEach((w) => console.log("  WARN:", w.slice(0, 200)));

    // Check for hydration or React errors
    const criticalErrors = errors.filter(
      (e) => e.includes("Hydration") || e.includes("hydration") || e.includes("did not match")
        || e.includes("mismatch") || e.includes("Minified React") || e.includes("PAGE_ERROR")
        || e.includes("Cannot read") || e.includes("is not a function")
    );

    expect(criticalErrors).toEqual([]);
  });
});
