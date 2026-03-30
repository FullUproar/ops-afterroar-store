export interface Store {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  address: Record<string, string> | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  user_id: string;
  store_id: string;
  role: "owner" | "manager" | "cashier";
  name: string;
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_balance_cents: number;
  loyalty_points: number;
  notes: string | null;
  afterroar_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemCategory =
  | "tcg_single"
  | "sealed"
  | "board_game"
  | "miniature"
  | "accessory"
  | "food_drink"
  | "other";

export interface InventoryItem {
  id: string;
  store_id: string;
  name: string;
  category: ItemCategory;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  low_stock_threshold: number;
  attributes: Record<string, unknown>;
  image_url: string | null;
  external_id: string | null;
  catalog_product_id: string | null;
  shared_to_catalog: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type LedgerType =
  | "sale"
  | "trade_in"
  | "credit_issue"
  | "credit_redeem"
  | "adjustment"
  | "event_fee"
  | "refund"
  | "void"
  | "no_sale"
  | "issue_flag";
  // Future: | "chargeback" (Stripe Connect)

export interface LedgerEntry {
  id: string;
  store_id: string;
  type: LedgerType;
  customer_id: string | null;
  staff_id: string | null;
  event_id: string | null;
  amount_cents: number;
  credit_amount_cents: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type TradeInStatus = "pending" | "accepted" | "rejected" | "completed";

export interface TradeIn {
  id: string;
  store_id: string;
  customer_id: string | null;
  staff_id: string | null;
  status: TradeInStatus;
  payout_type: "cash" | "credit" | null;
  total_offer_cents: number;
  credit_bonus_percent: number;
  total_payout_cents: number;
  notes: string | null;
  ledger_entry_id: string | null;
  created_at: string;
  completed_at: string | null;
  // Joined
  customer?: Customer;
  items?: TradeInItem[];
}

export interface TradeInItem {
  id: string;
  trade_in_id: string;
  inventory_item_id: string | null;
  name: string;
  category: string | null;
  attributes: Record<string, unknown>;
  quantity: number;
  market_price_cents: number | null;
  offer_price_cents: number;
  created_at: string;
}

export type EventType =
  | "fnm"
  | "prerelease"
  | "tournament"
  | "casual"
  | "draft"
  | "league"
  | "other";

export interface GameEvent {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  event_type: EventType;
  starts_at: string;
  ends_at: string | null;
  entry_fee_cents: number;
  max_players: number | null;
  afterroar_event_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  checkin_count?: number;
}

export interface EventCheckin {
  id: string;
  event_id: string;
  customer_id: string;
  checked_in_at: string;
  fee_paid: boolean;
  ledger_entry_id: string | null;
  // Joined
  customer?: Customer;
}

export type ReturnReason =
  | "defective"
  | "wrong_item"
  | "changed_mind"
  | "duplicate"
  | "other";

export type RefundMethod = "cash" | "store_credit";

export const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: "defective", label: "Defective / Damaged" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "changed_mind", label: "Changed Mind" },
  { value: "duplicate", label: "Duplicate Purchase" },
  { value: "other", label: "Other" },
];

export interface Return {
  id: string;
  store_id: string;
  customer_id: string | null;
  staff_id: string | null;
  original_ledger_entry_id: string;
  status: string;
  refund_method: RefundMethod;
  reason: ReturnReason;
  reason_notes: string | null;
  subtotal_cents: number;
  restocking_fee_cents: number;
  refund_amount_cents: number;
  credit_bonus_percent: number;
  total_refund_cents: number;
  ledger_entry_id: string | null;
  created_at: string;
  // Joined
  customer?: Customer;
  items?: ReturnItem[];
}

export interface ReturnItem {
  id: string;
  return_id: string;
  inventory_item_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  price_cents: number;
  total_cents: number;
  restock: boolean;
  created_at: string;
}

export type LoyaltyTransactionType =
  | "earn_purchase"
  | "earn_trade_in"
  | "earn_event"
  | "redeem"
  | "adjust";

// Utility
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function parseDollars(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}
