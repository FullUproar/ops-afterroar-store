/* ------------------------------------------------------------------ */
/*  Permissions — configurable per store, sensible defaults per role    */
/*  Owner configures once in Settings → Staff see only what they need. */
/* ------------------------------------------------------------------ */

export type Role = "owner" | "manager" | "cashier";

export type Permission =
  // POS / Checkout
  | "checkout"
  | "checkout.discount"
  | "checkout.discount.override"  // discounts above the guardrail threshold
  | "checkout.void"
  | "checkout.refund"
  | "checkout.no_sale"            // open drawer without a sale
  | "checkout.price_override"     // change price at checkout
  // Inventory
  | "inventory.view"
  | "inventory.adjust"
  | "inventory.create"
  | "inventory.delete"
  | "inventory.cost_view"         // see cost/margin data
  | "inventory.pricing"           // change prices
  // Customers
  | "customers.view"
  | "customers.edit"
  | "customers.credit"            // adjust store credit
  | "customers.delete"
  // Trade-Ins
  | "trade_ins"
  | "trade_ins.cash"              // pay cash (vs credit only)
  // Returns
  | "returns"
  | "returns.no_receipt"          // process return without original receipt
  // Events
  | "events.checkin"
  | "events.manage"               // create/edit/delete events
  // Reports & Intelligence
  | "reports"
  | "cash_flow"
  // Staff & Admin
  | "staff.manage"
  | "store.settings"
  | "import"
  | "certification"
  // Orders & Fulfillment
  | "manage_orders"               // view/manage orders and fulfillment queue
  // Operational
  | "timeclock.view_all"          // see all staff time entries (vs just own)
  | "ops_log";                    // view operational logs

/* ------------------------------------------------------------------ */
/*  Permission metadata — for the settings UI                          */
/* ------------------------------------------------------------------ */

export interface PermissionMeta {
  key: Permission;
  label: string;
  description: string;
  category: string;
}

export const PERMISSION_CATEGORIES = [
  { key: "pos", label: "Point of Sale" },
  { key: "inventory", label: "Inventory" },
  { key: "customers", label: "Customers" },
  { key: "trade_returns", label: "Trade-Ins & Returns" },
  { key: "events", label: "Events" },
  { key: "reports", label: "Reports & Intelligence" },
  { key: "admin", label: "Administration" },
] as const;

