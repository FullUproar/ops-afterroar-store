/* ------------------------------------------------------------------ */
/*  TCGPlayer CSV Export Formatter                                      */
/*                                                                      */
/*  Generates TCGPlayer-compatible CSV for inventory upload.            */
/*  This is the bridge that replaces BinderPOS's core function:         */
/*  manage inventory in Afterroar → export → upload to TCGPlayer.      */
/*                                                                      */
/*  TCGPlayer CSV format:                                               */
/*  TCGplayer Id, Product Line, Set Name, Product Name, Title,         */
/*  Number, Rarity, Condition, TCG Market Price, TCG Direct Low,       */
/*  TCG Low Price, Total Quantity, Add to Quantity, TCG Marketplace    */
/*  Price, Photo URL                                                    */
/* ------------------------------------------------------------------ */

export interface TCGPlayerExportRow {
  "TCGplayer Id": string;
  "Product Line": string;
  "Set Name": string;
  "Product Name": string;
  "Title": string;
  "Number": string;
  "Rarity": string;
  "Condition": string;
  "TCG Market Price": string;
  "TCG Direct Low": string;
  "TCG Low Price": string;
  "Total Quantity": string;
  "Add to Quantity": string;
  "TCG Marketplace Price": string;
  "Photo URL": string;
}

/** Map our condition codes to TCGPlayer condition names */
const CONDITION_MAP: Record<string, string> = {
  "NM": "Near Mint",
  "LP": "Lightly Played",
  "MP": "Moderately Played",
  "HP": "Heavily Played",
  "DMG": "Damaged",
};

/** Map our game identifiers to TCGPlayer Product Lines */
const PRODUCT_LINE_MAP: Record<string, string> = {
  "mtg": "Magic",
  "magic": "Magic",
  "magic: the gathering": "Magic",
  "pokemon": "Pokemon",
  "pokémon": "Pokemon",
  "yugioh": "YuGiOh",
  "yu-gi-oh": "YuGiOh",
  "yu-gi-oh!": "YuGiOh",
  "fab": "Flesh and Blood TCG",
  "flesh and blood": "Flesh and Blood TCG",
  "lorcana": "Disney Lorcana TCG",
  "one piece": "One Piece Card Game",
};

interface InventoryItemForExport {
  name: string;
  category: string;
  quantity: number;
  price_cents: number;
  attributes: Record<string, unknown>;
  sku?: string | null;
  barcode?: string | null;
  external_id?: string | null;
}

/**
 * Convert inventory items to TCGPlayer CSV format.
 * Only exports TCG singles (category = "tcg_single").
 */
export function formatForTCGPlayer(
  items: InventoryItemForExport[],
  options?: {
    includeZeroQuantity?: boolean;
    reserveStock?: number; // Hold back N units from listing
  }
): TCGPlayerExportRow[] {
  const rows: TCGPlayerExportRow[] = [];
  const reserveStock = options?.reserveStock ?? 0;

  for (const item of items) {
    // Only export TCG singles
    if (item.category !== "tcg_single") continue;

    const attrs = item.attributes ?? {};
    const game = String(attrs.game ?? "mtg").toLowerCase();
    const condition = String(attrs.condition ?? "NM");
    const listableQty = Math.max(0, item.quantity - reserveStock);

    if (!options?.includeZeroQuantity && listableQty <= 0) continue;

    const productLine = PRODUCT_LINE_MAP[game] ?? "Magic";
    const tcgCondition = CONDITION_MAP[condition] ?? "Near Mint";
    const foil = attrs.foil === true || attrs.foil === "Yes";

    // Build the title: "Card Name - Set Name"
    const setName = String(attrs.set_name ?? attrs.set ?? "");
    const collectorNumber = String(attrs.collector_number ?? "");
    const rarity = String(attrs.rarity ?? "");

    // TCGPlayer price in dollars
    const priceDollars = (item.price_cents / 100).toFixed(2);

    rows.push({
      "TCGplayer Id": item.external_id ?? "",
      "Product Line": productLine,
      "Set Name": setName,
      "Product Name": item.name + (foil ? " (Foil)" : ""),
      "Title": `${item.name}${setName ? ` - ${setName}` : ""}${foil ? " [Foil]" : ""}`,
      "Number": collectorNumber,
      "Rarity": rarity,
      "Condition": tcgCondition + (foil ? " Foil" : ""),
      "TCG Market Price": "", // Leave blank — TCGPlayer fills this
      "TCG Direct Low": "",
      "TCG Low Price": "",
      "Total Quantity": String(listableQty),
      "Add to Quantity": "0",
      "TCG Marketplace Price": priceDollars,
      "Photo URL": "",
    });
  }

  return rows;
}

/**
 * Convert rows to CSV string.
 */
export function rowsToCSV(rows: TCGPlayerExportRow[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h as keyof TCGPlayerExportRow] ?? "";
        // Quote values that contain commas or quotes
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(",")
    ),
  ];

  return lines.join("\n");
}
