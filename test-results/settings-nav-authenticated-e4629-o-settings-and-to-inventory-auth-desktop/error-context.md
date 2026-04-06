# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-nav.spec.ts >> authenticated: settings navigation >> can navigate to settings and to inventory
- Location: tests\settings-nav.spec.ts:32:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/dashboard/inventory**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]: Training Mode — Transactions are not real
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e6]:
        - heading "Afterroar" [level=1] [ref=e7]
        - paragraph [ref=e8]: Full Uproar Games & Café
      - navigation [ref=e9]:
        - generic [ref=e10]:
          - button "POS ▸" [ref=e11]:
            - generic [ref=e12]: POS
            - generic [ref=e13]: ▸
          - generic:
            - link "◈ Register":
              - /url: /dashboard/register
              - generic: ◈
              - generic: Register
            - link "▣ Drawer":
              - /url: /dashboard/drawer
              - generic: ▣
              - generic: Drawer
            - link "⊟ Orders":
              - /url: /dashboard/orders
              - generic: ⊟
              - generic: Orders
            - link "▶ Fulfillment":
              - /url: /dashboard/fulfillment
              - generic: ▶
              - generic: Fulfillment
        - generic [ref=e14]:
          - button "Inventory ▸" [ref=e15]:
            - generic [ref=e16]: Inventory
            - generic [ref=e17]: ▸
          - generic:
            - link "▦ Inventory":
              - /url: /dashboard/inventory
              - generic: ▦
              - generic: Inventory
            - link "♠ TCG Singles":
              - /url: /dashboard/singles
              - generic: ♠
              - generic: TCG Singles
            - link "♦ Deck Builder":
              - /url: /dashboard/deck-builder
              - generic: ♦
              - generic: Deck Builder
            - link "♜ Game Library":
              - /url: /dashboard/game-library
              - generic: ♜
              - generic: Game Library
            - link "◇ Consignment":
              - /url: /dashboard/consignment
              - generic: ◇
              - generic: Consignment
            - link "▤ Stock Count":
              - /url: /dashboard/stock-counts
              - generic: ▤
              - generic: Stock Count
            - link "⊡ Locations":
              - /url: /dashboard/locations
              - generic: ⊡
              - generic: Locations
            - link "⇆ Transfers":
              - /url: /dashboard/transfers
              - generic: ⇆
              - generic: Transfers
        - generic [ref=e18]:
          - button "Customers ▾" [active] [ref=e19]:
            - generic [ref=e20]: Customers
            - generic [ref=e21]: ▾
          - generic [ref=e22]:
            - link "♟ Customers" [ref=e23] [cursor=pointer]:
              - /url: /dashboard/customers
              - generic [ref=e24]: ♟
              - generic [ref=e25]: Customers
            - link "◎ Customer Insights" [ref=e26] [cursor=pointer]:
              - /url: /dashboard/customers/insights
              - generic [ref=e27]: ◎
              - generic [ref=e28]: Customer Insights
            - link "◆ Gift Cards" [ref=e29] [cursor=pointer]:
              - /url: /dashboard/gift-cards
              - generic [ref=e30]: ◆
              - generic [ref=e31]: Gift Cards
        - generic [ref=e32]:
          - button "Events ▸" [ref=e33]:
            - generic [ref=e34]: Events
            - generic [ref=e35]: ▸
          - generic:
            - link "★ Events":
              - /url: /dashboard/events
              - generic: ★
              - generic: Events
            - link "⊕ Tournaments":
              - /url: /dashboard/tournaments
              - generic: ⊕
              - generic: Tournaments
        - generic [ref=e36]:
          - button "Trade & Returns ▸" [ref=e37]:
            - generic [ref=e38]: Trade & Returns
            - generic [ref=e39]: ▸
          - generic:
            - link "⇄ Trade-Ins":
              - /url: /dashboard/trade-ins
              - generic: ⇄
              - generic: Trade-Ins
            - link "↩ Returns":
              - /url: /dashboard/returns
              - generic: ↩
              - generic: Returns
        - generic [ref=e40]:
          - button "Reports ▸" [ref=e41]:
            - generic [ref=e42]: Reports
            - generic [ref=e43]: ▸
          - generic:
            - link "⌂ Dashboard":
              - /url: /dashboard
              - generic: ⌂
              - generic: Dashboard
            - link "◩ Reports":
              - /url: /dashboard/reports
              - generic: ◩
              - generic: Reports
            - link "▣ Inventory Health":
              - /url: /dashboard/reports/inventory-health
              - generic: ▣
              - generic: Inventory Health
            - link "◆ Sales Analysis":
              - /url: /dashboard/reports/sales
              - generic: ◆
              - generic: Sales Analysis
            - link "△ Margins":
              - /url: /dashboard/reports/margins
              - generic: △
              - generic: Margins
            - link "⊞ Staff Performance":
              - /url: /dashboard/reports/staff
              - generic: ⊞
              - generic: Staff Performance
            - link "◎ Channels":
              - /url: /dashboard/reports/channels
              - generic: ◎
              - generic: Channels
            - link "◎ Cash Flow":
              - /url: /dashboard/cash-flow
              - generic: ◎
              - generic: Cash Flow
        - generic [ref=e44]:
          - button "Afterroar Network ▸" [ref=e45]:
            - generic [ref=e46]: Afterroar Network
            - generic [ref=e47]: ▸
          - generic:
            - link "◉ Network":
              - /url: /dashboard/network
              - generic: ◉
              - generic: Network
        - generic [ref=e48]:
          - button "Admin ▾" [ref=e49]:
            - generic [ref=e50]: Admin
            - generic [ref=e51]: ▾
          - generic [ref=e52]:
            - link "⊞ Staff" [ref=e53] [cursor=pointer]:
              - /url: /dashboard/staff
              - generic [ref=e54]: ⊞
              - generic [ref=e55]: Staff
            - link "◈ Subscription" [ref=e56] [cursor=pointer]:
              - /url: /dashboard/billing
              - generic [ref=e57]: ◈
              - generic [ref=e58]: Subscription
            - link "⚙ Settings" [ref=e59] [cursor=pointer]:
              - /url: /dashboard/settings
              - generic [ref=e60]: ⚙
              - generic [ref=e61]: Settings
            - link "⤓ Import" [ref=e62] [cursor=pointer]:
              - /url: /dashboard/import
              - generic [ref=e63]: ⤓
              - generic [ref=e64]: Import
            - link "◷ Time Clock" [ref=e65] [cursor=pointer]:
              - /url: /dashboard/timeclock
              - generic [ref=e66]: ◷
              - generic [ref=e67]: Time Clock
            - link "✦ Promotions" [ref=e68] [cursor=pointer]:
              - /url: /dashboard/promotions
              - generic [ref=e69]: ✦
              - generic [ref=e70]: Promotions
            - link "◌ Preorders" [ref=e71] [cursor=pointer]:
              - /url: /dashboard/preorders
              - generic [ref=e72]: ◌
              - generic [ref=e73]: Preorders
            - link "⚑ Issues" [ref=e74] [cursor=pointer]:
              - /url: /dashboard/issues
              - generic [ref=e75]: ⚑
              - generic [ref=e76]: Issues
            - link "◉ Ops Log" [ref=e77] [cursor=pointer]:
              - /url: /dashboard/ops-log
              - generic [ref=e78]: ◉
              - generic [ref=e79]: Ops Log
            - link "? Help" [ref=e80] [cursor=pointer]:
              - /url: /dashboard/help
              - generic [ref=e81]: "?"
              - generic [ref=e82]: Help
        - link "▤ Cafe" [ref=e83] [cursor=pointer]:
          - /url: /dashboard/cafe
          - generic [ref=e84]: ▤
          - text: Cafe
      - generic [ref=e85]:
        - paragraph [ref=e86]: Bot Owner · owner
        - button "Sign out" [ref=e87]
        - button "Register Mode" [ref=e88]
    - main [ref=e89]:
      - button "Notifications" [ref=e92]:
        - img [ref=e93]
        - generic [ref=e95]: "5"
      - generic [ref=e97]:
        - heading "Settings" [level=1] [ref=e100]
        - paragraph [ref=e101]: Full Uproar Games & Café· Changes save automatically
        - navigation [ref=e103]:
          - button "⌂ Store" [ref=e104]:
            - generic [ref=e105]: ⌂
            - text: Store
          - button "◈ Payments" [ref=e106]:
            - generic [ref=e107]: ◈
            - text: Payments
          - button "⊞ Staff" [ref=e108]:
            - generic [ref=e109]: ⊞
            - text: Staff
          - button "◎ Integrations" [ref=e110]:
            - generic [ref=e111]: ◎
            - text: Integrations
          - button "◉ Intelligence" [ref=e112]:
            - generic [ref=e113]: ◉
            - text: Intelligence
          - button "⚙ Operations" [ref=e114]:
            - generic [ref=e115]: ⚙
            - text: Operations
        - paragraph [ref=e116]: Your store identity, tax, checkout, and receipt settings
        - generic [ref=e117]:
          - generic [ref=e118]:
            - generic [ref=e119]:
              - generic [ref=e120]:
                - heading "Store Identity" [level=2] [ref=e121]
                - paragraph [ref=e122]: How your store appears on receipts and to customers
              - button "Reset to defaults" [ref=e123]
            - generic [ref=e124]:
              - generic [ref=e125]:
                - generic [ref=e126]: Display Name
                - textbox "Defaults to store name" [ref=e128]
              - generic [ref=e129]:
                - generic [ref=e130]: Store Phone
                - textbox "e.g. (503) 555-0100" [ref=e132]
              - generic [ref=e133]:
                - generic [ref=e134]: Website
                - textbox "e.g. www.yourstore.com" [ref=e136]
              - generic [ref=e137]:
                - generic [ref=e138]:
                  - text: Receipt Address
                  - button "Help" [ref=e140]: "?"
                - textbox "e.g. 123 Main St, City, ST 12345" [ref=e142]
              - generic [ref=e143]:
                - generic [ref=e144]: Receipt Footer
                - textbox "e.g. Thank you for shopping with us!" [ref=e146]: Thank you for shopping with us!
              - generic [ref=e147]:
                - generic [ref=e148]: Show barcode on printed receipts
                - button [ref=e150]
              - generic [ref=e152]:
                - generic [ref=e153]: Show 'You saved $X' on receipts
                - button [ref=e155]
              - generic [ref=e157]:
                - generic [ref=e158]: Show return policy on receipts
                - button [ref=e160]
              - generic [ref=e162]:
                - generic [ref=e163]: Return Policy Text
                - textbox "Returns accepted within 30 days with receipt." [ref=e165]
          - generic [ref=e166]:
            - generic [ref=e167]:
              - generic [ref=e168]:
                - heading "Trade-Ins" [level=2] [ref=e169]
                - paragraph [ref=e170]: Default settings for the trade-in workflow
              - button "Reset to defaults" [ref=e171]
            - generic [ref=e172]:
              - generic [ref=e173]:
                - generic [ref=e174]:
                  - text: Default Credit Bonus %
                  - button "Help" [ref=e176]: "?"
                - spinbutton [ref=e178]: "30"
              - generic [ref=e179]:
                - generic [ref=e180]: Require customer for trade-ins
                - button [ref=e182]
          - generic [ref=e184]:
            - generic [ref=e185]:
              - generic [ref=e186]:
                - heading "Returns" [level=2] [ref=e187]
                - paragraph [ref=e188]: Default settings for processing returns
              - button "Reset to defaults" [ref=e189]
            - generic [ref=e190]:
              - generic [ref=e191]:
                - generic [ref=e192]: Default Credit Bonus %
                - spinbutton [ref=e194]: "0"
              - generic [ref=e195]:
                - generic [ref=e196]: Default Restocking Fee %
                - spinbutton [ref=e198]: "0"
              - generic [ref=e199]:
                - generic [ref=e200]: Return Window (days)
                - spinbutton [ref=e202]: "30"
              - generic [ref=e203]:
                - generic [ref=e204]: Require reason for returns
                - button [ref=e206]
          - generic [ref=e208]:
            - generic [ref=e209]:
              - generic [ref=e210]:
                - heading "Checkout" [level=2] [ref=e211]
                - paragraph [ref=e212]: How the register behaves during sales
              - button "Reset to defaults" [ref=e213]
            - generic [ref=e214]:
              - generic [ref=e215]:
                - generic [ref=e216]: Require customer for every sale
                - button [ref=e218]
              - generic [ref=e220]:
                - generic [ref=e221]: Auto-print receipt after sale
                - button [ref=e223]
              - generic [ref=e225]:
                - generic [ref=e226]: Default Payment Method
                - combobox [ref=e228]:
                  - option "Cash" [selected]
                  - option "Card"
                  - option "Store Credit"
          - generic [ref=e229]:
            - generic [ref=e230]:
              - generic [ref=e231]:
                - heading "Tax" [level=2] [ref=e232]
                - paragraph [ref=e233]: Sales tax configuration
              - button "Reset to defaults" [ref=e234]
            - generic [ref=e235]:
              - generic [ref=e236]:
                - generic [ref=e237]:
                  - text: Tax Rate %
                  - button "Help" [ref=e239]: "?"
                - spinbutton [ref=e241]: "7"
              - generic [ref=e242]:
                - generic [ref=e243]:
                  - text: Tax is included in listed prices
                  - button "Help" [ref=e245]: "?"
                - button [ref=e247]
          - generic [ref=e249]:
            - generic [ref=e250]:
              - generic [ref=e251]:
                - heading "Inventory" [level=2] [ref=e252]
                - paragraph [ref=e253]: Default inventory behavior
              - button "Reset to defaults" [ref=e254]
            - generic [ref=e256]:
              - generic [ref=e257]: Default Low Stock Threshold
              - spinbutton [ref=e259]: "5"
  - alert [ref=e260]
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
  13  |     // Start at dashboard
  14  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  15  |     await expect(page).toHaveURL(/dashboard/);
  16  | 
  17  |     // Navigate to settings — use direct navigation since sidebar scrolling
  18  |     // can have overlapping group headers at certain viewport sizes
  19  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  20  | 
  21  |     // Wait for settings page to fully render (not just "Loading settings...")
  22  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  23  | 
  24  |     // Now try to navigate away — use force click to bypass sidebar overlap at test viewport
  25  |     await page.locator('a[href="/dashboard"]').first().click({ force: true });
  26  | 
  27  |     // If we can reach dashboard URL, navigation works
  28  |     await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  29  |     await expect(page).toHaveURL(/\/dashboard$/);
  30  |   });
  31  | 
  32  |   test("can navigate to settings and to inventory", async ({ page }) => {
  33  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  34  | 
  35  |     // Wait for settings to load
  36  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  37  | 
  38  |     // Navigate to inventory
  39  |     await page.locator('a[href="/dashboard/inventory"]').first().click({ force: true });
> 40  |     await page.waitForURL("**/dashboard/inventory**", { timeout: 10_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  41  |     await expect(page).toHaveURL(/inventory/);
  42  |   });
  43  | 
  44  |   test("can switch settings tabs without breaking navigation", async ({ page }) => {
  45  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  46  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  47  | 
  48  |     // Click through each tab
  49  |     for (const tab of ["Payments", "Staff", "Integrations", "Intelligence", "Operations", "Store"]) {
  50  |       await page.getByRole("button", { name: tab }).click();
  51  |       await page.waitForTimeout(500);
  52  |     }
  53  | 
  54  |     // Now navigate away
  55  |     await page.locator('a[href="/dashboard"]').first().click({ force: true });
  56  |     await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  57  |     await expect(page).toHaveURL(/\/dashboard$/);
  58  |   });
  59  | 
  60  |   test("no hydration errors on dashboard page", async ({ page }) => {
  61  |     const errors: string[] = [];
  62  |     page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));
  63  | 
  64  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  65  |     await page.waitForTimeout(3000);
  66  | 
  67  |     const critical = errors.filter((e) => e.includes("418") || e.includes("Hydration"));
  68  |     console.log("=== DASHBOARD ERRORS ===");
  69  |     errors.forEach((e) => console.log("  ", e.slice(0, 200)));
  70  |     expect(critical).toEqual([]);
  71  |   });
  72  | 
  73  |   test("no console errors on settings page", async ({ page }) => {
  74  |     const errors: string[] = [];
  75  |     const warnings: string[] = [];
  76  |     page.on("console", (msg) => {
  77  |       if (msg.type() === "error") errors.push(msg.text());
  78  |       if (msg.type() === "warning") warnings.push(msg.text());
  79  |     });
  80  |     page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));
  81  | 
  82  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  83  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  84  | 
  85  |     // Wait a bit for any delayed errors
  86  |     await page.waitForTimeout(3000);
  87  | 
  88  |     // Log ALL errors and warnings for debugging
  89  |     console.log("=== CONSOLE ERRORS ===");
  90  |     errors.forEach((e) => console.log("  ERROR:", e.slice(0, 200)));
  91  |     console.log("=== CONSOLE WARNINGS ===");
  92  |     warnings.forEach((w) => console.log("  WARN:", w.slice(0, 200)));
  93  | 
  94  |     // Check for hydration or React errors
  95  |     const criticalErrors = errors.filter(
  96  |       (e) => e.includes("Hydration") || e.includes("hydration") || e.includes("did not match")
  97  |         || e.includes("mismatch") || e.includes("Minified React") || e.includes("PAGE_ERROR")
  98  |         || e.includes("Cannot read") || e.includes("is not a function")
  99  |     );
  100 | 
  101 |     expect(criticalErrors).toEqual([]);
  102 |   });
  103 | });
  104 | 
```