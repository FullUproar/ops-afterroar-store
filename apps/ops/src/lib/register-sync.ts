/**
 * Per-event-type handlers for the register sync endpoint.
 *
 * Each handler:
 *   - Validates the payload shape
 *   - Mutates the relevant pos_* tables (sale → ledger, inventory decrement, etc.)
 *   - Returns one of: 'applied' | 'conflict' | 'rejected'
 *
 * Contract:
 *   - Handlers are idempotent at the *event* level (the unique
 *     RegisterEvent.id catches retries before we get here).
 *   - Within a handler, mutations should be wrapped in a transaction
 *     so partial-write failures don't leave the DB inconsistent.
 *   - Conflicts return data for the reconciliation queue but DO NOT
 *     throw — the caller (the /api/sync endpoint) records the
 *     RegisterEvent with status='conflict' and conflictData.
 *
 * R2 demo scope: `cash_sale` only. Other event types are stubs that
 * return 'rejected' for now.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { getStripe } from "./stripe";

export type EventStatus = "applied" | "conflict" | "rejected";

export interface ApplyResult {
  status: EventStatus;
  conflictData?: Record<string, unknown>;
  errorMessage?: string;
}

export interface RegisterEventInput {
  id: string;
  storeId: string;
  deviceId: string;
  lamport: number;
  wallTime: Date;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Cash sale event:
 *   payload: {
 *     items: [{ inventoryItemId, name, qty, priceCents }],
 *     totalCents: number,
 *     staffId: string,
 *     paymentMethod: 'cash',
 *     amountTendered?: number,
 *     changeCents?: number,
 *   }
 */
async function applyCashSale(
  tx: Prisma.TransactionClient,
  evt: RegisterEventInput,
): Promise<ApplyResult> {
  const p = evt.payload as {
    items?: Array<{ inventoryItemId: string; name: string; qty: number; priceCents: number }>;
    subtotalCents?: number;
    discountCents?: number;
    discount?: { kind: "percent" | "amount"; value: number; reason?: string } | null;
    taxCents?: number;
    totalCents?: number;
    staffId?: string;
    paymentMethod?: string;
    customerId?: string | null;
  };

  if (!p.items?.length || typeof p.totalCents !== "number" || !p.staffId) {
    return { status: "rejected", errorMessage: "cash_sale missing required fields" };
  }

  // Verify the customer (if attributed) belongs to this store. If they don't —
  // either deleted, or attempted attribution to another store's customer —
  // record the sale anyway as guest. Cash already changed hands; we can't
  // refuse the sale, but we shouldn't cross-tenant-leak either.
  let customerId: string | null = null;
  if (p.customerId) {
    const c = await tx.posCustomer.findFirst({
      where: { id: p.customerId, store_id: evt.storeId, deleted_at: null },
      select: { id: true },
    });
    customerId = c?.id ?? null;
  }

  // 1. Append to ledger (revenue entry).
  await tx.posLedgerEntry.create({
    data: {
      // Append-only — match the existing pos_ledger_entries schema.
      store_id: evt.storeId,
      type: "sale",
      amount_cents: p.totalCents,
      staff_id: p.staffId,
      customer_id: customerId,
      description: `Register cash sale (${p.items.length} ${p.items.length === 1 ? "item" : "items"})`,
      metadata: {
        source: "register_offline",
        eventId: evt.id,
        deviceId: evt.deviceId,
        wallTime: evt.wallTime.toISOString(),
        items: (p.items ?? []).map((i) => ({
          inventory_item_id: i.inventoryItemId,
          name: i.name,
          quantity: i.qty,
          price_cents: i.priceCents,
        })),
        paymentMethod: "cash",
        subtotalCents: p.subtotalCents ?? p.totalCents,
        discountCents: p.discountCents ?? 0,
        discount: p.discount ?? null,
        taxCents: p.taxCents ?? 0,
      },
      created_at: evt.wallTime,
    },
  });

  // 2. Decrement inventory. Track conflicts (oversold) but don't block.
  const oversold: Array<{ inventoryItemId: string; name: string; needed: number; available: number }> = [];
  for (const item of p.items) {
    const inv = await tx.posInventoryItem.findUnique({
      where: { id: item.inventoryItemId },
      select: { id: true, quantity: true, name: true },
    });
    if (!inv) {
      // Item doesn't exist server-side. Could mean: a custom-priced item
      // was rung up that has no inventory row, OR the row was deleted.
      // We've already taken the cash, so this is informational only.
      oversold.push({ inventoryItemId: item.inventoryItemId, name: item.name, needed: item.qty, available: 0 });
      continue;
    }
    if (inv.quantity < item.qty) {
      oversold.push({ inventoryItemId: inv.id, name: inv.name, needed: item.qty, available: inv.quantity });
    }
    // Decrement regardless. Negative qty surfaces in the reconciliation
    // queue for the owner to review.
    await tx.posInventoryItem.update({
      where: { id: item.inventoryItemId },
      data: { quantity: { decrement: item.qty } },
    });
  }

  if (oversold.length > 0) {
    return {
      status: "conflict",
      conflictData: {
        kind: "oversold_inventory",
        items: oversold,
        eventSummary: `Cash sale of $${(p.totalCents / 100).toFixed(2)} oversold ${oversold.length} item(s)`,
      },
    };
  }

  return { status: "applied" };
}

