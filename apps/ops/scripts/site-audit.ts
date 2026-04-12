import { test, type Page, type TestInfo } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------ */
/*  Site Audit — comprehensive screenshot crawl                        */
/*  Captures every page at current viewport for UX analysis.           */
/* ------------------------------------------------------------------ */

const OUTPUT_DIR = path.join(__dirname, "site-audit-output");
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "https://www.afterroar.store";

// Test credentials
const TEST_EMAIL = "manager@teststore.com";
const TEST_PASSWORD = "password123";

function getProject(testInfo: TestInfo): string {
  return testInfo.project.name.replace(/\s+/g, "-").toLowerCase();
}

async function snap(
  page: Page,
  category: string,
  step: string,
  project: string,
  fullPage = false,
) {
  const dir = path.join(OUTPUT_DIR, category, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(1500); // let animations settle
  await page.screenshot({
    path: path.join(dir, `${step}.png`),
    fullPage,
  });
  console.log(`  📸 ${category}/${project}/${step}.png${fullPage ? " (full)" : ""}`);
}

// ---- AUTH: login once and save cookies to reuse ----
const AUTH_STATE_FILE = path.join(OUTPUT_DIR, ".auth-state.json");

async function ensureLoggedIn(page: Page) {
  // Try loading saved auth state first
  if (fs.existsSync(AUTH_STATE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(AUTH_STATE_FILE, "utf-8"));
    await page.context().addCookies(cookies);
    // Verify the session is still valid
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const url = page.url();
    if (!url.includes("/login")) return; // already logged in
  }

  // Need to login fresh
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const passwordInput = page.locator('input[type="password"], input[name="password"]');

  if (await emailInput.isVisible({ timeout: 5000 })) {
    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);
    await page.locator('button[type="submit"], button:has-text("Sign")').first().click();
    await page.waitForTimeout(5000);
    await page.waitForLoadState("networkidle");
  }

  // Save cookies for reuse across tests
  const cookies = await page.context().cookies();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(AUTH_STATE_FILE, JSON.stringify(cookies));
}

// ---- ROUTE DEFINITIONS ----
// Grouped by section for organized output

const PUBLIC_ROUTES = [
  { path: "/login", name: "login", category: "01-public" },
  { path: "/brand", name: "brand", category: "01-public" },
  { path: "/ops", name: "ops-landing", category: "01-public" },
];

const DASHBOARD_ROUTES = [
  { path: "/dashboard", name: "dashboard-home", category: "02-dashboard" },
  { path: "/dashboard/register", name: "register", category: "03-pos" },
  { path: "/dashboard/drawer", name: "drawer", category: "03-pos" },
  { path: "/dashboard/orders", name: "orders", category: "03-pos" },
  { path: "/dashboard/inventory", name: "inventory-list", category: "04-inventory" },
  { path: "/dashboard/singles", name: "tcg-singles", category: "04-inventory" },
  { path: "/dashboard/singles/evaluate", name: "card-evaluator", category: "04-inventory" },
  { path: "/dashboard/singles/pricing", name: "bulk-pricing", category: "04-inventory" },
  { path: "/dashboard/singles/ebay", name: "ebay-listings", category: "04-inventory" },
  { path: "/dashboard/catalog", name: "catalog-scryfall", category: "04-inventory" },
  { path: "/dashboard/game-library", name: "game-library", category: "04-inventory" },
  { path: "/dashboard/purchase-orders", name: "purchase-orders", category: "04-inventory" },
  { path: "/dashboard/stock-counts", name: "stock-counts", category: "04-inventory" },
  { path: "/dashboard/locations", name: "locations", category: "04-inventory" },
  { path: "/dashboard/transfers", name: "transfers", category: "04-inventory" },
  { path: "/dashboard/preorders", name: "preorders", category: "04-inventory" },
  { path: "/dashboard/customers", name: "customers-list", category: "05-customers" },
  { path: "/dashboard/gift-cards", name: "gift-cards", category: "05-customers" },
  { path: "/dashboard/events", name: "events", category: "06-events" },
  { path: "/dashboard/tournaments", name: "tournaments", category: "06-events" },
  { path: "/dashboard/trade-ins", name: "trade-ins-list", category: "07-trades" },
  { path: "/dashboard/trade-ins/new", name: "new-trade-in", category: "07-trades" },
  { path: "/dashboard/trade-ins/bulk", name: "bulk-trade-in", category: "07-trades" },
  { path: "/dashboard/returns", name: "returns-list", category: "07-trades" },
  { path: "/dashboard/returns/new", name: "new-return", category: "07-trades" },
  { path: "/dashboard/cash-flow", name: "cash-flow", category: "08-reports" },
  { path: "/dashboard/reports", name: "reports", category: "08-reports" },
  { path: "/dashboard/timeclock", name: "timeclock", category: "09-admin" },
  { path: "/dashboard/staff", name: "staff", category: "09-admin" },
  { path: "/dashboard/settings", name: "settings", category: "09-admin" },
  { path: "/dashboard/promotions", name: "promotions", category: "09-admin" },
  { path: "/dashboard/import", name: "import", category: "09-admin" },
  { path: "/dashboard/certification", name: "certification", category: "09-admin" },
  { path: "/dashboard/scanner-setup", name: "scanner-setup", category: "09-admin" },
  { path: "/dashboard/ops-log", name: "ops-log", category: "09-admin" },
  { path: "/dashboard/issues", name: "issues", category: "09-admin" },
  { path: "/dashboard/help", name: "help", category: "09-admin" },
  { path: "/dashboard/onboarding", name: "onboarding", category: "09-admin" },
];