export const ALL_PERMISSIONS: PermissionMeta[] = [
  // POS
  { key: "checkout", label: "Ring up sales", description: "Process transactions at the register", category: "pos" },
  { key: "checkout.discount", label: "Apply discounts", description: "Apply discounts to items or cart", category: "pos" },
  { key: "checkout.discount.override", label: "Override discount limits", description: "Apply discounts above the guardrail threshold", category: "pos" },
  { key: "checkout.void", label: "Void transactions", description: "Cancel a completed sale", category: "pos" },
  { key: "checkout.refund", label: "Process refunds", description: "Refund a previous sale", category: "pos" },
  { key: "checkout.no_sale", label: "Open drawer (no sale)", description: "Open the cash drawer without a transaction", category: "pos" },
  { key: "checkout.price_override", label: "Override prices", description: "Change an item's price during checkout", category: "pos" },
  // Inventory
  { key: "inventory.view", label: "View inventory", description: "See inventory list and quantities", category: "inventory" },
  { key: "inventory.adjust", label: "Adjust stock", description: "Add/remove stock quantities", category: "inventory" },
  { key: "inventory.create", label: "Add new items", description: "Create new inventory items", category: "inventory" },
  { key: "inventory.delete", label: "Delete items", description: "Remove items from inventory", category: "inventory" },
  { key: "inventory.cost_view", label: "See cost & margin", description: "View cost prices and margin data", category: "inventory" },
  { key: "inventory.pricing", label: "Change prices", description: "Edit sell prices on inventory", category: "inventory" },
  // Customers
  { key: "customers.view", label: "View customers", description: "See customer list and profiles", category: "customers" },
  { key: "customers.edit", label: "Edit customers", description: "Update customer info, issue gift cards", category: "customers" },
  { key: "customers.credit", label: "Adjust store credit", description: "Add or remove store credit from a customer", category: "customers" },
  { key: "customers.delete", label: "Delete customers", description: "Permanently remove customer records", category: "customers" },
  // Trade-Ins & Returns
  { key: "trade_ins", label: "Process trade-ins", description: "Accept items for store credit or cash", category: "trade_returns" },
  { key: "trade_ins.cash", label: "Cash trade-in payouts", description: "Pay cash for trade-ins (vs credit only)", category: "trade_returns" },
  { key: "returns", label: "Process returns", description: "Accept returns and issue refunds", category: "trade_returns" },
  { key: "returns.no_receipt", label: "Returns without receipt", description: "Process a return without the original receipt", category: "trade_returns" },
  // Events
  { key: "events.checkin", label: "Check in players", description: "Check players into events", category: "events" },
  { key: "events.manage", label: "Manage events", description: "Create, edit, and delete events", category: "events" },
  // Reports
  { key: "reports", label: "View reports", description: "Access sales reports and analytics", category: "reports" },
  { key: "cash_flow", label: "View cash flow", description: "Access cash flow dashboard and intelligence", category: "reports" },
  // Orders & Fulfillment
  { key: "manage_orders", label: "Manage orders & fulfillment", description: "View orders, pick/pack/ship, create labels", category: "pos" },
  // Admin
  { key: "staff.manage", label: "Manage staff", description: "Add/remove staff, change roles", category: "admin" },
  { key: "store.settings", label: "Store settings", description: "Change store configuration and preferences", category: "admin" },
  { key: "import", label: "Import data", description: "Import inventory via CSV", category: "admin" },
  { key: "certification", label: "Certifications", description: "Manage store certifications", category: "admin" },
  { key: "timeclock.view_all", label: "View all time entries", description: "See all staff clock-in/out history", category: "admin" },
  { key: "ops_log", label: "View ops log", description: "Access operational event logs", category: "admin" },
];

/* ------------------------------------------------------------------ */
/*  Default permissions per role — the starting template               */
/* ------------------------------------------------------------------ */

const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS.map((p) => p.key),
  manager: [
    "checkout",
    "checkout.discount",
    "checkout.discount.override",
    "checkout.void",
    "checkout.refund",
    "checkout.no_sale",
    "checkout.price_override",
    "inventory.view",
    "inventory.adjust",
    "inventory.create",
    "inventory.cost_view",
    "inventory.pricing",
    "customers.view",
    "customers.edit",
    "customers.credit",
    "trade_ins",
    "trade_ins.cash",
    "returns",
    "returns.no_receipt",
    "events.checkin",
    "events.manage",
    "reports",
    "cash_flow",
    "timeclock.view_all",
    "import",
    "manage_orders",
  ],
  cashier: [
    "checkout",
    "checkout.discount",
    "inventory.view",
    "customers.view",
    "events.checkin",
    "trade_ins",
  ],
};

/* ------------------------------------------------------------------ */
/*  Store-level permission overrides                                    */
/*  Stored in pos_stores.settings.role_permissions as:                 */
/*  { manager: { "checkout.void": false, "inventory.delete": true } } */
/* ------------------------------------------------------------------ */

export type RolePermissionOverrides = Partial<Record<Role, Partial<Record<Permission, boolean>>>>;

/**
 * Check if a role has a specific permission, accounting for store overrides.
 * Owner always has all permissions (can't be restricted).
 */
export function hasPermission(
  role: Role,
  permission: Permission,
  overrides?: RolePermissionOverrides | null,
): boolean {
  // Owner always has everything
  if (role === "owner") return true;

  // Check store-level override first
  const roleOverrides = overrides?.[role];
  if (roleOverrides && permission in roleOverrides) {
    return !!roleOverrides[permission];
  }

  // Fall back to default
  return ROLE_DEFAULTS[role]?.includes(permission) ?? false;
}

