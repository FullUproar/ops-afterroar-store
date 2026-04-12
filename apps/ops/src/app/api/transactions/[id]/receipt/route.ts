import { NextRequest, NextResponse } from "next/server";
import { getStoreSettings } from "@/lib/store-settings-shared";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId, db } = await requireStaff();
    const { id } = await params;

    const entry = await db.posLedgerEntry.findFirst({
      where: { id },
      include: {
        customer: { select: { name: true, email: true } },
        staff: { select: { name: true } },
        store: { select: { name: true, settings: true } },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const items = (meta.items as Array<{
      inventory_item_id?: string;
      quantity?: number;
      price_cents?: number;
      name?: string;
    }>) ?? [];

    // Resolve item names from inventory if metadata doesn't include names
    let resolvedItems: Array<{ name: string; quantity: number; price_cents: number; total_cents: number }> = [];

    if (items.length > 0) {
      const itemIds = items
        .map((i) => i.inventory_item_id)
        .filter((id): id is string => !!id);

      const invItems = itemIds.length > 0
        ? await db.posInventoryItem.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, name: true },
          })
        : [];

      const nameMap = new Map(invItems.map((i) => [i.id, i.name]));

      resolvedItems = items.map((i) => {
        const qty = i.quantity ?? 1;
        const price = i.price_cents ?? 0;
        return {
          name: i.name || (i.inventory_item_id ? nameMap.get(i.inventory_item_id) : null) || "Unknown Item",
          quantity: qty,
          price_cents: price,
          total_cents: price * qty,
        };
      });
    }

    const storeRawSettings = (entry.store?.settings ?? {}) as Record<string, unknown>;
    const settings = getStoreSettings(storeRawSettings);
    const storeName = settings.store_display_name || entry.store?.name || "Store";

    const taxCents = (meta.tax_cents as number) ?? 0;
    const discountCents = (meta.discount_cents as number) ?? 0;
    const creditApplied = entry.credit_amount_cents || 0;
    const giftCardApplied = (meta.gift_card_amount_cents as number) ?? 0;
    const loyaltyApplied = (meta.loyalty_discount_cents as number) ?? 0;
    const paymentMethod = (meta.payment_method as string) ?? "unknown";
    const amountTendered = (meta.amount_tendered_cents as number) ?? 0;

    const totalCents = entry.amount_cents + taxCents - creditApplied - giftCardApplied - loyaltyApplied;
    const changeCents = (paymentMethod === "cash" || paymentMethod === "split")
      ? Math.max(0, amountTendered - totalCents)
      : 0;

    // Generate receipt number from date and id
    const createdDate = entry.created_at;
    const datePrefix = `${createdDate.getFullYear()}${String(createdDate.getMonth() + 1).padStart(2, "0")}${String(createdDate.getDate()).padStart(2, "0")}`;
    const receiptNumber = `R-${datePrefix}-${entry.id.slice(-4).toUpperCase()}`;

    const receipt = {
      store_name: storeName,
      transaction_id: entry.id,
      receipt_number: receiptNumber,
      date: createdDate.toISOString(),
      date_formatted: createdDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      type: entry.type,
      items: resolvedItems,
      subtotal_cents: entry.amount_cents,
      tax_cents: taxCents,
      discount_cents: discountCents,
      credit_applied_cents: creditApplied,
      gift_card_applied_cents: giftCardApplied,
      loyalty_discount_cents: loyaltyApplied,
      total_cents: totalCents,
      payment_method: paymentMethod,
      amount_tendered_cents: amountTendered,
      change_cents: changeCents,
      customer_name: entry.customer?.name ?? null,
      customer_email: entry.customer?.email ?? null,
      staff_name: entry.staff?.name ?? null,
      description: entry.description,
      receipt_footer: settings.receipt_footer_message || "Thank you for shopping with us!",
    };

    return NextResponse.json(receipt);
  } catch (error) {
    return handleAuthError(error);
  }
}
