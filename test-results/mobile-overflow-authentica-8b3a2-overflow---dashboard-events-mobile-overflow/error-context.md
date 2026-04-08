# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-overflow.spec.ts >> authenticated: mobile overflow checks >> mobile overflow - /dashboard/events
- Location: tests\mobile-overflow.spec.ts:32:9

# Error details

```
Error: /dashboard/events has 1 clipped buttons/links:
<button> "New Event" overflows right by 63px

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]: Training — Not Real
    - generic [ref=e5]:
      - main [ref=e6]:
        - generic [ref=e7]:
          - generic [ref=e9]:
            - generic [ref=e11]: Online
            - generic [ref=e12]: Building offline cache...
          - button "Notifications" [ref=e14]:
            - img [ref=e15]
            - generic [ref=e17]: "5"
        - generic [ref=e19]:
          - generic [ref=e20]:
            - generic [ref=e21]:
              - generic:
                - button "Go back" [ref=e22]:
                  - img [ref=e23]
                - heading "Events" [level=1]
              - generic [ref=e26]:
                - generic [ref=e27]:
                  - button "List" [ref=e28]
                  - button "Calendar" [ref=e29]
                - button "New Afterroar Event" [ref=e30]
                - button "New Event" [ref=e31]
            - paragraph [ref=e32]:
              - generic [ref=e33]: Connected to Afterroar
          - generic [ref=e35]:
            - button "Draft Night Active draft 4/7/2026 0 players" [ref=e37]:
              - generic [ref=e38]:
                - generic [ref=e39]: Draft Night
                - generic [ref=e40]: Active
              - generic [ref=e41]:
                - generic [ref=e42]: draft
                - generic [ref=e43]: 4/7/2026
                - generic [ref=e44]: 0 players
            - button "Commander Night Past casual 4/5/2026 0 players" [ref=e46]:
              - generic [ref=e47]:
                - generic [ref=e48]: Commander Night
                - generic [ref=e49]: Past
              - generic [ref=e50]:
                - generic [ref=e51]: casual
                - generic [ref=e52]: 4/5/2026
                - generic [ref=e53]: 0 players
            - button "FNM - Pioneer Past fnm 4/4/2026 0 players" [ref=e55]:
              - generic [ref=e56]:
                - generic [ref=e57]: FNM - Pioneer
                - generic [ref=e58]: Past
              - generic [ref=e59]:
                - generic [ref=e60]: fnm
                - generic [ref=e61]: 4/4/2026
                - generic [ref=e62]: 0 players
            - button "Commander Night Past casual 3/28/2026 16 players" [ref=e64]:
              - generic [ref=e65]:
                - generic [ref=e66]: Commander Night
                - generic [ref=e67]: Past
              - generic [ref=e68]:
                - generic [ref=e69]: casual
                - generic [ref=e70]: 3/28/2026
                - generic [ref=e71]: 16 players
            - button "Pokemon League Past league 3/26/2026 7 players" [ref=e73]:
              - generic [ref=e74]:
                - generic [ref=e75]: Pokemon League
                - generic [ref=e76]: Past
              - generic [ref=e77]:
                - generic [ref=e78]: league
                - generic [ref=e79]: 3/26/2026
                - generic [ref=e80]: 7 players
            - button "Friday Night Magic - Modern Past fnm 3/25/2026 22 players" [ref=e82]:
              - generic [ref=e83]:
                - generic [ref=e84]: Friday Night Magic - Modern
                - generic [ref=e85]: Past
              - generic [ref=e86]:
                - generic [ref=e87]: fnm
                - generic [ref=e88]: 3/25/2026
                - generic [ref=e89]: 22 players
            - button "Yu-Gi-Oh! Locals Past tournament 3/24/2026 10 players" [ref=e91]:
              - generic [ref=e92]:
                - generic [ref=e93]: Yu-Gi-Oh! Locals
                - generic [ref=e94]: Past
              - generic [ref=e95]:
                - generic [ref=e96]: tournament
                - generic [ref=e97]: 3/24/2026
                - generic [ref=e98]: 10 players
            - button "Board Game Night Past casual 3/23/2026 16 players" [ref=e100]:
              - generic [ref=e101]:
                - generic [ref=e102]: Board Game Night
                - generic [ref=e103]: Past
              - generic [ref=e104]:
                - generic [ref=e105]: casual
                - generic [ref=e106]: 3/23/2026
                - generic [ref=e107]: 16 players
            - button "Commander Night Past casual 3/21/2026 17 players" [ref=e109]:
              - generic [ref=e110]:
                - generic [ref=e111]: Commander Night
                - generic [ref=e112]: Past
              - generic [ref=e113]:
                - generic [ref=e114]: casual
                - generic [ref=e115]: 3/21/2026
                - generic [ref=e116]: 17 players
            - button "Friday Night Magic - Standard Past fnm 3/18/2026 21 players" [ref=e118]:
              - generic [ref=e119]:
                - generic [ref=e120]: Friday Night Magic - Standard
                - generic [ref=e121]: Past
              - generic [ref=e122]:
                - generic [ref=e123]: fnm
                - generic [ref=e124]: 3/18/2026
                - generic [ref=e125]: 21 players
            - button "Lorcana Tournament Past tournament 3/17/2026 14 players" [ref=e127]:
              - generic [ref=e128]:
                - generic [ref=e129]: Lorcana Tournament
                - generic [ref=e130]: Past
              - generic [ref=e131]:
                - generic [ref=e132]: tournament
                - generic [ref=e133]: 3/17/2026
                - generic [ref=e134]: 14 players
            - button "Commander Night Past casual 3/14/2026 9 players" [ref=e136]:
              - generic [ref=e137]:
                - generic [ref=e138]: Commander Night
                - generic [ref=e139]: Past
              - generic [ref=e140]:
                - generic [ref=e141]: casual
                - generic [ref=e142]: 3/14/2026
                - generic [ref=e143]: 9 players
            - button "Pokemon League Past league 3/12/2026 11 players" [ref=e145]:
              - generic [ref=e146]:
                - generic [ref=e147]: Pokemon League
                - generic [ref=e148]: Past
              - generic [ref=e149]:
                - generic [ref=e150]: league
                - generic [ref=e151]: 3/12/2026
                - generic [ref=e152]: 11 players
            - button "Friday Night Magic - Pioneer Past fnm 3/11/2026 22 players" [ref=e154]:
              - generic [ref=e155]:
                - generic [ref=e156]: Friday Night Magic - Pioneer
                - generic [ref=e157]: Past
              - generic [ref=e158]:
                - generic [ref=e159]: fnm
                - generic [ref=e160]: 3/11/2026
                - generic [ref=e161]: 22 players
            - button "Commander Night Past casual 3/7/2026 15 players" [ref=e163]:
              - generic [ref=e164]:
                - generic [ref=e165]: Commander Night
                - generic [ref=e166]: Past
              - generic [ref=e167]:
                - generic [ref=e168]: casual
                - generic [ref=e169]: 3/7/2026
                - generic [ref=e170]: 15 players
            - button "Friday Night Magic - Draft Past fnm 3/4/2026 19 players" [ref=e172]:
              - generic [ref=e173]:
                - generic [ref=e174]: Friday Night Magic - Draft
                - generic [ref=e175]: Past
              - generic [ref=e176]:
                - generic [ref=e177]: fnm
                - generic [ref=e178]: 3/4/2026
                - generic [ref=e179]: 19 players
            - button "Modern 1K Past tournament 3/2/2026 6 players" [ref=e181]:
              - generic [ref=e182]:
                - generic [ref=e183]: Modern 1K
                - generic [ref=e184]: Past
              - generic [ref=e185]:
                - generic [ref=e186]: tournament
                - generic [ref=e187]: 3/2/2026
                - generic [ref=e188]: 6 players
            - button "Friday Night Magic - Modern Past fnm 2/25/2026 19 players" [ref=e190]:
              - generic [ref=e191]:
                - generic [ref=e192]: Friday Night Magic - Modern
                - generic [ref=e193]: Past
              - generic [ref=e194]:
                - generic [ref=e195]: fnm
                - generic [ref=e196]: 2/25/2026
                - generic [ref=e197]: 19 players
            - button "Friday Night Magic - Standard Past fnm 2/18/2026 19 players" [ref=e199]:
              - generic [ref=e200]:
                - generic [ref=e201]: Friday Night Magic - Standard
                - generic [ref=e202]: Past
              - generic [ref=e203]:
                - generic [ref=e204]: fnm
                - generic [ref=e205]: 2/18/2026
                - generic [ref=e206]: 19 players
            - 'button "Prerelease: Thunder Junction Past prerelease 2/15/2026 30 players" [ref=e208]':
              - generic [ref=e209]:
                - generic [ref=e210]: "Prerelease: Thunder Junction"
                - generic [ref=e211]: Past
              - generic [ref=e212]:
                - generic [ref=e213]: prerelease
                - generic [ref=e214]: 2/15/2026
                - generic [ref=e215]: 30 players
      - navigation [ref=e216]:
        - generic [ref=e217]:
          - link "◈ Register" [ref=e218] [cursor=pointer]:
            - /url: /dashboard/register
            - generic [ref=e219]: ◈
            - generic [ref=e220]: Register
          - link "▦ Inventory" [ref=e221] [cursor=pointer]:
            - /url: /dashboard/inventory
            - generic [ref=e222]: ▦
            - generic [ref=e223]: Inventory
          - link "♟ Customers" [ref=e224] [cursor=pointer]:
            - /url: /dashboard/customers
            - generic [ref=e225]: ♟
            - generic [ref=e226]: Customers
          - button "··· More" [ref=e227]:
            - generic [ref=e228]: ···
            - generic [ref=e229]: More
  - alert [ref=e230]
```

