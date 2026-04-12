import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function POST(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const body = await request.json();
    const { items, label_size, include_price, include_barcode } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    const itemIds = items.map((i: { item_id: string }) => i.item_id);
    const inventoryItems = await db.posInventoryItem.findMany({
      where: { id: { in: itemIds } },
    });

    const itemMap = new Map(inventoryItems.map((i) => [i.id, i]));

    const size = label_size === "medium" ? "medium" : "small";
    const labelWidth = size === "medium" ? "2in" : "1.5in";
    const labelHeight = size === "medium" ? "1in" : "1in";
    const fontSize = size === "medium" ? "9pt" : "7pt";
    const priceSize = size === "medium" ? "14pt" : "11pt";

    const labels: string[] = [];

    for (const entry of items) {
      const item = itemMap.get(entry.item_id);
      if (!item) continue;

      const qty = entry.quantity || 1;
      const truncatedName =
        item.name.length > 40 ? item.name.substring(0, 37) + "..." : item.name;
      const price = (item.price_cents / 100).toFixed(2);
      const barcodeText = item.barcode || item.sku || item.id.substring(0, 12);

      for (let i = 0; i < qty; i++) {
        labels.push(`
          <div class="label" style="width:${labelWidth};height:${labelHeight};padding:4px;box-sizing:border-box;border:1px dashed #ccc;display:inline-flex;flex-direction:column;justify-content:space-between;overflow:hidden;page-break-inside:avoid;margin:2px;">
            <div style="font-size:${fontSize};font-weight:bold;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${truncatedName}</div>
            ${item.sku ? `<div style="font-size:6pt;color:#666;">SKU: ${item.sku}</div>` : ""}
            ${include_barcode !== false ? `<div style="font-size:8pt;font-family:monospace;letter-spacing:2px;text-align:center;">${barcodeText}</div>` : ""}
            ${include_price !== false ? `<div style="font-size:${priceSize};font-weight:bold;text-align:right;">$${price}</div>` : ""}
          </div>
        `);
      }
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Labels</title>
<style>
  * { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .label-container { display: flex; flex-wrap: wrap; }
  @media print {
    body { margin: 0; }
    .label { border: none !important; }
    @page { margin: 0.25in; }
  }
</style>
</head>
<body>
<div class="label-container">
${labels.join("\n")}
</div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
