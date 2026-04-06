# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-nav.spec.ts >> authenticated: settings navigation >> no console errors on settings page
- Location: tests\settings-nav.spec.ts:70:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "PAGE_ERROR: Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
            - link "◈ Register" [ref=e14] [cursor=pointer]:
              - /url: /dashboard/register
              - generic [ref=e15]: ◈
              - generic [ref=e16]: Register
            - link "▣ Drawer" [ref=e17] [cursor=pointer]:
              - /url: /dashboard/drawer
              - generic [ref=e18]: ▣
              - generic [ref=e19]: Drawer
            - link "⊟ Orders" [ref=e20] [cursor=pointer]:
              - /url: /dashboard/orders
              - generic [ref=e21]: ⊟
              - generic [ref=e22]: Orders
            - link "▶ Fulfillment" [ref=e23] [cursor=pointer]:
              - /url: /dashboard/fulfillment
              - generic [ref=e24]: ▶
              - generic [ref=e25]: Fulfillment
        - generic [ref=e26]:
          - button "Inventory ▸" [ref=e27]:
            - generic [ref=e28]: Inventory
            - generic [ref=e29]: ▸
          - generic:
            - link "▦ Inventory" [ref=e30] [cursor=pointer]:
              - /url: /dashboard/inventory
              - generic [ref=e31]: ▦
              - generic [ref=e32]: Inventory
            - link "♠ TCG Singles" [ref=e33] [cursor=pointer]:
              - /url: /dashboard/singles
              - generic [ref=e34]: ♠
              - generic [ref=e35]: TCG Singles
            - link "♦ Deck Builder" [ref=e36] [cursor=pointer]:
              - /url: /dashboard/deck-builder
              - generic [ref=e37]: ♦
              - generic [ref=e38]: Deck Builder
            - link "♜ Game Library" [ref=e39] [cursor=pointer]:
              - /url: /dashboard/game-library
              - generic [ref=e40]: ♜
              - generic [ref=e41]: Game Library
            - link "◇ Consignment" [ref=e42] [cursor=pointer]:
              - /url: /dashboard/consignment
              - generic [ref=e43]: ◇
              - generic [ref=e44]: Consignment
            - link "▤ Stock Count" [ref=e45] [cursor=pointer]:
              - /url: /dashboard/stock-counts
              - generic [ref=e46]: ▤
              - generic [ref=e47]: Stock Count
            - link "⊡ Locations" [ref=e48] [cursor=pointer]:
              - /url: /dashboard/locations
              - generic [ref=e49]: ⊡
              - generic [ref=e50]: Locations
            - link "⇆ Transfers" [ref=e51] [cursor=pointer]:
              - /url: /dashboard/transfers
              - generic [ref=e52]: ⇆
              - generic [ref=e53]: Transfers
        - generic [ref=e54]:
          - button "Customers ▸" [ref=e55]:
            - generic [ref=e56]: Customers
            - generic [ref=e57]: ▸
          - generic:
            - link "♟ Customers" [ref=e58] [cursor=pointer]:
              - /url: /dashboard/customers
              - generic [ref=e59]: ♟
              - generic [ref=e60]: Customers
            - link "◎ Customer Insights" [ref=e61] [cursor=pointer]:
              - /url: /dashboard/customers/insights
              - generic [ref=e62]: ◎
              - generic [ref=e63]: Customer Insights
            - link "◆ Gift Cards" [ref=e64] [cursor=pointer]:
              - /url: /dashboard/gift-cards
              - generic [ref=e65]: ◆
              - generic [ref=e66]: Gift Cards
        - generic [ref=e67]:
          - button "Events ▸" [ref=e68]:
            - generic [ref=e69]: Events
            - generic [ref=e70]: ▸
          - generic:
            - link "★ Events" [ref=e71] [cursor=pointer]:
              - /url: /dashboard/events
              - generic [ref=e72]: ★
              - generic [ref=e73]: Events
            - link "⊕ Tournaments" [ref=e74] [cursor=pointer]:
              - /url: /dashboard/tournaments
              - generic [ref=e75]: ⊕
              - generic [ref=e76]: Tournaments
        - generic [ref=e77]:
          - button "Trade & Returns ▸" [ref=e78]:
            - generic [ref=e79]: Trade & Returns
            - generic [ref=e80]: ▸
          - generic:
            - link "⇄ Trade-Ins" [ref=e81] [cursor=pointer]:
              - /url: /dashboard/trade-ins
              - generic [ref=e82]: ⇄
              - generic [ref=e83]: Trade-Ins
            - link "↩ Returns" [ref=e84] [cursor=pointer]:
              - /url: /dashboard/returns
              - generic [ref=e85]: ↩
              - generic [ref=e86]: Returns
        - generic [ref=e87]:
          - button "Reports ▸" [ref=e88]:
            - generic [ref=e89]: Reports
            - generic [ref=e90]: ▸
          - generic:
            - link "⌂ Dashboard" [ref=e91] [cursor=pointer]:
              - /url: /dashboard
              - generic [ref=e92]: ⌂
              - generic [ref=e93]: Dashboard
            - link "◩ Reports" [ref=e94] [cursor=pointer]:
              - /url: /dashboard/reports
              - generic [ref=e95]: ◩
              - generic [ref=e96]: Reports
            - link "▣ Inventory Health" [ref=e97] [cursor=pointer]:
              - /url: /dashboard/reports/inventory-health
              - generic [ref=e98]: ▣
              - generic [ref=e99]: Inventory Health
            - link "◆ Sales Analysis" [ref=e100] [cursor=pointer]:
              - /url: /dashboard/reports/sales
              - generic [ref=e101]: ◆
              - generic [ref=e102]: Sales Analysis
            - link "△ Margins" [ref=e103] [cursor=pointer]:
              - /url: /dashboard/reports/margins
              - generic [ref=e104]: △
              - generic [ref=e105]: Margins
            - link "⊞ Staff Performance" [ref=e106] [cursor=pointer]:
              - /url: /dashboard/reports/staff
              - generic [ref=e107]: ⊞
              - generic [ref=e108]: Staff Performance
            - link "◎ Channels" [ref=e109] [cursor=pointer]:
              - /url: /dashboard/reports/channels
              - generic [ref=e110]: ◎
              - generic [ref=e111]: Channels
            - link "◎ Cash Flow" [ref=e112] [cursor=pointer]:
              - /url: /dashboard/cash-flow
              - generic [ref=e113]: ◎
              - generic [ref=e114]: Cash Flow
        - generic [ref=e115]:
          - button "Afterroar Network ▸" [ref=e116]:
            - generic [ref=e117]: Afterroar Network
            - generic [ref=e118]: ▸
          - link "◉ Network" [ref=e119] [cursor=pointer]:
            - /url: /dashboard/network
            - generic [ref=e120]: ◉
            - generic [ref=e121]: Network
        - generic [ref=e122]:
          - button "Admin ▾" [ref=e123]:
            - generic [ref=e124]: Admin
            - generic [ref=e125]: ▾
          - generic [ref=e126]:
            - link "⊞ Staff" [ref=e127] [cursor=pointer]:
              - /url: /dashboard/staff
              - generic [ref=e128]: ⊞
              - generic [ref=e129]: Staff
            - link "◈ Subscription" [ref=e130] [cursor=pointer]:
              - /url: /dashboard/billing
              - generic [ref=e131]: ◈
              - generic [ref=e132]: Subscription
            - link "⚙ Settings" [ref=e133] [cursor=pointer]:
              - /url: /dashboard/settings
              - generic [ref=e134]: ⚙
              - generic [ref=e135]: Settings
            - link "⤓ Import" [ref=e136] [cursor=pointer]:
              - /url: /dashboard/import
              - generic [ref=e137]: ⤓
              - generic [ref=e138]: Import
            - link "◷ Time Clock" [ref=e139] [cursor=pointer]:
              - /url: /dashboard/timeclock
              - generic [ref=e140]: ◷
              - generic [ref=e141]: Time Clock
            - link "✦ Promotions" [ref=e142] [cursor=pointer]:
              - /url: /dashboard/promotions
              - generic [ref=e143]: ✦
              - generic [ref=e144]: Promotions
            - link "◌ Preorders" [ref=e145] [cursor=pointer]:
              - /url: /dashboard/preorders
              - generic [ref=e146]: ◌
              - generic [ref=e147]: Preorders
            - link "⚑ Issues" [ref=e148] [cursor=pointer]:
              - /url: /dashboard/issues
              - generic [ref=e149]: ⚑
              - generic [ref=e150]: Issues
            - link "◉ Ops Log" [ref=e151] [cursor=pointer]:
              - /url: /dashboard/ops-log
              - generic [ref=e152]: ◉
              - generic [ref=e153]: Ops Log
            - link "? Help" [ref=e154] [cursor=pointer]:
              - /url: /dashboard/help
              - generic [ref=e155]: "?"
              - generic [ref=e156]: Help
        - link "▤ Cafe" [ref=e157] [cursor=pointer]:
          - /url: /dashboard/cafe
          - generic [ref=e158]: ▤
          - text: Cafe
      - generic [ref=e159]:
        - paragraph [ref=e160]: Bot Owner · owner
        - button "Sign out" [ref=e161]
        - button "Register Mode" [ref=e162]
    - main [ref=e163]:
      - generic [ref=e164]:
        - generic [ref=e166]:
          - generic [ref=e168]: Online
          - generic [ref=e169]: Building offline cache...
        - button "Notifications" [ref=e171]:
          - img [ref=e172]
          - generic [ref=e174]: "5"
      - generic [ref=e176]:
        - heading "Settings" [level=1] [ref=e179]
        - paragraph [ref=e180]: Full Uproar Games & Café· Changes save automatically
        - navigation [ref=e182]:
          - button "⌂ Store" [ref=e183]:
            - generic [ref=e184]: ⌂
            - text: Store
          - button "◈ Payments" [ref=e185]:
            - generic [ref=e186]: ◈
            - text: Payments
          - button "⊞ Staff" [ref=e187]:
            - generic [ref=e188]: ⊞
            - text: Staff
          - button "◎ Integrations" [ref=e189]:
            - generic [ref=e190]: ◎
            - text: Integrations
          - button "◉ Intelligence" [ref=e191]:
            - generic [ref=e192]: ◉
            - text: Intelligence
          - button "⚙ Operations" [ref=e193]:
            - generic [ref=e194]: ⚙
            - text: Operations
        - paragraph [ref=e195]: Your store identity, tax, checkout, and receipt settings
        - generic [ref=e196]:
          - generic [ref=e197]:
            - generic [ref=e198]:
              - generic [ref=e199]:
                - heading "Store Identity" [level=2] [ref=e200]
                - paragraph [ref=e201]: How your store appears on receipts and to customers
              - button "Reset to defaults" [ref=e202]
            - generic [ref=e203]:
              - generic [ref=e204]:
                - generic [ref=e205]: Display Name
                - textbox "Defaults to store name" [ref=e207]
              - generic [ref=e208]:
                - generic [ref=e209]: Store Phone
                - textbox "e.g. (503) 555-0100" [ref=e211]
              - generic [ref=e212]:
                - generic [ref=e213]: Website
                - textbox "e.g. www.yourstore.com" [ref=e215]
              - generic [ref=e216]:
                - generic [ref=e217]:
                  - text: Receipt Address
                  - button "Help" [ref=e219]: "?"
                - textbox "e.g. 123 Main St, City, ST 12345" [ref=e221]
              - generic [ref=e222]:
                - generic [ref=e223]: Receipt Footer
                - textbox "e.g. Thank you for shopping with us!" [ref=e225]: Thank you for shopping with us!
              - generic [ref=e226]:
                - generic [ref=e227]: Show barcode on printed receipts
                - button [ref=e229]
              - generic [ref=e231]:
                - generic [ref=e232]: Show 'You saved $X' on receipts
                - button [ref=e234]
              - generic [ref=e236]:
                - generic [ref=e237]: Show return policy on receipts
                - button [ref=e239]
              - generic [ref=e241]:
                - generic [ref=e242]: Return Policy Text
                - textbox "Returns accepted within 30 days with receipt." [ref=e244]
          - generic [ref=e245]:
            - generic [ref=e246]:
              - generic [ref=e247]:
                - heading "Trade-Ins" [level=2] [ref=e248]
                - paragraph [ref=e249]: Default settings for the trade-in workflow
              - button "Reset to defaults" [ref=e250]
            - generic [ref=e251]:
              - generic [ref=e252]:
                - generic [ref=e253]:
                  - text: Default Credit Bonus %
                  - button "Help" [ref=e255]: "?"
                - spinbutton [ref=e257]: "30"
              - generic [ref=e258]:
                - generic [ref=e259]: Require customer for trade-ins
                - button [ref=e261]
          - generic [ref=e263]:
            - generic [ref=e264]:
              - generic [ref=e265]:
                - heading "Returns" [level=2] [ref=e266]
                - paragraph [ref=e267]: Default settings for processing returns
              - button "Reset to defaults" [ref=e268]
            - generic [ref=e269]:
              - generic [ref=e270]:
                - generic [ref=e271]: Default Credit Bonus %
                - spinbutton [ref=e273]: "0"
              - generic [ref=e274]:
                - generic [ref=e275]: Default Restocking Fee %
                - spinbutton [ref=e277]: "0"
              - generic [ref=e278]:
                - generic [ref=e279]: Return Window (days)
                - spinbutton [ref=e281]: "30"
              - generic [ref=e282]:
                - generic [ref=e283]: Require reason for returns
                - button [ref=e285]
          - generic [ref=e287]:
            - generic [ref=e288]:
              - generic [ref=e289]:
                - heading "Checkout" [level=2] [ref=e290]
                - paragraph [ref=e291]: How the register behaves during sales
              - button "Reset to defaults" [ref=e292]
            - generic [ref=e293]:
              - generic [ref=e294]:
                - generic [ref=e295]: Require customer for every sale
                - button [ref=e297]
              - generic [ref=e299]:
                - generic [ref=e300]: Auto-print receipt after sale
                - button [ref=e302]
              - generic [ref=e304]:
                - generic [ref=e305]: Default Payment Method
                - combobox [ref=e307]:
                  - option "Cash" [selected]
                  - option "Card"
                  - option "Store Credit"
          - generic [ref=e308]:
            - generic [ref=e309]:
              - generic [ref=e310]:
                - heading "Tax" [level=2] [ref=e311]
                - paragraph [ref=e312]: Sales tax configuration
              - button "Reset to defaults" [ref=e313]
            - generic [ref=e314]:
              - generic [ref=e315]:
                - generic [ref=e316]:
                  - text: Tax Rate %
                  - button "Help" [ref=e318]: "?"
                - spinbutton [ref=e320]: "7"
              - generic [ref=e321]:
                - generic [ref=e322]:
                  - text: Tax is included in listed prices
                  - button "Help" [ref=e324]: "?"
                - button [ref=e326]
          - generic [ref=e328]:
            - generic [ref=e329]:
              - generic [ref=e330]:
                - heading "Inventory" [level=2] [ref=e331]
                - paragraph [ref=e332]: Default inventory behavior
              - button "Reset to defaults" [ref=e333]
            - generic [ref=e335]:
              - generic [ref=e336]: Default Low Stock Threshold
              - spinbutton [ref=e338]: "5"
  - alert [ref=e339]
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
  24  |     // Now try to navigate away — this is what breaks
  25  |     // Use JS navigation to avoid sidebar overlap issues at test viewport size
  26  |     await page.evaluate(() => {
  27  |       const link = document.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;
  28  |       if (link) link.click();
  29  |     });
  30  | 
  31  |     // If we can reach dashboard URL, navigation works
  32  |     await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  33  |     await expect(page).toHaveURL(/\/dashboard$/);
  34  |   });
  35  | 
  36  |   test("can navigate to settings and to inventory", async ({ page }) => {
  37  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  38  | 
  39  |     // Wait for settings to load
  40  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  41  | 
  42  |     // Navigate to inventory via JS click (avoids sidebar overlap at test viewport)
  43  |     await page.evaluate(() => {
  44  |       const link = document.querySelector('a[href="/dashboard/inventory"]') as HTMLAnchorElement;
  45  |       if (link) link.click();
  46  |     });
  47  |     await page.waitForURL("**/dashboard/inventory**", { timeout: 10_000 });
  48  |     await expect(page).toHaveURL(/inventory/);
  49  |   });
  50  | 
  51  |   test("can switch settings tabs without breaking navigation", async ({ page }) => {
  52  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  53  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  54  | 
  55  |     // Click through each tab
  56  |     for (const tab of ["Payments", "Staff", "Integrations", "Intelligence", "Operations", "Store"]) {
  57  |       await page.getByRole("button", { name: tab }).click();
  58  |       await page.waitForTimeout(500);
  59  |     }
  60  | 
  61  |     // Now navigate away via JS click
  62  |     await page.evaluate(() => {
  63  |       const link = document.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;
  64  |       if (link) link.click();
  65  |     });
  66  |     await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  67  |     await expect(page).toHaveURL(/\/dashboard$/);
  68  |   });
  69  | 
  70  |   test("no console errors on settings page", async ({ page }) => {
  71  |     const errors: string[] = [];
  72  |     const warnings: string[] = [];
  73  |     page.on("console", (msg) => {
  74  |       if (msg.type() === "error") errors.push(msg.text());
  75  |       if (msg.type() === "warning") warnings.push(msg.text());
  76  |     });
  77  |     page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));
  78  | 
  79  |     await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
  80  |     await expect(page.locator("text=Changes save automatically")).toBeVisible({ timeout: 10_000 });
  81  | 
  82  |     // Wait a bit for any delayed errors
  83  |     await page.waitForTimeout(3000);
  84  | 
  85  |     // Log ALL errors and warnings for debugging
  86  |     console.log("=== CONSOLE ERRORS ===");
  87  |     errors.forEach((e) => console.log("  ERROR:", e.slice(0, 200)));
  88  |     console.log("=== CONSOLE WARNINGS ===");
  89  |     warnings.forEach((w) => console.log("  WARN:", w.slice(0, 200)));
  90  | 
  91  |     // Check for hydration or React errors
  92  |     const criticalErrors = errors.filter(
  93  |       (e) => e.includes("Hydration") || e.includes("hydration") || e.includes("did not match")
  94  |         || e.includes("mismatch") || e.includes("Minified React") || e.includes("PAGE_ERROR")
  95  |         || e.includes("Cannot read") || e.includes("is not a function")
  96  |     );
  97  | 
> 98  |     expect(criticalErrors).toEqual([]);
      |                            ^ Error: expect(received).toEqual(expected) // deep equality
  99  |   });
  100 | });
  101 | 
```