"use client";

import { useStore } from "./store-context";

/* ------------------------------------------------------------------ */
/*  Store Settings — typed, with sensible defaults                      */
/*  Owner configures on Tuesday. Cashier benefits on Saturday.          */
/* ------------------------------------------------------------------ */

export interface StoreSettings {
  // Store identity
  store_display_name: string;
  store_phone: string;
  store_website: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_show_barcode: boolean;
  receipt_show_savings: boolean;
  receipt_show_return_policy: boolean;
  return_policy_text: string;

  // Trade-ins
  trade_in_credit_bonus_percent: number;
  trade_in_require_customer: boolean;

  // Returns
  return_credit_bonus_percent: number;
  return_restocking_fee_percent: number;
  return_window_days: number;
  return_require_reason: boolean;

  // Checkout
  checkout_require_customer: boolean;
  checkout_auto_print_receipt: boolean;
  checkout_default_payment_method: string;

  // Tax
  tax_rate_percent: number;
  tax_included_in_price: boolean;

  // Inventory
  low_stock_threshold_default: number;

  // Promotion guardrails
  promo_max_discount_percent: number;       // Max % any single promo can take off (default: 50)
  promo_max_total_discount_percent: number; // Max % off total purchase (default: 50)
  promo_max_per_transaction: number;        // Max promos stackable per transaction (default: 1)
  promo_max_daily_uses_per_promo: number;   // Max times a single promo can be used per day (default: 0 = unlimited)
  promo_require_manager_above_percent: number; // Discounts above this % require manager override (default: 30)
  promo_allow_on_sale_items: boolean;       // Can promos stack on already-discounted items? (default: false)

  // Loyalty points
  loyalty_enabled: boolean;
  loyalty_points_per_dollar: number;       // Points earned per $1 spent
  loyalty_trade_in_bonus_points: number;   // Flat bonus points on trade-ins
  loyalty_event_checkin_points: number;    // Points for checking into an event
  loyalty_redeem_points_per_dollar: number; // Points needed for $1 off
  loyalty_min_redeem_points: number;       // Minimum points to redeem

  // Payment methods enabled
  payment_methods_enabled: string[];

  // Intelligence preferences — store-level customization for insights
  intel_monthly_rent: number;              // Monthly rent in dollars (0 = not set)
  intel_monthly_utilities: number;         // Monthly utilities in dollars
  intel_monthly_insurance: number;         // Monthly insurance in dollars
  intel_monthly_payroll: number;           // Monthly payroll in dollars
  intel_monthly_other_fixed: number;       // Other monthly fixed costs in dollars
  intel_dead_stock_days: number;           // Days with no sales before flagging as dead stock (default 30)
  intel_at_risk_days: number;              // Days since last visit before flagging customer at risk (default 14)
  intel_buylist_cash_comfort_days: number; // Days of cash runway you want before buylist shifts to credit (default 14)
  intel_credit_liability_warn_percent: number; // Warn when outstanding credit exceeds this % of monthly revenue (default 50)
  intel_prefer_credit_buylists: boolean;   // Default to credit-forward on buylists (default false)
  intel_wpn_level: string;                 // WPN level: "none" | "core" | "advanced" | "premium" (default "none")
  intel_seasonal_warnings: boolean;        // Enable seasonal Q4/January cliff warnings (default true)
  intel_advisor_enabled: boolean;          // Enable AI-powered store advisor (default true)
  intel_advisor_tone: string;              // "gamer" | "professional" | "casual" (default "gamer")

  // Timeclock
  timeclock_geofence_enabled: boolean;
  timeclock_geofence_lat: number;
  timeclock_geofence_lng: number;
  timeclock_geofence_radius_meters: number;
  // Staff lock screen
  staff_lock_enabled: boolean;
  staff_lock_timeout_minutes: number;
  // NUX
  nux_dismissed: boolean;
  // Mobile register
  mobile_register_enabled: boolean;
  mobile_access_code_hash: string;
  mobile_session_hours: number;
  mobile_max_tx_per_session: number;
  mobile_max_tx_cents: number;
  mobile_allow_discounts: boolean;
  mobile_allow_refunds: boolean;
  mobile_allow_cash: boolean;
}

