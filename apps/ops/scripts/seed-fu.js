// Seed script for FU database
// Run: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed-fu.js

const { Client } = require("pg");
const { hash } = require("bcryptjs");

const DB_URL = "postgres://6803da8f128670f8cffa9795d5686b98f6a63fe1050f83ad498d8529faaf5235:sk_Bk9J3LcdOe0vsJ0b2-GDS@db.prisma.io:5432/";
const STORE_ID = "885ccb77-6cc4-4868-b667-6cbf06f61ca8";

function cuid() {
  return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function daysAgo(d, h = 12) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(h, 0, 0, 0);
  return dt.toISOString();
}
function daysFromNow(d, h = 12) {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(h, 0, 0, 0);
  return dt.toISOString();
}

async function seed() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const pw = await hash("password123", 12);

  // Get owner staff ID
  const { rows: [ownerStaff] } = await client.query(
    `SELECT id FROM pos_staff WHERE store_id = $1 AND role = 'owner' LIMIT 1`,
    [STORE_ID]
  );
  const staffId = ownerStaff.id;
  console.log("Owner staff:", staffId);

  // ---- DUMMY STAFF ----
  console.log("Creating staff users...");
  const userFields = `(id, email, "passwordHash", "displayName", role, "isActive", "createdAt", "updatedAt", "cultDevotion", "cultLevel", "achievementPoints", "emailVerified", "isBanned", "isMuted", "trustLevel", "flagCount", "employeeDiscount", "lifetimeValue", "membershipTier", "marketingConsent", "smsConsent", "smsVerified", "totpEnabled", "forumBanned", "chaosSessionsHosted", "reviewBanned", "identityVerified", "venueAddonActive", "isDeactivated", "tentativeIdVerified", "reportCount", "reputationScore")`;
  const userDefaults = `'USER', true, NOW(), NOW(), 0, 0, 0, false, false, false, 1, 0, 0, 0, 'FREE', false, false, false, false, false, 0, false, false, false, false, false, 0, 100`;

  await client.query(
    `INSERT INTO "User" ${userFields} VALUES ($1, 'manager@teststore.com', $2, 'Alex Chen', ${userDefaults}) ON CONFLICT (email) DO UPDATE SET "passwordHash" = $2`,
    [cuid(), pw]
  );
  const { rows: [mgr] } = await client.query(`SELECT id FROM "User" WHERE email = 'manager@teststore.com'`);
  await client.query(
    `INSERT INTO pos_staff (id, user_id, store_id, role, name) VALUES ($1, $2, $3, 'manager', 'Alex Chen') ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'manager'`,
    [cuid(), mgr.id, STORE_ID]
  );

  await client.query(
    `INSERT INTO "User" ${userFields} VALUES ($1, 'cashier@teststore.com', $2, 'Jamie Rivera', ${userDefaults}) ON CONFLICT (email) DO UPDATE SET "passwordHash" = $2`,
    [cuid(), pw]
  );
  const { rows: [cash] } = await client.query(`SELECT id FROM "User" WHERE email = 'cashier@teststore.com'`);
  await client.query(
    `INSERT INTO pos_staff (id, user_id, store_id, role, name) VALUES ($1, $2, $3, 'cashier', 'Jamie Rivera') ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'cashier'`,
    [cuid(), cash.id, STORE_ID]
  );
  console.log("  Manager: manager@teststore.com / password123");
  console.log("  Cashier: cashier@teststore.com / password123");

  // ---- CUSTOMERS ----
  console.log("Creating customers...");
  const custData = [
    ["Marcus Thompson", "marcus.t@gmail.com", "503-555-0101", 4250],
    ["Sarah Kim", "sarahkim@outlook.com", "503-555-0102", 12800],
    ["Jake Rivera", "jake.r@yahoo.com", "503-555-0103", 0],
    ["Emily Watson", "emwatson@gmail.com", "503-555-0104", 6700],
    ["Dylan Chen", "dylanc@proton.me", "503-555-0105", 23500],
    ["Olivia Park", "opark@gmail.com", "503-555-0106", 800],
    ["Noah Williams", "noahw@live.com", "503-555-0107", 15200],
    ["Ava Martinez", "ava.m@gmail.com", "503-555-0108", 3100],
    ["Liam Johnson", "liamj@outlook.com", "503-555-0109", 0],
    ["Sophia Brown", "sophiab@gmail.com", "503-555-0110", 9400],
    ["Ethan Davis", "ethd@yahoo.com", "503-555-0111", 1500],
    ["Isabella Moore", "isabella.m@gmail.com", "503-555-0112", 0],
    ["Mason Taylor", "masont@proton.me", "503-555-0113", 7800],
    ["Mia Anderson", "mia.a@gmail.com", "503-555-0114", 45000],
    ["Lucas Thomas", "lucast@outlook.com", "503-555-0115", 2200],
    ["Charlotte Jackson", "charlottej@gmail.com", "503-555-0116", 0],
    ["Aiden White", "aidenw@yahoo.com", "503-555-0117", 11000],
    ["Amelia Harris", "ameliah@gmail.com", "503-555-0118", 500],
    ["James Clark", "jclark@proton.me", "503-555-0119", 0],
    ["Harper Lewis", "harperl@gmail.com", "503-555-0120", 18900],
    ["Benjamin Young", "benyoung@outlook.com", "503-555-0121", 3400],
    ["Evelyn King", "evelynk@gmail.com", "503-555-0122", 0],
    ["Henry Wright", "henryw@yahoo.com", "503-555-0123", 6200],
    ["Scarlett Lopez", "scarlettl@gmail.com", "503-555-0124", 950],
    ["Sebastian Hill", "sebh@proton.me", "503-555-0125", 14600],
    ["Grace Scott", "graces@gmail.com", "503-555-0126", 0],
    ["Daniel Green", "dgreen@outlook.com", "503-555-0127", 8300],
    ["Chloe Adams", "chloea@gmail.com", "503-555-0128", 2700],
    ["Owen Baker", "owenb@yahoo.com", "503-555-0129", 0],
    ["Lily Nelson", "lilyn@gmail.com", "503-555-0130", 5100],
  ];

  const customerIds = [];
  for (const [name, email, phone, credit] of custData) {
    const id = cuid();
    await client.query(
      "INSERT INTO pos_customers (id, store_id, name, email, phone, credit_balance_cents) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, STORE_ID, name, email, phone, credit]
    );
    customerIds.push(id);
  }
  console.log("  Created", customerIds.length, "customers");

  // ---- INVENTORY ----
  console.log("Creating inventory...");
  const items = [
    ["Lightning Bolt", "tcg_single", 250, 100, 12, { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" }],
    ["Lightning Bolt (Foil)", "tcg_single", 750, 350, 3, { condition: "NM", foil: true, language: "EN", set: "Foundations", game: "MTG" }],
    ["Counterspell", "tcg_single", 150, 50, 20, { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" }],
    ["Fatal Push", "tcg_single", 350, 150, 8, { condition: "NM", foil: false, language: "EN", set: "Aetherdrift", game: "MTG" }],
    ["Arid Mesa", "tcg_single", 2500, 1200, 4, { condition: "NM", foil: false, language: "EN", set: "Modern Horizons 3", game: "MTG" }],
    ["Ragavan, Nimble Pilferer", "tcg_single", 5500, 3000, 2, { condition: "NM", foil: false, language: "EN", set: "MH2", game: "MTG" }],
    ["Sheoldred, the Apocalypse", "tcg_single", 6000, 3500, 3, { condition: "NM", foil: false, language: "EN", set: "DMU", game: "MTG" }],
    ["The One Ring", "tcg_single", 4800, 2800, 2, { condition: "NM", foil: false, language: "EN", set: "LOTR", game: "MTG" }],
    ["Orcish Bowmasters", "tcg_single", 3200, 1800, 5, { condition: "NM", foil: false, language: "EN", set: "LOTR", game: "MTG" }],
    ["Thoughtseize", "tcg_single", 1800, 900, 6, { condition: "LP", foil: false, language: "EN", set: "Theros", game: "MTG" }],
    ["Path to Exile", "tcg_single", 300, 100, 15, { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" }],
    ["Sol Ring", "tcg_single", 100, 30, 30, { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" }],
    ["Mana Crypt", "tcg_single", 15000, 9000, 1, { condition: "NM", foil: false, language: "EN", set: "MB2", game: "MTG" }],
    ["Force of Will", "tcg_single", 8000, 5000, 2, { condition: "LP", foil: false, language: "EN", set: "Alliances", game: "MTG" }],
    ["Cavern of Souls", "tcg_single", 5000, 3000, 3, { condition: "NM", foil: false, language: "EN", set: "LOTR", game: "MTG" }],
    ["Snapcaster Mage", "tcg_single", 1500, 800, 4, { condition: "LP", foil: false, language: "EN", set: "Innistrad", game: "MTG" }],
    ["Charizard ex", "tcg_single", 4500, 2500, 2, { condition: "NM", foil: false, language: "EN", set: "Prismatic Evolutions", game: "Pokemon" }],
    ["Pikachu VMAX (Rainbow)", "tcg_single", 28000, 18000, 1, { condition: "NM", foil: true, language: "EN", set: "Vivid Voltage", game: "Pokemon" }],
    ["Umbreon VMAX (Alt Art)", "tcg_single", 35000, 22000, 1, { condition: "NM", foil: false, language: "EN", set: "Evolving Skies", game: "Pokemon" }],
    ["Mew ex", "tcg_single", 1200, 600, 4, { condition: "NM", foil: false, language: "EN", set: "Prismatic Evolutions", game: "Pokemon" }],
    ["Elsa - Spirit of Winter", "tcg_single", 1500, 800, 3, { condition: "NM", foil: false, language: "EN", set: "First Chapter", game: "Lorcana" }],
    ["Stitch - Rock Star (Enchanted)", "tcg_single", 12000, 7000, 1, { condition: "NM", foil: true, language: "EN", set: "First Chapter", game: "Lorcana" }],
    ["MTG Foundations Play Booster Box", "sealed", 12999, 8500, 8, { game: "MTG", product_type: "booster_box" }],
    ["MTG Collector Booster Box", "sealed", 29999, 20000, 3, { game: "MTG", product_type: "collector_box" }],
    ["MTG Aetherdrift Booster Box", "sealed", 11999, 7800, 12, { game: "MTG", product_type: "booster_box" }],
    ["Pokemon Prismatic Evolutions ETB", "sealed", 6999, 4500, 6, { game: "Pokemon", product_type: "etb" }],
    ["Lorcana Shimmering Skies Box", "sealed", 11999, 7500, 5, { game: "Lorcana", product_type: "booster_box" }],
    ["MTG Commander Deck - Eldrazi", "sealed", 4499, 2800, 5, { game: "MTG", product_type: "commander_deck" }],
    ["Wingspan", "board_game", 6499, 3800, 4, { publisher: "Stonemaier", players: "1-5" }],
    ["Terraforming Mars", "board_game", 6999, 4200, 3, { publisher: "Stronghold", players: "1-5" }],
    ["Catan", "board_game", 4499, 2500, 6, { publisher: "Catan Studio", players: "3-4" }],
    ["Ticket to Ride", "board_game", 4499, 2500, 5, { publisher: "Days of Wonder", players: "2-5" }],
    ["Spirit Island", "board_game", 7999, 4800, 2, { publisher: "GTG", players: "1-4" }],
    ["Gloomhaven", "board_game", 14999, 9000, 2, { publisher: "Cephalofair", players: "1-4" }],
    ["Root", "board_game", 5999, 3500, 3, { publisher: "Leder Games", players: "2-4" }],
    ["Ark Nova", "board_game", 6999, 4200, 2, { publisher: "Capstone", players: "1-4" }],
    ["Codenames", "board_game", 1999, 1000, 8, { publisher: "CGE", players: "2-8" }],
    ["Dune: Imperium", "board_game", 4999, 2800, 3, { publisher: "Dire Wolf", players: "1-4" }],
    ["WH40K Combat Patrol: Space Marines", "miniature", 16000, 10000, 2, { system: "Warhammer 40K" }],
    ["Citadel Paint Set", "miniature", 3600, 2000, 6, { type: "paint" }],
    ["Eclipse Sleeves (100ct) Black", "accessory", 1099, 550, 40, { type: "sleeves" }],
    ["Dragon Shield Matte Crimson", "accessory", 1199, 600, 25, { type: "sleeves" }],
    ["Ultra Pro 9-Pocket Binder", "accessory", 2499, 1200, 10, { type: "binder" }],
    ["BCW Toploader (25ct)", "accessory", 499, 200, 50, { type: "toploader" }],
    ["Chessex 7-Die Set", "accessory", 999, 400, 20, { type: "dice" }],
    ["Drip Coffee (12oz)", "food_drink", 300, 50, 999, { type: "hot_drink" }],
    ["Latte (16oz)", "food_drink", 550, 100, 999, { type: "hot_drink" }],
    ["Iced Americano", "food_drink", 450, 75, 999, { type: "cold_drink" }],
    ["Monster Energy", "food_drink", 350, 150, 48, { type: "canned" }],
    ["Bottled Water", "food_drink", 200, 30, 100, { type: "bottled" }],
    ["Pizza Slice", "food_drink", 350, 100, 30, { type: "food" }],
    ["Soft Pretzel", "food_drink", 400, 100, 20, { type: "food" }],
  ];

  const itemIds = [];
  for (const [name, cat, price, cost, qty, attrs] of items) {
    const id = cuid();
    await client.query(
      "INSERT INTO pos_inventory_items (id, store_id, name, category, price_cents, cost_cents, quantity, attributes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [id, STORE_ID, name, cat, price, cost, qty, JSON.stringify(attrs)]
    );
    itemIds.push({ id, name, price });
  }
  console.log("  Created", itemIds.length, "inventory items");

  // ---- EVENTS ----
  console.log("Creating events...");
  const evts = [
    ["Friday Night Magic - Standard", "fnm", -28, 18, 500, 32],
    ["Friday Night Magic - Modern", "fnm", -21, 18, 500, 32],
    ["Friday Night Magic - Draft", "fnm", -14, 18, 1500, 24],
    ["Friday Night Magic - Standard", "fnm", -7, 18, 500, 32],
    ["Aetherdrift Prerelease Sat", "prerelease", -35, 12, 3000, 48],
    ["Pokemon League Night", "league", -10, 17, 0, 20],
    ["Lorcana Tournament", "tournament", -12, 18, 500, 16],
    ["Board Game Night", "casual", -5, 18, 0, 40],
    ["Modern 1K", "tournament", -20, 10, 2500, 64],
    ["Commander Night", "casual", -3, 18, 0, 40],
    ["Yu-Gi-Oh! Locals", "tournament", -6, 14, 500, 16],
    ["FNM - Pioneer", "fnm", 3, 18, 500, 32],
    ["Pokemon League", "league", 4, 17, 0, 20],
    ["SW Unlimited Launch", "prerelease", 10, 12, 2500, 32],
    ["Board Game Night", "casual", 9, 18, 0, 40],
    ["Commander Night", "casual", 4, 18, 0, 40],
    ["Modern 2K Championship", "tournament", 17, 10, 3500, 64],
    ["Draft Night - MB2", "draft", 6, 18, 2000, 24],
    ["Lorcana Tournament", "tournament", 2, 18, 500, 16],
  ];

  const eventIds = [];
  for (const [name, type, dayOff, hr, fee, maxP] of evts) {
    const id = cuid();
    const sa = dayOff < 0 ? daysAgo(-dayOff, hr) : daysFromNow(dayOff, hr);
    const ea = dayOff < 0 ? daysAgo(-dayOff, hr + 4) : daysFromNow(dayOff, hr + 4);
    await client.query(
      "INSERT INTO pos_events (id, store_id, name, event_type, starts_at, ends_at, entry_fee_cents, max_players) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, STORE_ID, name, type, sa, ea, fee, maxP]
    );
    eventIds.push({ id, name, fee, dayOff });
  }
  console.log("  Created", eventIds.length, "events");

  // ---- CHECK-INS + EVENT LEDGER ----
  console.log("Creating check-ins...");
  const pastEvents = eventIds.filter((e) => e.dayOff < 0);
  let checkins = 0, ledger = 0;

  for (const evt of pastEvents) {
    const n = Math.floor(Math.random() * 15) + 5;
    const shuffled = [...customerIds].sort(() => Math.random() - 0.5).slice(0, n);
    for (const custId of shuffled) {
      let lid = null;
      if (evt.fee > 0) {
        lid = cuid();
        await client.query(
          "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,event_id,amount_cents,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [lid, STORE_ID, "event_fee", custId, staffId, evt.id, evt.fee, "Entry: " + evt.name]
        );
        ledger++;
      }
      await client.query(
        "INSERT INTO pos_event_checkins (id,event_id,customer_id,fee_paid,ledger_entry_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [cuid(), evt.id, custId, evt.fee > 0, lid]
      );
      checkins++;
    }
    // Tagged sales
    for (let i = 0; i < Math.floor(Math.random() * 6) + 2; i++) {
      const c = shuffled[Math.floor(Math.random() * shuffled.length)];
      const amt = [300, 350, 550, 1099, 250, 400][Math.floor(Math.random() * 6)];
      await client.query(
        "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,event_id,amount_cents,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [cuid(), STORE_ID, "sale", c, staffId, evt.id, amt, "Sale during " + evt.name, daysAgo(-evt.dayOff, 19)]
      );
      ledger++;
    }
  }
  console.log("  Check-ins:", checkins, "Ledger:", ledger);

  // ---- TRADE-INS ----
  console.log("Creating trade-ins...");
  const trades = [
    [0, [["Ragavan", 4000, 5500]], "credit", 30],
    [1, [["Sheoldred", 4200, 6000]], "cash", 0],
    [3, [["The One Ring", 3200, 4800], ["Bowmasters", 2200, 3200]], "credit", 30],
    [4, [["Charizard ex", 3000, 4500]], "credit", 25],
    [6, [["Force of Will", 5500, 8000]], "cash", 0],
    [9, [["Mana Crypt", 10000, 15000]], "credit", 30],
    [13, [["Umbreon VMAX", 25000, 35000]], "credit", 30],
    [16, [["Cavern of Souls", 3500, 5000]], "cash", 0],
    [19, [["Stitch Enchanted", 8000, 12000]], "credit", 30],
    [29, [["Pikachu VMAX", 20000, 28000]], "credit", 30],
  ];

  for (const [ci, tradeItems, payout, bonus] of trades) {
    const total = tradeItems.reduce((s, [, o]) => s + o, 0);
    const totalPay = payout === "credit" ? Math.round(total * (1 + bonus / 100)) : total;
    const ca = daysAgo(Math.floor(Math.random() * 30) + 1);
    const tid = cuid();
    const lid = cuid();
    await client.query(
      "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,credit_amount_cents,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [lid, STORE_ID, "trade_in", customerIds[ci], staffId, -total, payout === "credit" ? totalPay : 0, "Trade: " + tradeItems.map(([n]) => n).join(", "), ca]
    );
    await client.query(
      "INSERT INTO pos_trade_ins (id,store_id,customer_id,staff_id,status,payout_type,total_offer_cents,credit_bonus_percent,total_payout_cents,ledger_entry_id,created_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [tid, STORE_ID, customerIds[ci], staffId, "completed", payout, total, bonus, totalPay, lid, ca, ca]
    );
    for (const [name, offer, market] of tradeItems) {
      await client.query(
        `INSERT INTO pos_trade_in_items (id,trade_in_id,name,category,attributes,quantity,market_price_cents,offer_price_cents) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
        [cuid(), tid, name, "tcg_single", '{"condition":"NM"}', 1, market, offer]
      );
    }
  }
  console.log("  Created", trades.length, "trade-ins");

  // ---- DAILY SALES ----
  console.log("Creating daily sales...");
  let sales = 0;
  for (let d = 1; d <= 30; d++) {
    for (let s = 0; s < Math.floor(Math.random() * 15) + 5; s++) {
      const c = Math.random() > 0.4 ? customerIds[Math.floor(Math.random() * customerIds.length)] : null;
      const it = itemIds[Math.floor(Math.random() * itemIds.length)];
      await client.query(
        "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [cuid(), STORE_ID, "sale", c, staffId, it.price, "Sale: " + it.name, daysAgo(d, 10 + Math.floor(Math.random() * 10))]
      );
      sales++;
    }
  }
  console.log("  Created", sales, "daily sales");

  console.log("\n=== SEED COMPLETE ===");
  console.log("Accounts:");
  console.log("  Owner: Google sign-in (shawnoah.pollock@gmail.com)");
  console.log("  Manager: manager@teststore.com / password123");
  console.log("  Cashier: cashier@teststore.com / password123");

  await client.end();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
