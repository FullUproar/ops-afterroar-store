import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { formatForTCGPlayer, rowsToCSV } from "@/lib/export/tcgplayer-format";

/* ------------------------------------------------------------------ */
/*  GET /api/export/tcgplayer — export inventory as TCGPlayer CSV       */
/*                                                                      */
/*  Query params:                                                       */
/*    ?game=mtg          — filter by game (default: all TCG singles)    */
/*    ?reserve=2         — reserve N units (don't list them)            */
/*    ?include_zero=true — include out-of-stock items                   */
/*                                                                      */
/*  The store owner clicks "Export to TCGPlayer" →                      */
/*  downloads a CSV → uploads to TCGPlayer bulk listing tool.           */
/*  This replaces BinderPOS's core function.                            */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const url = new URL(request.url);
    const game = url.searchParams.get("game");
    const reserve = parseInt(url.searchParams.get("reserve") ?? "0") || 0;
    const includeZero = url.searchParams.get("include_zero") === "true";

    // Get all TCG singles
    const where: Record<string, unknown> = {
      category: "tcg_single",
      active: true,
    };

    const items = await db.posInventoryItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        quantity: true,
        price_cents: true,
        attributes: true,
        sku: true,
        barcode: true,
        external_id: true,
      },
    });

    // Filter by game if specified
    const filtered = game
      ? items.filter((item) => {
          const attrs = (item.attributes ?? {}) as Record<string, unknown>;
          const itemGame = String(attrs.game ?? "").toLowerCase();
          return itemGame.includes(game.toLowerCase());
        })
      : items;

    const rows = formatForTCGPlayer(
      filtered.map((item) => ({
        ...item,
        attributes: (item.attributes ?? {}) as Record<string, unknown>,
      })),
      { reserveStock: reserve, includeZeroQuantity: includeZero }
    );

    const csv = rowsToCSV(rows);
    const filename = `afterroar-tcgplayer-${game ?? "all"}-${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
