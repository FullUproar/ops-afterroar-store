import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/purchase-orders/suggest                                   */
/*                                                                      */
/*  Builds suggested purchase orders by scanning inventory for items   */
/*  at or below their reorder_point, then grouping them by preferred   */
/*  vendor. Items without a preferred vendor land in an "Unassigned"  */
/*  bucket — they still need reordering, but the operator has to pick */
/*  the supplier.                                                       */
/*                                                                      */
/*  Output shape (per group):                                           */
/*    {                                                                 */
/*      supplier: { id?, name, account_number? } | null,               */
/*      lines: [                                                        */
/*        { inventory_item_id, name, sku, vendor_sku, case_pack,       */
/*          quantity_on_hand, reorder_point, suggested_qty,            */
/*          last_cost_cents, line_cost_cents }                          */
/*      ],                                                              */
/*      total_units, total_cost_cents                                   */
/*    }                                                                 */
/*                                                                      */
/*  Suggested qty math:                                                 */
/*    target = max(reorder_point * 2, reorder_point + 10)                */
/*    suggested = max(0, target - quantity_on_hand)                     */
/*    if case_pack > 0, round UP to nearest case multiple               */
/*  This gives stores a sane default they can override line-by-line.   */
/* ------------------------------------------------------------------ */

interface VendorLink {
  supplier_id: string;
  vendor_sku: string | null;
  case_pack: number | null;
  last_cost_cents: number | null;
  preferred: boolean;
  supplier: { id: string; name: string; account_number: string | null } | null;
}

interface SuggestionLine {
  inventory_item_id: string;
  name: string;
  sku: string | null;
  vendor_sku: string | null;
  case_pack: number | null;
  quantity_on_hand: number;
  reorder_point: number;
  suggested_qty: number;
  last_cost_cents: number;
  line_cost_cents: number;
}

interface SuggestionGroup {
  supplier:
    | { id: string | null; name: string; account_number: string | null }
    | null;
  lines: SuggestionLine[];
  total_units: number;
  total_cost_cents: number;
}

function suggestQty(qoh: number, reorder: number, casePack: number | null): number {
  const target = Math.max(reorder * 2, reorder + 10);
  const need = Math.max(0, target - qoh);
  if (casePack && casePack > 0 && need > 0) {
    return Math.ceil(need / casePack) * casePack;
  }
  return need;
}

export async function GET() {
  try {
    const { db, storeId } = await requireStaff();

    // Pull all items at or below reorder_point. Without reorder_point we have
    // no signal — operator has to set those for the suggestion engine to
    // work. Could fall back to low_stock_threshold but that's a UI hint, not
    // a procurement target.
    const items = await db.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        active: true,
        reorder_point: { not: null },
      },
      include: {
        vendor_links: {
          include: {
            supplier: {
              select: { id: true, name: true, account_number: true },
            },
          },
        },
      },
    });

    // Filter to those actually below reorder_point
    const candidates = items.filter(
      (i) => i.reorder_point != null && i.quantity <= i.reorder_point,
    );

    if (candidates.length === 0) {
      return NextResponse.json({ groups: [], total_items: 0 });
    }

    // Group by preferred supplier; fall back to first vendor link, else null.
    const groups = new Map<string, SuggestionGroup>();
    const KEY_NULL = "__unassigned__";

    for (const item of candidates) {
      const links = (item.vendor_links ?? []) as VendorLink[];
      const preferred = links.find((l) => l.preferred) ?? links[0] ?? null;
      const supplierKey = preferred?.supplier_id ?? KEY_NULL;

      const suggestedQ = suggestQty(item.quantity, item.reorder_point ?? 0, preferred?.case_pack ?? null);
      if (suggestedQ <= 0) continue;

      const unitCost = preferred?.last_cost_cents ?? item.cost_cents;
      const line: SuggestionLine = {
        inventory_item_id: item.id,
        name: item.name,
        sku: item.sku ?? null,
        vendor_sku: preferred?.vendor_sku ?? null,
        case_pack: preferred?.case_pack ?? null,
        quantity_on_hand: item.quantity,
        reorder_point: item.reorder_point ?? 0,
        suggested_qty: suggestedQ,
        last_cost_cents: unitCost,
        line_cost_cents: unitCost * suggestedQ,
      };

      let group = groups.get(supplierKey);
      if (!group) {
        group = {
          supplier: preferred?.supplier
            ? {
                id: preferred.supplier.id,
                name: preferred.supplier.name,
                account_number: preferred.supplier.account_number,
              }
            : null,
          lines: [],
          total_units: 0,
          total_cost_cents: 0,
        };
        groups.set(supplierKey, group);
      }
      group.lines.push(line);
      group.total_units += suggestedQ;
      group.total_cost_cents += line.line_cost_cents;
    }

    // Sort groups: real suppliers first, alphabetical, then unassigned last.
    const result = Array.from(groups.values())
      .sort((a, b) => {
        if (!a.supplier && b.supplier) return 1;
        if (a.supplier && !b.supplier) return -1;
        if (!a.supplier && !b.supplier) return 0;
        return (a.supplier!.name).localeCompare(b.supplier!.name);
      });

    // Sort lines within each group by line cost desc (biggest spend up top)
    for (const g of result) {
      g.lines.sort((a, b) => b.line_cost_cents - a.line_cost_cents);
    }

    return NextResponse.json({
      groups: result,
      total_items: candidates.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
