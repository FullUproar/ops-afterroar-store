/* ------------------------------------------------------------------ */
/*  Loyalty Points Engine                                               */
/*  Earns points on purchases, trade-ins, events.                       */
/*  Redeems points as checkout discount.                                */
/*  All mutations are ledger-based (append-only).                       */
/* ------------------------------------------------------------------ */

import { prisma } from "./prisma";
import { getStoreSettings } from "./store-settings-shared";

interface EarnResult {
  points_earned: number;
  new_balance: number;
}

interface RedeemResult {
  points_redeemed: number;
  discount_cents: number;
  new_balance: number;
}

/**
 * Calculate points to earn for a purchase amount.
 */
export function calculatePurchasePoints(
  amountCents: number,
  storeSettings: Record<string, unknown> | null
): number {
  const settings = getStoreSettings(storeSettings);
  if (!settings.loyalty_enabled) return 0;
  return Math.floor((amountCents / 100) * settings.loyalty_points_per_dollar);
}

/**
 * Calculate points to earn for a trade-in.
 */
export function calculateTradeInPoints(
  storeSettings: Record<string, unknown> | null
): number {
  const settings = getStoreSettings(storeSettings);
  if (!settings.loyalty_enabled) return 0;
  return (settings.loyalty_trade_in_bonus_points as number) ?? 0;
}

/**
 * Calculate points to earn for an event check-in.
 */
export function calculateEventPoints(
  storeSettings: Record<string, unknown> | null
): number {
  const settings = getStoreSettings(storeSettings);
  if (!settings.loyalty_enabled) return 0;
  return (settings.loyalty_event_checkin_points as number) ?? 0;
}

/**
 * Calculate the discount in cents for a point redemption.
 */
export function calculateRedemptionDiscount(
  points: number,
  storeSettings: Record<string, unknown> | null
): number {
  const settings = getStoreSettings(storeSettings);
  if (!settings.loyalty_enabled) return 0;
  return Math.floor(points / ((settings.loyalty_redeem_points_per_dollar as number) || 100)) * 100;
}

/**
 * Check if a customer can redeem points.
 */
export function canRedeem(
  currentBalance: number,
  storeSettings: Record<string, unknown> | null
): boolean {
  const settings = getStoreSettings(storeSettings);
  if (!settings.loyalty_enabled) return false;
  return currentBalance >= ((settings.loyalty_min_redeem_points as number) || 100);
}

/**
 * Earn points for a customer. Creates a ledger entry and updates balance.
 * Call this inside a Prisma $transaction for atomicity with the sale/trade-in.
 */
export async function earnPoints(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    storeId: string;
    customerId: string;
    type: "earn_purchase" | "earn_trade_in" | "earn_event";
    points: number;
    description: string;
    referenceId?: string;
  }
): Promise<EarnResult> {
  if (params.points <= 0) return { points_earned: 0, new_balance: 0 };

  // Update customer balance
  const customer = await tx.posCustomer.update({
    where: { id: params.customerId },
    data: { loyalty_points: { increment: params.points } },
    select: { loyalty_points: true },
  });

  // Create loyalty ledger entry
  await tx.posLoyaltyEntry.create({
    data: {
      store_id: params.storeId,
      customer_id: params.customerId,
      type: params.type,
      points: params.points,
      balance_after: customer.loyalty_points,
      description: params.description,
      reference_id: params.referenceId,
    },
  });

  return {
    points_earned: params.points,
    new_balance: customer.loyalty_points,
  };
}

/**
 * Redeem points for a customer. Creates a ledger entry and updates balance.
 * Call this inside a Prisma $transaction for atomicity with the sale.
 */
export async function redeemPoints(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    storeId: string;
    customerId: string;
    points: number;
    discountCents: number;
    referenceId?: string;
  }
): Promise<RedeemResult> {
  if (params.points <= 0) return { points_redeemed: 0, discount_cents: 0, new_balance: 0 };

  // Update customer balance
  const customer = await tx.posCustomer.update({
    where: { id: params.customerId },
    data: { loyalty_points: { decrement: params.points } },
    select: { loyalty_points: true },
  });

  // Create loyalty ledger entry
  await tx.posLoyaltyEntry.create({
    data: {
      store_id: params.storeId,
      customer_id: params.customerId,
      type: "redeem",
      points: -params.points,
      balance_after: customer.loyalty_points,
      description: `Redeemed ${params.points} points for ${(params.discountCents / 100).toFixed(2)} discount`,
      reference_id: params.referenceId,
    },
  });

  return {
    points_redeemed: params.points,
    discount_cents: params.discountCents,
    new_balance: customer.loyalty_points,
  };
}
