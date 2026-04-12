/**
 * Stripe Tax Code mapping for Store Ops product categories.
 *
 * Tax codes tell Stripe WHAT the product is. Stripe Tax uses the code +
 * the customer/seller location to determine the correct rate.
 * This means the same product gets taxed correctly whether sold
 * at the home store or at a con in a different state.
 *
 * Reference: https://stripe.com/docs/tax/tax-codes
 */

export interface TaxCodeMapping {
  code: string;
  label: string;
  description: string;
}

/**
 * Category → Stripe Tax Code.
 * Defaults from product category. Stores can override per-item.
 */
export const CATEGORY_TAX_CODES: Record<string, TaxCodeMapping> = {
  // Tangible goods — taxed everywhere
  board_game: {
    code: "txcd_99999999",
    label: "General Merchandise",
    description: "Board games, tabletop games, RPG books, accessories",
  },
  tcg_single: {
    code: "txcd_99999999",
    label: "General Merchandise",
    description: "Individual trading cards (MTG, Pokemon, Yu-Gi-Oh, etc.)",
  },
  sealed: {
    code: "txcd_99999999",
    label: "General Merchandise",
    description: "Sealed booster boxes, packs, bundles, precons",
  },
  miniature: {
    code: "txcd_99999999",
    label: "General Merchandise",
    description: "Miniatures, terrain, paint, hobby supplies",
  },
  accessory: {
    code: "txcd_99999999",
    label: "General Merchandise",
    description: "Sleeves, deck boxes, playmats, dice",
  },
  clothing: {
    code: "txcd_20010000",
    label: "Clothing",
    description: "T-shirts, hats, apparel — some states exempt under thresholds",
  },

  // Food & drink — varies by state and preparation
  food_drink: {
    code: "txcd_40060003",
    label: "Prepared Food",
    description: "Food/drinks prepared and served for immediate consumption (cafe, bar)",
  },
  food_prepared: {
    code: "txcd_40060003",
    label: "Prepared Food",
    description: "Hot food, coffee, made-to-order items",
  },
  food_unprepared: {
    code: "txcd_40050001",
    label: "Food for Off-Premises",
    description: "Packaged snacks, bottled drinks, candy — exempt in many states",
  },
  beverage_alcohol: {
    code: "txcd_40040000",
    label: "Alcoholic Beverages",
    description: "Beer, wine, spirits — taxed everywhere, often at higher rate",
  },

  // Digital & services
  gift_card: {
    code: "txcd_10000000",
    label: "Stored Value / Gift Card",
    description: "Not taxed at purchase — tax collected when redeemed",
  },
  event_admission: {
    code: "txcd_10040001",
    label: "Admission to Events",
    description: "Tournament entry, event tickets — varies by state",
  },

  // Catch-all
  other: {
    code: "txcd_99999999",
    label: "General Merchandise",
    description: "Default for uncategorized items",
  },
};

/**
 * Get the Stripe Tax code for a product category.
 * Falls back to general merchandise if category not mapped.
 */
export function getTaxCode(category: string, subCategory?: string | null): string {
  // Check sub-category first (e.g. food_prepared vs food_unprepared)
  if (subCategory && CATEGORY_TAX_CODES[subCategory]) {
    return CATEGORY_TAX_CODES[subCategory].code;
  }
  return CATEGORY_TAX_CODES[category]?.code || CATEGORY_TAX_CODES.other.code;
}

/**
 * Get tax code label for display in settings/UI.
 */
export function getTaxCodeLabel(category: string): string {
  return CATEGORY_TAX_CODES[category]?.label || "General Merchandise";
}

/**
 * All available tax code options for UI dropdowns (per-item override).
 */
export const TAX_CODE_OPTIONS = Object.entries(CATEGORY_TAX_CODES).map(
  ([key, mapping]) => ({
    value: key,
    code: mapping.code,
    label: mapping.label,
    description: mapping.description,
  }),
);
