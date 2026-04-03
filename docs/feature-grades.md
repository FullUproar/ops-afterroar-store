# Feature Grades — Game Store Differentiators

**Last updated:** April 2, 2026 (post Wave 3)
**Strategy:** Breadth-first. Wave 1 (top 5 to B+), Wave 2 (bottom 5 to B), Wave 3 (A push with user feedback). TCG Singles gets A+++ treatment — woven in at the right moments.

---

## Grading Rubric

| Grade | Meaning |
|-------|---------|
| **A+** | Best-in-class. Store owners say "this is why I switched." Competitors can't match it. |
| **A** | Complete, polished, delightful. No complaints. Handles edge cases gracefully. |
| **A-** | Fully functional, minor rough edges. Works for 95% of use cases. |
| **B+** | Solid. Core workflows work end-to-end. Missing some nice-to-haves. Shippable. |
| **B** | Functional. Happy path works. Some gaps in secondary flows. Needs polish. |
| **B-** | Works but incomplete. Key workflows exist but missing supporting features. |
| **C+** | Partially built. Some pieces work, others are stubs or missing. |
| **C** | Skeleton exists. Data model and basic UI but not a real workflow. |
| **D** | Schema/spec exists. Minimal or placeholder UI. Not usable. |
| **F** | Nothing built. Spec only or not even spec'd. |

---

## Grade Summary (Post April 2 Session)

| # | Feature | Session Start | Wave 1 | Wave 2 | Wave 3 | A+ Push | Current |
|---|---------|--------------|--------|--------|--------|---------|---------|
| 1 | TCG Singles Engine | B+ | B+ | B+ | **A-** | A- | **A-** |
| 2 | Trade-In Circular Economy | B | **B+** | B+ | B+ | **A+** | **A+** |
| 3 | Event Ecosystem | B- | **B+** | B+ | **A-** | A- | **A-** |
| 4 | Community Customer Profiles | C+ | **B+** | B+ | **A-** | A- | **A-** |
| 5 | Prerelease / Allocation | D | **B+** | B+ | B+ | B+ | **B+** |
| 6 | Tournament Brackets | C- | C- | **B** | B | **B+** | **B+** |
| 7 | Cafe / Concessions | F | F | **B** | B | **A** | **A** |
| 8 | Game Library | D+ | D+ | **B** | B | B | **B** |
| 9 | Consignment / Showcase | F | F | **B** | B | **B+** | **B+** |
| 10 | Cross-Store Intelligence | D | D | **B** | B | B | **B** |

**Overall GPA: A-** (from C+ at session start)

### What moved after Wave 3:
- **Trade-In → A+**: Public buylist page, tiered VIP credit bonuses, inline stock intelligence, cash position indicator, retroactive points claim, return deductions
- **Cafe → A**: Unified F&B+retail tabs, menu builder with modifiers, QR table ordering, table fees (flat/hourly/free-with-purchase), auto-waive threshold, KDS filtering, hourly timer
- **Tournaments → B+**: Swiss flow in UI, bracket type selector, round timer, Next Round button
- **Consignment → B+**: Full management page with intake form, stats, sold/return actions

---

## Detailed Grades

### 1. TCG Singles Engine — A- (target: A+++)
**Wave 3 TCG Sprint completed.** Advanced search filters (set, color, rarity, price, format). Yu-Gi-Oh API integration (3 games live). Pokemon price drift parity. Buylist auto-generation from market data. One-click repricing from drift results. Sealed product EV calculator. Collection CSV import with Scryfall enrichment. Card image preview in trade-in grading. Cash position indicator in buylist workflow.

**Remaining for A+:** TCGPlayer marketplace sync. Lorcana API. Predictive price movement. Community price verification. Collection import from Moxfield/Archidekt.

