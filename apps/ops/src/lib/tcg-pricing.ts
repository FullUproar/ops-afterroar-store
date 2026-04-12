/**
 * TCG Singles Pricing Engine
 *
 * Auto-calculates buy/sell offers based on market price, condition, and store config.
 * Used by the bulk trade-in page and inventory pricing tools.
 */

export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const CONDITIONS: Condition[] = ["NM", "LP", "MP", "HP", "DMG"];

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export const DEFAULT_CONDITION_MULTIPLIERS: Record<Condition, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.5,
  DMG: 0.3,
};

export const CONDITION_PERCENT: Record<Condition, number> = {
  NM: 100,
  LP: 85,
  MP: 70,
  HP: 50,
  DMG: 30,
};

export interface PricingConfig {
  /** Store pays this % of market price (default 70) */
  buylistPercent: number;
  /** Multipliers per condition grade */
  conditionMultipliers: Record<Condition, number>;
  /** Extra multiplier for foils — usually 1.0 since foil market price is separate */
  foilMultiplier: number;
  /** Round offer to nearest X cents (default 25) */
  roundTo: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  buylistPercent: 70,
  conditionMultipliers: { ...DEFAULT_CONDITION_MULTIPLIERS },
  foilMultiplier: 1.0,
  roundTo: 25,
};

/**
 * Round a cent value to the nearest `roundTo` cents.
 * e.g. roundTo=25: 173 → 175, 112 → 100
 */
function roundCents(cents: number, roundTo: number): number {
  if (roundTo <= 1) return Math.round(cents);
  return Math.round(cents / roundTo) * roundTo;
}

/**
 * Calculate the store's buy offer for a card.
 */
export function calculateOffer(params: {
  marketPriceCents: number;
  condition: Condition;
  isFoil: boolean;
  config?: Partial<PricingConfig>;
}): number {
  const cfg: PricingConfig = { ...DEFAULT_PRICING_CONFIG, ...params.config };
  const condMul =
    cfg.conditionMultipliers[params.condition] ??
    DEFAULT_CONDITION_MULTIPLIERS[params.condition] ??
    1.0;
  const foilMul = params.isFoil ? cfg.foilMultiplier : 1.0;
  const raw =
    params.marketPriceCents * condMul * foilMul * (cfg.buylistPercent / 100);
  return Math.max(0, roundCents(raw, cfg.roundTo));
}

/**
 * Calculate the store's sell price for a card.
 */
export function calculateSellPrice(params: {
  marketPriceCents: number;
  condition: Condition;
  isFoil: boolean;
  markupPercent?: number; // e.g. 130 = sell at 130% of market (default 100)
}): number {
  const markup = (params.markupPercent ?? 100) / 100;
  const condMul =
    DEFAULT_CONDITION_MULTIPLIERS[params.condition] ?? 1.0;
  const raw = params.marketPriceCents * condMul * markup;
  return Math.max(0, Math.round(raw));
}
