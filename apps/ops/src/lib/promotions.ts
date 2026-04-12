/* ------------------------------------------------------------------ */
/*  Promotion / Discount Engine                                         */
/*                                                                      */
/*  Supports:                                                           */
/*    Sale pricing:                                                     */
/*      - percent_off     (20% off)                                    */
/*      - amount_off      ($5 off)                                     */
/*      - fixed_price     (override to $9.99)                          */
/*                                                                      */
/*    Scopes:                                                           */
/*      - all             (entire store)                               */
/*      - category        (all board_game, all tcg_single, etc.)       */
/*      - item            (specific inventory item ID)                 */
/*      - customer_tag    (senior, veteran, employee, vip, etc.)       */
/*      - quantity_min    (buy 3+, get 10% off — bulk discount)        */
/*      - combo           (buy X + Y, get $Z off)                      */
/*      - coupon          (enter code at checkout)                     */
/*                                                                      */
/*    Time-bound: starts_at / ends_at (null = always active)           */
/*    Stackable: priority determines order; metadata.stackable flag    */
/*                                                                      */
/*  The checkout calls getBestPrice() for each cart item.               */
/*  The cashier sees the original price crossed out + sale price.       */
/* ------------------------------------------------------------------ */

export interface Promotion {
  id: string;
  name: string;
  type: "percent_off" | "amount_off" | "fixed_price";
  value: number; // percent (20), cents (500), or fixed price cents (999)
  scope: string;
  scope_value: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  priority: number;
  metadata: Record<string, unknown>;
}

export interface CartItemForPricing {
  inventory_item_id: string;
  name: string;
  category: string;
  price_cents: number; // original price
  quantity: number;
}

export interface AppliedDiscount {
  promotion_id: string;
  promotion_name: string;
  type: string;
  original_price_cents: number;
  sale_price_cents: number;
  savings_cents: number;
  per_unit_savings_cents: number;
}

/**
 * Check if a promotion is currently active (time-bound check).
 */
export function isPromotionActive(promo: Promotion): boolean {
  if (!promo.active) return false;
  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) return false;
  if (promo.ends_at && new Date(promo.ends_at) < now) return false;
  return true;
}

/**
 * Check if a promotion applies to a specific cart item.
 */
export function promotionMatchesItem(
  promo: Promotion,
  item: CartItemForPricing,
  context?: {
    customer_tags?: string[];
    coupon_code?: string;
    cart_items?: CartItemForPricing[];
  }
): boolean {
  if (!isPromotionActive(promo)) return false;

  switch (promo.scope) {
    case "all":
      return true;

    case "category":
      return item.category === promo.scope_value;

    case "item":
      return item.inventory_item_id === promo.scope_value;

    case "customer_tag":
      // Matches if customer has the tag (senior, veteran, employee, vip)
      return context?.customer_tags?.includes(promo.scope_value ?? "") ?? false;

    case "quantity_min":
      // Bulk discount: applies when item quantity >= threshold
      const minQty = parseInt(promo.scope_value ?? "0");
      return item.quantity >= minQty;

    case "combo":
      // Combo: applies when BOTH item IDs are in the cart
      // scope_value format: "item_id_1+item_id_2"
      if (!context?.cart_items || !promo.scope_value) return false;
      const comboIds = promo.scope_value.split("+");
      const cartIds = new Set(context.cart_items.map((i) => i.inventory_item_id));
      return comboIds.every((id) => cartIds.has(id));

    case "coupon":
      // Matches if the entered coupon code matches
      return context?.coupon_code === promo.scope_value;

    default:
      return false;
  }
}

/**
 * Calculate the discounted price for an item given a promotion.
 */
export function calculateDiscountedPrice(
  promo: Promotion,
  originalPriceCents: number
): number {
  switch (promo.type) {
    case "percent_off":
      return Math.round(originalPriceCents * (1 - promo.value / 100));
    case "amount_off":
      return Math.max(0, originalPriceCents - promo.value);
    case "fixed_price":
      return promo.value;
    default:
      return originalPriceCents;
  }
}

/**
 * Find the best applicable promotion for a cart item.
 * Returns the discount that saves the customer the most money.
 */
export function getBestDiscount(
  item: CartItemForPricing,
  promotions: Promotion[],
  context?: {
    customer_tags?: string[];
    coupon_code?: string;
    cart_items?: CartItemForPricing[];
  }
): AppliedDiscount | null {
  const applicable = promotions
    .filter((p) => promotionMatchesItem(p, item, context))
    .sort((a, b) => b.priority - a.priority);

  if (applicable.length === 0) return null;

  // Find the promotion that saves the most
  let bestDiscount: AppliedDiscount | null = null;
  let bestSavings = 0;

  for (const promo of applicable) {
    const salePrice = calculateDiscountedPrice(promo, item.price_cents);
    const savings = item.price_cents - salePrice;

    if (savings > bestSavings) {
      bestSavings = savings;
      bestDiscount = {
        promotion_id: promo.id,
        promotion_name: promo.name,
        type: promo.type,
        original_price_cents: item.price_cents,
        sale_price_cents: salePrice,
        savings_cents: savings * item.quantity,
        per_unit_savings_cents: savings,
      };
    }
  }

  return bestDiscount;
}

