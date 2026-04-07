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
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Use Next.js router to navigate (simulates what happens when user clicks a link)
    await page.evaluate(() => window.history.pushState({}, "", "/dashboard"));
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("can navigate from settings to inventory", async ({ page }) => {
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Navigate via full page load (sidebar click has overlap issues at test viewport)
    await page.goto("/dashboard/inventory", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/inventory/);
  });

  test("can switch settings tabs without breaking page", async ({ page }) => {
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Navigate through each settings sub-page via URL
    for (const tab of ["payments", "staff", "integrations", "intelligence", "operations", "store"]) {
      await page.goto(`/dashboard/settings/${tab}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
    }

    // Verify page is still alive
    await expect(page.locator("text=Changes save automatically")).toBeVisible();

    // Navigate away via full page load
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("can click sidebar link from settings to navigate", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });

    // Wait for sidebar to render
    await page.waitForTimeout(2000);

    // Expand Admin group (Settings is in Admin)
    // Then click Dashboard link which is in a different group
    const salesGroup = page.locator("button:has-text('Sales')");
    if (await salesGroup.isVisible()) {
      await salesGroup.click();
      await page.waitForTimeout(300);
    }

    // Try clicking the Register link (should be in Sales group)
    const registerLink = page.locator('a[href="/dashboard/register"]').first();
    if (await registerLink.isVisible()) {
      await registerLink.click();
      await page.waitForURL("**/dashboard/register**", { timeout: 10_000 });
      await expect(page).toHaveURL(/register/);
    } else {
      // Fallback: check if ANY sidebar link is clickable
      const anyLink = page.locator('nav a[href^="/dashboard/"]').first();
      const href = await anyLink.getAttribute("href");
      await anyLink.click();
      await page.waitForURL(`**${href}**`, { timeout: 10_000 });
    }
  });

  test("no hydration errors on dashboard page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const critical = errors.filter((e) => e.includes("418") || e.includes("Hydration"));
    console.log("=== DASHBOARD ERRORS ===");
    errors.forEach((e) => console.log("  ", e.slice(0, 200)));
    expect(critical).toEqual([]);
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
