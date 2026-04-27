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
    totalCents?: number;
    staffId?: string;
    paymentMethod?: string;
  };

  if (!p.items?.length || typeof p.totalCents !== "number" || !p.staffId) {
    return { status: "rejected", errorMessage: "cash_sale missing required fields" };
  }

  // 1. Append to ledger (revenue entry).
  await tx.posLedgerEntry.create({
    data: {
      // Append-only — match the existing pos_ledger_entries schema.
      store_id: evt.storeId,
      type: "sale",
      amount_cents: p.totalCents,
      staff_id: p.staffId,
      description: `Register cash sale (${p.items.length} ${p.items.length === 1 ? "item" : "items"})`,
      metadata: {
        source: "register_offline",
        eventId: evt.id,
        deviceId: evt.deviceId,
        wallTime: evt.wallTime.toISOString(),
        items: p.items,
        paymentMethod: "cash",
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
    // Future event types land here. Each gets its own handler + payload contract.
    case "card_sale":
    case "return":
    case "credit_apply":
    case "loyalty_redeem":
      return { status: "rejected", errorMessage: `event type '${evt.type}' not yet implemented` };
    default:
      return { status: "rejected", errorMessage: `unknown event type '${evt.type}'` };
  }
}
