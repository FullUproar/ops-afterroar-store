import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPayment, PaymentMethod } from "@/lib/payment";
import { formatCents } from "@/lib/types";
import { getStoreSettings } from "@/lib/store-settings";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { calculatePurchasePoints, earnPoints, redeemPoints, calculateRedemptionDiscount } from "@/lib/loyalty";
import { calculateTaxFromSettings } from "@/lib/tax";

interface CheckoutItem {
  inventory_item_id: string;
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
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requireStaff();

    // Fetch the store relation needed for receipt/settings
    const staffWithStore = await prisma.posStaff.findFirst({
      where: { id: staff.id },
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

    // Idempotency: if this transaction was already processed, return the existing result
    if (client_tx_id) {
      const existing = await prisma.posLedgerEntry.findFirst({
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
    const itemIds = items.map((i) => i.inventory_item_id);
    const invItems = await prisma.posInventoryItem.findMany({
      where: { id: { in: itemIds }, store_id: storeId },
      select: { id: true, name: true, quantity: true, price_cents: true },
    });

    if (invItems.length !== itemIds.length) {
      return NextResponse.json(
        { error: "One or more items not found" },
        { status: 400 }
      );
    }

    const invMap = new Map(invItems.map((i) => [i.id, i]));
    for (const item of items) {
      const inv = invMap.get(item.inventory_item_id);
      if (!inv) {
        return NextResponse.json(
          { error: `Item ${item.inventory_item_id} not found` },
          { status: 400 }
        );
      }
      if (inv.quantity < item.quantity) {
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

    // 2b. Server-side tax calculation
    const storeRawSettings = (staffWithStore?.store?.settings ?? {}) as Record<string, unknown>;
    const taxResult = calculateTaxFromSettings(subtotal_cents, storeRawSettings);
    const tax_cents = clientTaxCents ?? taxResult.taxCents;

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
      const customer = await prisma.posCustomer.findFirst({
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

    // Get store's Stripe connected account (if any) for card payments
    const storeSettings = (staffWithStore?.store?.settings ?? {}) as Record<string, unknown>;
    const stripeConnectedAccountId = storeSettings.stripe_connected_account_id as string | undefined;

    const paymentResult = await processPayment(
      payment_method === "store_credit" ? "store_credit" : payment_method,
      cashPortion,
      {
        customer_credit_balance_cents: effectiveCreditApplied > 0 ? effectiveCreditApplied : undefined,
        stripe_connected_account_id: stripeConnectedAccountId,
        metadata: { afterroar_store_id: storeId },
      }
    );

    if (!paymentResult.success) {
      return NextResponse.json(
        { error: paymentResult.error || "Payment failed" },
        { status: 400 }
      );
    }

    // 5. Execute all DB writes in a transaction
    const itemNames = items
      .map((i) => {
        const inv = invMap.get(i.inventory_item_id);
        return `${inv?.name} x${i.quantity}`;
      })
      .join(", ");

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
          credit_amount_cents: effectiveCreditApplied,
          description: `Sale: ${itemNames}`,
          metadata: JSON.parse(JSON.stringify({
            items,
            payment_method,
            transaction_id: paymentResult.transaction_id,
            amount_tendered_cents,
            tax_cents,
            ...(discount_cents > 0 ? { discount_cents, discount_reason } : {}),
            ...(giftCardApplied > 0 ? { gift_card_code, gift_card_amount_cents: giftCardApplied } : {}),
            ...(loyaltyApplied > 0 ? { loyalty_points_redeemed: loyalty_points_redeem, loyalty_discount_cents: loyaltyApplied } : {}),
            ...(client_tx_id ? { client_tx_id } : {}),
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
        if (card && card.balance_cents >= giftCardApplied) {
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
      }

      // Deduct inventory quantities
      for (const item of items) {
        await tx.posInventoryItem.update({
          where: { id: item.inventory_item_id },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      // Earn loyalty points (if customer is attached and loyalty is enabled)
      let pointsEarned = 0;
      if (customer_id) {
        const earnablePoints = calculatePurchasePoints(
          subtotal_cents,
          staffWithStore?.store?.settings as Record<string, unknown> ?? null
        );
        if (earnablePoints > 0) {
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

      return { ledgerEntry, pointsEarned };
    });

    // Build receipt
    const total_cents = subtotal_cents + tax_cents - effectiveCreditApplied - giftCardApplied - loyaltyApplied;
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
        const inv = invMap.get(i.inventory_item_id);
        return {
          name: inv?.name ?? "Unknown Item",
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
      const cust = await prisma.posCustomer.findUnique({
        where: { id: customer_id },
        select: { name: true },
      });
      if (cust) receipt.customer_name = cust.name;
    }

    return NextResponse.json(
      {
        success: true,
        ledger_entry_id: result.ledgerEntry.id,
        change_cents,
        subtotal_cents,
        receipt,
        loyalty_points_earned: result.pointsEarned,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
