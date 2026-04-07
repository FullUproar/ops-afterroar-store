# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-nav.spec.ts >> authenticated: settings navigation >> can switch settings tabs without breaking page
- Location: tests\settings-nav.spec.ts:31:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('button:has-text("Payments")').last()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]: Training Mode — Transactions are not real
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e6]:
        - heading "Full Uproar Games & Café" [level=1] [ref=e7]
        - paragraph [ref=e8]: Afterroar Ops
      - link "◈ Open Register" [ref=e10] [cursor=pointer]:
        - /url: /dashboard/register
        - generic [ref=e11]: ◈
        - generic [ref=e12]: Open Register
      - navigation [ref=e13]:
        - button "POS ▸" [ref=e15]:
          - generic [ref=e16]: POS
          - generic [ref=e17]: ▸
        - button "Inventory ▸" [ref=e19]:
          - generic [ref=e20]: Inventory
          - generic [ref=e21]: ▸
        - button "Customers ▸" [ref=e23]:
          - generic [ref=e24]: Customers
          - generic [ref=e25]: ▸
        - button "Events ▸" [ref=e27]:
          - generic [ref=e28]: Events
          - generic [ref=e29]: ▸
        - button "Trade & Returns ▸" [ref=e31]:
          - generic [ref=e32]: Trade & Returns
          - generic [ref=e33]: ▸
        - button "Intelligence ▸" [ref=e35]:
          - generic [ref=e36]: Intelligence
          - generic [ref=e37]: ▸
        - button "Afterroar Network ▸" [ref=e39]:
          - generic [ref=e40]: Afterroar Network
          - generic [ref=e41]: ▸
        - button "Admin ▸" [ref=e43]:
          - generic [ref=e44]: Admin
          - generic [ref=e45]: ▸
        - button "Settings ▸" [ref=e47]:
          - generic [ref=e48]: Settings
          - generic [ref=e49]: ▸
        - link "⚙ Settings" [ref=e50] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=e51]: ⚙
          - text: Settings
      - generic [ref=e52]:
        - paragraph [ref=e53]: Bot Owner · owner
        - button "Sign out" [ref=e54]
    - main [ref=e55]:
      - button "Notifications" [ref=e58]:
        - img [ref=e59]
        - generic [ref=e61]: "6"
      - generic [ref=e63]:
        - heading "Store" [level=1] [ref=e66]
        - paragraph [ref=e67]: Full Uproar Games & Café· Changes save automatically
        - paragraph [ref=e68]: Your store identity, tax, checkout, and receipt settings
        - generic [ref=e69]:
          - generic [ref=e70]:
            - generic [ref=e71]:
              - generic [ref=e72]:
                - heading "Store Identity" [level=2] [ref=e73]
                - paragraph [ref=e74]: How your store appears on receipts and to customers
              - button "Reset to defaults" [ref=e75]
            - generic [ref=e76]:
              - generic [ref=e77]:
                - generic [ref=e78]: Display Name
                - textbox "Defaults to store name" [ref=e80]
              - generic [ref=e81]:
                - generic [ref=e82]: Store Phone
                - textbox "e.g. (503) 555-0100" [ref=e84]
              - generic [ref=e85]:
                - generic [ref=e86]: Website
                - textbox "e.g. www.yourstore.com" [ref=e88]
              - generic [ref=e89]:
                - generic [ref=e90]:
                  - text: Receipt Address
                  - button "Help" [ref=e92]: "?"
                - textbox "e.g. 123 Main St, City, ST 12345" [ref=e94]
              - generic [ref=e95]:
                - generic [ref=e96]: Receipt Footer
                - textbox "e.g. Thank you for shopping with us!" [ref=e98]: Thank you for shopping with us!
              - generic [ref=e99]:
                - generic [ref=e100]: Show barcode on printed receipts
                - button [ref=e102]
              - generic [ref=e104]:
                - generic [ref=e105]: Show 'You saved $X' on receipts
                - button [ref=e107]
              - generic [ref=e109]:
                - generic [ref=e110]: Show return policy on receipts
                - button [ref=e112]
              - generic [ref=e114]:
                - generic [ref=e115]: Return Policy Text
                - textbox "Returns accepted within 30 days with receipt." [ref=e117]
          - generic [ref=e118]:
            - generic [ref=e119]:
              - generic [ref=e120]:
                - heading "Trade-Ins" [level=2] [ref=e121]
                - paragraph [ref=e122]: Default settings for the trade-in workflow
              - button "Reset to defaults" [ref=e123]
            - generic [ref=e124]:
              - generic [ref=e125]:
                - generic [ref=e126]:
                  - text: Default Credit Bonus %
                  - button "Help" [ref=e128]: "?"
                - spinbutton [ref=e130]: "30"
              - generic [ref=e131]:
                - generic [ref=e132]: Require customer for trade-ins
                - button [ref=e134]
          - generic [ref=e136]:
            - generic [ref=e137]:
              - generic [ref=e138]:
                - heading "Returns" [level=2] [ref=e139]
                - paragraph [ref=e140]: Default settings for processing returns
              - button "Reset to defaults" [ref=e141]
            - generic [ref=e142]:
              - generic [ref=e143]:
                - generic [ref=e144]: Default Credit Bonus %
                - spinbutton [ref=e146]: "0"
              - generic [ref=e147]:
                - generic [ref=e148]: Default Restocking Fee %
                - spinbutton [ref=e150]: "0"
              - generic [ref=e151]:
                - generic [ref=e152]: Return Window (days)
                - spinbutton [ref=e154]: "30"
              - generic [ref=e155]:
                - generic [ref=e156]: Require reason for returns
                - button [ref=e158]
          - generic [ref=e160]:
            - generic [ref=e161]:
              - generic [ref=e162]:
                - heading "Checkout" [level=2] [ref=e163]
                - paragraph [ref=e164]: How the register behaves during sales
              - button "Reset to defaults" [ref=e165]
            - generic [ref=e166]:
              - generic [ref=e167]:
                - generic [ref=e168]: Require customer for every sale
                - button [ref=e170]
              - generic [ref=e172]:
                - generic [ref=e173]: Auto-print receipt after sale
                - button [ref=e175]
              - generic [ref=e177]:
                - generic [ref=e178]: Default Payment Method
                - combobox [ref=e180]:
                  - option "Cash" [selected]
                  - option "Card"
                  - option "Store Credit"
          - generic [ref=e181]:
            - generic [ref=e182]:
              - generic [ref=e183]:
                - heading "Tax" [level=2] [ref=e184]
                - paragraph [ref=e185]: Sales tax configuration
              - button "Reset to defaults" [ref=e186]
            - generic [ref=e187]:
              - generic [ref=e188]:
                - generic [ref=e189]:
                  - text: Tax Rate %
                  - button "Help" [ref=e191]: "?"
                - spinbutton [ref=e193]: "7"
              - generic [ref=e194]:
                - generic [ref=e195]:
                  - text: Tax is included in listed prices
                  - button "Help" [ref=e197]: "?"
                - button [ref=e199]
          - generic [ref=e201]:
            - generic [ref=e202]:
              - generic [ref=e203]:
                - heading "Inventory" [level=2] [ref=e204]
                - paragraph [ref=e205]: Default inventory behavior
              - button "Reset to defaults" [ref=e206]
            - generic [ref=e208]:
              - generic [ref=e209]: Default Low Stock Threshold
              - spinbutton [ref=e211]: "5"
  - alert [ref=e212]
