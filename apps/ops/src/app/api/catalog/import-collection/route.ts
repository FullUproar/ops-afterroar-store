import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { searchCards } from "@/lib/scryfall";

/* ------------------------------------------------------------------ */
/*  POST /api/catalog/import-collection — bulk import from CSV         */
/*  Accepts TCGPlayer, Moxfield, or simple CSV format.                 */
/*  Looks up each card on Scryfall, creates inventory items.           */
/*                                                                     */
/*  Supported formats:                                                 */
/*  TCGPlayer: Quantity, Name, Set Name, Set Code, Condition, ...      */
/*  Moxfield: Count, Name, Edition, Condition, Foil, ...               */
/*  Simple: name, quantity, condition, set (any order, header row)      */
/* ------------------------------------------------------------------ */

interface ParsedCard {
  name: string;
  quantity: number;
  set_name: string;
  set_code: string;
  condition: string;
  foil: boolean;
}

function parseCSV(text: string): ParsedCard[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim().replace(/"/g, ""));

  // Detect format and map columns
  const nameIdx = headers.findIndex((h) => h === "name" || h === "card name");
  const qtyIdx = headers.findIndex((h) => h === "quantity" || h === "count" || h === "qty");
  const setNameIdx = headers.findIndex((h) => h === "set name" || h === "edition" || h === "set");
  const setCodeIdx = headers.findIndex((h) => h === "set code" || h === "set_code");
  const conditionIdx = headers.findIndex((h) => h === "condition" || h === "cond");
  const foilIdx = headers.findIndex((h) => h === "foil" || h === "printing");

  if (nameIdx === -1) return []; // Can't proceed without name column

  const cards: ParsedCard[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Parse CSV line (handle quoted fields)
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    fields.push(current.trim());

    const name = fields[nameIdx];
    if (!name) continue;

    const qty = qtyIdx >= 0 ? parseInt(fields[qtyIdx]) || 1 : 1;
    const setName = setNameIdx >= 0 ? fields[setNameIdx] || "" : "";
    const setCode = setCodeIdx >= 0 ? fields[setCodeIdx] || "" : "";
    const condition = conditionIdx >= 0 ? normalizeCondition(fields[conditionIdx]) : "NM";
    const foilField = foilIdx >= 0 ? fields[foilIdx]?.toLowerCase() || "" : "";
    const foil = foilField === "foil" || foilField === "true" || foilField === "yes" || foilField === "1";

    cards.push({ name, quantity: qty, set_name: setName, set_code: setCode, condition, foil });
  }

  return cards;
}

function normalizeCondition(raw: string): string {
  const c = raw?.trim().toUpperCase() || "NM";
  if (c.startsWith("NM") || c === "NEAR MINT") return "NM";
  if (c.startsWith("LP") || c === "LIGHTLY PLAYED") return "LP";
  if (c.startsWith("MP") || c === "MODERATELY PLAYED") return "MP";
  if (c.startsWith("HP") || c === "HEAVILY PLAYED") return "HP";
  if (c.startsWith("D") || c === "DAMAGED") return "DMG";
  return "NM";
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.create");

    const body = await request.json();
    const { csv, dry_run } = body as { csv: string; dry_run?: boolean };

    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ error: "CSV data required" }, { status: 400 });
    }

    const parsed = parseCSV(csv);
    if (parsed.length === 0) {
      return NextResponse.json({ error: "No valid cards found in CSV. Make sure there's a 'Name' column." }, { status: 400 });
    }

    if (parsed.length > 500) {
      return NextResponse.json({ error: "Maximum 500 cards per import. Split your file." }, { status: 400 });
    }

    // Dry run: just show what would be imported
    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        total: parsed.length,
        preview: parsed.slice(0, 20),
        total_quantity: parsed.reduce((s, c) => s + c.quantity, 0),
      });
    }

    // Real import: look up each card, create inventory items
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // Batch in groups of 10 to respect Scryfall rate limits
    for (let batch = 0; batch < parsed.length; batch += 10) {
      const chunk = parsed.slice(batch, batch + 10);

      for (const card of chunk) {
        try {
          // Search Scryfall for the card
          const query = card.set_code
            ? `!"${card.name}" set:${card.set_code}`
            : `!"${card.name}"`;
          const result = await searchCards(query);
          const scryfallCard = result.cards[0];

          if (!scryfallCard) {
            // Create without Scryfall link
            await db.posInventoryItem.create({
              data: {
                store_id: storeId,
                name: card.name,
                category: "tcg_single",
                price_cents: 0,
                cost_cents: 0,
                quantity: card.quantity,
                attributes: {
                  game: "MTG",
                  set: card.set_name,
                  condition: card.condition,
                  foil: card.foil,
                  imported: true,
                },
              },
            });
            created++;
            continue;
          }

          // Check if already exists
          const externalId = `scryfall:${scryfallCard.id}:${card.foil ? "foil" : "nonfoil"}`;
          const existing = await db.posInventoryItem.findFirst({
            where: { external_id: externalId },
          });

          if (existing) {
            await db.posInventoryItem.update({
              where: { id: existing.id },
              data: { quantity: { increment: card.quantity } },
            });
            updated++;
          } else {
            const priceStr = card.foil ? scryfallCard.prices.usd_foil : scryfallCard.prices.usd;
            const priceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : 0;
            const imageUrl = scryfallCard.image_uris?.small ?? scryfallCard.card_faces?.[0]?.image_uris?.small ?? null;

            await db.posInventoryItem.create({
              data: {
                store_id: storeId,
                name: `${scryfallCard.name}${card.foil ? " (Foil)" : ""}`,
                category: "tcg_single",
                price_cents: priceCents,
                cost_cents: 0,
                quantity: card.quantity,
                image_url: imageUrl,
                external_id: externalId,
                attributes: {
                  game: "MTG",
                  set: scryfallCard.set_name,
                  set_code: scryfallCard.set,
                  collector_number: scryfallCard.collector_number,
                  condition: card.condition,
                  foil: card.foil,
                  rarity: scryfallCard.rarity,
                  scryfall_id: scryfallCard.id,
                  imported: true,
                },
              },
            });
            created++;
          }
        } catch {
          failed++;
          errors.push(card.name);
        }
      }

      // Rate limit pause between batches
      if (batch + 10 < parsed.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      failed,
      errors: errors.slice(0, 10),
      total: parsed.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
