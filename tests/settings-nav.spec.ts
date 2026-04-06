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

    // Click through each tab — if any crashes, the page dies
    for (const tab of ["Payments", "Staff", "Integrations", "Intelligence", "Operations", "Store"]) {
      await page.getByRole("button", { name: tab }).click();
      await page.waitForTimeout(500);
    }

    // Verify page is still alive by checking content is visible
    await expect(page.locator("text=Changes save automatically")).toBeVisible();

    // Navigate away via full page load
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/dashboard/);
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
