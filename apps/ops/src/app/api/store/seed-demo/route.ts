import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

const FIRST_NAMES = [
  "Liam","Noah","Oliver","James","Elijah","William","Henry","Lucas","Benjamin","Theodore",
  "Jack","Levi","Alexander","Mason","Ethan","Daniel","Jacob","Logan","Jackson","Sebastian",
  "Emma","Olivia","Charlotte","Amelia","Sophia","Isabella","Mia","Evelyn","Harper","Luna",
  "Camila","Gianna","Elizabeth","Eleanor","Chloe","Sofia","Layla","Riley","Zoey","Nora",
  "Lily","Hazel","Violet","Aurora","Savannah","Audrey","Brooklyn","Bella","Claire","Skylar",
];
const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
  "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
  "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
];

function generateDemoCustomers(count: number) {
  const customers = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    customers.push({
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@demo.example`,
      phone: `555-${String(1000 + i).padStart(4, "0")}`,
    });
  }
  return customers;
}

const DEMO_EVENTS = [
  { name: "Friday Night Magic", event_type: "fnm", entry_fee_cents: 500, max_players: 32, days_from_now: 3 },
  { name: "Commander Night", event_type: "casual", entry_fee_cents: 0, max_players: 40, days_from_now: 5 },
  { name: "Pokemon League", event_type: "league", entry_fee_cents: 0, max_players: 20, days_from_now: 7 },
];

export async function POST() {
  try {
    const { db, storeId } = await requirePermission("store.settings");

    // Check if demo data already exists
    const existingDemo = await db.posCustomer.count({
      where: { store_id: storeId, email: { endsWith: "@demo.example" } },
    });
    if (existingDemo > 0) {
      return NextResponse.json({
        error: "Demo data already seeded. Delete it first before re-seeding.",
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

    // Seed customers (100 for realistic pagination testing)
    const demoCustomers = generateDemoCustomers(100);
    for (const cust of demoCustomers) {
      await db.posCustomer.create({
        data: {
          store_id: storeId,
          ...cust,
          credit_balance_cents: Math.floor(Math.random() * 5000),
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
      customers: demoCustomers.length,
      events: DEMO_EVENTS.length,
      message: `Added ${DEMO_ITEMS.length} products, ${demoCustomers.length} customers, and ${DEMO_EVENTS.length} upcoming events.`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/store/seed-demo — remove all demo data                  */
/*  Cleans up demo customers (@demo.example), seeded inventory, events  */
/* ------------------------------------------------------------------ */
export async function DELETE(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("store.settings");

    const body = await request.json().catch(() => ({})) as { clear_all?: boolean };
    const clearAll = body.clear_all === true;

    const deleted: Record<string, number> = {};

    if (clearAll) {
      // Nuclear option: clear ALL store data (for fresh start)
      // Order matters — delete children before parents to avoid FK violations

      // Delete child records first
      const consignment = await db.posConsignmentItem.deleteMany({ where: { store_id: storeId } });
      deleted.consignment = consignment.count;

      const loyaltyEntries = await db.posLoyaltyEntry.deleteMany({ where: { store_id: storeId } });
      deleted.loyalty_entries = loyaltyEntries.count;

      const ledger = await db.posLedgerEntry.deleteMany({ where: { store_id: storeId } });
      deleted.ledger_entries = ledger.count;

      const tabItems = await prisma.$executeRawUnsafe(
        `DELETE FROM pos_tab_items WHERE tab_id IN (SELECT id FROM pos_tabs WHERE store_id = $1)`, storeId
      );
      deleted.tab_items = typeof tabItems === 'number' ? tabItems : 0;

      const tabs = await db.posTab.deleteMany({ where: { store_id: storeId } });
      deleted.tabs = tabs.count;

      const gameCheckouts = await db.posGameCheckout.deleteMany({ where: { store_id: storeId } });
      deleted.game_checkouts = gameCheckouts.count;

      const giftCards = await db.posGiftCard.deleteMany({ where: { store_id: storeId } });
      deleted.gift_cards = giftCards.count;

      // Now safe to delete customers and inventory
      const customers = await db.posCustomer.deleteMany({ where: { store_id: storeId } });
      deleted.customers = customers.count;

      const inventory = await db.posInventoryItem.deleteMany({ where: { store_id: storeId } });
      deleted.inventory = inventory.count;

      const events = await db.posEvent.deleteMany({ where: { store_id: storeId } });
      deleted.events = events.count;

      const total = Object.values(deleted).reduce((s, n) => s + n, 0);
      return NextResponse.json({
        success: true,
        deleted,
        message: `Cleared ${total} records from store.`,
      });
    }

    // Default: only delete demo data
    // Delete consignment items for demo customers first
    const demoCustomerIds = await db.posCustomer.findMany({
      where: { store_id: storeId, email: { endsWith: "@demo.example" } },
      select: { id: true },
    });
    const demoIds = demoCustomerIds.map(c => c.id);

    if (demoIds.length > 0) {
      await db.posConsignmentItem.deleteMany({
        where: { store_id: storeId, consignor_id: { in: demoIds } },
      });
      await db.posLoyaltyEntry.deleteMany({
        where: { store_id: storeId, customer_id: { in: demoIds } },
      });
      await db.posLedgerEntry.deleteMany({
        where: { store_id: storeId, customer_id: { in: demoIds } },
      });
    }

    const deletedCustomers = await db.posCustomer.deleteMany({
      where: { store_id: storeId, email: { endsWith: "@demo.example" } },
    });
    deleted.customers = deletedCustomers.count;

    return NextResponse.json({
      success: true,
      deleted,
      message: `Removed ${deletedCustomers.count} demo customers.`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
