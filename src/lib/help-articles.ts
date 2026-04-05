/* ------------------------------------------------------------------ */
/*  Help Center — Article data & categories                            */
/* ------------------------------------------------------------------ */

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  body: string;
  tips?: string[];
  tags: string[];
  popular?: boolean;
}

export const CATEGORIES = [
  "Getting Started",
  "Register & Checkout",
  "Inventory",
  "TCG Singles",
  "Customers",
  "Events & Tournaments",
  "Cafe & Food",
  "Trade-Ins & Returns",
  "Shipping & Fulfillment",
  "Marketplace & E-Commerce",
  "Reports & Intelligence",
  "Staff & Admin",
  "Troubleshooting",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const ARTICLES: HelpArticle[] = [
  /* ================================================================ */
  /*  1. Getting Started                                               */
  /* ================================================================ */
  {
    id: "first-sale",
    title: "Your first sale",
    category: "Getting Started",
    subcategory: "Basics",
    body: "Open the Register from the sidebar or dashboard. Search for an item by name or scan its barcode, then tap to add it to the cart. Hit PAY, pick a payment method, and complete the transaction. The change-due screen shows you exactly what to hand back for cash sales.",
    tips: [
      "You can type a dollar amount and add a manual item if the product isn't in your system yet.",
      "Training mode lets you practice without processing real payments.",
    ],
    tags: ["register", "checkout", "quick start", "new store", "first time"],
    popular: true,
  },
  {
    id: "adding-products",
    title: "Adding products to your catalog",
    category: "Getting Started",
    subcategory: "Basics",
    body: "There are three ways to add products: search the Scryfall/Pokemon/Yu-Gi-Oh catalogs for TCG singles, scan barcodes (unknown barcodes trigger a learn flow that looks up the product automatically via UPC databases and BoardGameGeek), or bulk import via CSV from the Import page.",
    tips: [
      "The barcode learn flow auto-fills product details including images, categories, and suggested pricing.",
    ],
    tags: ["products", "inventory", "catalog", "barcode", "import", "setup"],
    popular: true,
  },
  {
    id: "setting-up-tax",
    title: "Setting up sales tax",
    category: "Getting Started",
    subcategory: "Configuration",
    body: "Go to Settings and find the Tax section. Enter your local sales tax rate as a percentage (e.g. 8.25). You can also toggle whether prices include tax or if tax is added at checkout. Stripe Tax is the primary provider with automatic fallback to your manual rate.",
    tips: [
      "Most US stores add tax on top of listed prices. Tax-inclusive pricing is more common outside the US.",
    ],
    tags: ["tax", "settings", "stripe tax", "configuration"],
  },
  {
    id: "onboarding-wizard",
    title: "Onboarding wizard",
    category: "Getting Started",
    subcategory: "Setup",
    body: "The 6-step onboarding wizard walks you through store setup: store info, products, staff, payment configuration, a test sale, and going live. Complete each step to unlock the full dashboard. You can return to any step from Settings if you need to make changes later.",
    tags: ["onboarding", "setup", "wizard", "new store", "first time"],
  },
  {
    id: "demo-data",
    title: "Loading demo data",
    category: "Getting Started",
    subcategory: "Setup",
    body: "Want to explore without entering real products? Go to Settings and tap 'Seed Demo Data' to load sample inventory, customers, and events. This gives you a realistic store to practice with before entering your own data.",
    tips: [
      "Demo data is clearly marked and can be removed later without affecting real transactions.",
    ],
    tags: ["demo", "sample data", "testing", "onboarding", "seed"],
  },

  /* ================================================================ */
  /*  2. Register & Checkout                                           */
  /* ================================================================ */
  {
    id: "cash-sale",
    title: "Processing a cash sale",
    category: "Register & Checkout",
    subcategory: "Payments",
    body: "After adding items to the cart, tap PAY and select Cash. Enter the amount the customer handed you using the keypad. The system calculates change automatically and displays it prominently. Tap Done to complete and clear the screen.",
    tags: ["cash", "payment", "register", "checkout", "change"],
  },
  {
    id: "card-payment",
    title: "Card payments with Stripe Terminal",
    category: "Register & Checkout",
    subcategory: "Payments",
    body: "Tap PAY then Card to initiate a Stripe Terminal payment. The S710 reader will prompt the customer to tap, insert, or swipe their card. The receipt automatically includes the card brand and last 4 digits. Stripe processes the payment in real time.",
    tips: [
      "If the reader is disconnected, the status bar heartbeat will show an amber warning.",
      "Stripe is currently in test mode -- no real charges are processed.",
    ],
    tags: ["card", "stripe", "terminal", "S710", "payment", "contactless"],
    popular: true,
  },
  {
    id: "barcode-scanner",
    title: "Using the barcode scanner",
    category: "Register & Checkout",
    subcategory: "Scanning",
    body: "Plug in a USB or Bluetooth HID barcode scanner -- it works like a keyboard. Scan any barcode while the register is open and the matching item is added automatically. If the barcode is not recognized, the learn flow prompts you to link it to a product or look it up.",
    tips: [
      "The scanner only fires when no input field has focus. Tap somewhere neutral on the register first.",
      "Camera-based scanning is also available via the BarcodeDetector API on supported devices.",
    ],
    tags: ["barcode", "scanner", "USB", "bluetooth", "HID", "scan"],
  },
  {
    id: "discounts",
    title: "Applying discounts",
    category: "Register & Checkout",
    subcategory: "Adjustments",
    body: "Tap the Discount button in the action bar. Choose between a percentage or dollar amount, and whether it applies to a specific item or the whole cart. Add a reason (like 'loyalty customer' or 'damaged box') for your records. Discounts are tracked in reports.",
    tags: ["discount", "percentage", "markdown", "promotion", "coupon"],
  },
  {
    id: "manual-items",
    title: "Adding manual items",
    category: "Register & Checkout",
    subcategory: "Cart",
    body: "Tap Manual in the action bar to add an item that is not in your catalog. Enter a description and price. This is useful for one-off items, services, or event entry fees that do not have a barcode or catalog entry.",
    tags: ["manual", "custom item", "one-off", "service", "register"],
  },
  {
    id: "split-tender",
    title: "Split tender payments",
    category: "Register & Checkout",
    subcategory: "Payments",
    body: "Customers can pay with multiple methods on a single transaction. After applying the first payment (e.g. gift card), the remaining balance is shown. Choose another payment method for the rest. Common splits are gift card + cash, or store credit + card.",
    tags: ["split", "tender", "multiple payments", "partial", "gift card"],
  },
  {
    id: "store-credit-payment",
    title: "Paying with store credit",
    category: "Register & Checkout",
    subcategory: "Payments",
    body: "Attach a customer to the transaction, then tap PAY and select Store Credit. The system shows the customer's available balance and deducts the sale amount. If the credit does not cover the full total, the remainder can be paid with another method.",
    tags: ["store credit", "credit", "ledger", "customer", "payment"],
  },
  {
    id: "gift-cards",
    title: "Selling and redeeming gift cards",
    category: "Register & Checkout",
    subcategory: "Gift Cards",
    body: "To sell a gift card, add it as a product from the Gift Card section. To redeem one at checkout, tap PAY then Gift Card and enter the card code. The system checks the balance and applies it. Remaining balances carry forward for future use.",
    tags: ["gift card", "redeem", "balance", "sell", "payment"],
  },
  {
    id: "receipts",
    title: "Receipts: print, email, and QR",
    category: "Register & Checkout",
    subcategory: "Receipts",
    body: "After every sale, you can print a thermal receipt (280px monospace format), email a styled HTML receipt, or show a QR code the customer can scan to view their receipt online. Receipts include a CODE128 barcode for the transaction number, card details, loyalty points earned, and your store's return policy.",
    tips: [
      "Customize your receipt footer and return policy text in Settings.",
      "QR receipts use token-based URLs so customers can access them without logging in.",
    ],
    tags: ["receipt", "print", "email", "QR", "thermal", "barcode"],
  },
  {
    id: "voiding",
    title: "Voiding a transaction",
    category: "Register & Checkout",
    subcategory: "Adjustments",
    body: "From the More menu in the register, tap Void Last. This reverses the most recent transaction, restoring inventory quantities and refunding any payment. Only managers and owners can void. The voided transaction stays in your records for auditing.",
    tags: ["void", "reverse", "cancel", "undo", "refund", "manager"],
  },
  {
    id: "training-mode",
    title: "Training mode",
    category: "Register & Checkout",
    subcategory: "Setup",
    body: "Toggle Training Mode in Settings to let new staff practice without processing real charges or affecting inventory counts. All transactions created in training mode are marked with a training flag and excluded from reports and revenue totals.",
    tags: ["training", "practice", "demo", "new staff", "onboarding"],
  },

  /* ================================================================ */
  /*  3. Inventory                                                     */
  /* ================================================================ */
  {
    id: "adding-inventory",
    title: "Adding inventory items",
    category: "Inventory",
    subcategory: "Basics",
    body: "Go to Inventory and tap Add Item. Enter the product name, SKU, price, cost, and quantity. You can also set the category, weight, and shipping attributes. For TCG singles, use the catalog search instead -- it auto-fills card details from Scryfall, Pokemon TCG API, or YGOPRODeck.",
    tags: ["add item", "inventory", "SKU", "product", "new item"],
  },
  {
    id: "tcg-catalog-search",
    title: "Searching Scryfall, Pokemon, and Yu-Gi-Oh catalogs",
    category: "Inventory",
    subcategory: "TCG",
    body: "The Catalog page has game tabs for MTG, Pokemon, and Yu-Gi-Oh. Search by card name and the system queries the appropriate API (Scryfall, Pokemon TCG API, or YGOPRODeck). Select a card, set condition and quantity, and add it to inventory with images, set info, and pricing pre-filled.",
    tags: ["scryfall", "pokemon", "yugioh", "catalog", "search", "TCG"],
    popular: true,
  },
  {
    id: "bulk-import",
    title: "Bulk CSV import",
    category: "Inventory",
    subcategory: "Import",
    body: "Go to the Import page to upload a CSV file of products. The system supports TCGPlayer, Moxfield, and simple CSV formats. Map your columns to fields like name, quantity, price, and condition. The import runs in the background and you can track progress on the Import Jobs page.",
    tips: [
      "Download a sample CSV template from the import page to see the expected format.",
    ],
    tags: ["CSV", "import", "bulk", "TCGPlayer", "Moxfield", "upload"],
  },
  {
    id: "stock-counts",
    title: "Running a stock count",
    category: "Inventory",
    subcategory: "Counts",
    body: "Start a stock count from the Stock Count page. Scan or search items and enter the counted quantity. When done, the system highlights discrepancies between expected and actual quantities. Approve the count to update inventory levels and log adjustments.",
    tags: ["stock count", "physical count", "audit", "reconciliation", "discrepancy"],
  },
  {
    id: "low-stock-alerts",
    title: "Low stock alerts",
    category: "Inventory",
    subcategory: "Monitoring",
    body: "Set reorder points on any inventory item. When stock drops below that threshold, the item appears in your Low Stock report. This helps you reorder popular products before they sell out, especially for staples like sleeves, dice, and top-selling singles.",
    tags: ["low stock", "reorder", "alert", "threshold", "out of stock"],
  },
  {
    id: "barcode-labels",
    title: "Printing barcode labels",
    category: "Inventory",
    subcategory: "Labels",
    body: "Select items in Inventory and tap Print Labels. Labels include the product name, price, and a scannable barcode formatted for standard label sheets. You can also print labels from an individual item's detail page.",
    tags: ["barcode", "label", "print", "sticker", "price tag"],
  },
  {
    id: "categories",
    title: "Category management",
    category: "Inventory",
    subcategory: "Organization",
    body: "Organize your products into categories like Board Games, TCG Singles, Accessories, Snacks, and more. Categories help with filtering on the register, running category-level reports, and keeping your catalog browsable. Assign categories when adding items or edit them in bulk.",
    tags: ["category", "organize", "filter", "catalog", "classification"],
  },

  /* ================================================================ */
  /*  4. TCG Singles                                                   */
  /* ================================================================ */
  {
    id: "condition-guide",
    title: "Condition grading guide",
    category: "TCG Singles",
    subcategory: "Grading",
    body: "NM (Near Mint): looks unplayed, no visible wear. LP (Lightly Played): minor edge wear or small scratches. MP (Moderately Played): noticeable wear, minor creases. HP (Heavily Played): significant wear, creases, or markings. DMG (Damaged): major damage like bends, tears, or water damage.",
    tips: [
      "When in doubt, grade one step lower. Customers are happier getting a card in better condition than expected.",
      "Condition multipliers are configured in Settings under TCG Pricing.",
    ],
    tags: ["condition", "grading", "NM", "LP", "MP", "HP", "DMG"],
  },
  {
    id: "buylist-prices",
    title: "Buylist pricing",
    category: "TCG Singles",
    subcategory: "Pricing",
    body: "Your buylist is auto-calculated from market prices multiplied by your buylist percentage and condition multipliers. Cash payouts use the base percentage; store credit adds a configurable bonus. The public buylist page shows customers what you are buying and at what price.",
    tags: ["buylist", "pricing", "market", "trade-in", "buy price"],
  },
  {
    id: "market-pricing",
    title: "Market pricing and Scryfall cache",
    category: "TCG Singles",
    subcategory: "Pricing",
    body: "Market prices are pulled from Scryfall (MTG), Pokemon TCG API, and YGOPRODeck (Yu-Gi-Oh) with a 1-hour cache TTL. Prices update automatically. You can see the current market price vs your sell price on every card to spot pricing opportunities.",
    tags: ["market price", "Scryfall", "cache", "price drift", "TCG"],
  },
  {
    id: "bulk-repricing",
    title: "One-click bulk repricing",
    category: "TCG Singles",
    subcategory: "Pricing",
    body: "Use the Bulk Reprice tool to update prices across your entire singles inventory in one shot. Set rules like 'NM at 95% of market' or 'mark down all LP by 15%'. Changes are previewed before you commit so you can review the impact.",
    tags: ["reprice", "bulk", "markup", "markdown", "pricing rule"],
  },
  {
    id: "collection-import",
    title: "Collection CSV import",
    category: "TCG Singles",
    subcategory: "Import",
    body: "Import existing card collections via CSV from TCGPlayer, Moxfield, or a simple format. The system matches cards to the federated catalog, applies your pricing rules, and adds them to inventory. Great for onboarding a store's existing singles stock.",
    tags: ["collection", "CSV", "import", "TCGPlayer", "Moxfield", "migration"],
  },
  {
    id: "sealed-ev",
    title: "Sealed EV calculator",
    category: "TCG Singles",
    subcategory: "Tools",
    body: "The Sealed EV calculator estimates the expected value of opening a sealed product based on current singles prices. Enter a set code (like MH3) and the system calculates EV from the singles market. Useful for deciding whether to crack packs or sell sealed.",
    tags: ["sealed", "EV", "expected value", "booster", "pack", "set"],
  },

  /* ================================================================ */
  /*  5. Customers                                                     */
  /* ================================================================ */
  {
    id: "customer-profiles",
    title: "Customer profiles",
    category: "Customers",
    subcategory: "Profiles",
    body: "Create customer profiles to track purchase history, store credit balance, loyalty points, and trade-in history. Attach a customer to any transaction at the register to build their profile. Customer data syncs to the Afterroar network for cross-store recognition.",
    tags: ["customer", "profile", "history", "account", "CRM"],
  },
  {
    id: "loyalty-points",
    title: "Loyalty points: earning, redeeming, and claiming",
    category: "Customers",
    subcategory: "Loyalty",
    body: "Customers earn points on purchases (configurable rate), event check-ins, and trade-ins. VIP customers get a 10% bonus and regulars get 5%, auto-detected from lifetime spend. Points can be redeemed for store credit. If a sale was completed without a customer attached, they have a 24-hour window to claim their points retroactively.",
    tips: [
      "Points are reversed on returns (minimum 0 balance) and synced to the Afterroar network.",
      "Frequent returners (3+ returns in 30 days) are automatically flagged for review.",
    ],
    tags: ["loyalty", "points", "rewards", "VIP", "redeem", "claim"],
    popular: true,
  },
  {
    id: "afterroar-passport",
    title: "Afterroar Passport",
    category: "Customers",
    subcategory: "Network",
    body: "Customers who link their Afterroar account get a Passport that works across all Afterroar stores. Their reputation, loyalty points, and event history travel with them. Events you create show up in the Afterroar app for nearby players.",
    tags: ["Afterroar", "passport", "network", "cross-store", "reputation"],
  },
  {
    id: "public-buylist",
    title: "Public buylist page",
    category: "Customers",
    subcategory: "Public",
    body: "Your store has a public buylist page at /buylist/[your-slug] that shows customers what you are buying and at what price. It includes NM/LP/MP offers, demand indicators (Hot vs Stocked), and a credit bonus callout. Share this URL on social media to drive trade-ins.",
    tags: ["buylist", "public", "customer-facing", "trade-in", "marketing"],
  },

  /* ================================================================ */
  /*  6. Events & Tournaments                                          */
  /* ================================================================ */
  {
    id: "creating-events",
    title: "Creating events",
    category: "Events & Tournaments",
    subcategory: "Events",
    body: "Go to Events and tap Create Event. Set the name, date, time, format (Standard, Draft, Commander Night, etc.), entry fee, and max players. Configure ticket tiers like VIP, GA, or Early Bird with different pricing. Events appear on your public store page and the Afterroar app.",
    tags: ["event", "create", "format", "entry fee", "schedule"],
  },
  {
    id: "checkin-flow",
    title: "Event check-in flow",
    category: "Events & Tournaments",
    subcategory: "Events",
    body: "When players arrive, open the event and tap Check In. Search for the customer or create a new one on the spot. The system collects the entry fee, adds it to your daily revenue, and awards loyalty points for attendance. Check-in data syncs to the Afterroar network.",
    tags: ["check-in", "event", "attendance", "entry fee", "loyalty"],
  },
  {
    id: "swiss-pairing",
    title: "Swiss pairing tournaments",
    category: "Events & Tournaments",
    subcategory: "Tournaments",
    body: "After check-in, tap Start Tournament and select Swiss pairing. The system generates pairings based on win records and OMW% tiebreakers. Report match results round by round, and standings update automatically. Players can be dropped between rounds if they leave early.",
    tips: [
      "Swiss is the standard format for FNM and league play. It ensures every player gets to play all rounds.",
    ],
    tags: ["Swiss", "pairing", "tournament", "FNM", "OMW", "tiebreaker"],
  },
  {
    id: "single-elimination",
    title: "Single elimination brackets",
    category: "Events & Tournaments",
    subcategory: "Tournaments",
    body: "For knockout-style events, choose Single Elimination when starting a tournament. The bracket is generated automatically from check-in order. Report results each round and the bracket advances. Great for smaller events or playoff rounds after Swiss.",
    tags: ["bracket", "elimination", "knockout", "playoff", "tournament"],
  },
  {
    id: "prize-payouts",
    title: "Prize payouts as store credit",
    category: "Events & Tournaments",
    subcategory: "Prizes",
    body: "After a tournament ends, award prizes as store credit directly to player accounts via the ledger. Set payout amounts per placement. This keeps prize money in your store's ecosystem and encourages repeat visits.",
    tags: ["prize", "payout", "store credit", "ledger", "tournament", "reward"],
  },

  /* ================================================================ */
  /*  7. Cafe & Food                                                   */
  /* ================================================================ */
  {
    id: "opening-tabs",
    title: "Opening cafe tabs",
    category: "Cafe & Food",
    subcategory: "Tabs",
    body: "Open a tab from the Cafe page by selecting a table or customer. Tabs unify food, beverage, and retail items in one bill. Items are added from your menu or inventory catalog. Tabs stay open until the customer is ready to settle up.",
    tips: [
      "Hourly table fees are tracked automatically with a live elapsed time display.",
    ],
    tags: ["tab", "cafe", "open", "table", "food", "beverage"],
  },
  {
    id: "menu-builder",
    title: "Menu builder and modifiers",
    category: "Cafe & Food",
    subcategory: "Menu",
    body: "Build your food and drink menu from the Cafe settings. Each menu item can have structured modifiers (like milk type, size, extra shots) with individual pricing. Modifiers appear as options when adding items to a tab.",
    tags: ["menu", "modifier", "food", "drink", "pricing", "cafe"],
  },
  {
    id: "table-fees",
    title: "Table fees",
    category: "Cafe & Food",
    subcategory: "Tabs",
    body: "Charge customers for table time with flat, hourly, or free-with-purchase fee structures. Hourly fees show a live timer on the tab. Set a spend threshold to auto-waive the table fee when customers buy enough food or merchandise.",
    tags: ["table fee", "hourly", "play fee", "game room", "waive"],
  },
  {
    id: "kds-qr-ordering",
    title: "KDS and QR table ordering",
    category: "Cafe & Food",
    subcategory: "Operations",
    body: "The Kitchen Display System (KDS) shows incoming orders for your kitchen or bar staff. Customers can also scan a QR code at their table to order from their phone -- items appear on the KDS automatically. Age verification flags are enforced for alcohol items.",
    tags: ["KDS", "kitchen", "QR", "table ordering", "mobile order", "age verify"],
  },
  {
    id: "tab-operations",
    title: "Tab transfer, split, and close",
    category: "Cafe & Food",
    subcategory: "Tabs",
    body: "Transfer a tab to a different table if customers move. Split a tab by moving specific items to a new tab for separate checks. When ready, close the tab to settle the bill -- this creates a ledger entry and processes payment like a normal sale.",
    tags: ["transfer", "split", "close tab", "settle", "separate checks"],
  },

  /* ================================================================ */
  /*  8. Trade-Ins & Returns                                           */
  /* ================================================================ */
  {
    id: "trade-in-flow",
    title: "Processing a trade-in",
    category: "Trade-Ins & Returns",
    subcategory: "Trade-Ins",
    body: "Open Trade-Ins and scan or search for cards the customer wants to sell. Each card is priced automatically based on your buylist percentage and condition. Review the total offer, adjust individual prices if needed, and complete the trade as cash or store credit.",
    tags: ["trade-in", "buy", "sell", "cards", "singles"],
  },
  {
    id: "cash-vs-credit",
    title: "Cash vs credit payouts",
    category: "Trade-Ins & Returns",
    subcategory: "Trade-Ins",
    body: "Cash payouts use your base buylist percentage. Store credit adds a configurable bonus (default 30%) to incentivize keeping money in-store. Both options are shown side-by-side so the customer can choose. The credit bonus is a powerful retention tool.",
    tags: ["cash", "credit", "payout", "bonus", "trade-in", "incentive"],
  },
  {
    id: "processing-returns",
    title: "Processing returns",
    category: "Trade-Ins & Returns",
    subcategory: "Returns",
    body: "From the More menu in the register, tap Returns. Look up the original transaction, select the items being returned, and choose whether to refund to the original payment method or issue store credit. Inventory quantities are restored and loyalty points are reversed.",
    tips: [
      "Customers with 3+ returns in 30 days are auto-flagged as frequent returners.",
    ],
    tags: ["return", "refund", "exchange", "reverse", "store credit"],
  },
  {
    id: "consignment",
    title: "Consignment intake and management",
    category: "Trade-Ins & Returns",
    subcategory: "Consignment",
    body: "Accept items on consignment from customers. Set the asking price and commission percentage during intake. When the item sells, the system calculates the consignor's share and credits it to their account. Manage all consignment items from the dedicated dashboard with status filtering and stats.",
    tags: ["consignment", "commission", "intake", "consignor", "sell for"],
  },

  /* ================================================================ */
  /*  9. Shipping & Fulfillment                                        */
  /* ================================================================ */
  {
    id: "fulfillment-queue",
    title: "Fulfillment queue",
    category: "Shipping & Fulfillment",
    subcategory: "Queue",
    body: "Online orders land in the fulfillment queue. Each order shows items to pick, the customer's shipping address, and order status. Work through the queue by picking items, packing them, and printing shipping labels. Status updates are sent to customers automatically.",
    tags: ["fulfillment", "queue", "pick", "pack", "ship", "order"],
  },
  {
    id: "pull-sheets",
    title: "Pull sheets",
    category: "Shipping & Fulfillment",
    subcategory: "Picking",
    body: "Generate a pull sheet to batch multiple orders for efficient picking. The sheet groups items by location in your store so you can grab everything in one pass. Mark items as picked and move orders to the packing stage.",
    tags: ["pull sheet", "pick list", "batch", "warehouse", "efficiency"],
  },
  {
    id: "shipping-labels",
    title: "Shipping labels and rate shopping",
    category: "Shipping & Fulfillment",
    subcategory: "Shipping",
    body: "Print shipping labels directly from the fulfillment queue via ShipStation integration. Rate shopping compares carriers (USPS, UPS, FedEx) to find the best price for each package. Tracking numbers are saved and customers receive shipping notification emails.",
    tips: [
      "Set item weights and dimensions in Inventory to get accurate shipping quotes.",
    ],
    tags: ["shipping", "label", "ShipStation", "rate shop", "carrier", "tracking"],
  },
  {
    id: "order-ingestion",
    title: "Order ingestion API",
    category: "Shipping & Fulfillment",
    subcategory: "Integration",
    body: "The order ingestion API accepts orders from external sources (your website, marketplace integrations, or custom apps) and routes them into the fulfillment queue. Orders arrive with items, customer info, and shipping details ready for processing.",
    tags: ["API", "order", "ingestion", "integration", "webhook", "external"],
  },

  /* ================================================================ */
  /*  10. Marketplace & E-Commerce                                     */
  /* ================================================================ */
  {
    id: "ebay-integration",
    title: "eBay integration",
    category: "Marketplace & E-Commerce",
    subcategory: "eBay",
    body: "Connect your eBay account via OAuth to list inventory directly from your catalog. When a card sells on eBay, inventory is synced automatically to prevent overselling. The system handles eBay's account deletion compliance requirements.",
    tags: ["eBay", "marketplace", "listing", "OAuth", "sync"],
  },
  {
    id: "bulk-ebay-listing",
    title: "Bulk eBay listing",
    category: "Marketplace & E-Commerce",
    subcategory: "eBay",
    body: "Select multiple items from your TCG singles inventory and list them all on eBay at once. Set pricing rules (e.g. market price + 10%) and the system generates listings with card images, condition descriptions, and pricing. Review before publishing.",
    tags: ["eBay", "bulk", "listing", "TCG", "marketplace", "batch"],
  },
  {
    id: "api-keys",
    title: "API keys and generic order API",
    category: "Marketplace & E-Commerce",
    subcategory: "API",
    body: "Generate API keys from Settings to connect external platforms to your store. The generic order API lets any system push orders into your fulfillment queue. Use this for custom website integrations, Discord bots, or third-party marketplace connectors.",
    tags: ["API", "key", "integration", "webhook", "developer", "external"],
  },

  /* ================================================================ */
  /*  11. Reports & Intelligence                                       */
  /* ================================================================ */
  {
    id: "cash-flow-reports",
    title: "Cash flow reports",
    category: "Reports & Intelligence",
    subcategory: "Financial",
    body: "The Cash Flow page shows money in (sales, event fees) and money out (trade-in payouts, refunds) for any date range. The daily chart helps you spot trends. This is real operational cash flow, not just revenue -- it includes the liquidity runway metric showing how many days of operating expenses your current cash covers.",
    tags: ["cash flow", "revenue", "expenses", "liquidity", "runway", "financial"],
  },
  {
    id: "cogs-margins",
    title: "COGS and margins",
    category: "Reports & Intelligence",
    subcategory: "Financial",
    body: "Track cost of goods sold and profit margins across your entire inventory or filtered by category. See which product lines are most profitable and which ones are dragging down your margins. Margin data updates in real time as you make sales.",
    tags: ["COGS", "margin", "profit", "cost", "financial", "report"],
  },
  {
    id: "dead-stock",
    title: "Dead stock and bench warmers",
    category: "Reports & Intelligence",
    subcategory: "Inventory Intelligence",
    body: "Items that have not sold in a configurable window (default 90 days) show up as 'bench warmers' in the intelligence dashboard. Consider marking them down, returning them to your distributor, or bundling them in a clearance sale. The threshold is adjustable in Intelligence Preferences.",
    tags: ["dead stock", "bench warmers", "slow movers", "clearance", "aging"],
  },
  {
    id: "event-roi",
    title: "Event ROI",
    category: "Reports & Intelligence",
    subcategory: "Events",
    body: "Event ROI shows the revenue generated by each event -- entry fees plus additional sales made by event attendees during the event window. This helps you figure out which events drive the most business and which ones to cut or restructure.",
    tags: ["event", "ROI", "revenue", "attribution", "attendance", "report"],
  },
  {
    id: "store-advisor",
    title: "Store Advisor",
    category: "Reports & Intelligence",
    subcategory: "Intelligence",
    body: "The Store Advisor is an intelligent business co-pilot that analyzes your real store metrics and gives personalized advice in gamer language. It covers liquidity runway, credit liability, seasonal warnings, WPN metrics, cash-aware buylist recommendations, and identifies regulars who have gone MIA.",
    tips: [
      "Customize the advisor's tone and thresholds in Intelligence Preferences.",
      "The advisor uses FLGS-specific vocabulary like 'bench warmers' and 'regulars MIA'.",
    ],
    tags: ["advisor", "intelligence", "insights", "recommendations", "smart"],
  },
  {
    id: "intelligence-prefs",
    title: "Intelligence preferences",
    category: "Reports & Intelligence",
    subcategory: "Intelligence",
    body: "Configure your intelligence engine thresholds: dead stock days, at-risk customer days, cash comfort zone, monthly fixed costs (rent, payroll, utilities), WPN level, and advisor tone. These settings drive all the intelligence metrics and advisor recommendations.",
    tags: ["preferences", "settings", "thresholds", "intelligence", "configure"],
  },

  /* ================================================================ */
  /*  12. Staff & Admin                                                */
  /* ================================================================ */
  {
    id: "staff-management",
    title: "Staff management",
    category: "Staff & Admin",
    subcategory: "Staff",
    body: "Add team members from the Staff page. Assign them a role: Cashier (register only), Manager (register + inventory + reports), or Owner (everything). Staff members sign in with their own credentials and all actions are tracked. You can also set up credential-based login for staff who do not have Google accounts.",
    tags: ["staff", "team", "add", "role", "employee", "management"],
  },
  {
    id: "permissions",
    title: "Roles and permissions (30+)",
    category: "Staff & Admin",
    subcategory: "Permissions",
    body: "The system has 30+ granular permissions across 7 categories: POS, inventory, customers, trade/returns, events, reports, and admin. Default permissions are set per role but owners can override individual permissions for any staff member. Owners always have all permissions.",
    tags: ["permissions", "roles", "access control", "granular", "override", "security"],
  },
  {
    id: "timeclock",
    title: "Timeclock: PIN, geofence, adjusted clock-out",
    category: "Staff & Admin",
    subcategory: "Timeclock",
    body: "Staff clock in and out via a 4-8 digit PIN from their phone at /clock/[store-slug]. GPS is tagged on clock-in (on-site, remote, or no GPS) but never blocks entry. If someone forgets to clock out, managers can use 'adjusted clock-out' to set the correct time retroactively. The timeclock page is PWA-installable.",
    tips: [
      "PINs are set by owners or managers via the Staff settings.",
      "Geofence radius is configurable per store.",
    ],
    tags: ["timeclock", "PIN", "clock in", "clock out", "GPS", "geofence", "time"],
  },
  {
    id: "mobile-register",
    title: "Mobile register",
    category: "Staff & Admin",
    subcategory: "Mobile",
    body: "The mobile register at /mobile/[store-slug] lets employees run a slimmed-down POS from their phone. Pair the device with a 6-digit access code, then authenticate with a staff PIN. Configurable guardrails include max transaction amount, max transactions per session, refund blocking, and discount/cash toggles.",
    tips: [
      "Rotate the access code periodically -- this revokes all existing mobile sessions.",
      "Rate limiting prevents brute-force attacks: 10 attempts per 15 minutes per IP.",
    ],
    tags: ["mobile", "register", "access code", "PIN", "guardrails", "phone"],
  },
  {
    id: "settings-billing",
    title: "Store settings and billing",
    category: "Staff & Admin",
    subcategory: "Settings",
    body: "Manage your store name, address, tax settings, receipt customization, Stripe connection, feature plan (free/base/pro/enterprise), and add-on modules (intelligence, events, TCG engine, e-commerce, multi-location, cafe, advanced reports, API access) from the Settings page. Billing and plan changes are handled here too.",
    tags: ["settings", "billing", "plan", "subscription", "configuration", "store"],
  },

  /* ================================================================ */
  /*  13. Troubleshooting                                              */
  /* ================================================================ */
  {
    id: "scanner-not-working",
    title: "Scanner not working",
    category: "Troubleshooting",
    subcategory: "Hardware",
    body: "Make sure the scanner is plugged in and the register page is open. The scanner fires via a capture-phase keydown listener that only activates when no input field has focus. Tap somewhere neutral on the register before scanning. The barcode must end with an Enter keypress.",
    tips: [
      "Try scanning a known barcode to test.",
      "Some scanners need a prefix/suffix configured -- the system expects barcodes to end with Enter.",
      "Check that the scanner is in HID (keyboard) mode, not serial mode.",
    ],
    tags: ["scanner", "barcode", "not working", "USB", "HID", "troubleshoot"],
  },
  {
    id: "payment-failed",
    title: "Payment failed",
    category: "Troubleshooting",
    subcategory: "Payments",
    body: "If a card payment fails, check that Stripe is connected in Settings and that the Terminal reader is online (green heartbeat in the status bar). For test mode payments, failures usually indicate a network issue. Cash and store credit payments work even if your internet connection drops.",
    tags: ["payment", "failed", "error", "Stripe", "network", "troubleshoot"],
  },
  {
    id: "terminal-reader-setup",
    title: "Terminal reader setup (S710)",
    category: "Troubleshooting",
    subcategory: "Hardware",
    body: "Register your Stripe Terminal S710 reader from Settings under Payments. The reader connects over your local network. After registration, the reader appears in the status bar with a heartbeat indicator. If the reader disconnects, try power cycling it and checking your WiFi.",
    tags: ["terminal", "S710", "reader", "Stripe", "setup", "hardware"],
  },
  {
    id: "keyboard-issues",
    title: "Keyboard shortcut conflicts",
    category: "Troubleshooting",
    subcategory: "Input",
    body: "The register uses keyboard shortcuts for quick actions. If shortcuts are interfering with text input, make sure you are clicked into an input field -- all input fields prevent shortcut conflicts by stopping key event propagation. If you are on a tablet, the virtual keyboard should not trigger shortcuts.",
    tags: ["keyboard", "shortcut", "conflict", "input", "typing", "troubleshoot"],
  },
  {
    id: "sync-issues",
    title: "Sync and offline issues",
    category: "Troubleshooting",
    subcategory: "Network",
    body: "Most operations require an internet connection. If you notice data not updating, check your network connection and refresh the page. The HQ bridge uses an outbox pattern with exponential backoff -- events will sync automatically when connectivity is restored. Cash sales can be processed offline and will sync later.",
    tags: ["sync", "offline", "network", "connection", "outbox", "bridge"],
  },
];