/** Guardrail settings (from store settings) */
export interface PromoGuardrails {
  max_discount_percent: number;
  max_total_discount_percent: number;
  max_per_transaction: number;
  require_manager_above_percent: number;
  allow_on_sale_items: boolean;
}

export const DEFAULT_GUARDRAILS: PromoGuardrails = {
  max_discount_percent: 50,
  max_total_discount_percent: 50,
  max_per_transaction: 1,
  require_manager_above_percent: 30,
  allow_on_sale_items: false,
};

export interface CartWithDiscounts {
  items: Array<CartItemForPricing & { discount: AppliedDiscount | null }>;
  total_savings_cents: number;
  total_discount_percent: number;
  promos_applied: number;
  requires_manager_approval: boolean;
  guardrail_warnings: string[];
}

/**
 * Apply promotions to an entire cart WITH guardrails enforced.
 * This is the main function checkout should call.
 */
export function applyPromotionsToCart(
  items: CartItemForPricing[],
  promotions: Promotion[],
  guardrails?: Partial<PromoGuardrails>,
  context?: {
    customer_tags?: string[];
    coupon_code?: string;
  }
): CartWithDiscounts {
  const g = { ...DEFAULT_GUARDRAILS, ...guardrails };
  const warnings: string[] = [];
  const usedPromoIds = new Set<string>();

  const subtotal = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);

  const discountedItems = items.map((item) => {
    // Guardrail: max promos per transaction
    if (usedPromoIds.size >= g.max_per_transaction) {
      return { ...item, discount: null };
    }

    let discount = getBestDiscount(item, promotions, {
      ...context,
      cart_items: items,
    });

    if (!discount) return { ...item, discount: null };

    // Guardrail: max discount % per item
    const discountPercent = (discount.per_unit_savings_cents / discount.original_price_cents) * 100;
    if (discountPercent > g.max_discount_percent) {
      // Cap the discount
      const cappedSavings = Math.round(item.price_cents * g.max_discount_percent / 100);
      discount = {
        ...discount,
        sale_price_cents: item.price_cents - cappedSavings,
        per_unit_savings_cents: cappedSavings,
        savings_cents: cappedSavings * item.quantity,
      };
      warnings.push(`"${item.name}" discount capped at ${g.max_discount_percent}%`);
    }

    usedPromoIds.add(discount.promotion_id);
    return { ...item, discount };
  });

  const totalSavings = discountedItems.reduce(
    (s, i) => s + (i.discount?.savings_cents ?? 0), 0
  );
  const totalDiscountPercent = subtotal > 0 ? (totalSavings / subtotal) * 100 : 0;

  // Guardrail: max total discount % on entire purchase
  if (totalDiscountPercent > g.max_total_discount_percent) {
    warnings.push(`Total discount (${Math.round(totalDiscountPercent)}%) exceeds maximum (${g.max_total_discount_percent}%). Some discounts may be reduced.`);
  }

  // Guardrail: require manager approval above threshold
  const requiresManager = totalDiscountPercent > g.require_manager_above_percent;
  if (requiresManager) {
    warnings.push(`Discount above ${g.require_manager_above_percent}% requires manager approval`);
  }

  return {
    items: discountedItems,
    total_savings_cents: totalSavings,
    total_discount_percent: Math.round(totalDiscountPercent * 10) / 10,
    promos_applied: usedPromoIds.size,
    requires_manager_approval: requiresManager,
    guardrail_warnings: warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Promotion type helpers for the UI                                   */
/* ------------------------------------------------------------------ */

export const PROMOTION_TYPES = [
  { value: "percent_off", label: "Percent Off", unit: "%" },
  { value: "amount_off", label: "Amount Off", unit: "$" },
  { value: "fixed_price", label: "Fixed Price", unit: "$" },
];

export const PROMOTION_SCOPES = [
  { value: "all", label: "Everything in store" },
  { value: "category", label: "Specific category" },
  { value: "item", label: "Specific item" },
  { value: "customer_tag", label: "Customer group (senior, veteran, VIP, employee)" },
  { value: "quantity_min", label: "Bulk discount (minimum quantity)" },
  { value: "combo", label: "Combo deal (buy together)" },
  { value: "coupon", label: "Coupon code" },
];

export const CUSTOMER_DISCOUNT_TAGS = [
  { value: "senior", label: "Senior Discount" },
  { value: "veteran", label: "Veteran / Military Discount" },
  { value: "employee", label: "Employee Discount" },
  { value: "vip", label: "VIP Customer" },
  { value: "student", label: "Student Discount" },
];
