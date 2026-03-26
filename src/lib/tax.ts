/* ------------------------------------------------------------------ */
/*  Tax Calculation Engine (backup — Stripe Tax is primary later)      */
/*  Reads tax_rate_percent and tax_included_in_price from store        */
/*  settings. Supports tax-exempt customers.                           */
/* ------------------------------------------------------------------ */

import { getStoreSettings } from "./store-settings";

export interface TaxResult {
  taxCents: number;
  totalCents: number;
}

/**
 * Calculate tax on a subtotal.
 * @param subtotalCents  — the pre-tax subtotal in cents
 * @param taxRatePercent — the tax rate as a percentage (e.g., 7 for 7%)
 * @param taxInclusive   — true if prices already include tax
 * @param taxExempt      — true if the customer is tax-exempt
 */
export function calculateTax(
  subtotalCents: number,
  taxRatePercent: number,
  taxInclusive = false,
  taxExempt = false
): TaxResult {
  if (taxExempt || taxRatePercent <= 0) {
    return { taxCents: 0, totalCents: subtotalCents };
  }

  if (taxInclusive) {
    // Tax is already baked into the price — extract it for display
    const taxCents = Math.round(
      subtotalCents - subtotalCents / (1 + taxRatePercent / 100)
    );
    return { taxCents, totalCents: subtotalCents };
  }

  // Tax-exclusive: add tax on top
  const taxCents = Math.round(subtotalCents * (taxRatePercent / 100));
  return { taxCents, totalCents: subtotalCents + taxCents };
}

/**
 * Server-side helper: calculate tax from store settings JSON.
 */
export function calculateTaxFromSettings(
  subtotalCents: number,
  storeSettings: Record<string, unknown> | null,
  taxExempt = false
): TaxResult {
  const settings = getStoreSettings(storeSettings);
  return calculateTax(
    subtotalCents,
    settings.tax_rate_percent,
    settings.tax_included_in_price,
    taxExempt
  );
}
