/* ------------------------------------------------------------------ */
/*  Sample Data Generator                                               */
/*  Creates realistic game store exports for every source POS system.   */
/*  Used for: testing the pipeline, demo mode, and onboarding.          */
/*                                                                      */
/*  The data is fake but realistic:                                     */
/*  - Real MTG/Pokemon card names and sets                              */
/*  - Realistic price distributions                                     */
/*  - Realistic inventory quantities                                    */
/*  - Edge cases baked in (zero price, high-value cards, duplicates)    */
/* ------------------------------------------------------------------ */

// --- Card catalog (real names, realistic prices) ---

const MTG_CARDS = [
  { name: "Lightning Bolt", set: "Alpha", rarity: "Common", basePrice: 450_00, variants: true },
  { name: "Lightning Bolt", set: "Fourth Edition", rarity: "Common", basePrice: 1_50, variants: true },
  { name: "Sol Ring", set: "Commander 2021", rarity: "Uncommon", basePrice: 3_50, variants: true },
  { name: "Sol Ring", set: "The Brothers' War", rarity: "Uncommon", basePrice: 1_25, variants: true },
  { name: "Black Lotus", set: "Alpha", rarity: "Rare", basePrice: 250_000_00, variants: false },
  { name: "Force of Will", set: "Alliances", rarity: "Uncommon", basePrice: 85_00, variants: true },
  { name: "Ragavan, Nimble Pilferer", set: "Modern Horizons 2", rarity: "Mythic", basePrice: 55_00, variants: true },
  { name: "Arid Mesa", set: "Zendikar Rising Expeditions", rarity: "Mythic", basePrice: 22_00, variants: true },
  { name: "Counterspell", set: "Dominaria Remastered", rarity: "Uncommon", basePrice: 1_75, variants: true },
  { name: "Llanowar Elves", set: "Dominaria", rarity: "Common", basePrice: 25, variants: true },
  { name: "Sheoldred, the Apocalypse", set: "Dominaria United", rarity: "Mythic", basePrice: 68_00, variants: true },
  { name: "The One Ring", set: "Lord of the Rings", rarity: "Mythic", basePrice: 42_00, variants: true },
  { name: "Fable of the Mirror-Breaker", set: "Kamigawa: Neon Dynasty", rarity: "Rare", basePrice: 18_00, variants: true },
  { name: "Orcish Bowmasters", set: "Lord of the Rings", rarity: "Rare", basePrice: 35_00, variants: true },
  { name: "Doubling Season", set: "Ravnica", rarity: "Rare", basePrice: 45_00, variants: true },
  { name: "Wrenn and Six", set: "Modern Horizons", rarity: "Mythic", basePrice: 28_00, variants: true },
  { name: "Path to Exile", set: "Conflux", rarity: "Uncommon", basePrice: 3_00, variants: true },
  { name: "Thoughtseize", set: "Theros", rarity: "Rare", basePrice: 12_00, variants: true },
  { name: "Mana Crypt", set: "Eternal Masters", rarity: "Mythic", basePrice: 150_00, variants: true },
  { name: "Urza's Saga", set: "Modern Horizons 2", rarity: "Rare", basePrice: 32_00, variants: true },
];

const POKEMON_CARDS = [
  { name: "Charizard ex", set: "Obsidian Flames", rarity: "Double Rare", basePrice: 28_00, variants: true },
  { name: "Pikachu VMAX", set: "Vivid Voltage", rarity: "Secret", basePrice: 95_00, variants: false },
  { name: "Umbreon VMAX", set: "Evolving Skies", rarity: "Alternate Art", basePrice: 180_00, variants: false },
  { name: "Miraidon ex", set: "Scarlet & Violet", rarity: "Double Rare", basePrice: 8_00, variants: true },
  { name: "Gardevoir ex", set: "Paldea Evolved", rarity: "Double Rare", basePrice: 5_50, variants: true },
  { name: "Lugia V", set: "Silver Tempest", rarity: "Ultra Rare", basePrice: 12_00, variants: true },
  { name: "Mew VMAX", set: "Fusion Strike", rarity: "Secret", basePrice: 22_00, variants: false },
  { name: "Arceus VSTAR", set: "Brilliant Stars", rarity: "Ultra Rare", basePrice: 7_50, variants: true },
];

