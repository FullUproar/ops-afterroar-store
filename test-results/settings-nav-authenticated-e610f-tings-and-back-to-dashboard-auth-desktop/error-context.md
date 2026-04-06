# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-nav.spec.ts >> authenticated: settings navigation >> can navigate to settings and back to dashboard
- Location: tests\settings-nav.spec.ts:12:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
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
          - button "Customers ▸" [ref=e19]:
            - generic [ref=e20]: Customers
            - generic [ref=e21]: ▸
          - generic:
            - link "♟ Customers":
              - /url: /dashboard/customers
              - generic: ♟
              - generic: Customers
            - link "◎ Customer Insights":
              - /url: /dashboard/customers/insights
              - generic: ◎
              - generic: Customer Insights
            - link "◆ Gift Cards":
              - /url: /dashboard/gift-cards
              - generic: ◆
              - generic: Gift Cards
        - generic [ref=e22]:
          - button "Events ▸" [ref=e23]:
            - generic [ref=e24]: Events
            - generic [ref=e25]: ▸
          - generic:
            - link "★ Events":
              - /url: /dashboard/events
              - generic: ★
              - generic: Events
            - link "⊕ Tournaments":
              - /url: /dashboard/tournaments
              - generic: ⊕
              - generic: Tournaments
        - generic [ref=e26]:
          - button "Trade & Returns ▸" [ref=e27]:
            - generic [ref=e28]: Trade & Returns
            - generic [ref=e29]: ▸
          - generic:
            - link "⇄ Trade-Ins":
              - /url: /dashboard/trade-ins
              - generic: ⇄
              - generic: Trade-Ins
            - link "↩ Returns":
              - /url: /dashboard/returns
              - generic: ↩
              - generic: Returns
        - generic [ref=e30]:
          - button "Reports ▸" [ref=e31]:
            - generic [ref=e32]: Reports
            - generic [ref=e33]: ▸
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
        - generic [ref=e34]:
          - button "Afterroar Network ▾" [active] [ref=e35]:
            - generic [ref=e36]: Afterroar Network
            - generic [ref=e37]: ▾
          - link "◉ Network" [ref=e39] [cursor=pointer]:
            - /url: /dashboard/network
            - generic [ref=e40]: ◉
            - generic [ref=e41]: Network
        - generic [ref=e42]:
          - button "Admin ▾" [ref=e43]:
            - generic [ref=e44]: Admin
            - generic [ref=e45]: ▾
          - generic [ref=e46]:
            - link "⊞ Staff" [ref=e47] [cursor=pointer]:
              - /url: /dashboard/staff
              - generic [ref=e48]: ⊞
              - generic [ref=e49]: Staff
            - link "◈ Subscription" [ref=e50] [cursor=pointer]:
              - /url: /dashboard/billing
              - generic [ref=e51]: ◈
              - generic [ref=e52]: Subscription
            - link "⚙ Settings" [ref=e53] [cursor=pointer]:
              - /url: /dashboard/settings
              - generic [ref=e54]: ⚙
              - generic [ref=e55]: Settings
            - link "⤓ Import" [ref=e56] [cursor=pointer]:
              - /url: /dashboard/import
              - generic [ref=e57]: ⤓
              - generic [ref=e58]: Import
            - link "◷ Time Clock" [ref=e59] [cursor=pointer]:
              - /url: /dashboard/timeclock
              - generic [ref=e60]: ◷
              - generic [ref=e61]: Time Clock
            - link "✦ Promotions" [ref=e62] [cursor=pointer]:
              - /url: /dashboard/promotions
              - generic [ref=e63]: ✦
              - generic [ref=e64]: Promotions
            - link "◌ Preorders" [ref=e65] [cursor=pointer]:
              - /url: /dashboard/preorders
              - generic [ref=e66]: ◌
              - generic [ref=e67]: Preorders
            - link "⚑ Issues" [ref=e68] [cursor=pointer]:
              - /url: /dashboard/issues
              - generic [ref=e69]: ⚑
              - generic [ref=e70]: Issues
            - link "◉ Ops Log" [ref=e71] [cursor=pointer]:
              - /url: /dashboard/ops-log
              - generic [ref=e72]: ◉
              - generic [ref=e73]: Ops Log
            - link "? Help" [ref=e74] [cursor=pointer]:
              - /url: /dashboard/help
              - generic [ref=e75]: "?"
              - generic [ref=e76]: Help
        - link "▤ Cafe" [ref=e77] [cursor=pointer]:
          - /url: /dashboard/cafe
          - generic [ref=e78]: ▤
          - text: Cafe
      - generic [ref=e79]:
        - paragraph [ref=e80]: Bot Owner · owner
        - button "Sign out" [ref=e81]
        - button "Register Mode" [ref=e82]
    - main [ref=e83]:
      - button "Notifications" [ref=e86]:
        - img [ref=e87]
        - generic [ref=e89]: "5"
      - generic [ref=e91]:
        - heading "Settings" [level=1] [ref=e94]
        - paragraph [ref=e95]: Full Uproar Games & Café· Changes save automatically
        - navigation [ref=e97]:
          - button "⌂ Store" [ref=e98]:
            - generic [ref=e99]: ⌂
            - text: Store
          - button "◈ Payments" [ref=e100]:
            - generic [ref=e101]: ◈
            - text: Payments
          - button "⊞ Staff" [ref=e102]:
            - generic [ref=e103]: ⊞
            - text: Staff
          - button "◎ Integrations" [ref=e104]:
            - generic [ref=e105]: ◎
            - text: Integrations
          - button "◉ Intelligence" [ref=e106]:
            - generic [ref=e107]: ◉
            - text: Intelligence
          - button "⚙ Operations" [ref=e108]:
            - generic [ref=e109]: ⚙
            - text: Operations
        - paragraph [ref=e110]: Your store identity, tax, checkout, and receipt settings
        - generic [ref=e111]:
          - generic [ref=e112]:
            - generic [ref=e113]:
              - generic [ref=e114]:
                - heading "Store Identity" [level=2] [ref=e115]
                - paragraph [ref=e116]: How your store appears on receipts and to customers
              - button "Reset to defaults" [ref=e117]
            - generic [ref=e118]:
              - generic [ref=e119]:
                - generic [ref=e120]: Display Name
                - textbox "Defaults to store name" [ref=e122]
              - generic [ref=e123]:
                - generic [ref=e124]: Store Phone
                - textbox "e.g. (503) 555-0100" [ref=e126]
              - generic [ref=e127]:
                - generic [ref=e128]: Website
                - textbox "e.g. www.yourstore.com" [ref=e130]
              - generic [ref=e131]:
                - generic [ref=e132]:
                  - text: Receipt Address
                  - button "Help" [ref=e134]: "?"
                - textbox "e.g. 123 Main St, City, ST 12345" [ref=e136]
              - generic [ref=e137]:
                - generic [ref=e138]: Receipt Footer
                - textbox "e.g. Thank you for shopping with us!" [ref=e140]: Thank you for shopping with us!
              - generic [ref=e141]:
                - generic [ref=e142]: Show barcode on printed receipts
                - button [ref=e144]
              - generic [ref=e146]:
                - generic [ref=e147]: Show 'You saved $X' on receipts
                - button [ref=e149]
              - generic [ref=e151]:
                - generic [ref=e152]: Show return policy on receipts
                - button [ref=e154]
              - generic [ref=e156]:
                - generic [ref=e157]: Return Policy Text
                - textbox "Returns accepted within 30 days with receipt." [ref=e159]
          - generic [ref=e160]:
            - generic [ref=e161]:
              - generic [ref=e162]:
                - heading "Trade-Ins" [level=2] [ref=e163]
                - paragraph [ref=e164]: Default settings for the trade-in workflow
              - button "Reset to defaults" [ref=e165]
            - generic [ref=e166]:
              - generic [ref=e167]:
                - generic [ref=e168]:
                  - text: Default Credit Bonus %
                  - button "Help" [ref=e170]: "?"
                - spinbutton [ref=e172]: "30"
              - generic [ref=e173]:
                - generic [ref=e174]: Require customer for trade-ins
                - button [ref=e176]
          - generic [ref=e178]:
            - generic [ref=e179]:
              - generic [ref=e180]:
                - heading "Returns" [level=2] [ref=e181]
                - paragraph [ref=e182]: Default settings for processing returns
              - button "Reset to defaults" [ref=e183]
            - generic [ref=e184]:
              - generic [ref=e185]:
                - generic [ref=e186]: Default Credit Bonus %
                - spinbutton [ref=e188]: "0"
              - generic [ref=e189]:
                - generic [ref=e190]: Default Restocking Fee %
                - spinbutton [ref=e192]: "0"
              - generic [ref=e193]:
                - generic [ref=e194]: Return Window (days)
                - spinbutton [ref=e196]: "30"
              - generic [ref=e197]:
                - generic [ref=e198]: Require reason for returns
                - button [ref=e200]
          - generic [ref=e202]:
            - generic [ref=e203]:
              - generic [ref=e204]:
                - heading "Checkout" [level=2] [ref=e205]
                - paragraph [ref=e206]: How the register behaves during sales
              - button "Reset to defaults" [ref=e207]
            - generic [ref=e208]:
              - generic [ref=e209]:
                - generic [ref=e210]: Require customer for every sale
                - button [ref=e212]
              - generic [ref=e214]:
                - generic [ref=e215]: Auto-print receipt after sale
                - button [ref=e217]
              - generic [ref=e219]:
                - generic [ref=e220]: Default Payment Method
                - combobox [ref=e222]:
                  - option "Cash" [selected]
                  - option "Card"
                  - option "Store Credit"
          - generic [ref=e223]:
            - generic [ref=e224]:
              - generic [ref=e225]:
                - heading "Tax" [level=2] [ref=e226]
                - paragraph [ref=e227]: Sales tax configuration
              - button "Reset to defaults" [ref=e228]
            - generic [ref=e229]:
              - generic [ref=e230]:
                - generic [ref=e231]:
                  - text: Tax Rate %
                  - button "Help" [ref=e233]: "?"
                - spinbutton [ref=e235]: "7"
              - generic [ref=e236]:
                - generic [ref=e237]:
                  - text: Tax is included in listed prices
                  - button "Help" [ref=e239]: "?"
                - button [ref=e241]
          - generic [ref=e243]:
            - generic [ref=e244]:
              - generic [ref=e245]:
                - heading "Inventory" [level=2] [ref=e246]
                - paragraph [ref=e247]: Default inventory behavior
              - button "Reset to defaults" [ref=e248]
            - generic [ref=e250]:
              - generic [ref=e251]: Default Low Stock Threshold
              - spinbutton [ref=e253]: "5"
  - alert [ref=e254]
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
> 28  |     await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
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
  40  |     await page.waitForURL("**/dashboard/inventory**", { timeout: 10_000 });
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