# Test source

```ts
  11  | import { test, expect } from "@playwright/test";
  12  | 
  13  | const PAGES = [
  14  |   "/dashboard",
  15  |   "/dashboard/register",
  16  |   "/dashboard/inventory",
  17  |   "/dashboard/singles",
  18  |   "/dashboard/customers",
  19  |   "/dashboard/events",
  20  |   "/dashboard/cafe",
  21  |   "/dashboard/trade-ins",
  22  |   "/dashboard/returns",
  23  |   "/dashboard/cash-flow",
  24  |   "/dashboard/staff",
  25  |   "/dashboard/settings/store",
  26  |   "/dashboard/settings/payments",
  27  |   "/dashboard/help",
  28  | ];
  29  | 
  30  | test.describe("authenticated: mobile overflow checks", () => {
  31  |   for (const pagePath of PAGES) {
  32  |     test(`mobile overflow - ${pagePath}`, async ({ page }) => {
  33  |       await page.goto(pagePath, { waitUntil: "domcontentloaded", timeout: 30_000 });
  34  |       await page.waitForTimeout(2000);
  35  | 
  36  |       const viewportWidth = 390;
  37  | 
  38  |       // Check for horizontal overflow
  39  |       const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
  40  |       const hasHorizontalOverflow = bodyScrollWidth > viewportWidth + 5; // 5px tolerance
  41  | 
  42  |       if (hasHorizontalOverflow) {
  43  |         // Find the offending elements
  44  |         const overflowingElements = await page.evaluate((vw) => {
  45  |           const elements: string[] = [];
  46  |           document.querySelectorAll("*").forEach((el) => {
  47  |             const rect = el.getBoundingClientRect();
  48  |             if (rect.right > vw + 5 && rect.width > 0 && rect.height > 0) {
  49  |               const tag = el.tagName.toLowerCase();
  50  |               const cls = el.className?.toString().slice(0, 60) || "";
  51  |               const text = el.textContent?.slice(0, 30) || "";
  52  |               elements.push(`<${tag} class="${cls}"> "${text}" (right: ${Math.round(rect.right)}px)`);
  53  |             }
  54  |           });
  55  |           return elements.slice(0, 5); // First 5 offenders
  56  |         }, viewportWidth);
  57  | 
  58  |         console.log(`[${pagePath}] Horizontal overflow detected (scrollWidth: ${bodyScrollWidth}px):`);
  59  |         overflowingElements.forEach((el) => console.log(`  - ${el}`));
  60  |       }
  61  | 
  62  |       // Don't hard-fail on overflow for now — just report. Uncomment to enforce:
  63  |       // expect(hasHorizontalOverflow, `Horizontal overflow on ${pagePath}`).toBeFalsy();
  64  | 
  65  |       // Check that all interactive elements (buttons, links) are within viewport
  66  |       // Skip elements inside horizontally scrollable containers (they're meant to scroll)
  67  |       const clippedButtons = await page.evaluate((vw) => {
  68  |         function hasScrollableParent(el: Element): boolean {
  69  |           let parent = el.parentElement;
  70  |           while (parent) {
  71  |             const style = getComputedStyle(parent);
  72  |             if (style.overflowX === "auto" || style.overflowX === "scroll") return true;
  73  |             parent = parent.parentElement;
  74  |           }
  75  |           return false;
  76  |         }
  77  | 
  78  |         const clipped: string[] = [];
  79  |         document.querySelectorAll("button, a, input, select").forEach((el) => {
  80  |           const rect = el.getBoundingClientRect();
  81  |           if (rect.width === 0 || rect.height === 0) return;
  82  |           if (rect.top > 2000 || rect.top < -100) return;
  83  |           if (hasScrollableParent(el)) return; // Skip — it's in a scroll container
  84  | 
  85  |           const rightMargin = vw - rect.right;
  86  |           const leftMargin = rect.left;
  87  | 
  88  |           if (rightMargin < -2) { // 2px tolerance
  89  |             const tag = el.tagName.toLowerCase();
  90  |             const text = (el.textContent || (el as HTMLInputElement).placeholder || "").slice(0, 30);
  91  |             clipped.push(`<${tag}> "${text}" overflows right by ${Math.abs(Math.round(rightMargin))}px`);
  92  |           }
  93  |           if (leftMargin < -2) {
  94  |             const tag = el.tagName.toLowerCase();
  95  |             const text = (el.textContent || "").slice(0, 30);
  96  |             clipped.push(`<${tag}> "${text}" overflows left by ${Math.abs(Math.round(leftMargin))}px`);
  97  |           }
  98  |         });
  99  |         return clipped;
  100 |       }, viewportWidth);
  101 | 
  102 |       if (clippedButtons.length > 0) {
  103 |         console.log(`[${pagePath}] Clipped interactive elements:`);
  104 |         clippedButtons.forEach((el) => console.log(`  - ${el}`));
  105 |       }
  106 | 
  107 |       // This SHOULD pass — clipped buttons are a real usability problem
  108 |       expect(
  109 |         clippedButtons.length,
  110 |         `${pagePath} has ${clippedButtons.length} clipped buttons/links:\n${clippedButtons.join("\n")}`
> 111 |       ).toBe(0);
      |         ^ Error: /dashboard/events has 1 clipped buttons/links:
  112 |     });
  113 |   }
  114 | });
  115 | 
```