const SEALED_PRODUCTS = [
  { name: "MTG Modern Horizons 3 Draft Booster Box", category: "sealed", price: 220_00, cost: 160_00, qty: 8 },
  { name: "MTG Murders at Karlov Manor Bundle", category: "sealed", price: 45_00, cost: 30_00, qty: 12 },
  { name: "Pokemon Scarlet & Violet Booster Box", category: "sealed", price: 145_00, cost: 95_00, qty: 6 },
  { name: "Pokemon 151 Elite Trainer Box", category: "sealed", price: 55_00, cost: 40_00, qty: 15 },
  { name: "Yu-Gi-Oh Age of Overlord Booster Box", category: "sealed", price: 70_00, cost: 48_00, qty: 4 },
  { name: "Lorcana Shimmering Skies Booster Box", category: "sealed", price: 110_00, cost: 75_00, qty: 5 },
  { name: "MTG Commander Masters Set Booster Box", category: "sealed", price: 280_00, cost: 200_00, qty: 3 },
  { name: "Flesh and Blood Heavy Hitters Booster Box", category: "sealed", price: 95_00, cost: 65_00, qty: 4 },
];

const BOARD_GAMES = [
  { name: "Settlers of Catan", price: 44_99, cost: 28_00, qty: 6 },
  { name: "Wingspan", price: 55_00, cost: 35_00, qty: 4 },
  { name: "Ticket to Ride", price: 39_99, cost: 24_00, qty: 5 },
  { name: "Pandemic", price: 35_99, cost: 22_00, qty: 3 },
  { name: "Azul", price: 29_99, cost: 18_00, qty: 7 },
  { name: "Betrayal at House on the Hill", price: 45_00, cost: 28_00, qty: 3 },
  { name: "Codenames", price: 19_99, cost: 11_00, qty: 8 },
  { name: "Gloomhaven", price: 120_00, cost: 75_00, qty: 2 },
  { name: "Spirit Island", price: 65_00, cost: 40_00, qty: 3 },
  { name: "Terraforming Mars", price: 55_00, cost: 34_00, qty: 4 },
];

const ACCESSORIES = [
  { name: "Ultra Pro Eclipse Sleeves (100ct) - Jet Black", price: 10_99, cost: 6_00, qty: 25 },
  { name: "Ultra Pro Eclipse Sleeves (100ct) - Pacific Blue", price: 10_99, cost: 6_00, qty: 20 },
  { name: "Dragon Shield Matte Sleeves - Crimson", price: 12_99, cost: 7_50, qty: 18 },
  { name: "BCW 3x4 Top Loaders (25ct)", price: 4_99, cost: 2_50, qty: 40 },
  { name: "Ultimate Guard Boulder 100+ - Onyx", price: 8_99, cost: 5_00, qty: 15 },
  { name: "Ultra Pro Playmat - Swamp (John Avon)", price: 22_99, cost: 13_00, qty: 6 },
  { name: "Chessex Dice Set - Gemini Blue-Gold", price: 9_99, cost: 5_50, qty: 12 },
];

