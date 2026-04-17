import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  Consignment API                                                    */
/*  GET: list consignment items                                        */
/*  POST: actions (intake, mark_sold, payout, return)                  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.view");

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;

    const where = {};

    const [data, total] = await Promise.all([
      db.posConsignmentItem.findMany({
        where,
        orderBy: { listed_at: "desc" },
        include: {
          consignor: { select: { id: true, name: true } },
          inventory_item: { select: { id: true, name: true, price_cents: true } },
        },
        skip,
        take: Math.min(pageSize, 200),
      }),
      db.posConsignmentItem.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, pageSize });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requirePermission("inventory.adjust");
    const body = await request.json();
    const action = body.action as string;

    // ---- INTAKE: accept a consignment item ----
    if (action === "intake") {
      const { consignor_id, name, asking_price_cents, commission_percent, notes, category } = body;
      if (!consignor_id || !name || !asking_price_cents) {
        return NextResponse.json({ error: "consignor_id, name, and asking_price_cents required" }, { status: 400 });
      }

      // Create inventory item for the consignment piece
      const invItem = await db.posInventoryItem.create({
        data: {
          store_id: storeId,
          name: name.trim(),
          category: category || "tcg_single",
          price_cents: asking_price_cents,
          cost_cents: 0, // Store has no cost basis on consignment
          quantity: 1,
          attributes: { consignment: true, consignor_id },
        },
      });

      const consignmentItem = await db.posConsignmentItem.create({
        data: {
          store_id: storeId,
          consignor_id,
          inventory_item_id: invItem.id,
          asking_price_cents,
          commission_percent: commission_percent || 15,
          notes: notes || null,
        },
      });

      return NextResponse.json(consignmentItem, { status: 201 });
    }

    // ---- MARK SOLD: when the item sells at register ----
    if (action === "mark_sold") {
      const { consignment_id, sale_price_cents } = body;
      if (!consignment_id) {
        return NextResponse.json({ error: "consignment_id required" }, { status: 400 });
      }

      const item = await db.posConsignmentItem.findFirst({
        where: { id: consignment_id, status: "active" },
      });
      if (!item) {
        return NextResponse.json({ error: "Consignment item not found or not active" }, { status: 404 });
      }

      const salePrice = sale_price_cents || item.asking_price_cents;
      const commission = Math.round(salePrice * (Number(item.commission_percent) / 100));
      const payoutAmount = salePrice - commission;

      // Create payout ledger entry (credit to consignor)
      // SECURITY: use tenant-scoped db for ledger entries
      const ledgerEntry = await db.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "credit_issue",
          customer_id: item.consignor_id,
          staff_id: staff.id,
          amount_cents: payoutAmount,
          description: `Consignment payout: ${item.inventory_item_id ? "item sold" : "manual"} (${Number(item.commission_percent)}% commission)`,
          metadata: JSON.parse(JSON.stringify({
            consignment_id: item.id,
            sale_price_cents: salePrice,
            commission_cents: commission,
            commission_percent: Number(item.commission_percent),
          })),
        },
      });

      // Credit consignor's balance
      // SECURITY: use tenant-scoped db for customer updates
      await db.posCustomer.update({
        where: { id: item.consignor_id, store_id: storeId },
        data: { credit_balance_cents: { increment: payoutAmount } },
      });

      // Mark consignment as sold
      await db.posConsignmentItem.update({
        where: { id: consignment_id },
        data: {
          status: "sold",
          sold_at: new Date(),
          payout_cents: payoutAmount,
          payout_ledger_entry_id: ledgerEntry.id,
        },
      });

      return NextResponse.json({
        success: true,
        sale_price_cents: salePrice,
        commission_cents: commission,
        payout_cents: payoutAmount,
      });
    }

    // ---- RETURN: return unsold item to consignor ----
    if (action === "return") {
      const { consignment_id } = body;
      if (!consignment_id) {
        return NextResponse.json({ error: "consignment_id required" }, { status: 400 });
      }

      await db.posConsignmentItem.update({
        where: { id: consignment_id },
        data: { status: "returned" },
      });

      // Deactivate the inventory item
      const item = await db.posConsignmentItem.findFirst({ where: { id: consignment_id } });
      if (item?.inventory_item_id) {
        await db.posInventoryItem.update({
          where: { id: item.inventory_item_id },
          data: { active: false, quantity: 0 },
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
