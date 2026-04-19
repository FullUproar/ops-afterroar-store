import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermissionAndFeature,
  handleAuthError,
} from "@/lib/require-staff";
import { opLog } from "@/lib/op-log";
import { pushInventoryToShopify } from "@/lib/shopify-sync";

/* ------------------------------------------------------------------ */
/*  POST /api/fulfillment/oversell                                     */
/*                                                                     */
/*  Resolution endpoint for orders flagged with is_oversold OR for     */
/*  orders where the cashier discovered at fulfillment time that an    */
/*  item is short.                                                     */
/*                                                                     */
/*  Three resolution paths:                                            */
/*    backorder  → mark the order as partially-shipped capable, leave  */
/*                 the missing line behind, customer notified out-of-  */
/*                 band                                                */
/*    cancel     → cancel the order (full or partial); restore stock   */
/*                 for the cancelled lines, mark as cancelled          */
/*    reconcile  → "I have it but my count was wrong" — adjust         */
/*                 inventory upward to cover the order, clear the      */
/*                 oversold flag                                       */
/* ------------------------------------------------------------------ */

type OversellAction = "backorder" | "cancel" | "reconcile";

interface OversellBody {
  order_id: string;
  action: OversellAction;
  /** For "reconcile": the new on-hand quantity per item. */
  reconcile_quantities?: Array<{ inventory_item_id: string; on_hand: number }>;
  /** For "cancel": item IDs to cancel; omit to cancel the whole order. */
  cancel_line_ids?: string[];
  /** Free-text reason / cashier note for the audit log. */
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requirePermissionAndFeature(
      "manage_orders",
      "ecommerce",
    );

