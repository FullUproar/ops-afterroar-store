# Stripe Terminal S710 — Recovery Manual Test Plan

**Purpose:** verify the new idempotency + reconnect handling actually works on real hardware. Code can't simulate a Bluetooth disconnect or a network drop mid-charge — these scenarios need physical tests.

**Hardware:** Stripe Terminal S710 reader, paired to Store Ops as the cashier device.
**Mode:** Stripe TEST mode (test cards: 4242 4242 4242 4242 for success, 4000 0000 0000 0002 for declined).
**Pre-req:** the new code is deployed and the audit log is reachable (you'll grep it for state transitions).

---

## Test 1: Happy path — baseline
Confirms nothing broken. Always run this first.

1. Open register, add a $1 test item to cart
2. Tap Card → S710 prompts
3. Tap test card on reader → approved
4. Verify: receipt prints, sale appears in orders, audit log shows `terminal.payment.start` → `terminal.payment.collect` → `terminal.payment.confirm` → `terminal.payment.completed`

**Pass:** receipt prints, single charge in Stripe dashboard, audit trail complete
**Fail:** investigate before continuing other tests

---

## Test 2: Customer cancels at the reader
1. Open register, add $1 item
2. Tap Card → S710 prompts
3. Customer (you) tap "Cancel" on the reader
4. Verify: register UI returns to cart cleanly, no receipt, no charge in Stripe
5. Audit log shows `terminal.payment.start` → `terminal.payment.collect` → `terminal.payment.canceled`

**Pass:** clean cancellation, no charge, cashier can immediately try again
**Fail:** "stuck processing" state means we didn't handle cancel correctly

---

## Test 3: Card declined
1. Open register, add $1 item
2. Tap Card → tap declined test card (4000 0000 0000 0002)
3. Verify: register shows "Declined" with retry option, no receipt, no charge
4. Tap try again with valid test card → succeeds normally

**Pass:** declined surfaces clearly, retry works without ghost charge
**Fail:** if "approved" appears for declined card, the verification path is broken

---

## Test 4: Bluetooth disconnect mid-collect (the big one)
This is the scenario that most-needs the new code.

1. Open register, add $1 item
2. Tap Card → S710 starts collecting
3. **While the reader is showing "Tap card":** turn off Bluetooth on the cashier device (system tray on Windows, control center on iPad/Mac)
4. Wait 5 seconds → turn Bluetooth back on
5. Observe register UI:
   - Should show "Reconnecting to terminal..."
   - Then "Verifying transaction..."
   - Then either "Cleared — try again" (no charge) or "Charge confirmed" (if the charge actually went through)
6. Check Stripe dashboard for the PaymentIntent — confirm it matches what the UI showed
7. Audit log should show `terminal.disconnect` → `terminal.reconnect` → `terminal.verify`

**Pass:** UI never lies. If it says "no charge," there's no charge. If it says "charged," there's exactly one charge.
**Fail modes worth catching:**
- UI says "approved" + receipt prints, but Stripe shows no charge (false positive)
- UI says "failed" but Stripe shows a successful charge (false negative — this is the worst one)
- UI gets stuck on "Processing..." forever (no recovery)

---

## Test 5: Reader unplugged mid-confirm
Variant of Test 4 — the disconnect happens AFTER customer taps card but BEFORE we get the confirm response.

1. Add $1 item, tap Card
2. Customer taps card on reader → reader shows "Approved" briefly
3. **Immediately yank the reader's USB power cable** (assuming USB-powered, otherwise force-shutdown via the button)
4. Plug back in → wait for reader to boot
5. Register UI should detect disconnect, show "Reconnecting..." then "Verifying..."
6. Outcome: charge DID complete on Stripe's side (customer's card was authorized) — UI must reflect this and print the receipt

**Pass:** UI confirms charge + prints receipt + sale recorded
**Fail:** if UI says "Cancelled" and customer leaves, store is out the merchandise

---

## Test 6: Network drops between approval and webhook
1. Add $1 item, tap Card
2. Customer taps card → approved
3. **Immediately disable WiFi on the cashier device** (BEFORE the receipt prints if possible)
4. Wait 30 seconds → re-enable WiFi
5. Register UI should detect missing webhook, poll PaymentIntent status, confirm + print receipt

**Pass:** receipt prints, sale recorded once network is back
**Fail:** if sale never closes, customer thinks they weren't charged when they actually were

---

## Test 7: Rapid retry attack
Simulates a frustrated cashier hitting "Card" twice during a slow response.

1. Add $1 item, tap Card → starts processing
2. **While processing,** tap Card again rapidly (3-4 times)
3. Customer taps card on reader once
4. Verify: only ONE charge in Stripe dashboard, only ONE receipt prints
5. The idempotency key should prevent duplicates even if multiple requests fired

**Pass:** single charge, single receipt
**Fail:** multiple charges = idempotency key not working OR keys are different per click

---

## Test 8: Refund mid-disconnect
Variant of Test 4 for the refund flow.

1. Process a normal sale (Test 1)
2. Open the order, initiate a refund
3. As refund processes, disconnect Bluetooth (Test 4 method)
4. Reconnect → verify state
5. Outcome: ONE refund (not zero, not two) in Stripe dashboard

**Pass:** customer gets refunded once, register reflects it
**Fail:** double-refund (we paid them too much) OR no refund (customer angry)

---

## Test 9: Two registers, one customer
Simulates a race where customer hits two registers (rare but real for self-service stations).

1. On Register A, start a sale, add $1 item, tap Card
2. On Register B (different device, same store), start a different sale to the same customer, add $5 item, tap Card
3. Customer taps the SAME card on Register A's reader → approved
4. Customer taps the SAME card on Register B's reader → should also approve (different idempotency keys)
5. Verify: TWO charges in Stripe ($1 + $5), separate audit entries

**Pass:** both succeed with distinct PaymentIntents
**Fail:** if one is dedupd because keys collide, we have a bug

---

## Acceptance criteria

For all 9 tests to pass, the system must:
- Never charge a card twice for the same intended sale
- Never drop a successful charge silently
- Always reach a definitive UI state (success or failure) within 60 seconds of the customer completing their action
- Always produce an audit log entry that explains what happened and when

## What to do when something fails

1. Note the test number, the actual behavior, the audit log entries
2. Check Stripe dashboard for the actual PaymentIntent state
3. Compare to expected behavior in this doc
4. File against the relevant code path in `src/app/api/stripe/terminal/`

## When to re-run

- After any change to checkout, terminal, or refund code paths
- Before any major release
- If a customer reports a billing dispute that suggests a recovery edge case

## Revision log

| Date | Change |
|---|---|
| 2026-04-17 | Initial — covers all major recovery scenarios for Stripe Terminal S710 |
