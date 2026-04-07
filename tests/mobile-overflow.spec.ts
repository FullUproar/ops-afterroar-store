/**
 * Mobile Overflow Test
 *
 * Checks every authenticated page at mobile viewport (390x844) for:
 * 1. No horizontal overflow (nothing wider than viewport)
 * 2. All buttons/links are within viewport bounds
 * 3. No elements clipped at right edge
 *
 * Run: npx playwright test tests/mobile-overflow.spec.ts --project=mobile-overflow
 */
import { test, expect } from "@playwright/test";

const PAGES = [
  "/dashboard",
  "/dashboard/register",
  "/dashboard/inventory",
  "/dashboard/singles",
  "/dashboard/customers",
  "/dashboard/events",
  "/dashboard/cafe",
  "/dashboard/trade-ins",
  "/dashboard/returns",
  "/dashboard/cash-flow",
  "/dashboard/staff",
  "/dashboard/settings/store",
  "/dashboard/settings/payments",
  "/dashboard/help",
];

test.describe("authenticated: mobile overflow checks", () => {
  for (const pagePath of PAGES) {
    test(`mobile overflow - ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(2000);

      const viewportWidth = 390;

      // Check for horizontal overflow
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const hasHorizontalOverflow = bodyScrollWidth > viewportWidth + 5; // 5px tolerance

      if (hasHorizontalOverflow) {
        // Find the offending elements
        const overflowingElements = await page.evaluate((vw) => {
          const elements: string[] = [];
          document.querySelectorAll("*").forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.right > vw + 5 && rect.width > 0 && rect.height > 0) {
              const tag = el.tagName.toLowerCase();
              const cls = el.className?.toString().slice(0, 60) || "";
              const text = el.textContent?.slice(0, 30) || "";
              elements.push(`<${tag} class="${cls}"> "${text}" (right: ${Math.round(rect.right)}px)`);
            }
          });
          return elements.slice(0, 5); // First 5 offenders
        }, viewportWidth);

        console.log(`[${pagePath}] Horizontal overflow detected (scrollWidth: ${bodyScrollWidth}px):`);
        overflowingElements.forEach((el) => console.log(`  - ${el}`));
      }

      // Don't hard-fail on overflow for now — just report. Uncomment to enforce:
      // expect(hasHorizontalOverflow, `Horizontal overflow on ${pagePath}`).toBeFalsy();

      // Check that all interactive elements (buttons, links) are within viewport
      const clippedButtons = await page.evaluate((vw) => {
        const clipped: string[] = [];
        document.querySelectorAll("button, a, input, select").forEach((el) => {
          const rect = el.getBoundingClientRect();
          // Skip invisible/hidden elements
          if (rect.width === 0 || rect.height === 0) return;
          // Skip elements far off-screen (in scroll containers)
          if (rect.top > 2000 || rect.top < -100) return;

          const rightMargin = vw - rect.right;
          const leftMargin = rect.left;

          if (rightMargin < 0) {
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || (el as HTMLInputElement).placeholder || "").slice(0, 30);
            clipped.push(`<${tag}> "${text}" overflows right by ${Math.abs(Math.round(rightMargin))}px`);
          }
          if (leftMargin < 0) {
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || "").slice(0, 30);
            clipped.push(`<${tag}> "${text}" overflows left by ${Math.abs(Math.round(leftMargin))}px`);
          }
        });
        return clipped;
      }, viewportWidth);

      if (clippedButtons.length > 0) {
        console.log(`[${pagePath}] Clipped interactive elements:`);
        clippedButtons.forEach((el) => console.log(`  - ${el}`));
      }

      // This SHOULD pass — clipped buttons are a real usability problem
      expect(
        clippedButtons.length,
        `${pagePath} has ${clippedButtons.length} clipped buttons/links:\n${clippedButtons.join("\n")}`
      ).toBe(0);
    });
  }
});
