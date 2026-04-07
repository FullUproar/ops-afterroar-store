import { test, expect } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

/**
 * Helper: derive a filename-safe slug from viewport + page path.
 */
function screenshotName(
  pagePath: string,
  viewport: { width: number; height: number }
): string {
  const slug = pagePath.replace(/^\//, "").replace(/\//g, "--") || "home";
  const device = viewport.width >= 1024 ? "desktop" : viewport.width >= 768 ? "tablet" : "mobile";
  return `${slug}_${device}.png`;
}

async function captureScreenshot(
  page: import("@playwright/test").Page,
  urlPath: string,
  viewportSize: { width: number; height: number }
) {
  await page.goto(urlPath, { waitUntil: "networkidle", timeout: 30_000 });
  // Extra settle time for client hydration / lazy images
  await page.waitForTimeout(2000);
  const name = screenshotName(urlPath, viewportSize);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, name),
    fullPage: true,
  });
}

// ---------------------------------------------------------------------------
// PUBLIC PAGES (no auth required)
// ---------------------------------------------------------------------------

const PUBLIC_PAGES = [
  "/login",
  "/buylist/full-uproar-games",
  "/connect/full-uproar-games",
  "/embed/deck-builder/full-uproar-games",
  "/clock/full-uproar-games",
  "/order/full-uproar-games",
];

test.describe("public pages", () => {
  for (const pagePath of PUBLIC_PAGES) {
    test(`public - ${pagePath}`, async ({ page }) => {
      const vp = page.viewportSize()!;
      await captureScreenshot(page, pagePath, vp);
    });
  }
});

// ---------------------------------------------------------------------------
// AUTHENTICATED PAGES (require storageState from manual login)
// ---------------------------------------------------------------------------

const AUTH_PAGES = [
  "/dashboard",
  "/dashboard/register",
  "/dashboard/inventory",
  "/dashboard/singles",
  "/dashboard/customers",
  "/dashboard/events",
  "/dashboard/fulfillment",
  "/dashboard/orders",
  "/dashboard/deck-builder",
  "/dashboard/reports",
  "/dashboard/reports/margins",
  "/dashboard/cash-flow",
  "/dashboard/staff",
  "/dashboard/settings",
  "/dashboard/help",
  "/dashboard/trade-ins",
  "/dashboard/trade-ins/new",
  "/dashboard/tournaments",
  "/dashboard/consignment",
  "/dashboard/cafe",
  "/dashboard/timeclock",
];

test.describe("authenticated pages", () => {
  for (const pagePath of AUTH_PAGES) {
    test(`authenticated - ${pagePath}`, async ({ page }) => {
      const vp = page.viewportSize()!;
      await captureScreenshot(page, pagePath, vp);
    });
  }
});