/**
 * Get the full permission list for a role with overrides applied.
 */
export function getPermissions(
  role: Role,
  overrides?: RolePermissionOverrides | null,
): Permission[] {
  if (role === "owner") return ALL_PERMISSIONS.map((p) => p.key);

  const defaults = ROLE_DEFAULTS[role] ?? [];
  if (!overrides?.[role]) return defaults;

  const roleOverrides = overrides[role]!;
  const result = new Set(defaults);

  for (const [perm, enabled] of Object.entries(roleOverrides)) {
    if (enabled) result.add(perm as Permission);
    else result.delete(perm as Permission);
  }

  return [...result];
}

/**
 * Get default permissions for a role (no overrides).
 */
export function getDefaultPermissions(role: Role): Permission[] {
  return ROLE_DEFAULTS[role] ?? [];
}

/* ------------------------------------------------------------------ */
/*  Route → Permission mapping                                         */
/* ------------------------------------------------------------------ */

export function canAccess(
  role: Role,
  path: string,
  overrides?: RolePermissionOverrides | null,
): boolean {
  const routePermissions: Record<string, Permission> = {
    "/dashboard": "checkout",
    "/dashboard/checkout": "checkout",
    "/dashboard/register": "checkout",
    "/dashboard/inventory": "inventory.view",
    "/dashboard/inventory/receive": "inventory.adjust",
    "/dashboard/preorders": "inventory.adjust",
    "/dashboard/locations": "store.settings",
    "/dashboard/trade-ins": "trade_ins",
    "/dashboard/trade-ins/bulk": "trade_ins",
    "/dashboard/returns": "returns",
    "/dashboard/returns/new": "returns",
    "/dashboard/customers": "customers.view",
    "/dashboard/events": "events.checkin",
    "/dashboard/promotions": "inventory.pricing",
    "/dashboard/reports": "reports",
    "/dashboard/reports/inventory-health": "reports",
    "/dashboard/reports/sales": "reports",
    "/dashboard/reports/margins": "reports",
    "/dashboard/reports/staff": "reports",
    "/dashboard/reports/channels": "reports",
    "/dashboard/cash-flow": "cash_flow",
    "/dashboard/drawer": "checkout",
    "/dashboard/timeclock": "checkout",
    "/dashboard/gift-cards": "customers.edit",
    "/dashboard/transfers": "inventory.adjust",
    "/dashboard/staff": "staff.manage",
    "/dashboard/billing": "store.settings",
    "/dashboard/settings": "store.settings",
    "/dashboard/game-library": "inventory.view",
    "/dashboard/cafe": "checkout",
    "/dashboard/consignment": "inventory.view",
    "/dashboard/singles": "inventory.view",
    "/dashboard/deck-builder": "checkout",
    "/dashboard/singles/evaluate": "inventory.view",
    "/dashboard/singles/pricing": "inventory.pricing",
    "/dashboard/singles/ebay": "inventory.pricing",
    "/dashboard/catalog": "inventory.create",
    "/dashboard/purchase-orders": "inventory.adjust",
    "/dashboard/stock-counts": "inventory.adjust",
    "/dashboard/tournaments": "events.manage",
    "/dashboard/inventory/labels": "inventory.view",
    "/dashboard/import": "import",
    "/dashboard/certification": "certification",
    "/dashboard/orders": "checkout",
    "/dashboard/fulfillment": "manage_orders",
    "/dashboard/help": "checkout",
    "/dashboard/issues": "reports",
    "/dashboard/ops-log": "ops_log",
    "/dashboard/onboarding": "store.settings",
    "/dashboard/scanner-setup": "store.settings",
  };

  const matchedRoute = Object.keys(routePermissions)
    .filter((route) => path.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedRoute) return true;
  return hasPermission(role, routePermissions[matchedRoute], overrides);
}