/** Sensible defaults — a store works immediately with zero config */
export const SETTINGS_DEFAULTS: StoreSettings = {
  // Store identity
  store_display_name: "",
  store_phone: "",
  store_website: "",
  receipt_header: "",
  receipt_footer: "Thank you for shopping with us!",
  receipt_show_barcode: true,
  receipt_show_savings: true,
  receipt_show_return_policy: false,
  return_policy_text: "",

  // Trade-ins
  trade_in_credit_bonus_percent: 30,
  trade_in_require_customer: true,

  // Returns
  return_credit_bonus_percent: 0,
  return_restocking_fee_percent: 0,
  return_window_days: 30,
  return_require_reason: true,

  // Checkout
  checkout_require_customer: false,
  checkout_auto_print_receipt: false,
  checkout_default_payment_method: "cash",

  // Tax
  tax_rate_percent: 0,
  tax_included_in_price: false,

  // Inventory
  low_stock_threshold_default: 5,

  // Promotion guardrails
  promo_max_discount_percent: 50,
  promo_max_total_discount_percent: 50,
  promo_max_per_transaction: 1,
  promo_max_daily_uses_per_promo: 0, // 0 = unlimited
  promo_require_manager_above_percent: 30,
  promo_allow_on_sale_items: false,

  // Loyalty points
  loyalty_enabled: true,
  loyalty_points_per_dollar: 1,
  loyalty_trade_in_bonus_points: 50,
  loyalty_event_checkin_points: 25,
  loyalty_redeem_points_per_dollar: 100,
  loyalty_min_redeem_points: 500,

  // Payment methods
  payment_methods_enabled: ["cash", "card", "store_credit", "split"],

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

  // Staff lock screen
  staff_lock_enabled: false,
  staff_lock_timeout_minutes: 0,
  // NUX
  nux_dismissed: false,
  // Mobile register
  mobile_register_enabled: false,
  mobile_access_code_hash: "",
  mobile_session_hours: 12,
  mobile_max_tx_per_session: 0,
  mobile_max_tx_cents: 0,
  mobile_allow_discounts: false,
  mobile_allow_refunds: false,
  mobile_allow_cash: true,
  // Timeclock
  timeclock_geofence_enabled: false,
  timeclock_geofence_lat: 0,
  timeclock_geofence_lng: 0,
  timeclock_geofence_radius_meters: 150,
};