const CAFE_ITEMS = [
  { name: "Drip Coffee (12oz)", price: 3_50, cost: 75, qty: 999 },
  { name: "Latte (16oz)", price: 5_50, cost: 1_50, qty: 999 },
  { name: "Hot Chocolate", price: 4_50, cost: 1_00, qty: 999 },
  { name: "Bottled Water", price: 2_00, cost: 50, qty: 48 },
  { name: "Candy Bar (assorted)", price: 2_50, cost: 1_00, qty: 36 },
  { name: "Bag of Chips", price: 2_00, cost: 75, qty: 30 },
];

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const LANGUAGES = ["EN", "JP"] as const;
const CUSTOMER_FIRST = ["Alex", "Jordan", "Sam", "Morgan", "Casey", "Riley", "Dakota", "Quinn", "Avery", "Taylor", "Drew", "Jamie", "Blake", "Skyler", "Reese", "Cameron", "Parker", "Hayden", "Rowan", "Sage"];
const CUSTOMER_LAST = ["Chen", "Patel", "Kim", "Garcia", "Williams", "Johnson", "Brown", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Walker", "Hall"];

function cents(dollars: number): number {
  return Math.round(dollars);
}

function conditionMultiplier(cond: string): number {
  switch (cond) {
    case "NM": return 1.0;
    case "LP": return 0.85;
    case "MP": return 0.65;
    case "HP": return 0.45;
    case "DMG": return 0.25;
    default: return 1.0;
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Generators ---

interface SampleInventoryRow {
  name: string;
  category: string;
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  quantity: string;
  condition?: string;
  language?: string;
  foil?: string;
  set?: string;
  game?: string;
  rarity?: string;
  [key: string]: string | undefined;
}

interface SampleCustomerRow {
  name: string;
  email: string;
  phone: string;
  credit_balance: string;
  notes: string;
}

function generateTCGSingles(game: string, cards: typeof MTG_CARDS): SampleInventoryRow[] {
  const rows: SampleInventoryRow[] = [];
  let skuCounter = 1;

  for (const card of cards) {
    // Generate 1-4 condition variants per card
    const numVariants = card.variants ? randomInt(1, 4) : 1;
    const usedConditions = new Set<string>();

    for (let v = 0; v < numVariants; v++) {
      let cond: string;
      do {
        cond = randomPick(CONDITIONS);
      } while (usedConditions.has(cond) && usedConditions.size < CONDITIONS.length);
      usedConditions.add(cond);

      const lang = Math.random() > 0.9 ? "JP" : "EN";
      const foil = Math.random() > 0.85;
      const priceCents = Math.round(card.basePrice * conditionMultiplier(cond) * (foil ? 1.5 : 1));
      const costCents = Math.round(priceCents * (0.4 + Math.random() * 0.2));
      const qty = card.basePrice > 100_00 ? randomInt(1, 2) : randomInt(1, 12);

      rows.push({
        name: card.name,
        category: "tcg_single",
        sku: `${game.toUpperCase()}-${String(skuCounter++).padStart(5, "0")}`,
        barcode: "",
        price: (priceCents / 100).toFixed(2),
        cost: (costCents / 100).toFixed(2),
        quantity: String(qty),
        condition: cond,
        language: lang,
        foil: foil ? "Yes" : "No",
        set: card.set,
        game: game === "mtg" ? "Magic: The Gathering" : "Pokemon",
        rarity: card.rarity,
      });
    }
  }
  return rows;
}

function generateSealed(): SampleInventoryRow[] {
  return SEALED_PRODUCTS.map((p, i) => ({
    name: p.name,
    category: "sealed",
    sku: `SEALED-${String(i + 1).padStart(4, "0")}`,
    barcode: `${700000000000 + i}`,
    price: (p.price / 100).toFixed(2),
    cost: (p.cost / 100).toFixed(2),
    quantity: String(p.qty),
  }));
}

function generateBoardGames(): SampleInventoryRow[] {
  return BOARD_GAMES.map((p, i) => ({
    name: p.name,
    category: "board_game",
    sku: `BG-${String(i + 1).padStart(4, "0")}`,
    barcode: `${800000000000 + i}`,
    price: (p.price / 100).toFixed(2),
    cost: (p.cost / 100).toFixed(2),
    quantity: String(p.qty),
  }));
}

function generateAccessories(): SampleInventoryRow[] {
  return ACCESSORIES.map((p, i) => ({
    name: p.name,
    category: "accessory",
    sku: `ACC-${String(i + 1).padStart(4, "0")}`,
    barcode: `${900000000000 + i}`,
    price: (p.price / 100).toFixed(2),
    cost: (p.cost / 100).toFixed(2),
    quantity: String(p.qty),
  }));
}

function generateCafe(): SampleInventoryRow[] {
  return CAFE_ITEMS.map((p, i) => ({
    name: p.name,
    category: "food_drink",
    sku: `CAFE-${String(i + 1).padStart(4, "0")}`,
    barcode: "",
    price: (p.price / 100).toFixed(2),
    cost: (p.cost / 100).toFixed(2),
    quantity: String(p.qty),
  }));
}

function generateCustomers(count: number): SampleCustomerRow[] {
  const customers: SampleCustomerRow[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < count; i++) {
    const first = randomPick(CUSTOMER_FIRST);
    const last = randomPick(CUSTOMER_LAST);
    const name = `${first} ${last}`;
    let email = `${first.toLowerCase()}.${last.toLowerCase()}@email.com`;
    // Handle dupe emails
    if (usedEmails.has(email)) email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@email.com`;
    usedEmails.add(email);

    const hasCredit = Math.random() > 0.6;
    const creditBalance = hasCredit ? (randomInt(5, 200) + Math.random()).toFixed(2) : "0.00";

    customers.push({
      name,
      email: Math.random() > 0.1 ? email : "", // 10% missing email
      phone: Math.random() > 0.3 ? `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${randomInt(1000, 9999)}` : "",
      credit_balance: creditBalance,
      notes: Math.random() > 0.8 ? randomPick(["VIP customer", "Prefers Japanese cards", "League regular", "New player", "Commander enthusiast", "Draft regular"]) : "",
    });
  }
  return customers;
}

// --- Edge cases (baked into every sample) ---

function addEdgeCases(inventory: SampleInventoryRow[]): SampleInventoryRow[] {
  // Zero price item (common in café freebies or data errors)
  inventory.push({
    name: "Free Promo Card",
    category: "tcg_single",
    sku: "PROMO-FREE-001",
    barcode: "",
    price: "0.00",
    cost: "0.00",
    quantity: "50",
    condition: "NM",
    game: "Magic: The Gathering",
  });

  // Very high value item
  inventory.push({
    name: "PSA 10 Base Set Charizard",
    category: "tcg_single",
    sku: "GRADE-PSA10-001",
    barcode: "",
    price: "15000.00",
    cost: "8500.00",
    quantity: "1",
    condition: "NM",
    game: "Pokemon",
    rarity: "Rare",
  });

  // Item with special characters in name
  inventory.push({
    name: "Jace, the Mind Sculptor (Worldwake) - SP/NM",
    category: "tcg_single",
    sku: "MTG-JACE-WW-001",
    barcode: "",
    price: "28.00",
    cost: "15.00",
    quantity: "2",
    condition: "LP",
    game: "Magic: The Gathering",
    set: "Worldwake",
  });

  return inventory;
}

// --- Format converters (POS-specific CSV shapes) ---

export function generateShopifyProducts(): string {
  const inventory = [
    ...generateTCGSingles("mtg", MTG_CARDS),
    ...generateTCGSingles("pokemon", POKEMON_CARDS),
    ...generateSealed(),
    ...generateBoardGames(),
    ...generateAccessories(),
    ...generateCafe(),
  ];
  addEdgeCases(inventory);

  const headers = ["Handle", "Title", "Vendor", "Type", "Tags", "Variant SKU", "Variant Barcode", "Variant Price", "Variant Compare At Price", "Variant Inventory Qty", "Option1 Name", "Option1 Value"];
  const rows = inventory.map((item) => {
    const handle = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const tags = [item.game, item.set, item.condition, item.foil === "Yes" ? "Foil" : ""].filter(Boolean).join(", ");
    return [
      handle,
      item.name + (item.set ? ` (${item.set})` : ""),
      item.game || "Generic",
      item.category === "tcg_single" ? "TCG Single" : item.category === "sealed" ? "Sealed Product" : item.category === "board_game" ? "Board Game" : item.category,
      tags,
      item.sku,
      item.barcode || "",
      item.price,
      item.cost,
      item.quantity,
      item.condition ? "Condition" : "",
      item.condition || "",
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function generateShopifyCustomers(): string {
  const customers = generateCustomers(80);
  const headers = ["First Name", "Last Name", "Email", "Phone", "Tags", "Note"];
  const rows = customers.map((c) => {
    const [first, ...rest] = c.name.split(" ");
    const last = rest.join(" ");
    return [first, last, c.email, c.phone, "", c.notes].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

export function generateBinderPOSExport(): string {
  const singles = [
    ...generateTCGSingles("mtg", MTG_CARDS),
    ...generateTCGSingles("pokemon", POKEMON_CARDS),
  ];
  addEdgeCases(singles);

  const headers = ["Product Name", "Game", "Set", "Condition", "Language", "Foil", "Rarity", "SKU", "Price", "Quantity", "Enable Sync", "Reserve Stock", "Max To List", "Markup %"];
  const rows = singles.map((item) => [
    item.name,
    item.game || "",
    item.set || "",
    item.condition || "NM",
    item.language || "EN",
    item.foil || "No",
    item.rarity || "",
    item.sku,
    item.price,
    item.quantity,
    Math.random() > 0.3 ? "Yes" : "No",
    String(randomInt(0, 3)),
    String(randomInt(4, 20)),
    String(randomInt(5, 25)),
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

export function generateSquareExport(): string {
  const inventory = [
    ...generateTCGSingles("mtg", MTG_CARDS),
    ...generateSealed(),
    ...generateBoardGames(),
    ...generateAccessories(),
  ];
  addEdgeCases(inventory);

  const headers = ["Item Name", "Category", "SKU", "GTIN", "Price", "Current Quantity"];
  const rows = inventory.map((item) => {
    const fullName = item.condition
      ? `${item.name} (${item.set || ""}) - ${item.condition}${item.foil === "Yes" ? " Foil" : ""}`
      : item.name;
    const cat = item.category === "tcg_single" ? "MTG Singles" : item.category === "sealed" ? "Sealed" : item.category === "board_game" ? "Board Games" : "Accessories";
    return [fullName, cat, item.sku, item.barcode || "", item.price, item.quantity].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function generateGenericCSV(): string {
  const inventory = [
    ...generateTCGSingles("mtg", MTG_CARDS.slice(0, 10)),
    ...generateSealed(),
    ...generateBoardGames(),
  ];
  addEdgeCases(inventory);

  const headers = ["Name", "Type", "SKU", "Barcode", "Sell Price", "Cost", "Stock", "Notes"];
  const rows = inventory.map((item) => {
    const name = item.condition
      ? `${item.name} [${item.condition}] ${item.set || ""}`
      : item.name;
    return [name, item.category, item.sku, item.barcode || "", item.price, item.cost, item.quantity, ""].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/** Generate all sample files as a map of filename → content */
export function generateAllSamples(): Record<string, string> {
  return {
    "shopify-products-sample.csv": generateShopifyProducts(),
    "shopify-customers-sample.csv": generateShopifyCustomers(),
    "binderpos-inventory-sample.csv": generateBinderPOSExport(),
    "square-items-sample.csv": generateSquareExport(),
    "generic-inventory-sample.csv": generateGenericCSV(),
    "customers-sample.csv": generateCustomers(80).map((c) =>
      [c.name, c.email, c.phone, c.credit_balance, c.notes].join(",")
    ).join("\n"),
  };
}
