# Deferred Design Items — Need Care, Not Speed

Three items surfaced in the P0/P1 audit on 2026-04-17 that were deferred from the mechanical-fix batch because they require real design thought, not just patches. Each has revenue/safety implications.

---

## 1. Stripe Terminal mid-transaction idempotency
**Severity:** P0 risk · **Flow:** P0.2 (Card sale), P0.15 (Terminal recovery)

**The problem:**
A card sale via Stripe Terminal involves multiple round trips: create PaymentIntent → reader collects payment → confirm → webhook. If the network drops between steps, the system might:
- Charge the customer's card twice (we retried but the first attempt actually succeeded)
- Show "failed" when the charge actually succeeded (customer charged but no receipt)
- Show "succeeded" when the charge actually failed (we hand them merchandise we weren't paid for)

Worst-case scenarios that all need handling:
- Reader Bluetooth disconnects mid-collect → reconnect → did the charge complete?
- Network drops between `confirm` and webhook → we don't know if Stripe captured
- Cashier hits "Cancel" while a payment is in flight → race condition

**What's needed:**
- **Idempotency keys** on every Stripe API call (so retries don't double-charge)
- **PaymentIntent state polling** — when reconnecting after a disconnect, query the PaymentIntent ID to determine actual status
- **Reader event listeners** for `disconnect` / `reconnect` / `unexpected_disconnect`
- **UI states**: "Reconnecting..." (don't show "Failed" prematurely), "Verifying..." (when we recover and need to check), explicit "Charge confirmed" only after server confirms via webhook
- **Receipt suppression** — never print "approved" receipt until server confirms charge captured
- **Audit log** — every state transition logged so we can reconstruct what happened on a disputed charge

**Why deferred:**
This needs Stripe SDK deep-knowledge + a design pass with the actual S710 hardware in hand to test. Rushing it could create the very double-charge bug we're trying to prevent.

**Owner:** Shawn (or whoever owns payment infrastructure) · **Target:** Before first store onboards beyond beta

---

## 2. Mode switch state preservation
**Severity:** P1 (UX/data loss) · **Flow:** P1.14 (Mode switch dashboard ↔ register)

**The problem:**
Cashier is mid-form in dashboard mode (e.g., creating an event, adjusting inventory, writing a customer note) → customer walks up → cashier toggles to register mode → comes back → form data lost.

Currently the mode toggle is a global state change. It doesn't know about open forms.

**What's needed:**
- **Form auto-save** — every form auto-persists draft to localStorage on change, restores on navigate-back
- **Unsaved changes prompt** — if a form has unsaved changes and user toggles mode, prompt "Save your draft? Discard? Cancel?"
- **Or: register mode opens in a separate route+overlay** — preserves the dashboard underneath, restores on close
- **Or: form-level "draft" pattern** — every multi-field form has an implicit draft that persists across navigation

**The contract for form components:**
1. On mount, check localStorage for a saved draft → offer to restore
2. On every field change, save draft (debounced)
3. On submit, clear draft
4. On unmount with unsaved changes, prompt before destroying

**Why deferred:**
This is a per-form contract that touches every form in the app. A blanket fix doesn't exist — each form needs its own draft key + restore UX. Deserves a focused sprint with consistent patterns rather than a quick patch.

**Owner:** Frontend lead · **Target:** Within 30 days of beta launch

---

## 3. Pre-fulfillment oversell warning
**Severity:** P1 (revenue/customer trust) · **Flow:** P0.9 (Marketplace order → fulfillment → ship)

**The problem:**
Order ingests from eBay/Shopify with 1 unit available → customer buys → POS sells the same item to a walk-in 5 minutes later → fulfillment time, item not in stock.

The race window is "between marketplace webhook and POS sale on the same SKU."

**What's needed:**
- **Inventory hold** — when a marketplace order ingests, decrement on-hand quantity (or move N units to a "reserved" bucket)
- **Fulfillment-time check** — before generating a label, verify on-hand still matches order; if not, flag for manual reconciliation
- **Oversell UI** — when an order can't be fulfilled, present clear options: backorder + notify customer / cancel + refund / split shipment
- **Marketplace push-back** — when we sell out via POS, push updated inventory to all marketplaces immediately (order-ingest engine partially does this; verify it covers all paths)

**Design questions to resolve:**
- Hard hold (POS can't sell what marketplace bought) vs soft hold (POS can sell, fulfillment manually resolves)?
- How long do reserves stay valid? (Customer abandons cart on Shopify after webhook fires — when do we release the hold?)
- For consigned items: does the consignor pay if we oversell their inventory?

**Why deferred:**
The race semantics are subtle. The wrong fix could lock POS sales waiting on stale marketplace state, or release reserves too aggressively and double-sell. Needs concrete failure-case design before code.

**Owner:** Backend/inventory lead · **Target:** Before marketplace_sync_enabled is recommended to any beta store

---

## How to use this doc

When any of these items moves from "deferred" to "actively designing," create a tracked spec doc in `docs/` and link from here. Don't lose them in the noise.

## Revision log

| Date | Change |
|---|---|
| 2026-04-17 | Initial — captured from P0/P1 audit batch fixes |
