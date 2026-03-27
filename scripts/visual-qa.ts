/**
 * Visual QA Runner for Afterroar Store Ops
 *
 * Takes screenshots at key moments for AI review.
 *
 * Usage:
 *   npx playwright test --project=mobile --config=scripts/visual-qa-config.ts
 *   npx playwright test --project=desktop --config=scripts/visual-qa-config.ts
 *   npx playwright test --project=tablet --config=scripts/visual-qa-config.ts
 *   npx playwright test --project=pos-terminal --config=scripts/visual-qa-config.ts
 *   npx playwright test --project=mobile --config=scripts/visual-qa-config.ts -g "register"
 *
 * Output: scripts/visual-qa-output/{journey}/{project}/{step}.png
 *
 * Review: Use the Read tool on each PNG — it renders visually.
 */

import { test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

// ---- Helpers ----

function outputDir(journey: string, project: string) {
  const dir = join(__dirname, "visual-qa-output", journey, project);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function snap(page: Page, journey: string, project: string, step: string) {
  const dir = outputDir(journey, project);
  await page.screenshot({ path: join(dir, `${step}.png`) });
}

async function snapFull(page: Page, journey: string, project: string, step: string) {
  const dir = outputDir(journey, project);
  await page.screenshot({ path: join(dir, `${step}.png`), fullPage: true });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

// ---- Journeys ----

test("landing page", async ({ page }, testInfo) => {
  const project = testInfo.project.name;

  // Clear cookies to ensure logged-out state
  await page.context().clearCookies();

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await snap(page, "landing", project, "01-home");

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await snap(page, "landing", project, "02-login");

  await page.goto("/brand");
  await page.waitForLoadState("networkidle");
  await snap(page, "landing", project, "03-brand-dark");
  await snapFull(page, "landing", project, "03-brand-dark-full");

  // Toggle to light mode on brand page
  const lightButton = page.locator('button:has-text("Light")');
  if (await lightButton.isVisible()) {
    await lightButton.click();
    await page.waitForTimeout(500);
    await snap(page, "landing", project, "04-brand-light");
    await snapFull(page, "landing", project, "04-brand-light-full");
  }
});

test("dashboard - owner view", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "manager@teststore.com", "password123");

  // Dashboard home
  await snap(page, "dashboard", project, "01-home");
  await snapFull(page, "dashboard", project, "01-home-full");

  // Inventory
  await page.goto("/dashboard/inventory");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "02-inventory");

  // Customers
  await page.goto("/dashboard/customers");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "03-customers");

  // Events
  await page.goto("/dashboard/events");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "04-events");

  // Reports
  await page.goto("/dashboard/reports");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "05-reports");

  // Cash Flow
  await page.goto("/dashboard/cash-flow");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "06-cash-flow");

  // Trade-Ins
  await page.goto("/dashboard/trade-ins");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "07-trade-ins");

  // Settings
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "dashboard", project, "08-settings");
  await snapFull(page, "dashboard", project, "08-settings-full");
});

test("register mode", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "cashier@teststore.com", "password123");

  // Should land on register
  await page.waitForTimeout(1500);
  await snap(page, "register", project, "01-register-empty");

  // Go to register explicitly
  await page.goto("/dashboard/register");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "register", project, "02-register-loaded");

  // Search for something
  const searchInput = page.locator('input[placeholder*="Scan"], input[placeholder*="search"], input[type="search"]').first();
  if (await searchInput.isVisible()) {
    await searchInput.fill("Lightning");
    await page.waitForTimeout(500);
    await snap(page, "register", project, "03-search-results");
    await searchInput.clear();
  }

  // Check bottom nav
  await snap(page, "register", project, "04-bottom-nav");
});

test("checkout full", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "manager@teststore.com", "password123");

  await page.goto("/dashboard/checkout");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "checkout", project, "01-checkout-empty");

  // Search
  const searchInput = page.locator('input[placeholder*="Scan"], input[placeholder*="search"]').first();
  if (await searchInput.isVisible()) {
    await searchInput.fill("Coffee");
    await page.waitForTimeout(500);
    await snap(page, "checkout", project, "02-search-results");
    await searchInput.clear();
  }
});

test("navigation - mobile", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  if (project !== "mobile" && project !== "tablet") return;

  await login(page, "manager@teststore.com", "password123");
  await page.waitForTimeout(1000);

  // Bottom nav visible
  await snap(page, "navigation", project, "01-bottom-nav");

  // Tap More
  const moreButton = page.locator('button:has-text("More"), [aria-label="More"]').first();
  if (await moreButton.isVisible()) {
    await moreButton.click();
    await page.waitForTimeout(500);
    await snap(page, "navigation", project, "02-more-menu");

    // Close it
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
});

test("navigation - desktop sidebar", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  if (project !== "desktop") return;

  await login(page, "manager@teststore.com", "password123");
  await page.waitForTimeout(1000);

  // Sidebar visible
  await snap(page, "navigation", project, "01-sidebar");
  await snapFull(page, "navigation", project, "01-sidebar-full");
});

test("light mode", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "manager@teststore.com", "password123");

  // Set light mode via settings
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const lightButton = page.locator('button:has-text("Light")');
  if (await lightButton.isVisible()) {
    await lightButton.click();
    await page.waitForTimeout(500);
    await snap(page, "light-mode", project, "01-settings-light");

    // Dashboard in light mode
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await snap(page, "light-mode", project, "02-dashboard-light");

    // Inventory in light mode
    await page.goto("/dashboard/inventory");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await snap(page, "light-mode", project, "03-inventory-light");

    // Register in light mode
    await page.goto("/dashboard/register");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await snap(page, "light-mode", project, "04-register-light");

    // Switch back to dark
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("networkidle");
    const darkButton = page.locator('button:has-text("Dark")');
    if (await darkButton.isVisible()) {
      await darkButton.click();
    }
  }
});

test("staff pages", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "manager@teststore.com", "password123");

  // Staff management
  await page.goto("/dashboard/staff");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "staff", project, "01-staff-list");

  // Time clock
  await page.goto("/dashboard/timeclock");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "staff", project, "02-timeclock");

  // Drawer
  await page.goto("/dashboard/drawer");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "staff", project, "03-drawer");
});

test("inventory management", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "manager@teststore.com", "password123");

  // Purchase orders
  await page.goto("/dashboard/purchase-orders");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "inventory-mgmt", project, "01-purchase-orders");

  // Stock counts
  await page.goto("/dashboard/stock-counts");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "inventory-mgmt", project, "02-stock-counts");

  // Catalog
  await page.goto("/dashboard/catalog");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "inventory-mgmt", project, "03-catalog");

  // Game library
  await page.goto("/dashboard/game-library");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "inventory-mgmt", project, "04-game-library");

  // Locations
  await page.goto("/dashboard/locations");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "inventory-mgmt", project, "05-locations");
});

test("customer and events detail", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await login(page, "manager@teststore.com", "password123");

  // Gift cards
  await page.goto("/dashboard/gift-cards");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "detail", project, "01-gift-cards");

  // Returns
  await page.goto("/dashboard/returns");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "detail", project, "02-returns");

  // Tournaments
  await page.goto("/dashboard/tournaments");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "detail", project, "03-tournaments");

  // Orders
  await page.goto("/dashboard/orders");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "detail", project, "04-orders");

  // Promotions
  await page.goto("/dashboard/promotions");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await snap(page, "detail", project, "05-promotions");
});