/* ------------------------------------------------------------------ */
/*  Nav items                                                          */
/* ------------------------------------------------------------------ */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  /** If set, this nav item is only visible when the store has this feature module */
  feature?: FeatureModule;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/register", label: "Register", icon: "◈", permission: "checkout" },
  { href: "/dashboard", label: "Dashboard", icon: "⌂", permission: "checkout" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "▦", permission: "inventory.view" },
  { href: "/dashboard/singles", label: "TCG Singles", icon: "\u{1F0CF}", permission: "inventory.view", feature: "tcg_engine" },
  { href: "/dashboard/deck-builder", label: "Deck Builder", icon: "\u2660", permission: "checkout", feature: "tcg_engine" },
  { href: "/dashboard/game-library", label: "Game Library", icon: "♜", permission: "inventory.view" },
  { href: "/dashboard/cafe", label: "Cafe", icon: "\u2615", permission: "checkout", feature: "cafe" },
  { href: "/dashboard/consignment", label: "Consignment", icon: "\u{1F4CE}", permission: "inventory.view" },
  { href: "/dashboard/preorders", label: "Preorders", icon: "⏳", permission: "inventory.adjust" },
  { href: "/dashboard/trade-ins", label: "Trade-Ins", icon: "⇄", permission: "trade_ins" },
  { href: "/dashboard/returns", label: "Returns", icon: "↩", permission: "returns" },
  { href: "/dashboard/customers", label: "Customers", icon: "♟", permission: "customers.view" },
  { href: "/dashboard/customers/insights", label: "Customer Insights", icon: "◎", permission: "customers.view", feature: "intelligence" },
  { href: "/dashboard/events", label: "Events", icon: "★", permission: "events.checkin" },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: "\u2694", permission: "events.manage", feature: "events" },
  { href: "/dashboard/purchase-orders", label: "Purchase Orders", icon: "\u229e", permission: "inventory.adjust" },
  { href: "/dashboard/stock-counts", label: "Stock Count", icon: "\u25a4", permission: "inventory.adjust" },
  { href: "/dashboard/promotions", label: "Promotions", icon: "✦", permission: "inventory.pricing" },
  { href: "/dashboard/reports", label: "Reports", icon: "◩", permission: "reports" },
  { href: "/dashboard/reports/inventory-health", label: "Inventory Health", icon: "▣", permission: "reports" },
  { href: "/dashboard/reports/sales", label: "Sales Analysis", icon: "◆", permission: "reports" },
  { href: "/dashboard/reports/margins", label: "Margins", icon: "△", permission: "reports", feature: "advanced_reports" },
  { href: "/dashboard/reports/staff", label: "Staff Performance", icon: "⊞", permission: "reports", feature: "advanced_reports" },
  { href: "/dashboard/reports/channels", label: "Channels", icon: "◎", permission: "reports", feature: "ecommerce" },
  { href: "/dashboard/cash-flow", label: "Cash Flow", icon: "◎", permission: "cash_flow", feature: "intelligence" },
  // Catalog is accessed via "+ Add" button on TCG Singles page, not sidebar
  // { href: "/dashboard/catalog", label: "Catalog", icon: "⊕", permission: "inventory.create", feature: "tcg_engine" },
  { href: "/dashboard/import", label: "Import", icon: "⤓", permission: "import" },
  { href: "/dashboard/certification", label: "Certification", icon: "◉", permission: "certification" },
  { href: "/dashboard/orders", label: "Orders", icon: "⊟", permission: "checkout" },
  { href: "/dashboard/fulfillment", label: "Fulfillment", icon: "▶", permission: "manage_orders", feature: "ecommerce" },
  { href: "/dashboard/drawer", label: "Drawer", icon: "▣", permission: "checkout" },
  { href: "/dashboard/timeclock", label: "Time Clock", icon: "◷", permission: "checkout" },
  { href: "/dashboard/gift-cards", label: "Gift Cards", icon: "◆", permission: "customers.edit" },
  { href: "/dashboard/transfers", label: "Transfers", icon: "⇆", permission: "inventory.adjust", feature: "multi_location" },
  { href: "/dashboard/locations", label: "Locations", icon: "⊡", permission: "store.settings", feature: "multi_location" },
  { href: "/dashboard/issues", label: "Issues", icon: "⚑", permission: "reports" },
  { href: "/dashboard/ops-log", label: "Ops Log", icon: "◉", permission: "ops_log" },
  { href: "/dashboard/staff", label: "Staff", icon: "⊞", permission: "staff.manage" },
  { href: "/dashboard/billing", label: "Billing", icon: "\u{1F4B3}", permission: "store.settings" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", permission: "store.settings" },
  { href: "/dashboard/help", label: "Help", icon: "?", permission: "checkout" },
];

