# Store Ops — Canonical User Flows

**Purpose:** every flow Store Ops must support, told as narratives. Not feature lists — sequences of "user does X, system does Y, user does Z." Each flow is testable by literally walking through it in the app.

**Priority levels:**
- **P0 — Critical** — wake me up. If broken, stop everything.
- **P1 — High** — fix within 24 hours. Daily operations break without these.
- **P2 — Medium** — fix within 1 week. Quality of life and admin.
- **P3 — Low** — fix when convenient.

**Each flow has:** Actor · Trigger · Steps · Success · Failure modes worth testing

---

## P0 — Critical Flows

### P0.1 — Cash sale at the counter
**Actor:** Cashier · **Trigger:** Customer brings items to register
1. Cashier scans first item — it appears in cart with name + price
2. Scans next two items — cart updates running total
3. Customer hands cash — cashier taps Cash, enters tendered amount
4. System calculates change owed — cashier hands change
5. Receipt prints automatically; offers to email/QR a copy
6. Cart clears, ready for next customer

**Success:** receipt prints, total matches register, inventory decremented, payment recorded
**Failure modes worth testing:** wrong tendered amount entered, customer changes mind mid-scan, duplicate scan of same item, scanner misreads UPC, receipt printer out of paper

---

### P0.2 — Card sale via Stripe Terminal
**Actor:** Cashier · **Trigger:** Customer wants to pay by card
1. Cashier adds items to cart as in P0.1
2. Taps Card → Stripe S710 reader wakes, prompts customer
3. Customer taps/inserts/swipes their card
4. Reader processes; cashier sees "Approved" or "Declined"
5. On approved: receipt prints with last 4 + brand
6. On declined: cashier offers another payment method or splits tender

**Success:** Stripe charge captured, receipt printed, inventory decremented
**Failure modes:** terminal disconnects mid-transaction, network drops between approval and receipt, terminal needs restart, customer's card has chip + reader prefers tap, signature needed for amount over threshold

---

### P0.3 — Refund a previous sale
**Actor:** Cashier · **Trigger:** Customer returns with receipt or QR code
1. Cashier opens More menu → Returns (or scans receipt QR)
2. Original sale appears with line items
3. Cashier selects which items to refund (whole order or partial)
4. Chooses refund method: original card / cash / store credit
5. If card refund: terminal processes refund to original card
6. If cash refund: opens till, hands cash
7. Receipt prints showing what was refunded
8. Inventory restocks the returned items, loyalty points reverse

**Success:** money returned, inventory back in stock, points adjusted, audit trail intact
**Failure modes:** original card no longer valid, partial refund where one item is non-refundable, customer wants different item in exchange (refund + new sale combo), no receipt provided

---

### P0.4 — Trade-in for cash or store credit
**Actor:** Cashier · **Trigger:** Customer brings cards/games to sell
1. Cashier opens Trade-Ins from Inventory tabs
2. Scans or searches for each item, sets condition (NM/LP/MP/HP/DMG)
3. System calculates offer per buylist rules (TCG pricing × condition × buylist %)
4. Cashier shows total to customer, customer accepts
5. Cashier asks: cash or store credit? (Store credit usually has +10% bonus.)
6. If cash: opens till, hands cash, prints trade-in receipt
7. If store credit: credits customer account, prints credit slip
8. Items intake into inventory at calculated cost basis

**Success:** items in inventory, customer has money or credit, audit trail of the trade
**Failure modes:** card not in catalog yet (needs add), condition disputed, customer changes mind on payout method after acceptance, system offers more than the store wants to pay (override needed)

---

### P0.5 — Customer buys a gift card
**Actor:** Cashier · **Trigger:** Customer asks to buy a gift card
1. Cashier opens More → Gift Card → Sell
2. Picks card design or scans physical card barcode
3. Enters amount (preset $25/50/100 or custom)
4. Adds to cart at correct tax category (gift cards = no tax)
5. Customer pays as P0.1 or P0.2
6. Card activates with the loaded balance
7. Receipt prints; for digital cards, email arrives with redemption code

