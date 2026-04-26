import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/**
 * POST /api/import/detect-variants
 *
 * Post-import pass for Celerant (and any other source that uses a parent
 * "style" id stored in external_id). Groups all active inventory rows by
 * external_id, and for each group with 2+ rows wires parent_id and a
 * synthesised variant_label.
 *
 * Variant label heuristic, in priority order:
 *   1. attributes.celerant_size (apparel: "S/M/L"; FLGS: language/edition)
 *   2. attributes.celerant_attr1 (often color/condition)
 *   3. attributes.celerant_attr2
 *   4. fall back to the row's barcode (UPC) so the picker has *something*
 *
 * Idempotent — running twice produces the same final state.
 *
 * Body (optional): { source_system?: string }  // limits to a tagged import
 */
export async function POST(request: Request) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");
    const body = await request.json().catch(() => ({}));
    const sourceFilter = typeof body?.source_system === "string" ? body.source_system : null;

    // Pull every active item that has an external_id (these are the candidates
    // for variant grouping). Without external_id we have no signal.
    const items = await db.posInventoryItem.findMany({
      where: {
        store_id: storeId,
        active: true,
        external_id: { not: null },
      },
      select: {
        id: true,
        name: true,
        external_id: true,
        parent_id: true,
        variant_label: true,
        barcode: true,
        attributes: true,
      },
    });

    // Group by external_id. Optional source filter narrows to a specific
    // import job's tag (e.g. "celerant").
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      if (sourceFilter) {
        const attrs = (item.attributes as Record<string, unknown>) ?? {};
        const src = attrs.import_source as string | undefined;
        if (src && src !== sourceFilter) continue;
      }
      const key = item.external_id!;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    let parentsAssigned = 0;
    let labelsApplied = 0;

    for (const [, group] of groups) {
      if (group.length < 2) continue;

      // Pick a stable parent — preserves an existing parent if one is set,
      // otherwise takes the first row deterministically (sorted by id) so
      // subsequent runs converge on the same parent.
      const existingParent = group.find((g) => g.parent_id == null && group.some((other) => other.parent_id === g.id));
      const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
      const parent = existingParent ?? sorted[0];

      for (const item of group) {
        if (item.id === parent.id) continue;

        const attrs = (item.attributes as Record<string, unknown>) ?? {};
        const labelCandidate =
          (attrs.celerant_size as string | undefined) ||
          (attrs.celerant_attr1 as string | undefined) ||
          (attrs.celerant_attr2 as string | undefined) ||
          item.barcode ||
          null;

        const updates: Record<string, unknown> = {};
        if (item.parent_id !== parent.id) {
          updates.parent_id = parent.id;
          parentsAssigned++;
        }
        if (labelCandidate && item.variant_label !== labelCandidate) {
          updates.variant_label = labelCandidate;
          labelsApplied++;
        }
        if (Object.keys(updates).length > 0) {
          await db.posInventoryItem.update({
            where: { id: item.id },
            data: updates,
          });
        }
      }
    }

    return NextResponse.json({
      groups_examined: groups.size,
      parents_assigned: parentsAssigned,
      labels_applied: labelsApplied,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
