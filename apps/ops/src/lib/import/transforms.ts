/* ------------------------------------------------------------------ */
/*  Data transformations for import pipeline                            */
/* ------------------------------------------------------------------ */

/** Convert a dollar string to cents: "$12.99" → 1299, "12.99" → 1299 */
export function dollarsToCents(value: unknown): number {
  if (typeof value === "number") return Math.round(value * 100);
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

/** Normalize card condition to standard: "Near Mint" → "NM" */
const CONDITION_MAP: Record<string, string> = {
  "nm": "NM", "near mint": "NM", "near-mint": "NM", "mint": "NM",
  "lp": "LP", "light play": "LP", "lightly played": "LP", "light-play": "LP", "sp": "LP", "slightly played": "LP",
  "mp": "MP", "moderate play": "MP", "moderately played": "MP", "moderate-play": "MP",
  "hp": "HP", "heavy play": "HP", "heavily played": "HP", "heavy-play": "HP",
  "dmg": "DMG", "damaged": "DMG", "poor": "DMG",
};

export function normalizeCondition(value: unknown): string {
  if (typeof value !== "string") return "LP";
  const lookup = CONDITION_MAP[value.toLowerCase().trim()];
  if (lookup) return lookup;
  // Check if it's already a valid short code
  const upper = value.toUpperCase().trim();
  if (["NM", "LP", "MP", "HP", "DMG"].includes(upper)) return upper;
  return "LP"; // Default
}

/** Normalize category to our system's values */
const CATEGORY_MAP: Record<string, string> = {
  // TCG
  "tcg": "tcg_single", "tcg single": "tcg_single", "tcg singles": "tcg_single",
  "singles": "tcg_single", "single": "tcg_single", "card": "tcg_single", "cards": "tcg_single",
  "magic": "tcg_single", "magic: the gathering": "tcg_single", "mtg": "tcg_single",
  "pokemon": "tcg_single", "pokémon": "tcg_single",
  "yu-gi-oh": "tcg_single", "yugioh": "tcg_single", "yu-gi-oh!": "tcg_single",
  "flesh and blood": "tcg_single", "fab": "tcg_single",
  "lorcana": "tcg_single", "one piece": "tcg_single",
  // Sealed
  "sealed": "sealed", "sealed product": "sealed", "booster": "sealed", "box": "sealed",
  "booster box": "sealed", "pack": "sealed", "bundle": "sealed", "deck": "sealed",
  "commander deck": "sealed", "starter deck": "sealed",
  // Board games
  "board game": "board_game", "board games": "board_game", "boardgame": "board_game",
  "game": "board_game", "games": "board_game", "tabletop": "board_game",
  // Miniatures
  "miniature": "miniature", "miniatures": "miniature", "mini": "miniature",
  "warhammer": "miniature", "40k": "miniature", "paint": "miniature", "terrain": "miniature",
  // Accessories
  "accessory": "accessory", "accessories": "accessory", "supply": "accessory",
  "supplies": "accessory", "sleeve": "accessory", "sleeves": "accessory",
  "dice": "accessory", "playmat": "accessory", "binder": "accessory",
  // Food
  "food": "food_drink", "drink": "food_drink", "food & drink": "food_drink",
  "café": "food_drink", "cafe": "food_drink", "beverage": "food_drink", "snack": "food_drink",
};

export function normalizeCategory(value: unknown): string {
  if (typeof value !== "string") return "other";
  const lookup = CATEGORY_MAP[value.toLowerCase().trim()];
  if (lookup) return lookup;
  // Check if already valid
  const valid = ["tcg_single", "sealed", "board_game", "miniature", "accessory", "food_drink", "other"];
  if (valid.includes(value.toLowerCase().trim())) return value.toLowerCase().trim();
  return "other";
}

/** Normalize phone: strip non-digits, keep last 10 */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Keep last 10 digits (strip country code)
  const last10 = digits.slice(-10);
  return last10.length === 10
    ? `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`
    : digits;
}

/** Parse boolean from various formats */
export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  const v = value.toLowerCase().trim();
  return ["true", "yes", "1", "y", "foil", "x"].includes(v);
}

/** Apply a named transform to a value */
export function applyTransform(
  value: unknown,
  transform: string
): unknown {
  switch (transform) {
    case "dollars_to_cents":
      return dollarsToCents(value);
    case "normalize_condition":
      return normalizeCondition(value);
    case "normalize_category":
      return normalizeCategory(value);
    case "normalize_phone":
      return normalizePhone(value);
    case "boolean":
      return parseBoolean(value);
    default:
      return value;
  }
}