**Success:** card has correct balance, no double-activation, receipt clear
**Failure modes:** payment fails after card activation, customer wants different amount mid-transaction, cashier accidentally activates two cards

---

### P0.6 — Customer redeems a gift card or store credit
**Actor:** Cashier · **Trigger:** Customer presents gift card or store credit at checkout
1. Cashier adds items to cart normally
2. Taps payment → Gift Card / Store Credit
3. Scans card barcode or enters customer phone for credit
4. System shows available balance
5. Cashier applies amount (full balance or partial)
6. If balance covers total: complete sale
7. If balance < total: prompts for additional payment method
8. Receipt shows what was applied + remaining balance

**Success:** balance decremented correctly, no double-spend, customer leaves with items
**Failure modes:** card already empty, two cashiers redeem same card simultaneously (race), partial application then customer changes mind

---

### P0.7 — Loyalty points earn and redeem on a single sale
**Actor:** Cashier · **Trigger:** Known customer at checkout
1. Cashier searches for customer by phone/name → attaches to sale
2. Customer asks to redeem 200 points = $2 off
3. Cashier applies redemption → discount line appears in cart
4. Sale completes (cash or card)
5. Customer earns new points on the post-discount total
6. Receipt shows: points used, new points earned, current balance
7. Points balance syncs to HQ (Passport) for cross-store visibility

**Success:** correct earn + redeem math, balance updated, sync to HQ confirms
**Failure modes:** customer asks to redeem more than balance, sync to HQ fails (must queue), tier bonus calculates incorrectly, customer redeems then returns the item (points reverse)

---

### P0.8 — Cafe order: open tab, add items, settle
**Actor:** Cashier (or customer via QR) · **Trigger:** Customer sits at table or places order
1. Cashier opens Cafe → New Tab → assigns table number
2. Adds menu items (drink, sandwich, modifiers)
3. KDS in kitchen shows items as they're added
4. Throughout the meal, more items added to the same tab
5. Customer ready to leave: cashier opens tab → adds tip prompt
6. Customer pays (cash, card, splits with another customer)
7. Tab settles → ledger entry → table fee waived if spend threshold met
8. Table marked clean for next customer

**Success:** kitchen got every item, payment matches total, no double-billing, table flips
**Failure modes:** kitchen prints item before customer confirms, customer wants to split bill across cards, age verification on alcohol fails, table fee should waive but doesn't, two cashiers edit same tab simultaneously

---

### P0.9 — Marketplace order arrives, gets shipped
**Actor:** System (webhook) → Manager → Cashier · **Trigger:** Customer buys on eBay/Shopify
1. eBay/Shopify webhook fires → Store Ops creates order record
2. Inventory decrements (anti-oversell)
3. Order appears in Fulfillment queue with priority (oldest first)
4. Manager opens fulfillment, picks the order
5. Pulls items from shelf using pull-sheet
6. Packs box, weighs it
7. Generates ShipStation label → label prints
8. Marks order shipped → tracking number emails to customer
9. Marketplace acknowledges shipment via API

**Success:** customer gets tracking email same day, inventory matches, marketplace happy
**Failure modes:** item out of stock at fulfillment time (oversold), label printer offline, ShipStation API down, customer changes shipping address after webhook arrived, return label requested

---

### P0.10 — Public buylist: customer sees what store buys
**Actor:** Anonymous customer · **Trigger:** Customer visits `/buylist/[slug]`
1. Customer lands on public page (no login)
2. Sees grid of cards the store is actively buying with prices
3. Filters by game (MTG/Pokemon/Yu-Gi-Oh) or condition
4. Adds cards to "I'm bringing" list (saved locally)
5. Generates a printable list to bring to the store
6. Comes to store, hands list to cashier → P0.4 (Trade-in flow)

**Success:** customer arrives prepared, trade-in is faster, no surprises on offered prices
**Failure modes:** prices change between web view and in-store visit, customer brings cards not on the list, customer disputes the offered price

---

