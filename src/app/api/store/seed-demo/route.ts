import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/store/seed-demo — populate store with sample data        */
/*  Used during onboarding so owners can explore immediately.          */
/* ------------------------------------------------------------------ */

const DEMO_ITEMS = [
  // TCG Singles
  { name: "Lightning Bolt", category: "tcg_single", price_cents: 250, cost_cents: 100, quantity: 12, attributes: { game: "MTG", condition: "NM", set: "Foundations" } },
  { name: "Sol Ring", category: "tcg_single", price_cents: 100, cost_cents: 30, quantity: 20, attributes: { game: "MTG", condition: "NM", set: "Foundations" } },
  { name: "Fatal Push", category: "tcg_single", price_cents: 350, cost_cents: 150, quantity: 8, attributes: { game: "MTG", condition: "NM", set: "Aetherdrift" } },
  { name: "Charizard ex", category: "tcg_single", price_cents: 4500, cost_cents: 2500, quantity: 2, attributes: { game: "Pokemon", condition: "NM", set: "Prismatic Evolutions" } },
  { name: "Pikachu VMAX", category: "tcg_single", price_cents: 2800, cost_cents: 1800, quantity: 1, attributes: { game: "Pokemon", condition: "NM", set: "Vivid Voltage" } },
  // Sealed
  { name: "MTG Play Booster Box", category: "sealed", price_cents: 12999, cost_cents: 8500, quantity: 6, attributes: { game: "MTG", product_type: "booster_box" } },
  { name: "Pokemon ETB", category: "sealed", price_cents: 6999, cost_cents: 4500, quantity: 4, attributes: { game: "Pokemon", product_type: "etb" } },
  { name: "MTG Commander Deck", category: "sealed", price_cents: 4499, cost_cents: 2800, quantity: 5, attributes: { game: "MTG", product_type: "commander_deck" } },
  // Board Games
  { name: "Wingspan", category: "board_game", price_cents: 6499, cost_cents: 3800, quantity: 3, attributes: { publisher: "Stonemaier", players: "1-5" } },
  { name: "Catan", category: "board_game", price_cents: 4499, cost_cents: 2500, quantity: 4, attributes: { publisher: "Catan Studio", players: "3-4" } },
  { name: "Ticket to Ride", category: "board_game", price_cents: 4499, cost_cents: 2500, quantity: 3, attributes: { publisher: "Days of Wonder", players: "2-5" } },
  // Accessories
  { name: "Dragon Shield Sleeves (100ct)", category: "accessory", price_cents: 1199, cost_cents: 600, quantity: 20, attributes: { type: "sleeves" } },
  { name: "Ultra Pro Deck Box", category: "accessory", price_cents: 499, cost_cents: 200, quantity: 15, attributes: { type: "deck_box" } },
  { name: "Chessex Dice Set", category: "accessory", price_cents: 999, cost_cents: 400, quantity: 10, attributes: { type: "dice" } },
  // Food & Drink
  { name: "Drip Coffee", category: "food_drink", price_cents: 300, cost_cents: 50, quantity: 999, attributes: { type: "hot_drink" } },
  { name: "Monster Energy", category: "food_drink", price_cents: 350, cost_cents: 150, quantity: 48, attributes: { type: "canned" } },
  { name: "Bottled Water", category: "food_drink", price_cents: 200, cost_cents: 30, quantity: 100, attributes: { type: "bottled" } },
];

const DEMO_CUSTOMERS = [
  { name: "Alex Thompson", email: "alex@example.com", phone: "555-0101" },
  { name: "Sarah Kim", email: "sarah@example.com", phone: "555-0102" },
  { name: "Jake Rivera", email: "jake@example.com", phone: "555-0103" },
  { name: "Emily Watson", email: "emily@example.com", phone: "555-0104" },
  { name: "Dylan Chen", email: "dylan@example.com", phone: "555-0105" },
];

const DEMO_EVENTS = [
  { name: "Friday Night Magic", event_type: "fnm", entry_fee_cents: 500, max_players: 32, days_from_now: 3 },
  { name: "Commander Night", event_type: "casual", entry_fee_cents: 0, max_players: 40, days_from_now: 5 },
  { name: "Pokemon League", event_type: "league", entry_fee_cents: 0, max_players: 20, days_from_now: 7 },
];

export async function POST() {
  try {
    const { db, storeId } = await requirePermission("store.settings");

    // Check if store already has data
    const existingItems = await db.posInventoryItem.count();
    if (existingItems > 5) {
      return NextResponse.json({
        error: "Store already has inventory. Demo data is for new stores only.",
      }, { status: 400 });
    }

    // Seed items
    for (const item of DEMO_ITEMS) {
      await db.posInventoryItem.create({
        data: {
          store_id: storeId,
          ...item,
          attributes: item.attributes as Record<string, unknown>,
        },
      });
    }

    // Seed customers
    for (const cust of DEMO_CUSTOMERS) {
      await db.posCustomer.create({
        data: {
          store_id: storeId,
          ...cust,
          credit_balance_cents: 0,
        },
      });
    }

    // Seed events
    const now = new Date();
    for (const evt of DEMO_EVENTS) {
      const starts = new Date(now);
      starts.setDate(starts.getDate() + evt.days_from_now);
      starts.setHours(18, 0, 0, 0);
      const ends = new Date(starts);
      ends.setHours(22, 0, 0, 0);

      await db.posEvent.create({
        data: {
          store_id: storeId,
          name: evt.name,
          event_type: evt.event_type,
          entry_fee_cents: evt.entry_fee_cents,
          max_players: evt.max_players,
          starts_at: starts,
          ends_at: ends,
        },
      });
    }

    return NextResponse.json({
      success: true,
      items: DEMO_ITEMS.length,
      customers: DEMO_CUSTOMERS.length,
      events: DEMO_EVENTS.length,
      message: `Added ${DEMO_ITEMS.length} products, ${DEMO_CUSTOMERS.length} customers, and ${DEMO_EVENTS.length} upcoming events.`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
