export type Role = "owner" | "manager" | "cashier";

export type Permission =
  | "checkout"
  | "inventory.view"
  | "inventory.adjust"
  | "customers.view"
  | "customers.edit"
  | "customers.credit"
  | "trade_ins"
  | "returns"
  | "events.checkin"
  | "events.manage"
  | "reports"
  | "cash_flow"
  | "staff.manage"
  | "store.settings"
  | "import"
  | "certification";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "checkout",
    "inventory.view",
    "inventory.adjust",
    "customers.view",
    "customers.edit",
    "customers.credit",
    "trade_ins",
    "returns",
    "events.checkin",
    "events.manage",
    "reports",
    "cash_flow",
    "staff.manage",
    "store.settings",
    "import",
    "certification",
  ],
  manager: [
    "checkout",
    "inventory.view",
    "inventory.adjust",
    "customers.view",
    "customers.edit",
    "customers.credit",
    "trade_ins",
    "returns",
    "events.checkin",
    "events.manage",
    "reports",
  ],
  cashier: [
    "checkout",
    "inventory.view",
    "customers.view",
    "events.checkin",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function canAccess(role: Role, path: string): boolean {
  const routePermissions: Record<string, Permission> = {
    "/dashboard": "checkout", // everyone can see dashboard
    "/dashboard/checkout": "checkout",
    "/dashboard/register": "checkout",
    "/dashboard/inventory": "inventory.view",
    "/dashboard/inventory/receive": "inventory.adjust",
    "/dashboard/preorders": "inventory.adjust",
    "/dashboard/locations": "store.settings",
    "/dashboard/trade-ins": "trade_ins",
    "/dashboard/trade-ins/bulk": "trade_ins",
    "/dashboard/returns": "returns",
    "/dashboard/customers": "customers.view",
    "/dashboard/events": "events.checkin",
    "/dashboard/promotions": "inventory.adjust",
    "/dashboard/reports": "reports",
    "/dashboard/cash-flow": "cash_flow",
    "/dashboard/drawer": "checkout",
    "/dashboard/timeclock": "checkout",
    "/dashboard/gift-cards": "customers.edit",
    "/dashboard/transfers": "inventory.adjust",
    "/dashboard/staff": "staff.manage",
    "/dashboard/settings": "store.settings",
    "/dashboard/game-library": "inventory.view",
    "/dashboard/singles": "inventory.view",
    "/dashboard/singles/evaluate": "inventory.view",
    "/dashboard/singles/pricing": "inventory.adjust",
    "/dashboard/singles/ebay": "inventory.adjust",
    "/dashboard/catalog": "inventory.adjust",
    "/dashboard/purchase-orders": "inventory.adjust",
    "/dashboard/stock-counts": "inventory.adjust",
    "/dashboard/tournaments": "events.manage",
    "/dashboard/inventory/labels": "inventory.view",
    "/dashboard/import": "import",
    "/dashboard/certification": "certification",
    "/dashboard/orders": "checkout",
  };

  // Find the matching route (longest prefix match)
  const matchedRoute = Object.keys(routePermissions)
    .filter((route) => path.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedRoute) return true; // unknown routes are accessible
  return hasPermission(role, routePermissions[matchedRoute]);
}

// Nav items with required permissions
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/register", label: "Register", icon: "◈", permission: "checkout" },
  { href: "/dashboard/checkout", label: "Checkout (Full)", icon: "◈", permission: "checkout" },
  { href: "/dashboard", label: "Dashboard", icon: "⌂", permission: "checkout" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "▦", permission: "inventory.view" },
  { href: "/dashboard/singles", label: "TCG Singles", icon: "\u{1F0CF}", permission: "inventory.view" },
  { href: "/dashboard/game-library", label: "Game Library", icon: "♜", permission: "inventory.view" },
  { href: "/dashboard/preorders", label: "Preorders", icon: "⏳", permission: "inventory.adjust" },
  { href: "/dashboard/trade-ins", label: "Trade-Ins", icon: "⇄", permission: "trade_ins" },
  { href: "/dashboard/returns", label: "Returns", icon: "↩", permission: "returns" },
  { href: "/dashboard/customers", label: "Customers", icon: "♟", permission: "customers.view" },
  { href: "/dashboard/events", label: "Events", icon: "★", permission: "events.checkin" },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: "\u2694", permission: "events.manage" },
  { href: "/dashboard/purchase-orders", label: "Purchase Orders", icon: "\u229e", permission: "inventory.adjust" },
  { href: "/dashboard/stock-counts", label: "Stock Count", icon: "\u25a4", permission: "inventory.adjust" },
  { href: "/dashboard/promotions", label: "Promotions", icon: "✦", permission: "inventory.adjust" },
  { href: "/dashboard/reports", label: "Reports", icon: "◩", permission: "reports" },
  { href: "/dashboard/cash-flow", label: "Cash Flow", icon: "◎", permission: "cash_flow" },
  { href: "/dashboard/catalog", label: "Catalog", icon: "⊕", permission: "inventory.adjust" },
  { href: "/dashboard/import", label: "Import", icon: "⤓", permission: "import" },
  { href: "/dashboard/certification", label: "Certification", icon: "◉", permission: "certification" },
  { href: "/dashboard/orders", label: "Orders", icon: "⊟", permission: "checkout" },
  { href: "/dashboard/drawer", label: "Drawer", icon: "▣", permission: "checkout" },
  { href: "/dashboard/timeclock", label: "Time Clock", icon: "◷", permission: "checkout" },
  { href: "/dashboard/gift-cards", label: "Gift Cards", icon: "◆", permission: "customers.edit" },
  { href: "/dashboard/transfers", label: "Transfers", icon: "⇆", permission: "inventory.adjust" },
  { href: "/dashboard/locations", label: "Locations", icon: "⊡", permission: "store.settings" },
  { href: "/dashboard/staff", label: "Staff", icon: "⊞", permission: "staff.manage" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", permission: "store.settings" },
];
