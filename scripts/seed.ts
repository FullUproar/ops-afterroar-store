// Seed script: creates a fully populated demo store for ssp@fullproar.com
// Run with: npx tsx scripts/seed.ts

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bkrzpgtomyvsxrbngkib.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function seed() {
  console.log("Creating user...");
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: "ssp@fullproar.com",
    password: "demo1234!",
    email_confirm: true,
  });

  if (authError) {
    console.error("Auth error:", authError.message);
    // Try to get existing user
    const { data: users } = await supabase.auth.admin.listUsers();
    const existing = users?.users?.find((u) => u.email === "ssp@fullproar.com");
    if (!existing) throw authError;
    console.log("Using existing user:", existing.id);
    var userId = existing.id;
  } else {
    var userId = authData.user.id;
  }

  console.log("User ID:", userId);

  // Create store
  console.log("Creating store...");
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .insert({
      name: "Full Uproar Games & Café",
      slug: "full-uproar-games",
      owner_id: userId,
      address: {
        street: "742 Dice Boulevard",
        city: "Portland",
        state: "OR",
        zip: "97201",
      },
      settings: {
        credit_bonus_percent: 30,
        tax_rate: 0,
        currency: "USD",
      },
    })
    .select()
    .single();

  if (storeErr) throw storeErr;
  console.log("Store:", store.id);

  // Create staff
  console.log("Creating staff...");
  const { data: ownerStaff } = await supabase
    .from("staff")
    .insert({
      user_id: userId,
      store_id: store.id,
      role: "owner",
      name: "Shawn Pollock",
    })
    .select()
    .single();

  const { data: managerStaff } = await supabase
    .from("staff")
    .insert([
      { user_id: userId, store_id: store.id, role: "manager", name: "Alex Chen" },
    ])
    .select();

  // We'll use owner staff for all seeded transactions
  const staffId = ownerStaff!.id;

  // ============================================================
  // CUSTOMERS (30 regulars)
  // ============================================================
  console.log("Creating customers...");
  const customerData = [
    { name: "Marcus Thompson", email: "marcus.t@gmail.com", phone: "503-555-0101", credit_balance_cents: 4250 },
    { name: "Sarah Kim", email: "sarahkim@outlook.com", phone: "503-555-0102", credit_balance_cents: 12800 },
    { name: "Jake Rivera", email: "jake.r@yahoo.com", phone: "503-555-0103", credit_balance_cents: 0 },
    { name: "Emily Watson", email: "emwatson@gmail.com", phone: "503-555-0104", credit_balance_cents: 6700 },
    { name: "Dylan Chen", email: "dylanc@proton.me", phone: "503-555-0105", credit_balance_cents: 23500 },
    { name: "Olivia Park", email: "opark@gmail.com", phone: "503-555-0106", credit_balance_cents: 800 },
    { name: "Noah Williams", email: "noahw@live.com", phone: "503-555-0107", credit_balance_cents: 15200 },
    { name: "Ava Martinez", email: "ava.m@gmail.com", phone: "503-555-0108", credit_balance_cents: 3100 },
    { name: "Liam Johnson", email: "liamj@outlook.com", phone: "503-555-0109", credit_balance_cents: 0 },
    { name: "Sophia Brown", email: "sophiab@gmail.com", phone: "503-555-0110", credit_balance_cents: 9400 },
    { name: "Ethan Davis", email: "ethd@yahoo.com", phone: "503-555-0111", credit_balance_cents: 1500 },
    { name: "Isabella Moore", email: "isabella.m@gmail.com", phone: "503-555-0112", credit_balance_cents: 0 },
    { name: "Mason Taylor", email: "masont@proton.me", phone: "503-555-0113", credit_balance_cents: 7800 },
    { name: "Mia Anderson", email: "mia.a@gmail.com", phone: "503-555-0114", credit_balance_cents: 45000 },
    { name: "Lucas Thomas", email: "lucast@outlook.com", phone: "503-555-0115", credit_balance_cents: 2200 },
    { name: "Charlotte Jackson", email: "charlottej@gmail.com", phone: "503-555-0116", credit_balance_cents: 0 },
    { name: "Aiden White", email: "aidenw@yahoo.com", phone: "503-555-0117", credit_balance_cents: 11000 },
    { name: "Amelia Harris", email: "ameliah@gmail.com", phone: "503-555-0118", credit_balance_cents: 500 },
    { name: "James Clark", email: "jclark@proton.me", phone: "503-555-0119", credit_balance_cents: 0 },
    { name: "Harper Lewis", email: "harperl@gmail.com", phone: "503-555-0120", credit_balance_cents: 18900 },
    { name: "Benjamin Young", email: "benyoung@outlook.com", phone: "503-555-0121", credit_balance_cents: 3400 },
    { name: "Evelyn King", email: "evelynk@gmail.com", phone: "503-555-0122", credit_balance_cents: 0 },
    { name: "Henry Wright", email: "henryw@yahoo.com", phone: "503-555-0123", credit_balance_cents: 6200 },
    { name: "Scarlett Lopez", email: "scarlettl@gmail.com", phone: "503-555-0124", credit_balance_cents: 950 },
    { name: "Sebastian Hill", email: "sebh@proton.me", phone: "503-555-0125", credit_balance_cents: 14600 },
    { name: "Grace Scott", email: "graces@gmail.com", phone: "503-555-0126", credit_balance_cents: 0 },
    { name: "Daniel Green", email: "dgreen@outlook.com", phone: "503-555-0127", credit_balance_cents: 8300 },
    { name: "Chloe Adams", email: "chloea@gmail.com", phone: "503-555-0128", credit_balance_cents: 2700 },
    { name: "Owen Baker", email: "owenb@yahoo.com", phone: "503-555-0129", credit_balance_cents: 0 },
    { name: "Lily Nelson", email: "lilyn@gmail.com", phone: "503-555-0130", credit_balance_cents: 5100 },
  ].map((c) => ({ ...c, store_id: store.id }));

  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .insert(customerData)
    .select();

  if (custErr) throw custErr;
  console.log(`Created ${customers.length} customers`);

  // ============================================================
  // INVENTORY (150+ items across categories)
  // ============================================================
  console.log("Creating inventory...");

  const tcgSingles = [
    // MTG singles
    { name: "Lightning Bolt", price: 250, cost: 100, qty: 12, attrs: { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Lightning Bolt (Foil)", price: 750, cost: 350, qty: 3, attrs: { condition: "NM", foil: true, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Counterspell", price: 150, cost: 50, qty: 20, attrs: { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Fatal Push", price: 350, cost: 150, qty: 8, attrs: { condition: "NM", foil: false, language: "EN", set: "Aetherdrift", game: "MTG" } },
    { name: "Arid Mesa", price: 2500, cost: 1200, qty: 4, attrs: { condition: "NM", foil: false, language: "EN", set: "Modern Horizons 3", game: "MTG" } },
    { name: "Arid Mesa (Foil)", price: 4500, cost: 2500, qty: 1, attrs: { condition: "NM", foil: true, language: "EN", set: "Modern Horizons 3", game: "MTG" } },
    { name: "Ragavan, Nimble Pilferer", price: 5500, cost: 3000, qty: 2, attrs: { condition: "NM", foil: false, language: "EN", set: "Modern Horizons 2", game: "MTG" } },
    { name: "Sheoldred, the Apocalypse", price: 6000, cost: 3500, qty: 3, attrs: { condition: "NM", foil: false, language: "EN", set: "Dominaria United", game: "MTG" } },
    { name: "The One Ring", price: 4800, cost: 2800, qty: 2, attrs: { condition: "NM", foil: false, language: "EN", set: "LOTR: Tales of Middle-earth", game: "MTG" } },
    { name: "Orcish Bowmasters", price: 3200, cost: 1800, qty: 5, attrs: { condition: "NM", foil: false, language: "EN", set: "LOTR: Tales of Middle-earth", game: "MTG" } },
    { name: "Thoughtseize", price: 1800, cost: 900, qty: 6, attrs: { condition: "LP", foil: false, language: "EN", set: "Theros", game: "MTG" } },
    { name: "Path to Exile", price: 300, cost: 100, qty: 15, attrs: { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Swords to Plowshares", price: 200, cost: 75, qty: 18, attrs: { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Brainstorm", price: 125, cost: 40, qty: 25, attrs: { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Sol Ring", price: 100, cost: 30, qty: 30, attrs: { condition: "NM", foil: false, language: "EN", set: "Foundations", game: "MTG" } },
    { name: "Mana Crypt", price: 15000, cost: 9000, qty: 1, attrs: { condition: "NM", foil: false, language: "EN", set: "Mystery Booster 2", game: "MTG" } },
    { name: "Force of Will", price: 8000, cost: 5000, qty: 2, attrs: { condition: "LP", foil: false, language: "EN", set: "Alliances", game: "MTG" } },
    { name: "Liliana of the Veil", price: 2200, cost: 1200, qty: 3, attrs: { condition: "NM", foil: false, language: "EN", set: "Innistrad", game: "MTG" } },
    { name: "Wrenn and Six", price: 4000, cost: 2200, qty: 2, attrs: { condition: "NM", foil: false, language: "EN", set: "Modern Horizons", game: "MTG" } },
    { name: "Cavern of Souls", price: 5000, cost: 3000, qty: 3, attrs: { condition: "NM", foil: false, language: "EN", set: "LOTR: Tales of Middle-earth", game: "MTG" } },
    // Pokemon singles
    { name: "Charizard ex", price: 4500, cost: 2500, qty: 2, attrs: { condition: "NM", foil: false, language: "EN", set: "Prismatic Evolutions", game: "Pokemon" } },
    { name: "Pikachu VMAX (Rainbow)", price: 28000, cost: 18000, qty: 1, attrs: { condition: "NM", foil: true, language: "EN", set: "Vivid Voltage", game: "Pokemon" } },
    { name: "Umbreon VMAX (Alt Art)", price: 35000, cost: 22000, qty: 1, attrs: { condition: "NM", foil: false, language: "EN", set: "Evolving Skies", game: "Pokemon" } },
    { name: "Mew ex", price: 1200, cost: 600, qty: 4, attrs: { condition: "NM", foil: false, language: "EN", set: "Prismatic Evolutions", game: "Pokemon" } },
    { name: "Gardevoir ex", price: 800, cost: 400, qty: 6, attrs: { condition: "NM", foil: false, language: "EN", set: "Prismatic Evolutions", game: "Pokemon" } },
    // Lorcana singles
    { name: "Elsa - Spirit of Winter", price: 1500, cost: 800, qty: 3, attrs: { condition: "NM", foil: false, language: "EN", set: "The First Chapter", game: "Lorcana" } },
    { name: "Stitch - Rock Star (Enchanted)", price: 12000, cost: 7000, qty: 1, attrs: { condition: "NM", foil: true, language: "EN", set: "The First Chapter", game: "Lorcana" } },
    { name: "Mickey Mouse - Brave Little Tailor", price: 500, cost: 250, qty: 5, attrs: { condition: "NM", foil: false, language: "EN", set: "Rise of the Floodborn", game: "Lorcana" } },
    // Yu-Gi-Oh
    { name: "Ash Blossom & Joyous Spring", price: 1000, cost: 500, qty: 8, attrs: { condition: "NM", foil: false, language: "EN", set: "Maximum Gold", game: "Yu-Gi-Oh" } },
    { name: "Nibiru, the Primal Being", price: 400, cost: 150, qty: 10, attrs: { condition: "NM", foil: false, language: "EN", set: "Tin of Lost Memories", game: "Yu-Gi-Oh" } },
    // Used/played condition items
    { name: "Tarmogoyf", price: 800, cost: 400, qty: 3, attrs: { condition: "MP", foil: false, language: "EN", set: "Modern Masters", game: "MTG" } },
    { name: "Dark Confidant", price: 600, cost: 300, qty: 2, attrs: { condition: "HP", foil: false, language: "EN", set: "Ravnica", game: "MTG" } },
    { name: "Snapcaster Mage", price: 1500, cost: 800, qty: 4, attrs: { condition: "LP", foil: false, language: "EN", set: "Innistrad", game: "MTG" } },
    // Foreign language
    { name: "Lightning Bolt (Japanese)", price: 400, cost: 200, qty: 5, attrs: { condition: "NM", foil: false, language: "JP", set: "Foundations", game: "MTG" } },
    { name: "Counterspell (Japanese Foil)", price: 800, cost: 400, qty: 2, attrs: { condition: "NM", foil: true, language: "JP", set: "Foundations", game: "MTG" } },
  ];

  const sealedProducts = [
    { name: "MTG Foundations Play Booster Box", price: 12999, cost: 8500, qty: 8, attrs: { game: "MTG", product_type: "booster_box" } },
    { name: "MTG Foundations Collector Booster Box", price: 29999, cost: 20000, qty: 3, attrs: { game: "MTG", product_type: "collector_box" } },
    { name: "MTG Foundations Bundle", price: 4999, cost: 3200, qty: 10, attrs: { game: "MTG", product_type: "bundle" } },
    { name: "MTG Aetherdrift Play Booster Box", price: 11999, cost: 7800, qty: 12, attrs: { game: "MTG", product_type: "booster_box" } },
    { name: "MTG Aetherdrift Collector Booster Box", price: 27999, cost: 18000, qty: 4, attrs: { game: "MTG", product_type: "collector_box" } },
    { name: "MTG Commander Deck - Eldrazi Incursion", price: 4499, cost: 2800, qty: 5, attrs: { game: "MTG", product_type: "commander_deck" } },
    { name: "MTG Commander Deck - Creative Energy", price: 4499, cost: 2800, qty: 4, attrs: { game: "MTG", product_type: "commander_deck" } },
    { name: "Pokemon Prismatic Evolutions Elite Trainer Box", price: 6999, cost: 4500, qty: 6, attrs: { game: "Pokemon", product_type: "etb" } },
    { name: "Pokemon Prismatic Evolutions Booster Bundle", price: 3999, cost: 2500, qty: 8, attrs: { game: "Pokemon", product_type: "bundle" } },
    { name: "Pokemon Scarlet & Violet Booster Box", price: 14499, cost: 9500, qty: 4, attrs: { game: "Pokemon", product_type: "booster_box" } },
    { name: "Lorcana Shimmering Skies Booster Box", price: 11999, cost: 7500, qty: 5, attrs: { game: "Lorcana", product_type: "booster_box" } },
    { name: "Lorcana Starter Deck - Amber/Sapphire", price: 1699, cost: 1000, qty: 8, attrs: { game: "Lorcana", product_type: "starter_deck" } },
    { name: "Yu-Gi-Oh! 25th Anniversary Tin", price: 2999, cost: 1800, qty: 10, attrs: { game: "Yu-Gi-Oh", product_type: "tin" } },
    { name: "Star Wars Unlimited Spark of Rebellion Booster Box", price: 10999, cost: 7000, qty: 3, attrs: { game: "Star Wars Unlimited", product_type: "booster_box" } },
    { name: "MTG Mystery Booster 2 Play Booster Box", price: 16999, cost: 11000, qty: 2, attrs: { game: "MTG", product_type: "booster_box" } },
  ];

  const boardGames = [
    { name: "Wingspan", price: 6499, cost: 3800, qty: 4, attrs: { publisher: "Stonemaier Games", players: "1-5", playtime: "40-70min" } },
    { name: "Terraforming Mars", price: 6999, cost: 4200, qty: 3, attrs: { publisher: "Stronghold Games", players: "1-5", playtime: "120min" } },
    { name: "Catan", price: 4499, cost: 2500, qty: 6, attrs: { publisher: "Catan Studio", players: "3-4", playtime: "60-120min" } },
    { name: "Ticket to Ride", price: 4499, cost: 2500, qty: 5, attrs: { publisher: "Days of Wonder", players: "2-5", playtime: "30-60min" } },
    { name: "Azul", price: 3999, cost: 2200, qty: 4, attrs: { publisher: "Next Move Games", players: "2-4", playtime: "30-45min" } },
    { name: "Pandemic", price: 3999, cost: 2200, qty: 3, attrs: { publisher: "Z-Man Games", players: "2-4", playtime: "45min" } },
    { name: "Spirit Island", price: 7999, cost: 4800, qty: 2, attrs: { publisher: "Greater Than Games", players: "1-4", playtime: "90-120min" } },
    { name: "Gloomhaven", price: 14999, cost: 9000, qty: 2, attrs: { publisher: "Cephalofair Games", players: "1-4", playtime: "60-120min" } },
    { name: "Root", price: 5999, cost: 3500, qty: 3, attrs: { publisher: "Leder Games", players: "2-4", playtime: "60-90min" } },
    { name: "Everdell", price: 5999, cost: 3500, qty: 3, attrs: { publisher: "Starling Games", players: "1-4", playtime: "40-80min" } },
    { name: "Ark Nova", price: 6999, cost: 4200, qty: 2, attrs: { publisher: "Capstone Games", players: "1-4", playtime: "90-150min" } },
    { name: "Scythe", price: 7999, cost: 4800, qty: 2, attrs: { publisher: "Stonemaier Games", players: "1-5", playtime: "90-115min" } },
    { name: "Codenames", price: 1999, cost: 1000, qty: 8, attrs: { publisher: "Czech Games Edition", players: "2-8", playtime: "15min" } },
    { name: "7 Wonders", price: 3999, cost: 2200, qty: 4, attrs: { publisher: "Repos Production", players: "2-7", playtime: "30min" } },
    { name: "Dominion (2nd Edition)", price: 4499, cost: 2500, qty: 3, attrs: { publisher: "Rio Grande Games", players: "2-4", playtime: "30min" } },
    { name: "King of Tokyo", price: 3499, cost: 1800, qty: 5, attrs: { publisher: "IELLO", players: "2-6", playtime: "30min" } },
    { name: "Betrayal at House on the Hill", price: 4999, cost: 2800, qty: 3, attrs: { publisher: "Avalon Hill", players: "3-6", playtime: "60min" } },
    { name: "Splendor", price: 3999, cost: 2200, qty: 4, attrs: { publisher: "Space Cowboys", players: "2-4", playtime: "30min" } },
    { name: "Agricola", price: 5999, cost: 3500, qty: 2, attrs: { publisher: "Lookout Games", players: "1-4", playtime: "30-150min" } },
    { name: "Dune: Imperium", price: 4999, cost: 2800, qty: 3, attrs: { publisher: "Dire Wolf", players: "1-4", playtime: "60-120min" } },
  ];

  const miniatures = [
    { name: "Warhammer 40K Combat Patrol: Space Marines", price: 16000, cost: 10000, qty: 2, attrs: { system: "Warhammer 40K", faction: "Space Marines" } },
    { name: "Warhammer 40K Combat Patrol: Orks", price: 16000, cost: 10000, qty: 2, attrs: { system: "Warhammer 40K", faction: "Orks" } },
    { name: "Citadel Shade Paint Set", price: 3600, cost: 2000, qty: 6, attrs: { type: "paint", brand: "Citadel" } },
    { name: "Army Painter Mega Brush Set", price: 2999, cost: 1500, qty: 4, attrs: { type: "brush", brand: "Army Painter" } },
    { name: "Star Wars Legion Core Set", price: 9999, cost: 6000, qty: 2, attrs: { system: "Star Wars Legion" } },
  ];

  const accessories = [
    { name: "Ultra Pro Eclipse Sleeves (100ct) - Jet Black", price: 1099, cost: 550, qty: 40, attrs: { type: "sleeves", count: 100, color: "black" } },
    { name: "Ultra Pro Eclipse Sleeves (100ct) - Pacific Blue", price: 1099, cost: 550, qty: 30, attrs: { type: "sleeves", count: 100, color: "blue" } },
    { name: "Dragon Shield Matte Sleeves - Crimson", price: 1199, cost: 600, qty: 25, attrs: { type: "sleeves", count: 100, color: "crimson" } },
    { name: "Ultra Pro 9-Pocket Binder", price: 2499, cost: 1200, qty: 10, attrs: { type: "binder" } },
    { name: "BCW Toploader (25ct)", price: 499, cost: 200, qty: 50, attrs: { type: "toploader", count: 25 } },
    { name: "Ultimate Guard Boulder 100+ - Onyx", price: 1299, cost: 650, qty: 15, attrs: { type: "deck_box" } },
    { name: "Ultimate Guard Sidewinder 100+ - Black", price: 2499, cost: 1200, qty: 8, attrs: { type: "deck_box" } },
    { name: "Chessex 7-Die Polyhedral Set - Gemini", price: 999, cost: 400, qty: 20, attrs: { type: "dice" } },
    { name: "Chessex Pound-O-Dice", price: 2999, cost: 1500, qty: 5, attrs: { type: "dice" } },
    { name: "Ultra Pro Playmat - Basic Black", price: 1999, cost: 1000, qty: 12, attrs: { type: "playmat" } },
  ];

  const foodDrink = [
    { name: "Drip Coffee (12oz)", price: 300, cost: 50, qty: 999, attrs: { type: "hot_drink" } },
    { name: "Latte (16oz)", price: 550, cost: 100, qty: 999, attrs: { type: "hot_drink" } },
    { name: "Iced Americano", price: 450, cost: 75, qty: 999, attrs: { type: "cold_drink" } },
    { name: "Hot Chocolate", price: 400, cost: 80, qty: 999, attrs: { type: "hot_drink" } },
    { name: "Bottled Water", price: 200, cost: 30, qty: 100, attrs: { type: "bottled" } },
    { name: "Monster Energy", price: 350, cost: 150, qty: 48, attrs: { type: "canned" } },
    { name: "Chips (assorted)", price: 250, cost: 80, qty: 60, attrs: { type: "snack" } },
    { name: "Candy Bar (assorted)", price: 200, cost: 60, qty: 80, attrs: { type: "snack" } },
    { name: "Soft Pretzel", price: 400, cost: 100, qty: 20, attrs: { type: "food" } },
    { name: "Pizza Slice", price: 350, cost: 100, qty: 30, attrs: { type: "food" } },
  ];

  const allInventory = [
    ...tcgSingles.map((i) => ({
      store_id: store.id, name: i.name, category: "tcg_single" as const,
      price_cents: i.price, cost_cents: i.cost, quantity: i.qty, attributes: i.attrs,
      barcode: `TCG${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")}`,
    })),
    ...sealedProducts.map((i) => ({
      store_id: store.id, name: i.name, category: "sealed" as const,
      price_cents: i.price, cost_cents: i.cost, quantity: i.qty, attributes: i.attrs,
      barcode: `SEA${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")}`,
    })),
    ...boardGames.map((i) => ({
      store_id: store.id, name: i.name, category: "board_game" as const,
      price_cents: i.price, cost_cents: i.cost, quantity: i.qty, attributes: i.attrs,
      barcode: `BRD${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")}`,
    })),
    ...miniatures.map((i) => ({
      store_id: store.id, name: i.name, category: "miniature" as const,
      price_cents: i.price, cost_cents: i.cost, quantity: i.qty, attributes: i.attrs,
      barcode: `MIN${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")}`,
    })),
    ...accessories.map((i) => ({
      store_id: store.id, name: i.name, category: "accessory" as const,
      price_cents: i.price, cost_cents: i.cost, quantity: i.qty, attributes: i.attrs,
      barcode: `ACC${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")}`,
    })),
    ...foodDrink.map((i) => ({
      store_id: store.id, name: i.name, category: "food_drink" as const,
      price_cents: i.price, cost_cents: i.cost, quantity: i.qty, attributes: i.attrs,
    })),
  ];

  const { data: items, error: invErr } = await supabase
    .from("inventory_items")
    .insert(allInventory)
    .select();

  if (invErr) throw invErr;
  console.log(`Created ${items.length} inventory items`);

  // ============================================================
  // EVENTS (past + upcoming)
  // ============================================================
  console.log("Creating events...");
  const now = new Date();
  const eventsList = [
    // Past events
    { name: "Friday Night Magic - Standard", event_type: "fnm", starts_at: daysAgo(28, 18), ends_at: daysAgo(28, 22), entry_fee_cents: 500, max_players: 32 },
    { name: "Friday Night Magic - Modern", event_type: "fnm", starts_at: daysAgo(21, 18), ends_at: daysAgo(21, 22), entry_fee_cents: 500, max_players: 32 },
    { name: "Friday Night Magic - Draft", event_type: "fnm", starts_at: daysAgo(14, 18), ends_at: daysAgo(14, 22), entry_fee_cents: 1500, max_players: 24 },
    { name: "Friday Night Magic - Standard", event_type: "fnm", starts_at: daysAgo(7, 18), ends_at: daysAgo(7, 22), entry_fee_cents: 500, max_players: 32 },
    { name: "Aetherdrift Prerelease - Saturday", event_type: "prerelease", starts_at: daysAgo(35, 12), ends_at: daysAgo(35, 18), entry_fee_cents: 3000, max_players: 48 },
    { name: "Aetherdrift Prerelease - Sunday", event_type: "prerelease", starts_at: daysAgo(34, 12), ends_at: daysAgo(34, 18), entry_fee_cents: 3000, max_players: 48 },
    { name: "Pokemon League Night", event_type: "league", starts_at: daysAgo(10, 17), ends_at: daysAgo(10, 20), entry_fee_cents: 0, max_players: 20 },
    { name: "Lorcana Weekly Tournament", event_type: "tournament", starts_at: daysAgo(12, 18), ends_at: daysAgo(12, 21), entry_fee_cents: 500, max_players: 16 },
    { name: "Board Game Night", event_type: "casual", starts_at: daysAgo(5, 18), ends_at: daysAgo(5, 22), entry_fee_cents: 0, max_players: 40 },
    { name: "Modern 1K Tournament", event_type: "tournament", starts_at: daysAgo(20, 10), ends_at: daysAgo(20, 20), entry_fee_cents: 2500, max_players: 64 },
    { name: "Commander Night", event_type: "casual", starts_at: daysAgo(3, 18), ends_at: daysAgo(3, 22), entry_fee_cents: 0, max_players: 40 },
    { name: "Yu-Gi-Oh! Locals", event_type: "tournament", starts_at: daysAgo(6, 14), ends_at: daysAgo(6, 18), entry_fee_cents: 500, max_players: 16 },
    // Upcoming events
    { name: "Friday Night Magic - Pioneer", event_type: "fnm", starts_at: daysFromNow(3, 18), ends_at: daysFromNow(3, 22), entry_fee_cents: 500, max_players: 32 },
    { name: "Pokemon League Night", event_type: "league", starts_at: daysFromNow(4, 17), ends_at: daysFromNow(4, 20), entry_fee_cents: 0, max_players: 20 },
    { name: "Star Wars Unlimited Launch Party", event_type: "prerelease", starts_at: daysFromNow(10, 12), ends_at: daysFromNow(10, 18), entry_fee_cents: 2500, max_players: 32 },
    { name: "Board Game Night", event_type: "casual", starts_at: daysFromNow(9, 18), ends_at: daysFromNow(9, 22), entry_fee_cents: 0, max_players: 40 },
    { name: "Commander Night", event_type: "casual", starts_at: daysFromNow(4, 18), ends_at: daysFromNow(4, 22), entry_fee_cents: 0, max_players: 40 },
    { name: "Modern 2K Championship", event_type: "tournament", starts_at: daysFromNow(17, 10), ends_at: daysFromNow(17, 20), entry_fee_cents: 3500, max_players: 64 },
    { name: "Draft Night - Mystery Booster 2", event_type: "draft", starts_at: daysFromNow(6, 18), ends_at: daysFromNow(6, 22), entry_fee_cents: 2000, max_players: 24 },
    { name: "Lorcana Weekly Tournament", event_type: "tournament", starts_at: daysFromNow(2, 18), ends_at: daysFromNow(2, 21), entry_fee_cents: 500, max_players: 16 },
  ].map((e) => ({ ...e, store_id: store.id }));

  const { data: events, error: evErr } = await supabase
    .from("events")
    .insert(eventsList)
    .select();

  if (evErr) throw evErr;
  console.log(`Created ${events.length} events`);

  // ============================================================
  // EVENT CHECK-INS + LEDGER ENTRIES (for past events)
  // ============================================================
  console.log("Creating check-ins and ledger entries...");
  const pastEvents = events.filter((e: any) => new Date(e.starts_at) < now);

  let totalCheckins = 0;
  let totalLedger = 0;

  for (const event of pastEvents) {
    // Random subset of customers checked in
    const numCheckins = Math.floor(Math.random() * 15) + 5;
    const shuffled = [...customers].sort(() => Math.random() - 0.5);
    const attendees = shuffled.slice(0, numCheckins);

    for (const customer of attendees) {
      // Create ledger entry for fee if applicable
      let ledgerEntryId = null;
      if (event.entry_fee_cents > 0) {
        const { data: ledger } = await supabase
          .from("ledger_entries")
          .insert({
            store_id: store.id,
            type: "event_fee",
            customer_id: customer.id,
            staff_id: staffId,
            event_id: event.id,
            amount_cents: event.entry_fee_cents,
            description: `Entry fee: ${event.name}`,
          })
          .select()
          .single();

        ledgerEntryId = ledger?.id;
        totalLedger++;
      }

      const { error: checkinErr } = await supabase
        .from("event_checkins")
        .insert({
          event_id: event.id,
          customer_id: customer.id,
          fee_paid: event.entry_fee_cents > 0,
          ledger_entry_id: ledgerEntryId,
        });

      if (!checkinErr) totalCheckins++;
    }

    // Add some tagged sales for past events (snacks, sleeves bought during event)
    const numSales = Math.floor(Math.random() * 8) + 2;
    for (let i = 0; i < numSales; i++) {
      const buyer = attendees[Math.floor(Math.random() * attendees.length)];
      const saleAmount = [300, 350, 250, 550, 200, 1099, 1199, 400][Math.floor(Math.random() * 8)];

      await supabase.from("ledger_entries").insert({
        store_id: store.id,
        type: "sale",
        customer_id: buyer.id,
        staff_id: staffId,
        event_id: event.id,
        amount_cents: saleAmount,
        description: `Sale during ${event.name}`,
      });
      totalLedger++;
    }
  }

  console.log(`Created ${totalCheckins} check-ins, ${totalLedger} ledger entries`);

  // ============================================================
  // TRADE-INS (15 completed trades)
  // ============================================================
  console.log("Creating trade-ins...");

  const tradeInData = [
    { customer: 0, items: [{ name: "Ragavan, Nimble Pilferer", offer: 4000, market: 5500, condition: "NM" }, { name: "Wrenn and Six", offer: 2800, market: 4000, condition: "LP" }], payout: "credit", bonus: 30 },
    { customer: 1, items: [{ name: "Sheoldred, the Apocalypse", offer: 4200, market: 6000, condition: "NM" }], payout: "cash", bonus: 0 },
    { customer: 3, items: [{ name: "The One Ring", offer: 3200, market: 4800, condition: "LP" }, { name: "Orcish Bowmasters", offer: 2200, market: 3200, condition: "NM" }, { name: "Orcish Bowmasters", offer: 2200, market: 3200, condition: "NM" }], payout: "credit", bonus: 30 },
    { customer: 4, items: [{ name: "Charizard ex", offer: 3000, market: 4500, condition: "NM" }, { name: "Mew ex", offer: 700, market: 1200, condition: "NM" }], payout: "credit", bonus: 25 },
    { customer: 6, items: [{ name: "Force of Will", offer: 5500, market: 8000, condition: "MP" }], payout: "cash", bonus: 0 },
    { customer: 9, items: [{ name: "Mana Crypt", offer: 10000, market: 15000, condition: "NM" }], payout: "credit", bonus: 30 },
    { customer: 12, items: [{ name: "Snapcaster Mage", offer: 1000, market: 1500, condition: "LP" }, { name: "Thoughtseize", offer: 1100, market: 1800, condition: "LP" }], payout: "credit", bonus: 30 },
    { customer: 13, items: [{ name: "Umbreon VMAX (Alt Art)", offer: 25000, market: 35000, condition: "NM" }], payout: "credit", bonus: 30 },
    { customer: 16, items: [{ name: "Cavern of Souls", offer: 3500, market: 5000, condition: "NM" }], payout: "cash", bonus: 0 },
    { customer: 19, items: [{ name: "Stitch - Rock Star (Enchanted)", offer: 8000, market: 12000, condition: "NM" }, { name: "Elsa - Spirit of Winter", offer: 900, market: 1500, condition: "LP" }], payout: "credit", bonus: 30 },
    { customer: 7, items: [{ name: "Liliana of the Veil", offer: 1400, market: 2200, condition: "NM" }], payout: "cash", bonus: 0 },
    { customer: 14, items: [{ name: "Ash Blossom & Joyous Spring", offer: 600, market: 1000, condition: "NM" }, { name: "Nibiru, the Primal Being", offer: 200, market: 400, condition: "NM" }], payout: "credit", bonus: 30 },
    { customer: 24, items: [{ name: "Arid Mesa", offer: 1500, market: 2500, condition: "NM" }, { name: "Arid Mesa", offer: 1500, market: 2500, condition: "NM" }], payout: "credit", bonus: 25 },
    { customer: 22, items: [{ name: "Lightning Bolt (Foil)", offer: 400, market: 750, condition: "NM" }, { name: "Path to Exile", offer: 150, market: 300, condition: "NM" }, { name: "Fatal Push", offer: 200, market: 350, condition: "NM" }], payout: "cash", bonus: 0 },
    { customer: 29, items: [{ name: "Pikachu VMAX (Rainbow)", offer: 20000, market: 28000, condition: "NM" }], payout: "credit", bonus: 30 },
  ];

  let tradeCount = 0;
  for (let i = 0; i < tradeInData.length; i++) {
    const td = tradeInData[i];
    const customer = customers[td.customer];
    const totalOffer = td.items.reduce((sum, item) => sum + item.offer, 0);
    const totalPayout = td.payout === "credit"
      ? Math.round(totalOffer * (1 + td.bonus / 100))
      : totalOffer;
    const createdAt = daysAgo(Math.floor(Math.random() * 30) + 1);

    // Create ledger entry
    const { data: ledger } = await supabase
      .from("ledger_entries")
      .insert({
        store_id: store.id,
        type: "trade_in",
        customer_id: customer.id,
        staff_id: staffId,
        amount_cents: -totalOffer,
        credit_amount_cents: td.payout === "credit" ? totalPayout : 0,
        description: `Trade-in: ${td.items.map((i) => i.name).join(", ")}`,
        created_at: createdAt,
      })
      .select()
      .single();

    // Create trade-in
    const { data: tradeIn } = await supabase
      .from("trade_ins")
      .insert({
        store_id: store.id,
        customer_id: customer.id,
        staff_id: staffId,
        status: "completed",
        payout_type: td.payout,
        total_offer_cents: totalOffer,
        credit_bonus_percent: td.bonus,
        total_payout_cents: totalPayout,
        ledger_entry_id: ledger?.id,
        created_at: createdAt,
        completed_at: createdAt,
      })
      .select()
      .single();

    // Create trade-in items
    if (tradeIn) {
      await supabase.from("trade_in_items").insert(
        td.items.map((item) => ({
          trade_in_id: tradeIn.id,
          name: item.name,
          category: "tcg_single",
          attributes: { condition: item.condition },
          quantity: 1,
          market_price_cents: item.market,
          offer_price_cents: item.offer,
        }))
      );
      tradeCount++;
    }
  }

  console.log(`Created ${tradeCount} trade-ins`);

  // ============================================================
  // ADDITIONAL SALE LEDGER ENTRIES (daily sales over past 30 days)
  // ============================================================
  console.log("Creating daily sales history...");
  let salesCount = 0;

  for (let day = 1; day <= 30; day++) {
    const numSales = Math.floor(Math.random() * 15) + 5; // 5-20 sales per day
    for (let s = 0; s < numSales; s++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const item = items[Math.floor(Math.random() * items.length)];

      await supabase.from("ledger_entries").insert({
        store_id: store.id,
        type: "sale",
        customer_id: Math.random() > 0.4 ? customer.id : null, // 60% have customer
        staff_id: staffId,
        amount_cents: item.price_cents,
        description: `Sale: ${item.name}`,
        created_at: daysAgo(day, Math.floor(Math.random() * 10) + 10),
      });
      salesCount++;
    }
  }

  console.log(`Created ${salesCount} sale records`);

  // ============================================================
  // CREDIT TRANSACTIONS
  // ============================================================
  console.log("Creating credit transactions...");
  const creditCustomers = customers.filter((c: any) => c.credit_balance_cents > 0);
  let creditCount = 0;

  for (const customer of creditCustomers) {
    // Some credit redemptions
    if (Math.random() > 0.5) {
      const redeemAmount = Math.floor(Math.random() * 2000) + 500;
      await supabase.from("ledger_entries").insert({
        store_id: store.id,
        type: "credit_redeem",
        customer_id: customer.id,
        staff_id: staffId,
        amount_cents: 0,
        credit_amount_cents: -redeemAmount,
        description: "Store credit redemption",
        created_at: daysAgo(Math.floor(Math.random() * 14) + 1),
      });
      creditCount++;
    }
  }

  console.log(`Created ${creditCount} credit transactions`);

  console.log("\n✅ Seed complete!");
  console.log("   Login: ssp@fullproar.com / demo1234!");
  console.log(`   Store: ${store.name}`);
  console.log(`   Customers: ${customers.length}`);
  console.log(`   Inventory: ${items.length}`);
  console.log(`   Events: ${events.length}`);
  console.log(`   Trade-ins: ${tradeCount}`);
}

function daysAgo(days: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function daysFromNow(days: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