/* ------------------------------------------------------------------ */
/*  Store Plans & Feature Gating                                       */
/* ------------------------------------------------------------------ */

export type StorePlan = "free" | "base" | "pro" | "enterprise";

export type FeatureModule =
  | "intelligence"     // AI advisor, cash flow insights, liquidity runway
  | "events"           // Event management, check-ins, WPN tracking
  | "tcg_engine"       // Scryfall, bulk pricing, buylist automation
  | "ecommerce"        // eBay listings, e-commerce sync
  | "multi_location"   // Locations, transfers, warehouse
  | "cafe"             // Table ordering, kitchen display (future)
  | "advanced_reports" // Margin analysis, category drill-down, exports
  | "api_access";      // External API access for integrations

export interface FeatureModuleMeta {
  key: FeatureModule;
  label: string;
  description: string;
  icon: string;
}

export const ALL_FEATURE_MODULES: FeatureModuleMeta[] = [
  { key: "intelligence", label: "Store Intelligence", description: "Smart advisor, cash flow insights, liquidity runway, store alerts", icon: "\u{1F9E0}" },
  { key: "events", label: "Events & Tournaments", description: "Event management, player check-ins, WPN tracking", icon: "\u2605" },
  { key: "tcg_engine", label: "TCG Engine", description: "Scryfall search, bulk pricing, buylist automation, condition grading", icon: "\u{1F0CF}" },
  { key: "ecommerce", label: "E-Commerce", description: "eBay listings, marketplace sync, online storefront", icon: "\u{1F6D2}" },
  { key: "multi_location", label: "Multi-Location", description: "Multiple stores, warehouses, transfers between locations", icon: "\u{1F3E2}" },
  { key: "cafe", label: "Cafe Module", description: "Table ordering, kitchen display, tab management", icon: "\u2615" },
  { key: "advanced_reports", label: "Advanced Reports", description: "Margin analysis, category drill-down, export to CSV", icon: "\u{1F4CA}" },
  { key: "api_access", label: "API Access", description: "External API for custom integrations", icon: "\u{1F517}" },
];

/** Which modules are included in each plan */
const PLAN_MODULES: Record<StorePlan, FeatureModule[]> = {
  free: [],
  base: ["events"],
  pro: ["intelligence", "events", "tcg_engine", "advanced_reports"],
  enterprise: ALL_FEATURE_MODULES.map((m) => m.key),
};

/**
 * Check if a store has access to a feature module.
 * Checks plan inclusion first, then explicit add-ons.
 */
export function hasFeature(
  plan: StorePlan,
  addons: FeatureModule[],
  feature: FeatureModule,
): boolean {
  if (PLAN_MODULES[plan]?.includes(feature)) return true;
  if (addons.includes(feature)) return true;
  return false;
}

/**
 * Get all features available to a store (plan + add-ons combined).
 */
export function getStoreFeatures(
  plan: StorePlan,
  addons: FeatureModule[],
): FeatureModule[] {
  const planFeatures = PLAN_MODULES[plan] ?? [];
  return [...new Set([...planFeatures, ...addons])];
}