```

# Test source

```ts
  1   | /**
  2   |  * Settings Navigation Test
  3   |  *
  4   |  * Reproduces the hydration bug where navigating TO settings works,
  5   |  * but navigating AWAY is impossible (React tree dies).
  6   |  *
  7   |  * Run: npx playwright test tests/settings-nav.spec.ts --project=auth-desktop
  8   |  */
  9   | import { test, expect } from "@playwright/test";
  10  | 
  11  | test.describe("authenticated: settings navigation", () => {
  12  |   test("can navigate to settings and back to dashboard", async ({ page }) => {
  13  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  14  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  15  | 
  16  |     // Use Next.js router to navigate (simulates what happens when user clicks a link)
  17  |     await page.evaluate(() => window.history.pushState({}, "", "/dashboard"));
  18  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  19  |     await expect(page).toHaveURL(/\/dashboard/);
  20  |   });
  21  | 
  22  |   test("can navigate from settings to inventory", async ({ page }) => {
  23  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  24  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  25  | 
  26  |     // Navigate via full page load (sidebar click has overlap issues at test viewport)
  27  |     await page.goto("/dashboard/inventory", { waitUntil: "networkidle" });
  28  |     await expect(page).toHaveURL(/inventory/);
  29  |   });
  30  | 
  31  |   test("can switch settings tabs without breaking page", async ({ page }) => {
  32  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  33  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  34  | 
  35  |     // Click through each tab — if any crashes, the page dies
  36  |     for (const tab of ["Payments", "Staff", "Integrations", "Intelligence", "Operations", "Store"]) {
  37  |       // Use exact match to avoid sidebar group name collision
> 38  |       await page.locator(`button:has-text("${tab}")`).last().click();
      |                                                              ^ Error: locator.click: Test timeout of 60000ms exceeded.
  39  |       await page.waitForTimeout(500);
  40  |     }
  41  | 
  42  |     // Verify page is still alive by checking content is visible
  43  |     await expect(page.locator("text=Changes save automatically")).toBeVisible();
  44  | 
  45  |     // Navigate away via full page load
  46  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  47  |     await expect(page).toHaveURL(/\/dashboard/);
  48  |   });
  49  | 
  50  |   test("can click sidebar link from settings to navigate", async ({ page }) => {
  51  |     await page.setViewportSize({ width: 1440, height: 900 });
  52  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  53  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  54  | 
  55  |     // Wait for sidebar to render
  56  |     await page.waitForTimeout(2000);
  57  | 
  58  |     // Expand Admin group (Settings is in Admin)
  59  |     // Then click Dashboard link which is in a different group
  60  |     const salesGroup = page.locator("button:has-text('Sales')");
  61  |     if (await salesGroup.isVisible()) {
  62  |       await salesGroup.click();
  63  |       await page.waitForTimeout(300);
  64  |     }
  65  | 
  66  |     // Try clicking the Register link (should be in Sales group)
  67  |     const registerLink = page.locator('a[href="/dashboard/register"]').first();
  68  |     if (await registerLink.isVisible()) {
  69  |       await registerLink.click();
  70  |       await page.waitForURL("**/dashboard/register**", { timeout: 10_000 });
  71  |       await expect(page).toHaveURL(/register/);
  72  |     } else {
  73  |       // Fallback: check if ANY sidebar link is clickable
  74  |       const anyLink = page.locator('nav a[href^="/dashboard/"]').first();
  75  |       const href = await anyLink.getAttribute("href");
  76  |       await anyLink.click();
  77  |       await page.waitForURL(`**${href}**`, { timeout: 10_000 });
  78  |     }
  79  |   });
  80  | 
  81  |   test("no hydration errors on dashboard page", async ({ page }) => {
  82  |     const errors: string[] = [];
  83  |     page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));
  84  | 
  85  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  86  |     await page.waitForTimeout(3000);
  87  | 
  88  |     const critical = errors.filter((e) => e.includes("418") || e.includes("Hydration"));
  89  |     console.log("=== DASHBOARD ERRORS ===");
  90  |     errors.forEach((e) => console.log("  ", e.slice(0, 200)));
  91  |     expect(critical).toEqual([]);
  92  |   });
  93  | 
  94  |   test("no console errors on settings page", async ({ page }) => {
  95  |     const errors: string[] = [];
  96  |     const warnings: string[] = [];
  97  |     page.on("console", (msg) => {
  98  |       if (msg.type() === "error") errors.push(msg.text());
  99  |       if (msg.type() === "warning") warnings.push(msg.text());
  100 |     });
  101 |     page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));
  102 | 
  103 |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  104 |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  105 | 
  106 |     // Wait a bit for any delayed errors
  107 |     await page.waitForTimeout(3000);
  108 | 
  109 |     // Log ALL errors and warnings for debugging
  110 |     console.log("=== CONSOLE ERRORS ===");
  111 |     errors.forEach((e) => console.log("  ERROR:", e.slice(0, 200)));
  112 |     console.log("=== CONSOLE WARNINGS ===");
  113 |     warnings.forEach((w) => console.log("  WARN:", w.slice(0, 200)));
  114 | 
  115 |     // Check for hydration or React errors
  116 |     const criticalErrors = errors.filter(
  117 |       (e) => e.includes("Hydration") || e.includes("hydration") || e.includes("did not match")
  118 |         || e.includes("mismatch") || e.includes("Minified React") || e.includes("PAGE_ERROR")
  119 |         || e.includes("Cannot read") || e.includes("is not a function")
  120 |     );
  121 | 
  122 |     expect(criticalErrors).toEqual([]);
  123 |   });
  124 | });
  125 | 
```