### P0.11 — Customer scans receipt QR for past purchase
**Actor:** Customer · **Trigger:** Customer scans QR on a printed receipt
1. Customer scans QR with their phone camera
2. Lands on `/r/[token]` (no login required)
3. Sees full sale details: items, prices, total, store name, date
4. Can email/save the receipt
5. Optionally taps "Loyalty signup" to claim points retroactively (24hr window)

**Success:** receipt loads on phone, customer doesn't need paper copy, retroactive loyalty claim works
**Failure modes:** QR scanned a year later (must still resolve), loyalty claim attempted after 24hr window, customer scans someone else's receipt

---

### P0.12 — Cafe table QR: customer orders from phone
**Actor:** Customer at a table · **Trigger:** Customer scans QR on the table
1. Lands on `/order/[slug]/[table]` — no login
2. Sees menu (cached, works offline)
3. Adds items to order, applies modifiers
4. Submits order → KDS in kitchen receives it
5. Items arrive at the table
6. Bill closes via cashier as P0.8

**Success:** kitchen sees the order with table number, customer gets food, no manual data entry
**Failure modes:** customer at wrong table, age verification needed for alcohol but customer is alone, kitchen printer offline, customer wants to modify after submission

---

### P0.13 — Mobile timeclock: staff clocks in via phone
**Actor:** Staff member · **Trigger:** Start of shift
1. Staff opens `/clock/[slug]` on their phone (PWA installable)
2. Enters their PIN (4-8 digits, hashed)
3. System records clock-in time + GPS tag (on_site/remote/no_gps)
4. Staff sees their hours-this-week dashboard
5. End of shift: clock out via same flow

**Success:** time recorded, payroll has accurate hours, no admin needs to be involved
**Failure modes:** wrong PIN entered (10 attempts → lockout), GPS denied (still works, just untagged), staff forgets to clock out (manager corrects in dashboard)

---

### P0.14 — Sale completes when network drops
**Actor:** Cashier · **Trigger:** Mid-transaction network outage
1. Cashier mid-cart when WiFi drops
2. Status bar shows "Offline — sales will sync when back online"
3. Cashier completes sale (cash or queued card)
4. Receipt prints normally (thermal printer is local)
5. Customer leaves
6. Network returns → queued sales sync → inventory updates → marketplace pushes go out

**Success:** customer never knows there was a problem, sale is recorded, sync completes cleanly
**Failure modes:** card transactions in offline mode (need clear UX about deferred capture), inventory shows stale counts during outage, two registers desync during outage, sale conflicts on resync

---

### P0.15 — Stripe Terminal recovers from disconnect
**Actor:** Cashier · **Trigger:** Terminal loses connection mid-payment
1. Customer has tapped card, terminal is processing
2. Terminal loses Bluetooth/network mid-transaction
3. UI shows "Reconnecting..." not "Failed"
4. Terminal reconnects
5. System checks: did the charge complete?
6. If yes: receipt prints, sale closes
7. If no: cashier prompted to retry payment method

**Success:** never charge a card twice, never lose a payment, customer is never unsure
**Failure modes:** terminal reports success but Stripe API says failed (or vice versa), terminal's last transaction was a refund that reconnects ambiguously, cashier hits "Cancel" while reconnecting

---

## P1 — High (fix within 24h)

