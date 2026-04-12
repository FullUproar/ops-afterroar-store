import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  Test barcode → inventory seed endpoint                             */
/*  POST: matches test UPCs to inventory items by fuzzy name and       */
/*  updates the barcode field.                                         */
/* ------------------------------------------------------------------ */

const TEST_BARCODES = [
  { name: "MTG Foundations Play Booster Box", upc: "195166253602", keywords: ["mtg", "foundations", "play booster", "booster box"] },
  { name: "Pokemon Prismatic Evolutions ETB", upc: "820650853517", keywords: ["pokemon", "prismatic", "evolutions", "etb", "elite trainer"] },
  { name: "Lorcana Shimmering Skies Booster Box", upc: "4050368983862", keywords: ["lorcana", "shimmering", "skies", "booster"] },
  { name: "Wingspan (Board Game)", upc: "644216627721", keywords: ["wingspan"] },
  { name: "Catan (Board Game)", upc: "029877030712", keywords: ["catan", "settlers"] },
  { name: "Ticket to Ride", upc: "824968717912", keywords: ["ticket to ride", "ticket"] },
  { name: "Drip Coffee", upc: "000000000001", keywords: ["drip coffee", "coffee"] },
  { name: "Monster Energy", upc: "070847811169", keywords: ["monster", "energy"] },
  { name: "Dragon Shield Matte Sleeves", upc: "5706569100056", keywords: ["dragon shield", "matte sleeve"] },
  { name: "Ultra Pro Eclipse Sleeves", upc: "074427152642", keywords: ["ultra pro", "eclipse", "sleeve"] },
];

export async function POST() {
  try {
    const { db } = await requireStaff();

    // Get all inventory items for this store
    const items = await db.posInventoryItem.findMany({
      select: { id: true, name: true, barcode: true },
    });

    const results = [];

    for (const test of TEST_BARCODES) {
      const nameLower = test.name.toLowerCase();

      // Try exact name match first
      let match = items.find(
        (item) => item.name.toLowerCase() === nameLower
      );

      // Try keyword match (all keywords must appear in item name)
      if (!match) {
        match = items.find((item) => {
          const itemLower = item.name.toLowerCase();
          return test.keywords.some((kw) => itemLower.includes(kw));
        });
      }

      // Try partial match on first significant word
      if (!match) {
        const firstWord = test.keywords[0];
        match = items.find((item) =>
          item.name.toLowerCase().includes(firstWord)
        );
      }

      if (match) {
        if (match.barcode === test.upc) {
          // Already set to this UPC
          results.push({
            name: test.name,
            upc: test.upc,
            matched: true,
            updated: false,
            inventoryName: match.name,
          });
        } else {
          // Update the barcode
          await db.posInventoryItem.update({
            where: { id: match.id },
            data: { barcode: test.upc },
          });
          results.push({
            name: test.name,
            upc: test.upc,
            matched: true,
            updated: true,
            inventoryName: match.name,
          });
        }
      } else {
        results.push({
          name: test.name,
          upc: test.upc,
          matched: false,
          updated: false,
        });
      }
    }

    const updatedCount = results.filter((r) => r.updated).length;
    const matchedCount = results.filter((r) => r.matched).length;

    return NextResponse.json({
      results,
      summary: {
        total: TEST_BARCODES.length,
        matched: matchedCount,
        updated: updatedCount,
        notFound: TEST_BARCODES.length - matchedCount,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