/** Settings section metadata for the settings UI */
export const SETTINGS_SECTIONS = [
  {
    key: "identity",
    label: "Store Identity",
    description: "How your store appears on receipts and to customers",
    fields: [
      { key: "store_display_name", label: "Display Name", type: "text" as const, placeholder: "Defaults to store name" },
      { key: "store_phone", label: "Store Phone", type: "text" as const, placeholder: "e.g. (503) 555-0100" },
      { key: "store_website", label: "Website", type: "text" as const, placeholder: "e.g. www.yourstore.com" },
      { key: "receipt_header", label: "Receipt Address", type: "text" as const, placeholder: "e.g. 123 Main St, City, ST 12345", tooltip: "Printed on receipts below your store name. Required for legal compliance in most states." },
      { key: "receipt_footer", label: "Receipt Footer", type: "text" as const, placeholder: "e.g. Thank you for shopping with us!" },
      { key: "receipt_show_barcode", label: "Show barcode on printed receipts", type: "toggle" as const },
      { key: "receipt_show_savings", label: "Show 'You saved $X' on receipts", type: "toggle" as const },
      { key: "receipt_show_return_policy", label: "Show return policy on receipts", type: "toggle" as const },
      { key: "return_policy_text", label: "Return Policy Text", type: "text" as const, placeholder: "Returns accepted within 30 days with receipt." },
    ],
  },
  {
    key: "trade_ins",
    label: "Trade-Ins",
    description: "Default settings for the trade-in workflow",
    fields: [
      { key: "trade_in_credit_bonus_percent", label: "Default Credit Bonus %", type: "number" as const, min: 0, max: 100, tooltip: "The extra percentage added when customers choose store credit over cash. A 30% bonus means a $10 cash offer becomes $13 in credit." },
      { key: "trade_in_require_customer", label: "Require customer for trade-ins", type: "toggle" as const },
    ],
  },
  {
    key: "returns",
    label: "Returns",
    description: "Default settings for processing returns",
    fields: [
      { key: "return_credit_bonus_percent", label: "Default Credit Bonus %", type: "number" as const, min: 0, max: 100 },
      { key: "return_restocking_fee_percent", label: "Default Restocking Fee %", type: "number" as const, min: 0, max: 100 },
      { key: "return_window_days", label: "Return Window (days)", type: "number" as const, min: 0, max: 365 },
      { key: "return_require_reason", label: "Require reason for returns", type: "toggle" as const },
    ],
  },
  {
    key: "checkout",
    label: "Checkout",
    description: "How the register behaves during sales",
    fields: [
      { key: "checkout_require_customer", label: "Require customer for every sale", type: "toggle" as const },
      { key: "checkout_auto_print_receipt", label: "Auto-print receipt after sale", type: "toggle" as const },
      {
        key: "checkout_default_payment_method",
        label: "Default Payment Method",
        type: "select" as const,
        options: [
          { value: "cash", label: "Cash" },
          { value: "card", label: "Card" },
          { value: "store_credit", label: "Store Credit" },
        ],
      },
    ],
  },
  {
    key: "tax",
    label: "Tax",
    description: "Sales tax configuration",
    fields: [
      { key: "tax_rate_percent", label: "Tax Rate %", type: "number" as const, min: 0, max: 30, step: 0.01, tooltip: "Your local sales tax rate. For example, enter 8.25 for 8.25% tax. This is applied automatically at checkout." },
      { key: "tax_included_in_price", label: "Tax is included in listed prices", type: "toggle" as const, tooltip: "Enable this if the prices you enter already include tax (common in some countries). When off, tax is calculated on top of the listed price." },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Default inventory behavior",
    fields: [
      { key: "low_stock_threshold_default", label: "Default Low Stock Threshold", type: "number" as const, min: 0, max: 100 },
    ],
  },
  {
    key: "promo_guardrails",
    label: "Promotion Guardrails",
    description: "Safety limits to prevent accidental or excessive discounting",
    fields: [
      { key: "promo_max_discount_percent", label: "Max discount % per item", type: "number" as const, min: 1, max: 100 },
      { key: "promo_max_total_discount_percent", label: "Max discount % off total purchase", type: "number" as const, min: 1, max: 100 },
      { key: "promo_max_per_transaction", label: "Max promos per transaction", type: "number" as const, min: 1, max: 10 },
      { key: "promo_max_daily_uses_per_promo", label: "Max daily uses per promo (0 = unlimited)", type: "number" as const, min: 0, max: 10000 },
      { key: "promo_require_manager_above_percent", label: "Require manager approval above %", type: "number" as const, min: 1, max: 100 },
      { key: "promo_allow_on_sale_items", label: "Allow promos on already-discounted items", type: "toggle" as const },
    ],
  },
  {
    key: "loyalty",
    label: "Loyalty Points",
    description: "Reward customers for purchases, trade-ins, and event attendance",
    fields: [
      { key: "loyalty_enabled", label: "Enable loyalty points program", type: "toggle" as const },
      { key: "loyalty_points_per_dollar", label: "Points earned per $1 spent", type: "number" as const, min: 0, max: 100 },
      { key: "loyalty_trade_in_bonus_points", label: "Bonus points per trade-in", type: "number" as const, min: 0, max: 1000 },
      { key: "loyalty_event_checkin_points", label: "Points per event check-in", type: "number" as const, min: 0, max: 1000 },
      { key: "loyalty_redeem_points_per_dollar", label: "Points needed for $1 discount", type: "number" as const, min: 1, max: 10000 },
      { key: "loyalty_min_redeem_points", label: "Minimum points to redeem", type: "number" as const, min: 0, max: 10000 },
    ],
  },
  {
    key: "intelligence",
    label: "Store Intelligence",
    description: "Customize how your store advisor analyzes your business",
    fields: [
      { key: "intel_advisor_enabled", label: "Enable AI store advisor", type: "toggle" as const },
      {
        key: "intel_advisor_tone",
        label: "Advisor Personality",
        type: "select" as const,
        options: [
          { value: "gamer", label: "Gamer (friendly, uses game store lingo)" },
          { value: "casual", label: "Casual (plain English, no jargon)" },
          { value: "professional", label: "Professional (formal business language)" },
        ],
      },
      {
        key: "intel_wpn_level",
        label: "WPN Level",
        type: "select" as const,
        tooltip: "Your Wizards Play Network level. Affects event frequency recommendations and metric targets.",
        options: [
          { value: "none", label: "Not WPN / Not Applicable" },
          { value: "core", label: "WPN Core" },
          { value: "advanced", label: "WPN Advanced" },
          { value: "premium", label: "WPN Premium" },
        ],
      },
      { key: "intel_seasonal_warnings", label: "Seasonal cash flow warnings (Q4, January cliff, etc.)", type: "toggle" as const },
      { key: "intel_prefer_credit_buylists", label: "Default buylists to credit-forward pricing", type: "toggle" as const, tooltip: "When enabled, buylist offers default to store credit instead of cash. Customers still choose, but the default shifts." },
    ],
  },
  {
    key: "intelligence_costs",
    label: "Monthly Fixed Costs",
    description: "Enter your fixed monthly expenses so we can calculate your cash runway and buying power",
    fields: [
      { key: "intel_monthly_rent", label: "Rent ($)", type: "number" as const, min: 0, max: 100000 },
      { key: "intel_monthly_utilities", label: "Utilities ($)", type: "number" as const, min: 0, max: 50000 },
      { key: "intel_monthly_insurance", label: "Insurance ($)", type: "number" as const, min: 0, max: 50000 },
      { key: "intel_monthly_payroll", label: "Payroll ($)", type: "number" as const, min: 0, max: 500000 },
      { key: "intel_monthly_other_fixed", label: "Other Fixed Costs ($)", type: "number" as const, min: 0, max: 100000, tooltip: "Subscriptions, loan payments, POS fees, etc." },
    ],
  },
  {
    key: "intelligence_thresholds",
    label: "Intelligence Thresholds",
    description: "Fine-tune when alerts trigger — every store is different",
    fields: [
      { key: "intel_dead_stock_days", label: "Flag dead stock after (days)", type: "number" as const, min: 7, max: 180, tooltip: "Items with zero sales for this many days get flagged. Lower = more aggressive inventory management." },
      { key: "intel_at_risk_days", label: "Flag at-risk customers after (days)", type: "number" as const, min: 7, max: 90, tooltip: "Regular customers who haven't visited in this many days get flagged. Lower = more proactive outreach." },
      { key: "intel_buylist_cash_comfort_days", label: "Cash comfort zone (days)", type: "number" as const, min: 7, max: 60, tooltip: "When your cash runway drops below this many days, buylist pricing automatically shifts toward store credit." },
      { key: "intel_credit_liability_warn_percent", label: "Credit liability warning threshold (%)", type: "number" as const, min: 10, max: 200, tooltip: "Alert when total outstanding store credit exceeds this percentage of your monthly revenue." },
    ],
  },
  {
    key: "staff_lock",
    label: "Staff Lock Screen",
    description: "Require staff PIN before using the system. Locks between shifts.",
    fields: [
      { key: "staff_lock_enabled", label: "Enable staff lock screen", type: "toggle" as const, tooltip: "When enabled, staff must enter their PIN to use the system. The device stays logged in between shifts." },
      { key: "staff_lock_timeout_minutes", label: "Auto-lock after idle (minutes, 0 = never)", type: "number" as const, min: 0, max: 480, tooltip: "Automatically lock the screen after this many minutes of no activity. Set to 0 to disable." },
    ],
  },
  {
    key: "mobile_register",
    label: "Mobile Register",
    description: "Let employees sell from their phones during events and busy periods",
    fields: [
      { key: "mobile_register_enabled", label: "Enable mobile register", type: "toggle" as const, tooltip: "When enabled, employees can pair their phone to your store with an access code and sell using their PIN." },
      { key: "mobile_session_hours", label: "Session duration (hours)", type: "number" as const, min: 1, max: 72, tooltip: "How long a paired device stays active before requiring re-pairing." },
      { key: "mobile_max_tx_per_session", label: "Max sales per session (0 = unlimited)", type: "number" as const, min: 0, max: 10000 },
      { key: "mobile_max_tx_cents", label: "Max sale amount (cents, 0 = unlimited)", type: "number" as const, min: 0, max: 10000000, tooltip: "Maximum single transaction amount on mobile. E.g. 50000 = $500." },
      { key: "mobile_allow_discounts", label: "Allow discounts on mobile", type: "toggle" as const },
      { key: "mobile_allow_refunds", label: "Allow refunds on mobile", type: "toggle" as const, tooltip: "Not recommended. Refunds are safer on the main register where managers can supervise." },
      { key: "mobile_allow_cash", label: "Allow cash payments on mobile", type: "toggle" as const },
    ],
  },
  {
    key: "timeclock",
    label: "Time Clock",
    description: "Employee clock-in from phone: share your store's clock-in link or print the QR code",
    fields: [
      { key: "timeclock_geofence_enabled", label: "Enable GPS geofencing", type: "toggle" as const, tooltip: "When enabled, clock-ins are tagged as 'at store' or 'remote' based on GPS. Never blocks clock-in — just tags it." },
      { key: "timeclock_geofence_lat", label: "Store Latitude", type: "number" as const, min: -90, max: 90, step: 0.000001 },
      { key: "timeclock_geofence_lng", label: "Store Longitude", type: "number" as const, min: -180, max: 180, step: 0.000001 },
      { key: "timeclock_geofence_radius_meters", label: "Geofence Radius (meters)", type: "number" as const, min: 50, max: 5000, tooltip: "How close to the store GPS must be to count as 'at store'. Default 150m (~500ft)." },
    ],
  },
  {
    key: "payments",
    label: "Payment Methods",
    description: "Which payment methods are available at checkout",
    fields: [
      {
        key: "payment_methods_enabled",
        label: "Enabled Methods",
        type: "multiselect" as const,
        options: [
          { value: "cash", label: "Cash" },
          { value: "card", label: "Card" },
          { value: "store_credit", label: "Store Credit" },
          { value: "split", label: "Split Payment" },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Client-side: get typed settings merged with defaults */
export function useStoreSettings(): StoreSettings {
  const { store } = useStore();
  const raw = (store?.settings ?? {}) as Partial<StoreSettings>;
  return { ...SETTINGS_DEFAULTS, ...raw };
}

/** Get the effective store display name */
export function useStoreName(): string {
  const { store } = useStore();
  const settings = useStoreSettings();
  return settings.store_display_name || store?.name || "Store";
}

/* ------------------------------------------------------------------ */
/*  Server-side helper                                                  */
/* ------------------------------------------------------------------ */

/** Server-side: get typed settings from a store record */
export function getStoreSettings(storeSettings: Record<string, unknown> | null): StoreSettings {
  const raw = (storeSettings ?? {}) as Partial<StoreSettings>;
  return { ...SETTINGS_DEFAULTS, ...raw };
}
