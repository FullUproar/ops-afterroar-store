import { NextRequest, NextResponse } from "next/server";
import { processPayment, PaymentMethod } from "@/lib/payment";
import { formatCents } from "@/lib/types";
import { getStoreSettings } from "@/lib/store-settings-shared";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { calculatePurchasePoints, earnPoints, redeemPoints, calculateRedemptionDiscount } from "@/lib/loyalty";
import { earnPointsFromPurchase } from "@/lib/hq-bridge";
import { calculateTaxFromSettings, getDefaultTaxRate } from "@/lib/tax";
import { getStripe } from "@/lib/stripe";
import { opLog } from "@/lib/op-log";
import { getTaxCode } from "@/lib/tax-codes";
import { pushInventoryToShopify } from "@/lib/shopify-sync";
import { prisma } from "@/lib/prisma";

interface CheckoutItem {
  inventory_item_id: string | null;
  category?: string; // for manual items (gift_card, etc.)
  quantity: number;
  price_cents: number;
}

interface CheckoutBody {
  items: CheckoutItem[];
  customer_id: string | null;
  payment_method: PaymentMethod;
  amount_tendered_cents: number;
  credit_applied_cents: number;
  event_id: string | null;
  tax_cents?: number;
  client_tx_id?: string; // Idempotency key for offline queue
  discount_cents?: number;
  discount_reason?: string;
  gift_card_code?: string;
  gift_card_amount_cents?: number;
  loyalty_points_redeem?: number;
  loyalty_discount_cents?: number;
  tip_cents?: number;
  gift_card_amounts?: number[]; // cents per gift card being sold
  training?: boolean;
  allow_negative_stock?: boolean;
  stripe_payment_intent_id?: string; // Terminal already collected — skip processPayment
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requireStaff();

    // Fetch the store relation needed for receipt/settings
    // SECURITY: use tenant-scoped db for staff lookup
    const staffWithStore = await db.posStaff.findFirst({
      where: { id: staff.id, store_id: storeId },
      select: { id: true, store_id: true, store: { select: { name: true, settings: true } } },
    });