/**
 * Card sale event:
 *   payload: {
 *     items, subtotalCents, discountCents, discount, taxCents, totalCents,
 *     staffId, customerId,
 *     paymentMethod: 'card',
 *     paymentIntentId: string,    // Stripe PI we minted via /payment-intent
 *   }
 *
 * The register only fires this event after Stripe reports status='succeeded'.
 * We re-verify the PI server-side before recording — protects against a
 * compromised key trying to record fake card sales.
 */
async function applyCardSale(
  tx: Prisma.TransactionClient,
  evt: RegisterEventInput,
): Promise<ApplyResult> {
  const p = evt.payload as {
    items?: Array<{ inventoryItemId: string; name: string; qty: number; priceCents: number }>;
    subtotalCents?: number;
    discountCents?: number;
    discount?: { kind: "percent" | "amount"; value: number; reason?: string } | null;
    taxCents?: number;
    totalCents?: number;
    staffId?: string;
    customerId?: string | null;
    paymentIntentId?: string;
  };

  if (!p.items?.length || typeof p.totalCents !== "number" || !p.staffId || !p.paymentIntentId) {
    return { status: "rejected", errorMessage: "card_sale missing required fields" };
  }

  // Verify the PI exists, succeeded, and matches our expected amount.
  const stripe = getStripe();
  if (!stripe) {
    return { status: "rejected", errorMessage: "Stripe not configured server-side" };
  }
  let pi: { id: string; status: string; amount: number; metadata?: Record<string, string> | null };
  try {
    const fetched = await stripe.paymentIntents.retrieve(p.paymentIntentId);
    pi = {
      id: fetched.id,
      status: fetched.status,
      amount: fetched.amount,
      metadata: (fetched.metadata as Record<string, string> | null) ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe lookup failed";
    return { status: "rejected", errorMessage: `PaymentIntent lookup failed: ${msg}` };
  }
  if (pi.status !== "succeeded") {
    return { status: "rejected", errorMessage: `PaymentIntent status is '${pi.status}', expected 'succeeded'` };
  }
  if (pi.amount !== p.totalCents) {
    return {
      status: "rejected",
      errorMessage: `PaymentIntent amount ${pi.amount} != event totalCents ${p.totalCents}`,
    };
  }
  if (pi.metadata?.afterroar_store_id && pi.metadata.afterroar_store_id !== evt.storeId) {
    return { status: "rejected", errorMessage: "PaymentIntent belongs to a different store" };
  }

  // Customer guard (same as cash_sale)
  let customerId: string | null = null;
  if (p.customerId) {
    const c = await tx.posCustomer.findFirst({
      where: { id: p.customerId, store_id: evt.storeId, deleted_at: null },
      select: { id: true },
    });
    customerId = c?.id ?? null;
  }

  await tx.posLedgerEntry.create({
    data: {
      store_id: evt.storeId,
      type: "sale",
      amount_cents: p.totalCents,
      staff_id: p.staffId,
      customer_id: customerId,
      description: `Register card sale (${p.items.length} ${p.items.length === 1 ? "item" : "items"})`,
      metadata: {
        source: "register_offline",
        eventId: evt.id,
        deviceId: evt.deviceId,
        wallTime: evt.wallTime.toISOString(),
        items: (p.items ?? []).map((i) => ({
          inventory_item_id: i.inventoryItemId,
          name: i.name,
          quantity: i.qty,
          price_cents: i.priceCents,
        })),
        paymentMethod: "card",
        paymentIntentId: p.paymentIntentId,
        subtotalCents: p.subtotalCents ?? p.totalCents,
        discountCents: p.discountCents ?? 0,
        discount: p.discount ?? null,
        taxCents: p.taxCents ?? 0,
      },
      created_at: evt.wallTime,
    },
  });

  // Inventory decrement — same logic as cash_sale.
  const oversold: Array<{ inventoryItemId: string; name: string; needed: number; available: number }> = [];
  for (const item of p.items) {
    const inv = await tx.posInventoryItem.findUnique({
      where: { id: item.inventoryItemId },
      select: { id: true, quantity: true, name: true },
    });
    if (!inv) {
      oversold.push({ inventoryItemId: item.inventoryItemId, name: item.name, needed: item.qty, available: 0 });
      continue;
    }
    if (inv.quantity < item.qty) {
      oversold.push({ inventoryItemId: inv.id, name: inv.name, needed: item.qty, available: inv.quantity });
    }
    await tx.posInventoryItem.update({
      where: { id: item.inventoryItemId },
      data: { quantity: { decrement: item.qty } },
    });
  }

  if (oversold.length > 0) {
    return {
      status: "conflict",
      conflictData: {
        kind: "oversold_inventory",
        items: oversold,
        eventSummary: `Card sale of $${(p.totalCents / 100).toFixed(2)} oversold ${oversold.length} item(s)`,
      },
    };
  }

  return { status: "applied" };
}

/**
 * Top-level applier. Looks up the handler by `evt.type` and runs it
 * inside a transaction. Unknown types are rejected (defensive — keeps
 * server schema additions ahead of client schema additions).
 */
export async function applyEvent(
  prisma: PrismaClient,
  evt: RegisterEventInput,
): Promise<ApplyResult> {
  switch (evt.type) {
    case "cash_sale":
      return prisma.$transaction((tx) => applyCashSale(tx, evt));
    case "card_sale":
      return prisma.$transaction((tx) => applyCardSale(tx, evt));
    // Future event types land here. Each gets its own handler + payload contract.
    case "return":
    case "credit_apply":
    case "loyalty_redeem":
      return { status: "rejected", errorMessage: `event type '${evt.type}' not yet implemented` };
    default:
      return { status: "rejected", errorMessage: `unknown event type '${evt.type}'` };
  }
}
