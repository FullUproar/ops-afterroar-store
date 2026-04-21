/**
 * Visual QA for the Deck Builder Level 2.5 polish.
 *
 * Runs against production (per playwright.config.ts baseURL =
 * https://www.afterroar.store). Requires the "setup" project to
 * have stored bot-owner auth at tests/.auth/state.json.
 *
 *   npx playwright test tests/deck-builder-qa.spec.ts --project=auth-desktop
 *
 * Captures screenshots to tests/screenshots/deck-builder/ for
 * morning review.
 */
import { test, expect } from "@playwright/test";
import path from "path";

const SAMPLE_DECK = [
  "4 Lightning Bolt",
  "4 Monastery Swiftspear",
  "4 Goblin Guide",
  "4 Eidolon of the Great Revel",
  "4 Lava Spike",
  "4 Rift Bolt",
  "4 Searing Blaze",
  "4 Skullcrack",
  "4 Boros Charm",
  "4 Lightning Helix",
  "2 Atarka's Command",
  "20 Mountain",
  "4 Wooded Foothills",
].join("\n");

test.describe("authenticated — deck builder Level 2.5", () => {
  test("url import field + paste flow + analysis panel renders", async ({ page }) => {
    // Navigate to deck builder
    await page.goto("/dashboard/deck-builder", { waitUntil: "networkidle" });

    // Landing screenshot
    await page.screenshot({
      path: path.join(__dirname, "screenshots", "deck-builder", "01-landing.png"),
      fullPage: true,
    });

    // Switch to paste tab. Format dropdown defaults to standard, paste tab may
    // be hidden behind the Search tab. Click the Paste tab button if it exists.
    const pasteTab = page.getByRole("button", { name: /paste/i }).first();
    if (await pasteTab.isVisible().catch(() => false)) {
      await pasteTab.click();
      await page.waitForTimeout(400);
    }

    // URL import field should be visible
    await expect(page.getByPlaceholder(/moxfield\.com\/decks/i)).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(__dirname, "screenshots", "deck-builder", "02-paste-tab-with-import.png"),
      fullPage: true,
    });

    // Paste the sample decklist
    const textarea = page.locator("textarea").filter({ hasText: /^$/ }).first();
    await textarea.fill(SAMPLE_DECK);

    // Click Parse & Check Inventory
    await page.getByRole("button", { name: /parse.*check inventory/i }).click();

    // Wait for either inventory results OR the analysis panel
    await Promise.race([
      page.waitForSelector("text=/Mana Curve/i", { timeout: 20000 }),
      page.waitForSelector("text=/Inventory Match/i", { timeout: 20000 }),
    ]);

    // Give analysis a moment to settle (Scryfall batch lookup)
    await page.waitForTimeout(6000);

    await page.screenshot({
      path: path.join(__dirname, "screenshots", "deck-builder", "03-results-with-analysis.png"),
      fullPage: true,
    });

    // Hover the first card name to trigger the card-preview popover
    const firstCardHeader = page.locator("h3").first();
    const first = await firstCardHeader.count();
    if (first > 0) {
      await firstCardHeader.hover();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(__dirname, "screenshots", "deck-builder", "04-hover-preview.png"),
        fullPage: false,
      });
    }

    // Verify analysis panel text is present (smoke check, not strict — the
    // panel only renders if Scryfall batch succeeded)
    const analysisVisible = await page
      .getByText(/mana curve/i)
      .isVisible()
      .catch(() => false);

    if (analysisVisible) {
      // eslint-disable-next-line no-console
      console.log("[qa] Analysis panel rendered: curve visible");
    } else {
      // eslint-disable-next-line no-console
      console.log("[qa] WARN — Analysis panel not visible. Check Scryfall batch lookup path.");
    }
  });

  test("moxfield url import path exercises the import UI (no real fetch)", async ({ page }) => {
    await page.goto("/dashboard/deck-builder", { waitUntil: "networkidle" });

    const pasteTab = page.getByRole("button", { name: /paste/i }).first();
    if (await pasteTab.isVisible().catch(() => false)) {
      await pasteTab.click();
      await page.waitForTimeout(400);
    }

    const urlField = page.getByPlaceholder(/moxfield\.com\/decks/i);
    await expect(urlField).toBeVisible();

    // Bad URL — should surface error without crashing
    await urlField.fill("https://example.com/not-a-deck");
    await page.getByRole("button", { name: /^import$/i }).click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(__dirname, "screenshots", "deck-builder", "05-import-bad-url-error.png"),
      fullPage: false,
    });

    // Error should be visible
    const error = page.getByText(/URL not recognized|not supported|failed/i);
    await expect(error).toBeVisible({ timeout: 3000 });
  });
});
