// Seed script for intelligence engine testing
// Generates synthetic data designed to trigger ALL insight types:
//   - Liquidity Runway (tight + healthy scenarios)
//   - Dead stock / bench warmers
//   - Overstock
//   - At-risk / MIA customers
//   - VIP hot streak
//   - New customer celebrations
//   - Store credit liability (high outstanding)
//   - Credit redemption velocity
//   - Cash-position-aware buylist (heavy cash payouts)
//   - WPN metrics (event frequency + engagement)
//   - Seasonal (prerelease, Q4, January cliff)
//   - Weekly revenue trends (up + down)
//   - Margin alerts (low margin categories)
//   - No staff clocked in
//   - Capital locked in inventory
//
// Run: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed-intelligence.js

const { Client } = require("pg");

const DB_URL =
  "postgres://6803da8f128670f8cffa9795d5686b98f6a63fe1050f83ad498d8529faaf5235:sk_Bk9J3LcdOe0vsJ0b2-GDS@db.prisma.io:5432/";
const STORE_ID = "885ccb77-6cc4-4868-b667-6cbf06f61ca8";

function cuid() {
  return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function daysAgo(d, h = 12) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(h, Math.floor(Math.random() * 60), 0, 0);
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
  console.log("Connected to database");

  // Get owner staff ID
  const {
    rows: [ownerStaff],
  } = await client.query(
    `SELECT id FROM pos_staff WHERE store_id = $1 AND role = 'owner' LIMIT 1`,
    [STORE_ID]
  );
  if (!ownerStaff) {
    console.error("No owner staff found for store", STORE_ID);
    process.exit(1);
  }
  const staffId = ownerStaff.id;
  console.log("Owner staff:", staffId);

  // ================================================================
  // STEP 1: Clean existing ledger, trade-ins, checkins, events
  // (preserves customers, inventory, staff)
  // ================================================================
  console.log("\n--- Cleaning existing transaction data ---");
  await client.query(
    "DELETE FROM pos_trade_in_items WHERE trade_in_id IN (SELECT id FROM pos_trade_ins WHERE store_id = $1)",
    [STORE_ID]
  );
  await client.query("DELETE FROM pos_trade_ins WHERE store_id = $1", [
    STORE_ID,
  ]);
  await client.query("DELETE FROM pos_event_checkins WHERE event_id IN (SELECT id FROM pos_events WHERE store_id = $1)", [
    STORE_ID,
  ]);
  await client.query("DELETE FROM pos_ledger_entries WHERE store_id = $1", [
    STORE_ID,
  ]);
  await client.query("DELETE FROM pos_events WHERE store_id = $1", [STORE_ID]);
  console.log("  Cleaned ledger, trade-ins, events, checkins");

  // ================================================================
  // STEP 2: Update store settings with intelligence preferences
  // ================================================================
  console.log("\n--- Setting intelligence preferences ---");
  const currentSettings = await client.query(
    "SELECT settings FROM pos_stores WHERE id = $1",
    [STORE_ID]
  );
  const settings = currentSettings.rows[0]?.settings || {};
  const newSettings = {
    ...settings,
    // Monthly fixed costs (realistic for small FLGS)
    intel_monthly_rent: 3200,
    intel_monthly_utilities: 450,
    intel_monthly_insurance: 280,
    intel_monthly_payroll: 4800,
    intel_monthly_other_fixed: 650, // POS fees, subscriptions, etc.
    // Thresholds
    intel_dead_stock_days: 30,
    intel_at_risk_days: 14,
    intel_buylist_cash_comfort_days: 14,
    intel_credit_liability_warn_percent: 50,
    intel_prefer_credit_buylists: false,
    // WPN Advanced level
    intel_wpn_level: "advanced",
    intel_seasonal_warnings: true,
    intel_advisor_enabled: true,
    intel_advisor_tone: "gamer",
  };
  await client.query("UPDATE pos_stores SET settings = $1::jsonb WHERE id = $2", [
    JSON.stringify(newSettings),
    STORE_ID,
  ]);
  console.log("  Monthly nut: $" + (3200 + 450 + 280 + 4800 + 650));
  console.log("  WPN Level: Advanced");
  console.log("  Advisor tone: Gamer");

  // ================================================================
  // STEP 3: Reset customer credit balances for testing
  // ================================================================
  console.log("\n--- Setting up customer credit balances ---");
  const { rows: customers } = await client.query(
    "SELECT id, name FROM pos_customers WHERE store_id = $1 ORDER BY name",
    [STORE_ID]
  );
  console.log("  Found", customers.length, "customers");

  // Give specific customers large credit balances (for liability testing)
  // Total should be ~60% of monthly revenue to trigger warning
  const creditAssignments = [
    [0, 15000, 45], // $150, updated 45 days ago (stale)
    [1, 28500, 35], // $285, updated 35 days ago (stale)
    [3, 8700, 5],   // $87, recent
    [4, 42000, 60], // $420, very stale
    [6, 19500, 40], // $195, stale
    [7, 5200, 3],   // $52, recent
    [9, 31000, 50], // $310, stale
    [13, 65000, 55],// $650, large & stale
    [16, 12000, 8], // $120, recent
    [19, 22000, 42],// $220, stale
    [24, 18500, 38],// $185, stale
    [27, 9800, 2],  // $98, recent
  ];

  for (const [idx, cents, daysBack] of creditAssignments) {
    if (customers[idx]) {
      const updatedAt = daysAgo(daysBack);
      await client.query(
        "UPDATE pos_customers SET credit_balance_cents = $1, updated_at = $2 WHERE id = $3",
        [cents, updatedAt, customers[idx].id]
      );
    }
  }
  const totalCredit = creditAssignments.reduce((s, [, c]) => s + c, 0);
  console.log("  Total outstanding credit: $" + (totalCredit / 100).toFixed(2));

  // ================================================================
  // STEP 4: Reset inventory quantities & create dead stock
  // ================================================================
  console.log("\n--- Setting up inventory for intelligence testing ---");
  const { rows: inventory } = await client.query(
    "SELECT id, name, category, price_cents, cost_cents FROM pos_inventory_items WHERE store_id = $1 AND active = true",
    [STORE_ID]
  );
  console.log("  Found", inventory.length, "active items");

  // Set some items to very low stock (reorder alerts)
  const lowStockItems = inventory.filter(
    (i) => i.category === "tcg_single"
  ).slice(0, 5);
  for (const item of lowStockItems) {
    await client.query(
      "UPDATE pos_inventory_items SET quantity = $1, low_stock_threshold = 5 WHERE id = $2",
      [Math.floor(Math.random() * 3) + 1, item.id]
    );
  }
  console.log("  Set", lowStockItems.length, "items to low stock");

  // Set some items to overstock (3+ months supply)
  const overstockItems = inventory
    .filter((i) => i.category === "sealed")
    .slice(0, 3);
  for (const item of overstockItems) {
    await client.query(
      "UPDATE pos_inventory_items SET quantity = $1 WHERE id = $2",
      [25 + Math.floor(Math.random() * 15), item.id]
    );
  }
  console.log("  Set", overstockItems.length, "items to overstock");

  // Create dead stock items (old, no sales)
  const deadStockNames = [
    ["Flesh & Blood Tales of Aria Box", "sealed", 8999, 6500, 4, 65],
    ["WH40K Kill Team Starter", "miniature", 6500, 4000, 3, 70],
    ["Force of Will Booster Box", "sealed", 4999, 3500, 2, 90],
    ["Digimon TCG Starter Deck", "sealed", 1499, 900, 6, 55],
    ["Star Wars Unlimited Booster Box", "sealed", 10999, 7200, 3, 45],
    ["One Piece TCG OP-03 Box", "sealed", 8999, 6000, 2, 80],
    ["Arkham Horror LCG Core Set", "board_game", 4999, 2800, 2, 120],
    ["Everdell", "board_game", 5999, 3500, 3, 50],
  ];

  for (const [name, cat, price, cost, qty, daysOld] of deadStockNames) {
    const createdAt = daysAgo(daysOld);
    await client.query(
      `INSERT INTO pos_inventory_items (id, store_id, name, category, price_cents, cost_cents, quantity, attributes, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', true, $8, $8)
       ON CONFLICT DO NOTHING`,
      [cuid(), STORE_ID, name, cat, price, cost, qty, createdAt]
    );
  }
  console.log("  Created", deadStockNames.length, "dead stock items");

  // Reload inventory with new items
  const { rows: allItems } = await client.query(
    "SELECT id, name, category, price_cents, cost_cents, quantity FROM pos_inventory_items WHERE store_id = $1 AND active = true",
    [STORE_ID]
  );

  // ================================================================
  // STEP 5: Create events (mix of past and future)
  // ================================================================
  console.log("\n--- Creating events ---");
  const events = [
    // Past events (revenue + attendance data)
    ["Friday Night Magic - Standard", "fnm", -42, 18, 500, 32],
    ["Friday Night Magic - Modern", "fnm", -35, 18, 500, 32],
    ["Friday Night Magic - Draft", "fnm", -28, 18, 1500, 24],
    ["Friday Night Magic - Pioneer", "fnm", -21, 18, 500, 32],
    ["Friday Night Magic - Standard", "fnm", -14, 18, 500, 32],
    ["Friday Night Magic - Modern", "fnm", -7, 18, 500, 32],
    ["Commander Night", "casual", -25, 18, 0, 40],
    ["Commander Night", "casual", -18, 18, 0, 40],
    ["Commander Night", "casual", -11, 18, 0, 40],
    ["Commander Night", "casual", -4, 18, 0, 40],
    ["Pokemon League", "league", -20, 17, 0, 20],
    ["Pokemon League", "league", -6, 17, 0, 20],
    ["Lorcana Tournament", "tournament", -15, 18, 500, 16],
    ["Modern 1K", "tournament", -30, 10, 2500, 64],
    ["Board Game Night", "casual", -9, 18, 0, 40],
    ["Yu-Gi-Oh! Locals", "tournament", -8, 14, 500, 16],
    ["Prerelease: Thunder Junction", "prerelease", -45, 12, 3000, 48],
    // Future events (upcoming count)
    ["FNM - Pioneer", "fnm", 3, 18, 500, 32],
    ["Commander Night", "casual", 4, 18, 0, 40],
    ["Draft Night", "draft", 6, 18, 2000, 24],
  ];

  const eventIds = [];
  for (const [name, type, dayOff, hr, fee, maxP] of events) {
    const id = cuid();
    const sa = dayOff < 0 ? daysAgo(-dayOff, hr) : daysFromNow(dayOff, hr);
    const ea =
      dayOff < 0 ? daysAgo(-dayOff, hr + 4) : daysFromNow(dayOff, hr + 4);
    await client.query(
      "INSERT INTO pos_events (id, store_id, name, event_type, starts_at, ends_at, entry_fee_cents, max_players) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, STORE_ID, name, type, sa, ea, fee, maxP]
    );
    eventIds.push({ id, name, fee, dayOff, type });
  }
  console.log("  Created", eventIds.length, "events");

  // ================================================================
  // STEP 6: Check-ins + event ledger for past events
  // ================================================================
  console.log("\n--- Creating check-ins and event revenue ---");
  const pastEvents = eventIds.filter((e) => e.dayOff < 0);
  let checkinCount = 0;
  let ledgerCount = 0;

  for (const evt of pastEvents) {
    // Attendance varies: FNM 12-22, prerelease 20-35, commander 8-18, others 6-14
    let minN, maxN;
    switch (evt.type) {
      case "prerelease":
        minN = 20; maxN = 35; break;
      case "fnm":
        minN = 12; maxN = 22; break;
      case "casual":
        minN = 8; maxN = 18; break;
      default:
        minN = 6; maxN = 14;
    }
    const n = Math.floor(Math.random() * (maxN - minN + 1)) + minN;
    const shuffled = [...customers]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(n, customers.length));

    for (const cust of shuffled) {
      let lid = null;
      if (evt.fee > 0) {
        lid = cuid();
        await client.query(
          "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,event_id,amount_cents,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            lid, STORE_ID, "event_fee", cust.id, staffId, evt.id, evt.fee,
            "Entry: " + evt.name, daysAgo(-evt.dayOff, 18),
          ]
        );
        ledgerCount++;
      }
      await client.query(
        "INSERT INTO pos_event_checkins (id,event_id,customer_id,fee_paid,ledger_entry_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [cuid(), evt.id, cust.id, evt.fee > 0, lid]
      );
      checkinCount++;
    }

    // Tagged sales during events (snacks, sleeves, singles)
    const eventSaleCount = Math.floor(Math.random() * 8) + 3;
    for (let i = 0; i < eventSaleCount; i++) {
      const c = shuffled[Math.floor(Math.random() * shuffled.length)];
      // Mix of snacks and accessories
      const saleItems = allItems.filter(
        (it) => it.category === "food_drink" || it.category === "accessory"
      );
      const item = saleItems[Math.floor(Math.random() * saleItems.length)];
      if (!item) continue;
      const qty = 1;
      await client.query(
        `INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,event_id,amount_cents,description,metadata,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
        [
          cuid(), STORE_ID, "sale", c.id, staffId, evt.id,
          item.price_cents * qty, "Sale during " + evt.name,
          JSON.stringify({ items: [{ inventory_item_id: item.id, quantity: qty, price_cents: item.price_cents }] }),
          daysAgo(-evt.dayOff, 19),
        ]
      );
      ledgerCount++;
    }
  }
  console.log("  Check-ins:", checkinCount, "Event ledger:", ledgerCount);

  // ================================================================
  // STEP 7: Daily sales data (30 days, with weekly trend)
  // ================================================================
  console.log("\n--- Creating daily sales ---");
  let salesCount = 0;

  // Week-by-week pattern: dip, recover, spike, current
  // This creates a revenue-down trend for last week vs this week
  const weeklyPatterns = [
    { start: 29, end: 22, salesPerDay: [8, 10, 9, 7, 12, 18, 6] },   // 4 weeks ago (normal)
    { start: 21, end: 15, salesPerDay: [9, 11, 10, 8, 14, 20, 7] },   // 3 weeks ago (growing)
    { start: 14, end: 8, salesPerDay: [12, 14, 13, 11, 16, 25, 9] },  // 2 weeks ago (spike - had big event)
    { start: 7, end: 1, salesPerDay: [7, 8, 7, 6, 10, 15, 5] },       // last week (down - triggers warning)
  ];

  // Categorized items for realistic sales mix
  const singleItems = allItems.filter((i) => i.category === "tcg_single");
  const sealedItems = allItems.filter((i) => i.category === "sealed");
  const boardGames = allItems.filter((i) => i.category === "board_game");
  const accessories = allItems.filter((i) => i.category === "accessory");
  const food = allItems.filter((i) => i.category === "food_drink");

  function pickItem(category) {
    switch (category) {
      case "single": return singleItems[Math.floor(Math.random() * singleItems.length)];
      case "sealed": return sealedItems[Math.floor(Math.random() * sealedItems.length)];
      case "board": return boardGames[Math.floor(Math.random() * boardGames.length)];
      case "accessory": return accessories[Math.floor(Math.random() * accessories.length)];
      case "food": return food[Math.floor(Math.random() * food.length)];
      default: return allItems[Math.floor(Math.random() * allItems.length)];
    }
  }

  // Sales mix weights: 40% singles, 15% sealed, 10% board games, 15% accessories, 20% food
  function randomCategory() {
    const r = Math.random();
    if (r < 0.40) return "single";
    if (r < 0.55) return "sealed";
    if (r < 0.65) return "board";
    if (r < 0.80) return "accessory";
    return "food";
  }

  for (const week of weeklyPatterns) {
    for (let d = week.start; d >= week.end; d--) {
      const dayIdx = week.start - d;
      const numSales = weeklyPatterns.indexOf(week) >= 0
        ? week.salesPerDay[dayIdx % 7] + Math.floor(Math.random() * 3) - 1
        : 10;

      for (let s = 0; s < numSales; s++) {
        const hasCustomer = Math.random() > 0.3;
        const c = hasCustomer
          ? customers[Math.floor(Math.random() * customers.length)]
          : null;
        const category = randomCategory();
        const item = pickItem(category);
        if (!item) continue;

        const qty = category === "food" ? Math.floor(Math.random() * 3) + 1 : 1;
        const amount = item.price_cents * qty;

        // Some sales use store credit (for redemption velocity tracking)
        const usesCredit = hasCustomer && Math.random() < 0.08; // 8% of sales
        const creditUsed = usesCredit ? Math.min(amount, 5000) : 0;

        await client.query(
          `INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,credit_amount_cents,description,metadata,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
          [
            cuid(), STORE_ID, "sale", c?.id || null, staffId,
            amount, creditUsed,
            "Sale: " + item.name + (qty > 1 ? ` x${qty}` : ""),
            JSON.stringify({ items: [{ inventory_item_id: item.id, quantity: qty, price_cents: item.price_cents }] }),
            daysAgo(d, 10 + Math.floor(Math.random() * 10)),
          ]
        );
        salesCount++;
      }
    }
  }
  console.log("  Created", salesCount, "daily sales");

  // ================================================================
  // STEP 8: VIP hot streak — one customer with $200+ this week
  // ================================================================
  console.log("\n--- Creating VIP hot streak ---");
  const vip = customers[4]; // Dylan Chen
  if (vip) {
    for (let i = 0; i < 5; i++) {
      const item = singleItems[Math.floor(Math.random() * singleItems.length)];
      if (!item) continue;
      await client.query(
        `INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,description,metadata,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          cuid(), STORE_ID, "sale", vip.id, staffId,
          item.price_cents, "Sale: " + item.name,
          JSON.stringify({ items: [{ inventory_item_id: item.id, quantity: 1, price_cents: item.price_cents }] }),
          daysAgo(Math.floor(Math.random() * 5) + 1, 14),
        ]
      );
    }
    console.log("  VIP:", vip.name, "— 5 big purchases this week");
  }

  // ================================================================
  // STEP 9: New customers (created in last 7 days, some with purchases)
  // ================================================================
  console.log("\n--- Creating new customers ---");
  const newCusts = [
    ["Zara Mitchell", "zara.m@gmail.com", "503-555-0201"],
    ["Tyler Pham", "tylerpham@outlook.com", "503-555-0202"],
    ["Luna Reyes", "luna.r@gmail.com", "503-555-0203"],
  ];
  const newCustIds = [];
  for (const [name, email, phone] of newCusts) {
    const id = cuid();
    const createdAt = daysAgo(Math.floor(Math.random() * 5) + 1);
    await client.query(
      "INSERT INTO pos_customers (id, store_id, name, email, phone, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, STORE_ID, name, email, phone, createdAt]
    );
    newCustIds.push(id);
    // Give them a purchase
    const item = allItems[Math.floor(Math.random() * allItems.length)];
    if (item) {
      await client.query(
        `INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,description,metadata,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          cuid(), STORE_ID, "sale", id, staffId,
          item.price_cents, "Sale: " + item.name,
          JSON.stringify({ items: [{ inventory_item_id: item.id, quantity: 1, price_cents: item.price_cents }] }),
          createdAt,
        ]
      );
    }
  }
  console.log("  Created", newCusts.length, "new customers with purchases");

  // ================================================================
  // STEP 10: Trade-ins (mix of cash and credit payouts)
  // ================================================================
  console.log("\n--- Creating trade-ins ---");
  const trades = [
    // [customer_idx, items, payout_type, credit_bonus, days_ago]
    [0, [["Ragavan, Nimble Pilferer", 4000, 5500]], "cash", 0, 3],
    [1, [["Sheoldred, the Apocalypse", 4200, 6000]], "cash", 0, 5],
    [3, [["The One Ring", 3200, 4800], ["Orcish Bowmasters", 2200, 3200]], "credit", 30, 7],
    [4, [["Charizard ex", 3000, 4500]], "cash", 0, 10],
    [6, [["Force of Will", 5500, 8000]], "cash", 0, 12],
    [9, [["Mana Crypt", 10000, 15000]], "cash", 0, 15],
    [13, [["Umbreon VMAX (Alt Art)", 25000, 35000]], "credit", 30, 18],
    [16, [["Cavern of Souls", 3500, 5000]], "cash", 0, 20],
    [19, [["Stitch - Rock Star (Enchanted)", 8000, 12000]], "cash", 0, 22],
    [24, [["Pikachu VMAX (Rainbow)", 20000, 28000]], "cash", 0, 25],
    [7, [["Snapcaster Mage", 1000, 1500], ["Thoughtseize", 1200, 1800]], "credit", 30, 2],
    [27, [["Arid Mesa", 1500, 2500]], "cash", 0, 8],
  ];

  let tradeCount = 0;
  let totalCashPayout = 0;
  let totalCreditPayout = 0;

  for (const [ci, tradeItems, payout, bonus, dago] of trades) {
    const cust = customers[ci];
    if (!cust) continue;
    const total = tradeItems.reduce((s, [, o]) => s + o, 0);
    const totalPay =
      payout === "credit" ? Math.round(total * (1 + bonus / 100)) : total;
    const ca = daysAgo(dago);
    const tid = cuid();
    const lid = cuid();

    if (payout === "cash") totalCashPayout += totalPay;
    else totalCreditPayout += totalPay;

    await client.query(
      "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,credit_amount_cents,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        lid, STORE_ID, "trade_in", cust.id, staffId,
        -total, payout === "credit" ? totalPay : 0,
        "Trade: " + tradeItems.map(([n]) => n).join(", "), ca,
      ]
    );
    await client.query(
      "INSERT INTO pos_trade_ins (id,store_id,customer_id,staff_id,status,payout_type,total_offer_cents,credit_bonus_percent,total_payout_cents,ledger_entry_id,created_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        tid, STORE_ID, cust.id, staffId, "completed", payout,
        total, bonus, totalPay, lid, ca, ca,
      ]
    );
    for (const [name, offer, market] of tradeItems) {
      await client.query(
        `INSERT INTO pos_trade_in_items (id,trade_in_id,name,category,attributes,quantity,market_price_cents,offer_price_cents) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
        [
          cuid(), tid, name, "tcg_single",
          '{"condition":"NM"}', 1, market, offer,
        ]
      );
    }
    tradeCount++;
  }
  console.log("  Created", tradeCount, "trade-ins");
  console.log("    Cash payouts:   $" + (totalCashPayout / 100).toFixed(2));
  console.log("    Credit payouts: $" + (totalCreditPayout / 100).toFixed(2));
  console.log("    Cash/credit ratio:", Math.round((totalCashPayout / (totalCashPayout + totalCreditPayout)) * 100) + "% cash");

  // ================================================================
  // STEP 11: Some refunds (to create payouts in ledger)
  // ================================================================
  console.log("\n--- Creating refunds ---");
  for (let i = 0; i < 4; i++) {
    const c = customers[Math.floor(Math.random() * customers.length)];
    const item = allItems[Math.floor(Math.random() * allItems.length)];
    if (!item) continue;
    await client.query(
      "INSERT INTO pos_ledger_entries (id,store_id,type,customer_id,staff_id,amount_cents,description,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        cuid(), STORE_ID, "refund", c.id, staffId,
        -item.price_cents, "Refund: " + item.name,
        daysAgo(Math.floor(Math.random() * 20) + 1),
      ]
    );
  }
  console.log("  Created 4 refunds");

  // ================================================================
  // SUMMARY
  // ================================================================
  // Count totals for summary
  const { rows: [ledgerTotals] } = await client.query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN type = 'sale' THEN amount_cents ELSE 0 END) as revenue,
       SUM(CASE WHEN type = 'trade_in' THEN ABS(amount_cents) ELSE 0 END) as trade_payouts,
       SUM(CASE WHEN type = 'event_fee' THEN amount_cents ELSE 0 END) as event_fees,
       SUM(CASE WHEN type = 'refund' THEN ABS(amount_cents) ELSE 0 END) as refunds
     FROM pos_ledger_entries WHERE store_id = $1`,
    [STORE_ID]
  );

  const { rows: [invTotals] } = await client.query(
    `SELECT COUNT(*) as items, SUM(cost_cents * quantity) as total_cost
     FROM pos_inventory_items WHERE store_id = $1 AND active = true`,
    [STORE_ID]
  );

  const { rows: [creditTotals] } = await client.query(
    `SELECT COUNT(*) as count, SUM(credit_balance_cents) as total
     FROM pos_customers WHERE store_id = $1 AND credit_balance_cents > 0`,
    [STORE_ID]
  );

  console.log("\n========================================");
  console.log("  INTELLIGENCE SEED COMPLETE");
  console.log("========================================");
  console.log("  Ledger entries:", ledgerTotals.total);
  console.log("  Revenue (30d):  $" + (Number(ledgerTotals.revenue) / 100).toFixed(2));
  console.log("  Event fees:     $" + (Number(ledgerTotals.event_fees) / 100).toFixed(2));
  console.log("  Trade payouts:  $" + (Number(ledgerTotals.trade_payouts) / 100).toFixed(2));
  console.log("  Refunds:        $" + (Number(ledgerTotals.refunds) / 100).toFixed(2));
  console.log("  Inventory items:", invTotals.items);
  console.log("  Inventory cost: $" + (Number(invTotals.total_cost) / 100).toFixed(2));
  console.log("  Credit holders:", creditTotals.count);
  console.log("  Credit total:   $" + (Number(creditTotals.total) / 100).toFixed(2));
  console.log("  Monthly nut:    $9,380");
  console.log("");
  console.log("  EXPECTED INSIGHTS:");
  console.log("  [x] Liquidity Runway (revenue vs $9,380/mo fixed)");
  console.log("  [x] Bench Warmers (8 dead stock items, $X trapped)");
  console.log("  [x] Reorder Alerts (5 low stock singles)");
  console.log("  [x] Overstock (3 sealed products)");
  console.log("  [x] Regulars MIA (high-spend customers inactive)");
  console.log("  [x] VIP Hot Streak (Dylan Chen)");
  console.log("  [x] New Faces (3 new customers)");
  console.log("  [x] Credit on the Books ($" + (Number(creditTotals.total) / 100).toFixed(0) + " outstanding)");
  console.log("  [x] Credit Collecting Dust (stale balances)");
  console.log("  [x] Buylist Cash Shift (75%+ cash payouts)");
  console.log("  [x] WPN Advanced metrics (event count + engagement)");
  console.log("  [x] Weekly Revenue Down (spike week → dip week)");
  console.log("  [x] Prerelease Season (April = set launch month)");
  console.log("  [x] Daily Summary (yesterday vs same day last week)");
  console.log("  [x] Capital Locked in Inventory");
  console.log("");

  await client.end();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