### P1.1 — Owner morning routine
**Actor:** Owner · **Trigger:** Start of day at home or at the store
1. Logs in via Google on laptop → lands on Dashboard
2. Glances at headline metrics (yesterday's revenue, on-hand cash, pending orders)
3. Clicks Intelligence → reviews dead stock alerts, liquidity runway
4. Clicks Inventory → filters to "low stock" → notes items to reorder
5. Switches to Card Catalog tab → checks MTG market drift on key sets
6. Triggers a repricing batch on a few sets that moved
7. Goes to Settings → tweaks dead stock threshold from 60 → 90 days
8. Closes laptop, heads to store with a mental list

**Success:** owner has a clear plan for the day in 15 min
**Failure modes:** Intelligence data lags by a day, can't get back to dashboard from a deep page, low-stock filter doesn't match what owner mentally calls "low"

---

### P1.2 — Cashier opens for the day
**Actor:** Cashier · **Trigger:** First arrival of the morning
1. Clocks in via mobile → P0.13
2. At register: switches to Register Mode via sidebar footer
3. Opens till → enters starting cash count
4. System confirms variance vs last-close → flag if off
5. Status bar shows green: scanner ready, terminal connected, printer online
6. First customer arrives → P0.1

**Success:** till matches expected start, all hardware connected, cashier feels ready
**Failure modes:** terminal not paired yet, printer needs paper change, last-close cash doesn't match opening (overnight discrepancy)

---

### P1.3 — Owner adds 50 new MTG cards to inventory after a release
**Actor:** Owner · **Trigger:** New MTG set drops, store has stock
1. Goes to Card Catalog → MTG → searches set name
2. Sees all cards in the set with market prices
3. Bulk-selects which ones the store will stock
4. Sets buylist % per rarity (Mythic 60%, Rare 50%, Common 30%)
5. Bulk-adds to inventory with starting quantities
6. System creates inventory records, links to catalog products
7. Prints labels for the new stock

**Success:** 50 cards added in 5 minutes, prices and buylist already set
**Failure modes:** Scryfall doesn't have the set yet, owner wants different prices than market, bulk add fails partway and leaves orphaned records

---

### P1.4 — Manager schedules and runs a Friday Night Magic tournament
**Actor:** Manager · **Trigger:** Weekly recurring event
1. Goes to Events → New Event → format: Standard, $5 entry, 4 rounds Swiss
2. Sets date/time, max players 16
3. Saves event → automatically syncs to WPN
4. Friday evening: players arrive, manager checks each in (P1.5)
5. At start time: manager closes registration, starts round 1
6. Players play; when matches end, players report results
7. Manager confirms or adjusts results
8. After last round in the cut: manager declares winners
9. Prizes paid out as store credit via ledger

**Success:** tournament runs on time, results sync to WPN, prize credits applied, players happy
**Failure modes:** odd number of players (bye logic), player drops mid-tournament, dispute on a match result, WPN sync fails, prize structure doesn't match payout

---

### P1.5 — Customer checks in to an event
**Actor:** Cashier · **Trigger:** Player walks up to counter for FNM check-in
1. Cashier finds customer (P1.7) or creates new
2. Selects tonight's event from list
3. Confirms entry fee — customer pays (cash/card/store credit)
4. System assigns a player number
5. Customer earns event check-in loyalty points
6. Cashier prints a player tag with their number/name

**Success:** customer in the system for the event, fee collected, loyalty credit, ready to play
**Failure modes:** event already started (late check-in policy?), player wants to use store credit but has none, customer registers under wrong event

---

### P1.6 — Owner reprices a TCG set after market shift
**Actor:** Owner · **Trigger:** Market sees a big mover (e.g., a card spiked overnight)
1. Card Catalog → searches the spiking card
2. Sees current store price vs current market price → big delta
3. Clicks Reprice on this card → confirms new price
4. Selects related set/cards to reprice in the same batch
5. Bulk-applies new prices → inventory updates
6. Public buylist updates (if buying that card)

**Success:** store catches the move, doesn't sell at old underpriced
**Failure modes:** market data is stale, owner wants nuanced pricing (not just market), repricing affects items in active customer reservations

---

### P1.7 — Cashier finds an existing customer at register
**Actor:** Cashier · **Trigger:** Customer says "I have an account here"
1. At register: taps Customer panel
2. Searches by name / phone / email
3. Sees matches with lifetime spend, last visit, loyalty balance
4. Picks the right one → attached to current sale
5. Sale proceeds with customer context (loyalty, tier, history visible)

**Success:** right customer attached in <10 seconds
**Failure modes:** two customers with similar names, customer mistypes phone, customer has duplicate accounts (need merge), customer never gave their info before

---

### P1.8 — Cashier handles a complex multi-tender sale
**Actor:** Cashier · **Trigger:** Customer wants to split payment across methods
1. Adds items to cart, total is $87.50
2. Customer: "I have $40 store credit, $20 cash, rest on card"
3. Cashier taps Split Tender
4. Applies $40 store credit → balance $47.50
5. Applies $20 cash → balance $27.50
6. Taps Card → terminal processes $27.50
7. Receipt shows all three payment methods

**Success:** no double-charging, balance reaches zero exactly, receipt is clear
**Failure modes:** customer overpays cash and wants change, card portion declines mid-flow, store credit balance was wrong (race with another sale)

---

### P1.9 — Cashier sells a Magic deck via Deck Builder
**Actor:** Cashier · **Trigger:** Customer wants a pre-built deck
1. Customer asks "do you have a Modern Burn deck ready?"
2. Cashier opens Deck Builder from Inventory tabs
3. Searches saved decks → finds "Modern Burn $200"
4. Pulls up deck list → confirms cards in stock
5. Adds entire deck to cart as one bundled item
6. Bundle includes deck box + sleeves at deck price
7. Customer pays → P0.1 or P0.2
8. Inventory decrements each card individually

**Success:** sale closes in 60 seconds, every card decremented from inventory, deck remains available as a template
**Failure modes:** one card is out of stock (cashier offers substitute), deck price differs from sum of card prices (override?), customer wants modifications

---

### P1.10 — Cashier processes a return + new sale in one interaction
**Actor:** Cashier · **Trigger:** Customer returns item and buys something else
1. Customer hands back item with receipt
2. Cashier opens Returns → P0.3
3. Refunds to original payment OR converts to store credit
4. Customer browses → picks new items
5. Cashier rings up new items
6. If customer chose store credit: P0.6 to redeem
7. If refunded to card: customer pays for new items separately
8. Single visit, two transactions

**Success:** clean accounting, customer happy, no manual reconciliation needed
**Failure modes:** customer expects to "exchange" and avoid two receipts, math gets confusing if returning $50 + buying $30, refund timing if returning to original card

---

### P1.11 — Owner generates buylist offers for a customer's collection
**Actor:** Owner · **Trigger:** Customer brings in a binder of cards to sell
1. Owner opens Card Catalog → Bulk Add to Buylist
2. Scans/enters cards one by one (or imports CSV from customer's TCGPlayer export)
3. System auto-grades + prices each card
4. Owner reviews offer total
5. Adjusts up/down on individual cards as needed
6. Presents total to customer
7. If accepted: P0.4 (trade-in completes)

**Success:** scales to 200+ card binders without taking an hour
**Failure modes:** customer's CSV format doesn't match what we expect, cards in catalog have outdated prices, condition unknowable from data import (need manual grading)

---

### P1.12 — Manager runs end-of-day close
**Actor:** Manager · **Trigger:** End of operating day
1. Manager opens Reports → End of Day
2. Reviews day's sales (cash, card, gift card, store credit breakdowns)
3. Counts till cash → enters closing count
4. System shows variance vs expected (sum of starting + cash sales − cash refunds)
5. If variance > $5: prompt for explanation/note
6. Approves close → till locks for the day
7. Tomorrow's opening uses tonight's closing as baseline

**Success:** clean end-of-day reconciliation, variance accountability, ready for next morning
**Failure modes:** variance unexplained but manager closes anyway (audit), petty cash drawer not counted, manager closes early (cashier still mid-transaction)

---

### P1.13 — Mobile register: cashier checks out a customer from phone
**Actor:** Cashier on phone · **Trigger:** Floor sale, no register nearby
1. Cashier walks customer to a quiet area
2. Opens `/mobile/[slug]` on phone (already paired with access code)
3. Enters PIN
4. Adds items by scanning barcode with phone camera
5. Customer pays via Stripe Terminal (S710 paired to phone)
6. Receipt emails to customer

**Success:** sale completes anywhere in the store, no waiting in line
**Failure modes:** phone scanner can't read damaged barcode, terminal Bluetooth pairing issue, exceeds per-session transaction limit (mobile guardrails)

---

### P1.14 — Owner switches between dashboard and register modes
**Actor:** Owner · **Trigger:** Owner needs to ring up a sale during data review
1. Owner is reviewing reports in dashboard mode
2. Customer needs help → owner taps mode toggle in sidebar footer
3. UI flips to register mode (sidebar disappears, full-screen POS)
4. Owner rings up the sale
5. Toggles back to dashboard mode
6. Resumes report review where they left off

**Success:** mode switch is instant, no state lost, no reload required
**Failure modes:** open form data lost during switch, toggle button hard to find, register mode misses a permission check

---

## P2 — Medium (fix within 1 week)

### P2.1 — New owner walks through onboarding
**Actor:** New store owner · **Trigger:** First login after Connect approval
1. Lands on onboarding wizard → Step 1: confirm store info
2. Step 2: choose to import inventory CSV / scan items / seed demo data / start blank
3. Step 3: invite staff (optional)
4. Step 4: connect Stripe (skippable)
5. Step 5: do a test sale in training mode
6. Step 6: toggle off training, go live
7. Lands on dashboard with the demo or first real data

**Success:** new owner is doing real sales within 30 minutes of first login
**Failure modes:** wizard step fails midway and they can't resume, demo data confuses them when they want to start clean, Stripe step unclear and they skip it then need it later

---

### P2.2 — Owner connects Stripe Terminal for the first time
**Actor:** Owner · **Trigger:** New S710 reader arrives
1. Settings → Hardware → Stripe Terminal
2. Powers on the S710
3. App scans for nearby readers via Bluetooth
4. Selects their reader → pairs
5. Generates Stripe connection token
6. Reader displays "Ready"
7. Owner runs a $1 test transaction
8. Confirms charge in Stripe dashboard, then refunds

**Success:** terminal works for real sales after pairing
**Failure modes:** Bluetooth not enabled on device, multiple stores' readers nearby (wrong one selected), Stripe account not in correct mode, test charge succeeds but reader needs reboot for live use

---

### P2.3 — Owner enables a feature module mid-life (e.g., Cafe)
**Actor:** Owner · **Trigger:** Store starts serving coffee, needs cafe module
1. Settings → Features → Cafe → Enable
2. UI updates: Cafe option appears in More menu in register
3. Settings → Cafe → Menu → adds first coffee item with modifiers
4. Sets table fee policy (waive over $10 spend)
5. Goes to register, opens first cafe tab
6. Order flow as P0.8

**Success:** new module visible immediately, sample data or empty state guides setup
**Failure modes:** module enables but UI doesn't update without refresh, settings page for the module doesn't exist yet, conflicting permission gates leave the module visible but non-functional

---

### P2.4 — Owner customizes receipt template
**Actor:** Owner · **Trigger:** Owner wants logo + custom footer on receipts
1. Settings → Receipt Template
2. Uploads store logo (preview shows it on a sample receipt)
3. Edits footer text ("Thanks for shopping local!")
4. Toggles return policy line on/off
5. Saves
6. Next sale prints with the new template

**Success:** receipt looks branded, customers notice
**Failure modes:** logo too large for thermal width, special characters in footer break print formatting, customer-facing email receipt doesn't match thermal version

---

### P2.5 — Owner sets up promo code for an event
**Actor:** Owner · **Trigger:** Wants 20% off MTG products this weekend
1. Settings → Promotions → New
2. Code: SUMMER20, 20% off, MTG category only, ends Sunday
3. Saves
4. Customer at register knows the code
5. Cashier enters code at checkout → discount applies if items match
6. Sunday end: code stops working

**Success:** code only applies where intended, expires automatically
**Failure modes:** code applies to non-MTG items by mistake, two codes attempted on same sale, code shared widely on social and used 1000x (single-use protection)

---

### P2.6 — Owner reviews sales and margins for the week
**Actor:** Owner · **Trigger:** Weekly business review
1. Reports → Sales → date range: last 7 days
2. Sees totals by category, by payment method, by staff
3. Drills into Margins → sees revenue vs COGS per category
4. Identifies low-margin category (e.g., snacks at 12%)
5. Goes to Intelligence → asks Advisor for guidance
6. Advisor suggests: raise snack prices or drop the category

**Success:** owner has a concrete decision to make from the data
**Failure modes:** report data lags by a day, margins miscalculated due to missing COGS, advisor gives generic advice instead of store-specific

---

### P2.7 — Manager adjusts a permission for the cashier role
**Actor:** Manager · **Trigger:** Cashier should be able to issue refunds (was previously not allowed)
1. Settings → Permissions → Cashier role
2. Finds "Issue refunds" toggle → enables
3. Saves
4. Cashier (already logged in) attempts a refund
5. Now succeeds (was blocked before)

**Success:** permission change takes effect on next action without logout
**Failure modes:** change requires cashier to log out + back in, permission cache doesn't refresh, permission name is unclear ("returns" vs "refunds")

---

## P3 — Low (defer or fix when convenient)

### P3.1 — Customer reports their gift card was lost; owner reissues
**Actor:** Owner · **Trigger:** Customer calls about a lost gift card
1. Owner looks up the gift card by purchase date / last 4 of original payment
2. Confirms balance and original purchaser
3. Deactivates old card
4. Issues new card with same balance
5. Mails or hands to customer
6. Old card balance shows as "transferred" in audit log

**Success:** customer's value is preserved, no double-spend possible
**Failure modes:** original card is partially used (balance might be wrong), customer can't prove it's their card, card was already redeemed by someone who found it

---

### P3.2 — Owner exports year-end inventory for accountant
**Actor:** Owner · **Trigger:** Tax season
1. Reports → Inventory → Year End
2. Picks date (Dec 31)
3. System snapshots: every item, quantity, cost basis, location
4. Exports as CSV
5. Owner emails to accountant

**Success:** snapshot is accurate as of midnight Dec 31, in a format accountant can use
**Failure modes:** items added between Dec 31 and the report run skew the snapshot, cost basis missing for items added before COGS tracking started, format is right but column names don't match QuickBooks template

---

### P3.3 — Owner restores a deleted inventory item
**Actor:** Owner · **Trigger:** Realizes a deleted item should still exist
1. Settings → Trash (or Inventory → Show deleted)
2. Sees items deleted in last 30 days
3. Selects the one to restore
4. Confirms restore
5. Item back in active inventory with all history intact

**Success:** undelete works within retention window, no data loss
**Failure modes:** items deleted more than 30 days ago are gone for good (need clear messaging), restore creates a duplicate if SKU was reused, history is incomplete after restore

---

### P3.4 — Two cashiers attempt to redeem the same gift card simultaneously
**Actor:** Two cashiers at different registers · **Trigger:** Race condition
1. Card has $50 balance
2. Cashier A applies $30 to a sale
3. Cashier B (same instant) applies $40 to a different sale
4. System detects conflict
5. First write wins (Cashier A succeeds), Cashier B sees "Card balance changed, please re-check"
6. Cashier B sees actual remaining $20, applies that

**Success:** no double-spend, second cashier handles gracefully
**Failure modes:** silent overdraft (both succeed and balance goes negative), unclear error message to second cashier, customer gets confused about why their card was insufficient

---

## How to use this list

**For testing:** every P0 flow must pass before any release. Walk each one literally — don't trust automated tests alone. Have a human do the steps.

**For QA across dimensions:** for each P0/P1 flow, validate on:
- Desktop (1920) + small laptop (1280) + tablet portrait/landscape + phone portrait
- Online + slow 3G + offline + reconnecting
- Owner + Manager + Cashier roles
- With and without hardware (scanner, terminal, printer)

**For bug triage:** any reported bug gets a P-level matching the broken flow. P0 jumps the queue.

**Maintenance:** add a flow when a new feature ships. Re-evaluate priority when revenue or customer count crosses a threshold.

## Revision log

| Date | Change |
|---|---|
| 2026-04-17 | Rewrote as narrative flows (was feature lists). 30+ flows across P0-P3. |