**Previous grade: B+. Moved to A- via:**
**What works:** Scryfall search, Pokemon TCG API, add-to-inventory with prices, condition grading, bulk pricing tool, market price cache, eBay listing integration, card evaluator for trade-ins.
**What's missing for A:**
- Yu-Gi-Oh and Lorcana API integrations
- Advanced search filters (set, color, rarity, price range, format legality)
- Cached results for slow connections (IndexedDB)
- Price drift alerts ("Sheoldred dropped 20% this week")
- Buylist price auto-generation from market data
- Inventory photos (camera capture or Scryfall image auto-attach)
- Collection import (TCGPlayer CSV, Moxfield, Archidekt)
**What makes it A+++:**
- Real-time market-aware pricing across all games
- "What should I buy at this price?" intelligence
- Predictive price movement ("this card will spike after rotation")
- Community price verification (stores confirm prices, builds trust)
- Sealed product EV calculator
- Integration with tournament results (winner's deck drives singles demand)

### 2. Trade-In Circular Economy — B
**What works:** Trade-in workflow (customer → items → offer → complete), cash/credit choice, credit bonus %, ledger tracking, intelligence warns on credit liability, cash-aware buylist recommendations.
**What's missing for B+:**
- Buylist automation (auto-generate offers from market × condition × buylist%)
- Bulk buylist import (customer brings a list, not one card at a time)
- Trade-in history on customer profiles
- Credit redemption velocity tracking (measured, not estimated)
- "What did we pay vs what did we sell it for" per-item ROI
**What's missing for A:**
- Buylist publishing (customer-facing "we're buying these cards at these prices")
- Credit expiration policies (configurable)
- Tiered credit bonuses (VIPs get better rates)
- Trade-in appointment scheduling
- Photo verification for mail-in buylist submissions

### 3. Event Ecosystem — B-
**What works:** Event creation, check-ins, entry fees via ledger, event ROI in intelligence feed, WPN level tracking, event list with upcoming/past, "nothing on calendar" alert.
**What's missing for B+:**
- Halo effect tracking (purchases within 7 days of attendance — code started, not measured)
- Recurring event templates ("FNM every Friday at 6pm")
- Event-linked promotions ("10% off sleeves during FNM")
- Afterroar HQ sync (create event → appears on venue page)
- Pre-registration (RSVP count before the event)
**What's missing for A:**
- Event calendar view (not just a list)
- Prize pool management (entry fees → prize distribution)
- Event series tracking ("Modern Monday" as a series with cumulative stats)
- Attendance trends ("FNM attendance is declining — change format?")
- Player pairing preferences ("these two always want to play each other")
- Event-specific inventory holds ("hold 24 draft kits for Saturday's event")

### 4. Community Customer Profiles — C+
**What works:** Customer list, segments (VIP/Regular/New/At Risk/Dormant), credit balance, loyalty points, email/phone, auto-created from receipt QR capture.
**What's missing for B+:**
- Play format tracking ("plays Modern, Commander, Pokemon")
- Event attendance history on profile page
- Customer tags (manual: "whale", "judge", "problem customer")
- Customer notes (free-text, timestamped)
- Communication tools (email/text from profile)
- Purchase history detail view (not just ledger entries)
**What's missing for A:**
- Customer lifetime value calculation
- Churn prediction ("Sarah is 80% likely to stop coming")
- Social graph ("Alex always comes with Dylan and Sarah")
- Birthday/anniversary tracking with auto-reminders
- Wish list / want list (customer tells you what they're looking for)
- Customer-facing profile page (scan QR → see your credit, points, history)

### 5. Prerelease / Allocation Management — D
**What works:** Preorders table in schema, basic preorder page UI.
**What's missing for B+:**
- Deposit collection workflow (take deposit → link to product → fulfill on release)
- Allocation tracking ("ordered 48 kits, received 36")
- Waitlist management (overflow list, auto-notify when spots open)
- Product release calendar (upcoming sets with release dates)
- Fulfillment workflow (release day: check in preorder customers, distribute product)
- Integration with events ("this prerelease has 24 preorders, cap at 48")
**What's missing for A:**
- Distributor order integration (Alliance, ACD, GTS)
- Allocation prediction ("based on WPN level, expect X kits")
- Multi-wave preorders (early bird, regular, waitlist)
- Deposit refund policy enforcement
- Cross-product allocation ("Commander deck allocation tied to booster box order")

### 6. Tournament Bracket Management — C-
**What works:** Tournament, player, match tables in schema. Basic UI: create tournament, add players, report results.
**What's missing for B:**
- Swiss pairing algorithm (the core — must be correct)
- Round management (start round, timer, end round)
- Live standings display (projectable for in-store TV)
- Prize pool calculation and distribution
- Drop/bye handling
- Integration with check-ins (checked-in players auto-added to tournament)
**What's missing for A:**
- Multiple bracket types (Swiss, single elim, double elim, round robin)
- Tiebreaker calculations (opponent match win %, game win %)
- Judge tools (penalties, warnings, match slips)
- Player ratings / ELO tracking over time
- Companion app integration or replacement
- Results export for WPN reporting

### 7. Cafe / Concession Integration — F
**What exists:** Food/drink category in inventory with qty 999 perpetual stock.
**What's needed for B:**
- Menu management (separate from regular inventory, with modifiers)
- Table/seat ordering (QR at table → order from phone)
- Kitchen display system (KDS — orders appear on a screen in the kitchen)
- Tab management (open tab, add items, close and pay)
- Event revenue attribution ("$180 in food sold during FNM")
- Basic food cost tracking
**What's needed for A:**
- Modifier system (milk type, size, add shots)
- Prep station routing (drinks to bar, food to kitchen)
- Happy hour / time-based pricing
- Combo deals ("draft entry + coffee for $18")
- Allergen tracking
- Waste tracking

### 8. Game Library / Demo Table Management — D+
**What works:** Game library page with "Available" and "Active Checkouts" tabs. `lendable` flag on inventory. Check-out/return API.
**What's needed for B:**
- Table assignment ("Wingspan checked out to Table 4")
- Overdue notifications (checked out > 3 hours)
- Return condition check (quick "looks good" or "damaged" toggle)
- Most popular demos report
- Game recommendation ("you liked Wingspan, try Ark Nova")
**What's needed for A:**
- Table reservation system
- Demo event integration ("Board Game Night uses tables 1-6")
- Customer game history ("Alex has played 12 different games this month")
- Teach-to-play scheduling
- Damage tracking and replacement cost

### 9. Consignment / Showcase — F
**Nothing built.**
**What's needed for B:**
- Consignment agreement data model (customer, items, commission %, duration)
- Customer-owned inventory flag (separate from store-owned)
- Commission tracking (store takes X% on sale)
- Payout management (settle with consignor monthly or on-sale)
- Showcase display management (which items are in the case)
**What's needed for A:**
- Consignment agreement templates
- Auto-price adjustments over time (markdown schedule)
- Consignor portal (customer can see their items + sales status)
- Tax handling (1099 for consignors over $600)
- Unsold item return workflow
- Photo documentation for high-value consignments

### 10. Cross-Store Intelligence — D
**What exists:** Federated catalog schema (pos_catalog_products, shared_to_catalog flag, contributed_by_store_id). Catalog pricing table with velocity data.
**What's needed for B:**
- Opt-in sharing toggle in settings
- Anonymized sales velocity aggregation pipeline
- Basic benchmarks ("stores your size sell X of this per month")
- Category mix comparison ("your board game % is low vs peers")
**What's needed for A:**
- Regional pricing intelligence ("MTG singles are 10% higher in the Northeast")
- Seasonal demand patterns across the network
- New product performance prediction ("stores that stocked X saw Y velocity")
- Shared buylist pricing ("the network average buylist for Ragavan is $40")
- Community catalog enrichment (one store adds a product, all stores benefit)
- Competitive gap analysis ("no store within 50 miles stocks Flesh & Blood")

---

## Execution Plan

### Wave 1: Top 5 to B+ Floor
**Goal:** Every core differentiator is shippable. No embarrassing gaps in the top 5.

| Feature | Current | Target | Key Work |
|---------|---------|--------|----------|
| TCG Singles | B+ | B+ (hold, A+++ later) | Minor polish only |
| Trade-In | B | B+ | Buylist auto-pricing, trade history on profiles, per-item ROI |
| Events | B- | B+ | Halo tracking, recurring templates, pre-registration |
| Customer Profiles | C+ | B+ | Play formats, event history, tags, notes, purchase detail |
| Prerelease | D | B+ | Deposit workflow, allocation, waitlist, fulfillment |

### Wave 2: Bottom 5 to B Floor
**Goal:** Every feature works for the happy path. No F grades.

| Feature | Current | Target | Key Work |
|---------|---------|--------|----------|
| Tournaments | C- | B | Swiss algorithm, round management, standings, prize pool |
| Cafe | F | B | Menu, table ordering, KDS, tabs, event attribution |
| Game Library | D+ | B | Table assignment, overdue alerts, popularity tracking |
| Consignment | F | B | Data model, commission tracking, payout management |
| Cross-Store | D | B | Sharing toggle, velocity aggregation, basic benchmarks |

### Wave 3: A Push (User-Feedback Driven)
**Goal:** Listen to real stores, find what matters most, push those to A/A+.

TCG Singles gets the A+++ treatment during this wave — market intelligence, predictive pricing, sealed EV, community verification. This is the feature that makes store owners say "holy shit" and tell their friends.

### Wave 4: A+ Across the Board
**Goal:** Every feature is polished, handles edge cases, delightful. This is the competitive moat.