    // Parse body
    let body: CheckoutBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      items,
      customer_id,
      payment_method,
      amount_tendered_cents,
      credit_applied_cents,
      event_id,
      tax_cents: clientTaxCents,
      client_tx_id,
      discount_cents: rawDiscountCents,
      discount_reason,
      gift_card_code,
      gift_card_amount_cents,
      loyalty_points_redeem,
      loyalty_discount_cents,
    } = body;

    const discount_cents = rawDiscountCents ?? 0;
    const tip_cents = body.tip_cents ?? 0;

    // Idempotency: if this transaction was already processed, return the existing result
    if (client_tx_id) {
      const existing = await db.posLedgerEntry.findFirst({
        where: {
          store_id: storeId,
          type: "sale",
          metadata: { path: ["client_tx_id"], equals: client_tx_id },
        },
      });
      if (existing) {
        return NextResponse.json({
          success: true,
          ledger_entry_id: existing.id,
          deduplicated: true,
        });
      }
    }

    if (!items?.length) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    // 1. Validate all items exist and have sufficient quantity
    // Split: inventory items vs manual items (gift cards, etc.)
    const inventoryItems = items.filter((i) => i.inventory_item_id);
    const itemIds = inventoryItems.map((i) => i.inventory_item_id).filter(Boolean) as string[];
    const invItems = itemIds.length > 0
      ? await db.posInventoryItem.findMany({
          where: { id: { in: itemIds }, store_id: storeId },
          select: { id: true, name: true, quantity: true, price_cents: true, cost_cents: true, category: true, attributes: true },
        })
      : [];

    if (invItems.length !== itemIds.length) {
      return NextResponse.json(
        { error: "One or more items not found" },
        { status: 400 }
      );
    }

    const invMap = new Map(invItems.map((i) => [i.id, i]));
    for (const item of inventoryItems) {
      const inv = invMap.get(item.inventory_item_id!);
      if (!inv) {
        return NextResponse.json(
          { error: `Item ${item.inventory_item_id} not found` },
          { status: 400 }
        );
      }
      if (inv.quantity < item.quantity && !body.allow_negative_stock) {
        return NextResponse.json(
          {
            error: `Insufficient quantity for "${inv.name}". Available: ${inv.quantity}, requested: ${item.quantity}`,
          },
          { status: 400 }
        );
      }
    }

    // 2. Calculate subtotal with discount
    const rawSubtotal = items.reduce(
      (sum, i) => sum + i.price_cents * i.quantity,
      0
    );
    const subtotal_cents = Math.max(0, rawSubtotal - discount_cents);

    // 2b. Server-side tax calculation — try Stripe Tax first, fall back to manual rate
    const storeRawSettings = (staffWithStore?.store?.settings ?? {}) as Record<string, unknown>;
    let tax_cents = 0;
    let taxSource: "stripe" | "manual" | "none" = "none";
    let taxRateUsed = 0;

    // Check if store has a manual tax rate — if so, use it directly (no Stripe Tax API call)
    const manualTaxRate = (storeRawSettings.tax_rate_percent as number) || getDefaultTaxRate();
    const hasManualRate = manualTaxRate > 0;

    if (clientTaxCents !== undefined) {
      // Client provided tax — trust it (was calculated from the same store settings)
      tax_cents = clientTaxCents;
      taxSource = "manual";
    } else if (hasManualRate) {
      // Manual rate configured — use it immediately, skip Stripe Tax API
      const taxResult = calculateTaxFromSettings(subtotal_cents, storeRawSettings);
      tax_cents = taxResult.taxCents;
      taxRateUsed = manualTaxRate;
      taxSource = "manual";
    } else {
      // No manual rate — try Stripe Tax
      const stripe = getStripe();
      let stripeTaxSuccess = false;

      if (stripe && subtotal_cents > 0) {
        try {
          const storeAddress = storeRawSettings.store_address as Record<string, string> | undefined;
          const taxCalc = await stripe.tax.calculations.create({
            currency: "usd",
            line_items: items.map((item) => {
              const inv = item.inventory_item_id ? invMap.get(item.inventory_item_id) : null;
              const attrs = (inv?.attributes ?? {}) as Record<string, unknown>;
              const taxSubCategory = attrs.tax_code as string | undefined;
              const category = inv?.category || item.category || "other";
              return {
                amount: item.price_cents * item.quantity,
                reference: item.inventory_item_id || "manual",
                tax_code: getTaxCode(category, taxSubCategory),
              };
            }),
            customer_details: {
              address: {
                country: "US",
                state: storeAddress?.state || process.env.DEFAULT_TAX_STATE || undefined,
                postal_code: storeAddress?.postal_code || storeAddress?.zip || process.env.DEFAULT_TAX_ZIP || undefined,
                city: storeAddress?.city || undefined,
                line1: storeAddress?.line1 || undefined,
              },
              address_source: "billing",
            },
          });
          tax_cents = taxCalc.tax_amount_exclusive;
          taxSource = "stripe";
          // Calculate effective rate for metadata
          taxRateUsed = subtotal_cents > 0 ? Math.round((tax_cents / subtotal_cents) * 10000) / 100 : 0;
          stripeTaxSuccess = true;
        } catch {
          // Stripe Tax not enabled or errored — fall through to manual
        }
      }

      if (!stripeTaxSuccess) {
        // Manual fallback: store settings → DEFAULT_TAX_RATE env → 0
        // Exclude gift card items from taxable subtotal (gift cards are not taxable)
        const giftCardSubtotal = items.reduce((sum, i) => {
          const inv = i.inventory_item_id ? invMap.get(i.inventory_item_id) : null;
          const category = inv?.category || i.category || "other";
          return category === "gift_card" ? sum + i.price_cents * i.quantity : sum;
        }, 0);
        const taxableSubtotal = Math.max(0, subtotal_cents - giftCardSubtotal);
        const taxResult = calculateTaxFromSettings(taxableSubtotal, storeRawSettings);
        tax_cents = taxResult.taxCents;
        const settingsRate = (storeRawSettings.tax_rate_percent as number) || getDefaultTaxRate();
        taxRateUsed = settingsRate;
        taxSource = settingsRate > 0 ? "manual" : "none";
      }
    }

    console.log(`[Checkout] Tax: ${tax_cents}c via ${taxSource} (rate: ${taxRateUsed}%, subtotal: ${subtotal_cents}c, client sent: ${clientTaxCents ?? 'none'})`);

    // 2c. Gift card + loyalty deductions
    const giftCardApplied = gift_card_amount_cents ?? 0;
    const loyaltyApplied = loyalty_discount_cents ?? 0;

    // 3. Validate store credit if applicable
    const effectiveCreditApplied = credit_applied_cents || 0;

    if (
      (payment_method === "store_credit" || payment_method === "split") &&
      effectiveCreditApplied > 0
    ) {
      if (!customer_id) {
        return NextResponse.json(
          { error: "Customer is required for store credit payments" },
          { status: 400 }
        );
      }
      const customer = await db.posCustomer.findFirst({
        where: { id: customer_id, store_id: storeId },
        select: { credit_balance_cents: true },
      });

      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 400 });
      }
      if (customer.credit_balance_cents < effectiveCreditApplied) {
        return NextResponse.json(
          {
            error: `Insufficient store credit. Balance: ${customer.credit_balance_cents}, required: ${effectiveCreditApplied}`,
          },
          { status: 400 }
        );
      }
    }

    // 4. Process payment
    const cashPortion = subtotal_cents - effectiveCreditApplied;

    // If a stripe_payment_intent_id was provided, the terminal already collected
    // the payment — skip processPayment and use the existing PI as the reference.
    const terminalPiId = body.stripe_payment_intent_id as string | undefined;

    let paymentResult: Awaited<ReturnType<typeof processPayment>>;

    if (terminalPiId && payment_method === "card") {
      // Terminal already charged — just record the transaction
      paymentResult = {
        success: true,
        transaction_id: terminalPiId,
        method: "card",
        provider: "stripe_terminal",
        stripe_payment_intent_id: terminalPiId,
        live: true,
      };
    } else {
      // Normal payment flow
      const storeSettings = (staffWithStore?.store?.settings ?? {}) as Record<string, unknown>;
      const stripeConnectedAccountId = storeSettings.stripe_connected_account_id as string | undefined;

      paymentResult = await processPayment(
        payment_method === "store_credit" ? "store_credit" : payment_method,
        cashPortion,
        {
          customer_credit_balance_cents: effectiveCreditApplied > 0 ? effectiveCreditApplied : undefined,
          stripe_connected_account_id: stripeConnectedAccountId,
          metadata: { afterroar_store_id: storeId },
        }
      );
    }

    if (!paymentResult.success) {
      return NextResponse.json(
        { error: paymentResult.error || "Payment failed" },
        { status: 400 }
      );
    }

    // 5. Generate receipt token (8-char alphanumeric, URL-safe)
    const receiptToken = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"[b % 53])
      .join("")
      .slice(0, 8);

    // 6. Execute all DB writes in a transaction
    const itemNames = items
      .map((i) => {
        const inv = i.inventory_item_id ? invMap.get(i.inventory_item_id) : null;
        return `${inv?.name || i.category || "Manual"} x${i.quantity}`;
      })
      .join(", ");

    // Calculate COGS for items with cost data
    const cogsCents = items.reduce((sum, i) => {
      const inv = i.inventory_item_id ? invMap.get(i.inventory_item_id) : null;
      return sum + (inv?.cost_cents ?? 0) * i.quantity;
    }, 0);
    const marginCents = subtotal_cents - cogsCents;
    const marginPercent = subtotal_cents > 0
      ? ((marginCents / subtotal_cents) * 100).toFixed(1)
      : "0.0";

    const result = await prisma.$transaction(async (tx) => {
      // Create sale ledger entry
      const ledgerEntry = await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "sale",
          customer_id,
          staff_id: staff.id,
          event_id,
          amount_cents: subtotal_cents,
          tip_cents,
          credit_amount_cents: effectiveCreditApplied,
          description: `Sale: ${itemNames}`,
          metadata: JSON.parse(JSON.stringify({
            receipt_token: receiptToken,
            items: items.map((i) => {
              const inv = i.inventory_item_id ? invMap.get(i.inventory_item_id) : null;
              return { ...i, name: inv?.name || i.category || "Manual" };
            }),
            payment_method,
            transaction_id: paymentResult.transaction_id,
            amount_tendered_cents,
            tax_cents,
            ...(cogsCents > 0 ? { cogs_cents: cogsCents, margin_cents: marginCents, margin_percent: marginPercent } : {}),
            ...(paymentResult.stripe_payment_intent_id ? { stripe_payment_intent_id: paymentResult.stripe_payment_intent_id } : {}),
            ...(paymentResult.provider ? { payment_provider: paymentResult.provider } : {}),
            ...(tip_cents > 0 ? { tip_cents } : {}),
            ...(discount_cents > 0 ? { discount_cents, discount_reason } : {}),
            ...(giftCardApplied > 0 ? { gift_card_code, gift_card_amount_cents: giftCardApplied } : {}),
            ...(loyaltyApplied > 0 ? { loyalty_points_redeemed: loyalty_points_redeem, loyalty_discount_cents: loyaltyApplied } : {}),
            tax_source: taxSource,
            ...(taxRateUsed > 0 ? { tax_rate: taxRateUsed } : {}),
            ...(client_tx_id ? { client_tx_id } : {}),
            ...(body.training ? { training: true } : {}),
          })),
        },
      });

      // If credit was applied, create credit_redeem ledger entry and update balance
      if (effectiveCreditApplied > 0 && customer_id) {
        await tx.posLedgerEntry.create({
          data: {
            store_id: storeId,
            type: "credit_redeem",
            customer_id,
            staff_id: staff.id,
            event_id: null,
            amount_cents: 0,
            credit_amount_cents: -effectiveCreditApplied,
            description: "Store credit redeemed for sale",
            metadata: { sale_ledger_entry_id: ledgerEntry.id },
          },
        });

        await tx.posCustomer.update({
          where: { id: customer_id, store_id: storeId },
          data: {
            credit_balance_cents: { decrement: effectiveCreditApplied },
          },
        });
      }

      // Deduct gift card balance if used
      if (giftCardApplied > 0 && gift_card_code) {
        const card = await tx.posGiftCard.findFirst({
          where: { code: gift_card_code.toUpperCase(), store_id: storeId, active: true },
        });
        if (!card) {
          throw new Error("Gift card not found or inactive");
        }
        if (card.balance_cents < giftCardApplied) {
          throw new Error(`Gift card balance insufficient: ${card.balance_cents} < ${giftCardApplied}`);
        }
        {
          await tx.posGiftCard.update({
            where: { id: card.id },
            data: { balance_cents: { decrement: giftCardApplied } },
          });
          await tx.posLedgerEntry.create({
            data: {
              store_id: storeId,
              type: "gift_card_redeem",
              staff_id: staff.id,
              customer_id,
              amount_cents: -giftCardApplied,
              description: `Gift card redeemed: ${gift_card_code.toUpperCase()}`,
              metadata: { gift_card_id: card.id, code: gift_card_code.toUpperCase(), sale_id: ledgerEntry.id },
            },
          });
        }
      }

      // Redeem loyalty points if used
      if (loyalty_points_redeem && loyalty_points_redeem > 0 && customer_id) {
        await redeemPoints(tx, {
          storeId,
          customerId: customer_id,
          points: loyalty_points_redeem,
          discountCents: loyaltyApplied,
          referenceId: ledgerEntry.id,
        });

        // Sync redemption to HQ if customer is linked
        const redeemCust = await tx.posCustomer.findUnique({
          where: { id: customer_id },
          select: { afterroar_user_id: true },
        });
        if (redeemCust?.afterroar_user_id) {
          try {
            const { enqueueHQ } = await import("@/lib/hq-outbox");
            await enqueueHQ(storeId, "points_earned", {
              userId: redeemCust.afterroar_user_id,
              storeId,
              points: -loyalty_points_redeem, // Negative = redemption
              category: "redemption",
              transactionId: ledgerEntry.id,
              discountCents: loyaltyApplied,
            });
          } catch {
            // Non-blocking
          }
        }
      }

      // Deduct inventory quantities (skip manual items like gift cards)
      // Re-validate quantities INSIDE the transaction to prevent overselling
      // (the pre-transaction check at line ~108 is a fast-fail optimization,
      // but this is the authoritative check under transactional isolation)
      for (const item of items) {
        if (item.inventory_item_id) {
          const current = await tx.posInventoryItem.findUnique({
            where: { id: item.inventory_item_id },
            select: { quantity: true, name: true },
          });
          if (current && current.quantity < item.quantity && !body.allow_negative_stock) {
            throw new Error(
              `Insufficient quantity for "${current.name}". Available: ${current.quantity}, requested: ${item.quantity}`
            );
          }
          await tx.posInventoryItem.update({
            where: { id: item.inventory_item_id },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }

      // Earn loyalty points (if customer is attached and loyalty is enabled)
      let pointsEarned = 0;
      if (customer_id) {
        const earnablePoints = calculatePurchasePoints(
          subtotal_cents,
          staffWithStore?.store?.settings as Record<string, unknown> ?? null
        );
        if (earnablePoints > 0) {
          // Check if customer is linked to Afterroar
          const custRecord = await tx.posCustomer.findUnique({
            where: { id: customer_id },
            select: { afterroar_user_id: true },
          });

          if (custRecord?.afterroar_user_id) {
            // Write to HQ PointsLedger for linked customers (non-blocking — don't let HQ issues kill checkout)
            try {
              await earnPointsFromPurchase({
                userId: custRecord.afterroar_user_id,
                points: earnablePoints,
                storeId,
                transactionId: ledgerEntry.id,
                amountSpentCents: subtotal_cents,
              });
            } catch (hqErr) {
              console.error("[Checkout] HQ points sync failed (non-fatal):", hqErr);
              // Fall through to POS-local points instead
            }
            pointsEarned = earnablePoints;
          } else {
            // POS-local loyalty points for unlinked customers
            const loyaltyResult = await earnPoints(tx, {
              storeId,
              customerId: customer_id,
              type: "earn_purchase",
              points: earnablePoints,
              description: `Earned on purchase of ${formatCents(subtotal_cents)}`,
              referenceId: ledgerEntry.id,
            });
            pointsEarned = loyaltyResult.points_earned;
          }
        }
      }

      return { ledgerEntry, pointsEarned };
    });

    // Fire-and-forget: sync sold items to Shopify (pushInventoryToShopify
    // short-circuits if the item has no shopify_inventory_item_id)
    for (const item of items) {
      if (item.inventory_item_id) {
        pushInventoryToShopify(storeId, item.inventory_item_id).catch((err) => {
          console.error("[Checkout] Shopify inventory sync failed for item", item.inventory_item_id, err);
        });
      }
    }

    // Send store visit signal to HQ (customer walked in and bought something)
    if (customer_id) {
      try {
        const visitCust = await db.posCustomer.findFirst({
          where: { id: customer_id, store_id: storeId },
          select: { afterroar_user_id: true },
        });
        if (visitCust?.afterroar_user_id) {
          const { enqueueHQ } = await import("@/lib/hq-outbox");
          // Store visit signal
          await enqueueHQ(storeId, "checkin", {
            userId: visitCust.afterroar_user_id,
            storeId,
          });
          // Purchase summary for Passport receipt holder
          // No dollar amounts per bridge spec — categories + board game names only
          const categoryCounts = new Map<string, number>();
          const boardGames: Array<{ name: string; catalog_product_id?: string; bgg_id?: string }> = [];
          for (const item of items) {
            const inv = item.inventory_item_id ? invMap.get(item.inventory_item_id) : null;
            const cat = inv?.category || item.category || "other";
            categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + item.quantity);
            // Include board game details for game library integration
            if (cat === "board_game" && inv?.name && item.inventory_item_id) {
              // Get full item for catalog link and BGG ID
              const fullItem = await db.posInventoryItem.findFirst({
                where: { id: item.inventory_item_id, store_id: storeId },
                select: { catalog_product_id: true, attributes: true },
              });
              const attrs = (fullItem?.attributes ?? {}) as Record<string, unknown>;
              boardGames.push({
                name: inv.name,
                catalog_product_id: fullItem?.catalog_product_id || undefined,
                bgg_id: (attrs.bgg_id as string) || (attrs.bgg as Record<string, unknown>)?.id as string || undefined,
              });
            }
          }
          await enqueueHQ(storeId, "purchase_summary", {
            userId: visitCust.afterroar_user_id,
            storeId,
            itemCount: items.reduce((s, i) => s + i.quantity, 0),
            categories: Object.fromEntries(categoryCounts),
            boardGames: boardGames.length > 0 ? boardGames : undefined,
            receiptToken,
            receiptUrl: `https://www.afterroar.store/r/${receiptToken}`,
          });
        }
      } catch (receiptErr) {
        console.error("[Checkout] Receipt QR creation failed:", receiptErr);
      }
    }

    // Build receipt
    const total_cents = subtotal_cents + tax_cents + tip_cents - effectiveCreditApplied - giftCardApplied - loyaltyApplied;
    const change_cents =
      payment_method === "cash" || payment_method === "split"
        ? Math.max(0, amount_tendered_cents - total_cents)
        : 0;

    const receiptStoreSettings = getStoreSettings(staffWithStore?.store?.settings as Record<string, unknown> ?? null);
    const receiptStoreName = receiptStoreSettings.store_display_name || staffWithStore?.store?.name || "Store";

    const receipt = {
      store_name: receiptStoreName,
      date: new Date().toISOString(),
      items: items.map((i) => {
        const inv = i.inventory_item_id ? invMap.get(i.inventory_item_id) : null;
        return {
          name: inv?.name ?? i.category ?? "Unknown Item",
          quantity: i.quantity,
          price_cents: i.price_cents,
          total_cents: i.price_cents * i.quantity,
        };
      }),
      subtotal_cents,
      tax_cents,
      discount_cents,
      credit_applied_cents: effectiveCreditApplied,
      gift_card_applied_cents: giftCardApplied,
      loyalty_discount_cents: loyaltyApplied,
      payment_method,
      total_cents,
      change_cents,
      customer_name: null as string | null,
    };

    // Attach customer name if present
    if (customer_id) {
      // SECURITY: use tenant-scoped db to prevent cross-store customer lookup
      const cust = await db.posCustomer.findFirst({
        where: { id: customer_id, store_id: storeId },
        select: { name: true },
      });
      if (cust) receipt.customer_name = cust.name;
    }

    // Create gift cards if any were sold in this transaction
    const giftCardsCreated: Array<{ code: string; balance_cents: number }> = [];
    if (body.gift_card_amounts && Array.isArray(body.gift_card_amounts)) {
      for (const amountCents of body.gift_card_amounts) {
        if (amountCents > 0) {
          try {
            // Generate unique code
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let code = "";
            for (let i = 0; i < 16; i++) {
              if (i > 0 && i % 4 === 0) code += "-";
              code += chars[Math.floor(Math.random() * chars.length)];
            }

            await db.posGiftCard.create({
              data: {
                store_id: storeId,
                code,
                balance_cents: amountCents,
                initial_balance_cents: amountCents,
                purchased_by_customer_id: customer_id || null,
              },
            });

            giftCardsCreated.push({ code, balance_cents: amountCents });
          } catch (err) {
            console.error("[Checkout] Gift card creation failed:", err);
          }
        }
      }
    }

    // Marketplace inventory sync handled by cron (/api/marketplace/sync every 5 min)

    opLog({
      storeId,
      eventType: "checkout.complete",
      message: `Sale ${formatCents(subtotal_cents)} · ${payment_method} · ${items.length} item(s) · ${staff.name}`,
      metadata: {
        ledger_entry_id: result.ledgerEntry.id,
        payment_method,
        subtotal_cents,
        tax_cents,
        item_count: items.length,
        customer_id: customer_id ?? undefined,
      },
      userId: staff.user_id,
      staffName: staff.name,
    });

    return NextResponse.json(
      {
        success: true,
        ledger_entry_id: result.ledgerEntry.id,
        receipt_token: receiptToken,
        change_cents,
        subtotal_cents,
        tax_cents,
        tax_source: taxSource,
        tax_rate: taxRateUsed,
        tip_cents,
        receipt,
        loyalty_points_earned: result.pointsEarned,
        gift_cards_created: giftCardsCreated.length > 0 ? giftCardsCreated : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    // Log checkout failures (best-effort — we don't have storeId in the catch)
    if (error instanceof Error && !(error as unknown as { status?: number }).hasOwnProperty("status")) {
      // Only log unexpected errors, not auth/validation errors
      console.error("[checkout] unexpected error", error.message);
    }
    return handleAuthError(error);
  }
}
