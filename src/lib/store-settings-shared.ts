/**
 * Shared store settings — safe to import from BOTH client and server.
 * No React hooks, no "use client" directive.
 */

export interface StoreSettings {
  store_display_name: string;
  tax_rate_percent: number;
  tax_included_in_price: boolean;
  default_credit_bonus_percent: number;
  low_stock_threshold: number;
  receipt_footer_message: string;
  loyalty_enabled: boolean;
  loyalty_points_per_dollar: number;
  loyalty_redemption_rate: number;
  currency: string;
  // Intelligence preferences
  intel_monthly_rent: number;
  intel_monthly_utilities: number;
  intel_monthly_insurance: number;
  intel_monthly_payroll: number;
  intel_monthly_other_fixed: number;
  intel_dead_stock_days: number;
  intel_at_risk_days: number;
  intel_buylist_cash_comfort_days: number;
  intel_credit_liability_warn_percent: number;
  intel_prefer_credit_buylists: boolean;
  intel_wpn_level: string;
  intel_seasonal_warnings: boolean;
  intel_advisor_enabled: boolean;
  intel_advisor_tone: string;
  // Timeclock
  timeclock_geofence_enabled: boolean;
  timeclock_geofence_lat: number;
  timeclock_geofence_lng: number;
  timeclock_geofence_radius_meters: number;
  [key: string]: unknown;
}

export const SETTINGS_DEFAULTS: StoreSettings = {
  store_display_name: "",
  tax_rate_percent: 0,
  tax_included_in_price: false,
  default_credit_bonus_percent: 30,
  low_stock_threshold: 5,
  receipt_footer_message: "Thank you for shopping with us!",
  loyalty_enabled: false,
  loyalty_points_per_dollar: 1,
  loyalty_redemption_rate: 100, // 100 points = $1
  currency: "USD",
  // Intelligence preferences
  intel_monthly_rent: 0,
  intel_monthly_utilities: 0,
  intel_monthly_insurance: 0,
  intel_monthly_payroll: 0,
  intel_monthly_other_fixed: 0,
  intel_dead_stock_days: 30,
  intel_at_risk_days: 14,
  intel_buylist_cash_comfort_days: 14,
  intel_credit_liability_warn_percent: 50,
  intel_prefer_credit_buylists: false,
  intel_wpn_level: "none",
  intel_seasonal_warnings: true,
  intel_advisor_enabled: true,
  intel_advisor_tone: "gamer",
  // Timeclock
  timeclock_geofence_enabled: false,
  timeclock_geofence_lat: 0,
  timeclock_geofence_lng: 0,
  timeclock_geofence_radius_meters: 150,
};

/** Server-safe: get typed settings from a store record */
export function getStoreSettings(
  storeSettings: Record<string, unknown> | null
): StoreSettings {
  const raw = (storeSettings ?? {}) as Partial<StoreSettings>;
  return { ...SETTINGS_DEFAULTS, ...raw };
}
