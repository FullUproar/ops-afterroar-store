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
  // Staff lock screen
  staff_lock_enabled: boolean;
  staff_lock_timeout_minutes: number;
  // Shipping
  shipping_enabled: boolean;
  warehouse_street: string;
  warehouse_city: string;
  warehouse_state: string;
  warehouse_zip: string;
  warehouse_country: string;
  shipping_free_threshold_cents: number; // Free shipping above this amount (0 = no free shipping)
  // Cross-store intelligence
  opt_in_benchmarking: boolean;
  // Afterroar Network — cross-store inventory sharing
  network_inventory_enabled: boolean; // share your stock levels with the network
  network_inventory_visible: boolean; // show your store name + location to other stores
  // NUX (new user experience)
  nux_dismissed: boolean;
  // Tips
  tips_mode: "never" | "always" | "contextual";
  tips_contexts: string[]; // which contexts trigger tip prompt: "cafe", "food_drink", "table_service", "events"
  tips_presets: number[];  // preset tip percentages shown on terminal/screen (e.g. [15, 20, 25])
  tips_allow_custom: boolean; // allow custom tip amount
  // Mobile register
  mobile_register_enabled: boolean;
  mobile_access_code_hash: string;    // bcrypt hash of the 6-digit code
  mobile_session_hours: number;       // how long a paired device stays active (default 12)
  mobile_max_tx_per_session: number;  // max transactions per session (0 = unlimited)
  mobile_max_tx_cents: number;        // max single transaction in cents (0 = unlimited)
  mobile_allow_discounts: boolean;    // can mobile register apply discounts
  mobile_allow_refunds: boolean;      // can mobile register process refunds (default false)
  mobile_allow_cash: boolean;         // can mobile register accept cash (default true)
  hidden_nav_items: string[];        // hrefs of nav items to hide (e.g. ["/dashboard/cafe", "/dashboard/consignment"])
  // Custom tags — store-defined taxonomy on top of the fixed `category` enum.
  // Stores use these for things like "Asmodee exclusive", "Clearance", or
  // "Holiday gift idea". Applied to inventory via attributes.tags[] and
  // referenced by promotions via scope=tag, scope_value=<tag_id>.
  custom_tags: { id: string; label: string; color: string }[];
  // Register quick-button tiles — store-curated favorites that override the
  // automatic top-sellers fallback. Each tile points at an inventory item
  // and renders as a one-tap add-to-cart button on the register screen.
  quick_items: { id: string; label: string; inventory_id?: string; price_cents?: number; color?: string }[];
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
  intel_at_risk_days: 60,
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
  // Staff lock screen
  staff_lock_enabled: false,
  staff_lock_timeout_minutes: 0,
  // Shipping
  shipping_enabled: false,
  warehouse_street: "",
  warehouse_city: "",
  warehouse_state: "",
  warehouse_zip: "",
  warehouse_country: "US",
  shipping_free_threshold_cents: 0,
  // Cross-store intelligence
  opt_in_benchmarking: false,
  network_inventory_enabled: false,
  network_inventory_visible: false,
  // NUX
  nux_dismissed: false,
  // Tips
  tips_mode: "contextual",
  tips_contexts: ["cafe", "food_drink", "table_service"],
  tips_presets: [15, 20, 25],
  tips_allow_custom: true,
  // Mobile register
  mobile_register_enabled: false,
  mobile_access_code_hash: "",
  mobile_session_hours: 12,
  mobile_max_tx_per_session: 0,
  mobile_max_tx_cents: 0,
  mobile_allow_discounts: false,
  mobile_allow_refunds: false,
  mobile_allow_cash: true,
  hidden_nav_items: [],
  custom_tags: [],
  quick_items: [],
};

/** Server-safe: get typed settings from a store record */
export function getStoreSettings(
  storeSettings: Record<string, unknown> | null
): StoreSettings {
  const raw = (storeSettings ?? {}) as Partial<StoreSettings>;
  return { ...SETTINGS_DEFAULTS, ...raw };
}

/**
 * Should we prompt for a tip on this transaction?
 * Uses store settings + cart context to decide.
 *
 * @param settings - store settings
 * @param context - what kind of transaction this is
 *   - categories: item categories in the cart (e.g. ["food_drink", "board_game"])
 *   - source: "register" | "cafe" | "table" | "mobile" | "online"
 */
export function shouldPromptTip(
  settings: StoreSettings,
  context: {
    categories?: string[];
    source?: string;
  },
): boolean {
  if (settings.tips_mode === "never") return false;
  if (settings.tips_mode === "always") return true;

  // Contextual mode — check if any trigger matches
  const triggers = settings.tips_contexts;

  // Cafe tab close
  if (context.source === "cafe" && triggers.includes("cafe")) return true;

  // Table service (QR order, tab)
  if (context.source === "table" && triggers.includes("table_service")) return true;

  // Cart contains food/drink items
  if (
    triggers.includes("food_drink") &&
    context.categories?.some((c) => c === "food_drink")
  ) {
    return true;
  }

  // Event check-in with fee
  if (context.source === "event" && triggers.includes("events")) return true;

  return false;
}