    let body: OversellBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.order_id || !body.action) {
      return NextResponse.json(
        { error: "order_id and action required" },
        { status: 400 },
      );
    }

    // Tenant-scoped: confirm the order belongs to this store.
    const order = await db.posOrder.findFirst({
      where: { id: body.order_id },
      select: {
        id: true,
        store_id: true,
        order_number: true,
        is_oversold: true,
        status: true,
        notes: true,
        items: {
          select: {
            id: true,
            inventory_item_id: true,
            quantity: true,
            name: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    switch (body.action) {
      case "backorder":
        return await handleBackorder(order, body, storeId, staff);
      case "cancel":
        return await handleCancel(order, body, storeId, staff);
      case "reconcile":
        return await handleReconcile(order, body, storeId, staff);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ---------- Backorder -------------------------------------------- */

async function handleBackorder(
  order: { id: string; order_number: string; notes: string | null },
  body: OversellBody,
  storeId: string,
  staff: { id: string; name: string; user_id: string },
) {
  // We don't have a partial-shipment status in the workflow, so use
  // notes + a custom status to flag the order for manual follow-up.
  // Customer notification happens out-of-band (email send is not
  // wired here yet — TODO[design]: standardize a "backorder pending"
  // template before we automate this).
  const notePieces = [
    order.notes,
    `[Backorder] ${new Date().toISOString()} by ${staff.name}${body.reason ? ` — ${body.reason}` : ""}`,
  ].filter(Boolean);

  const updated = await prisma.posOrder.update({
    where: { id: order.id },
    data: {
      status: "backordered",
      notes: notePieces.join(" | "),
      updated_at: new Date(),
    },
    select: { id: true, status: true, order_number: true },
  });

  opLog({
    storeId,
    eventType: "issue.flagged",
    severity: "warn",
    message: `Order ${order.order_number} backordered (oversell resolution)`,
    metadata: {
      order_id: order.id,
      action: "backorder",
      reason: body.reason ?? null,
    },
    staffName: staff.name,
    userId: staff.user_id,
  });

  return NextResponse.json({ ok: true, order: updated });
}

/* ---------- Cancel ----------------------------------------------- */

async function handleCancel(
  order: {
    id: string;
    order_number: string;
    items: Array<{
      id: string;
      inventory_item_id: string | null;
      quantity: number;
      name: string;
    }>;
  },
  body: OversellBody,
  storeId: string,
  staff: { id: string; name: string; user_id: string },
) {
  const lineIds =
    body.cancel_line_ids && body.cancel_line_ids.length > 0
      ? body.cancel_line_ids
      : order.items.map((i) => i.id);

  // Restore inventory for the cancelled lines: we hard-decremented on
  // ingest, so cancellation has to give the stock back.
  await prisma.$transaction(async (tx) => {
    for (const line of order.items) {
      if (!lineIds.includes(line.id)) continue;
      if (line.inventory_item_id) {
        await tx.posInventoryItem.update({
          where: { id: line.inventory_item_id },
          data: { quantity: { increment: line.quantity }, updated_at: new Date() },
        });
      }
    }

    // If we're cancelling everything, cancel the order itself.
    const cancellingAll = lineIds.length === order.items.length;
    await tx.posOrder.update({
      where: { id: order.id },
      data: cancellingAll
        ? { status: "cancelled", updated_at: new Date() }
        : { status: "partial_cancelled", updated_at: new Date() },
    });
  });

  opLog({
    storeId,
    eventType: "checkout.void",
    severity: "warn",
    message: `Order ${order.order_number}: cancelled ${lineIds.length}/${order.items.length} line(s) (oversell resolution)`,
    metadata: {
      order_id: order.id,
      action: "cancel",
      cancelled_lines: lineIds,
      reason: body.reason ?? null,
    },
    staffName: staff.name,
    userId: staff.user_id,
  });

  // TODO[design]: Trigger Stripe refund through processRefund() when we
  // have the original PaymentIntent attached to the order. Today the
  // marketplace controls the charge so refund typically happens upstream.

  // Fire-and-forget: push the restored quantities to Shopify so the
  // listing reflects what's now back on the shelf.
  for (const line of order.items) {
    if (line.inventory_item_id && lineIds.includes(line.id)) {
      pushInventoryToShopify(storeId, line.inventory_item_id).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

/* ---------- Reconcile -------------------------------------------- */

async function handleReconcile(
  order: { id: string; order_number: string; is_oversold: boolean },
  body: OversellBody,
  storeId: string,
  staff: { id: string; name: string; user_id: string },
) {
  const adjustments = body.reconcile_quantities ?? [];
  if (adjustments.length === 0) {
    return NextResponse.json(
      { error: "reconcile_quantities required for reconcile action" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const adj of adjustments) {
      // Tenant-scope check via composite where so we can't reconcile
      // another store's inventory.
      const inv = await tx.posInventoryItem.findFirst({
        where: { id: adj.inventory_item_id, store_id: storeId },
        select: { id: true, quantity: true, name: true },
      });
      if (!inv) continue;

      const delta = adj.on_hand - inv.quantity;
      if (delta === 0) continue;

      await tx.posInventoryItem.update({
        where: { id: inv.id },
        data: { quantity: adj.on_hand, updated_at: new Date() },
      });

      await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          staff_id: staff.id,
          type: "adjustment",
          amount_cents: 0,
          description: `Inventory adjustment: ${inv.name} ${delta > 0 ? "+" : ""}${delta} — fulfillment reconciliation`,
          metadata: JSON.parse(
            JSON.stringify({
              item_id: inv.id,
              item_name: inv.name,
              previous_quantity: inv.quantity,
              adjustment: delta,
              new_quantity: adj.on_hand,
              reason: "fulfillment reconciliation",
              order_id: order.id,
              cashier_note: body.reason ?? null,
            }),
          ),
        },
      });
    }

    // Reconciliation made the order fulfillable — clear the oversold
    // flag so the banner stops nagging the cashier.
    await tx.posOrder.update({
      where: { id: order.id },
      data: { is_oversold: false, updated_at: new Date() },
    });
  });

  opLog({
    storeId,
    eventType: "inventory.adjust",
    message: `Order ${order.order_number}: reconciled ${adjustments.length} item(s) at fulfillment`,
    metadata: {
      order_id: order.id,
      action: "reconcile",
      adjustments,
      reason: body.reason ?? null,
    },
    staffName: staff.name,
    userId: staff.user_id,
  });

  // Fire-and-forget: bring marketplaces in line with the corrected
  // on-hand. Same pattern as POS sale → Shopify sync.
  for (const adj of adjustments) {
    pushInventoryToShopify(storeId, adj.inventory_item_id).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