// ---- TESTS ----

test.describe("Site Audit — Public Pages", () => {
  for (const route of PUBLIC_ROUTES) {
    test(route.name, async ({ page }, testInfo) => {
      const p = getProject(testInfo);
      await page.goto(`${BASE_URL}${route.path}`);
      await page.waitForLoadState("networkidle");
      await snap(page, route.category, `${route.name}-above-fold`, p);
      await snap(page, route.category, `${route.name}-full`, p, true);
    });
  }
});

test.describe("Site Audit — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  for (const route of DASHBOARD_ROUTES) {
    test(route.name, async ({ page }, testInfo) => {
      const p = getProject(testInfo);
      await page.goto(`${BASE_URL}${route.path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000); // extra time for data to load
      await snap(page, route.category, `${route.name}-above-fold`, p);
      await snap(page, route.category, `${route.name}-full`, p, true);
    });
  }

  // Settings page is long — capture each section
  test("settings-scrolled", async ({ page }, testInfo) => {
    const p = getProject(testInfo);
    await page.goto(`${BASE_URL}/dashboard/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Scroll through sections
    for (let i = 0; i < 5; i++) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), i * 800);
      await snap(page, "09-admin", `settings-scroll-${i}`, p);
    }
  });

  // Cash flow page is data-heavy — capture scrolled
  test("cash-flow-scrolled", async ({ page }, testInfo) => {
    const p = getProject(testInfo);
    await page.goto(`${BASE_URL}/dashboard/cash-flow`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    for (let i = 0; i < 5; i++) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), i * 800);
      await snap(page, "08-reports", `cash-flow-scroll-${i}`, p);
    }
  });

  // Register interactions
  test("register-interactions", async ({ page }, testInfo) => {
    const p = getProject(testInfo);
    await page.goto(`${BASE_URL}/dashboard/register`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await snap(page, "03-pos", "register-empty", p);

    // Try clicking the exit button to see the dialog
    const exitBtn = page.locator('button[title="Exit register"]');
    if (await exitBtn.isVisible({ timeout: 3000 })) {
      await exitBtn.click();
      await page.waitForTimeout(500);
      await snap(page, "03-pos", "register-exit-dialog", p);
      // Close dialog
      const cancelBtn = page.locator('button:has-text("Cancel")');
      if (await cancelBtn.isVisible({ timeout: 2000 })) {
        await cancelBtn.click();
      }
    }
  });
});

test.describe("Site Audit — Mobile-Only Pages", () => {
  test("clock-page", async ({ page }, testInfo) => {
    const p = getProject(testInfo);
    // Use a known store slug
    await page.goto(`${BASE_URL}/clock/full-uproar-games`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await snap(page, "10-mobile", "clock-page", p);
  });

  test("mobile-register", async ({ page }, testInfo) => {
    const p = getProject(testInfo);
    await page.goto(`${BASE_URL}/mobile/full-uproar-games`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await snap(page, "10-mobile", "mobile-register", p);
  });

  test("timeclock-standalone", async ({ page }, testInfo) => {
    const p = getProject(testInfo);
    await page.goto(`${BASE_URL}/timeclock`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await snap(page, "10-mobile", "timeclock-standalone", p);
  });
});
