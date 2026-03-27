/* ------------------------------------------------------------------ */
/*  Cart Persistence — localStorage-backed cart state                   */
/*  Survives page nav, refresh, tab close, crash.                       */
/*  Active cart + park/recall for multi-transaction flow.                */
/* ------------------------------------------------------------------ */

import type { Customer } from "./types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CartItem {
  /** null for manual items */
  inventory_item_id: string | null;
  name: string;
  category: string;
  price_cents: number;
  quantity: number;
  max_quantity: number;
}

export interface CartDiscount {
  id: string;
  scope: "item" | "cart";
  itemIndex?: number;
  type: "percent" | "dollar";
  value: number;
  reason: string;
}

export interface PersistedCart {
  id: string;
  items: CartItem[];
  customer: Customer | null;
  discounts: CartDiscount[];
  createdAt: string;
  updatedAt: string;
}

export interface ParkedCart extends PersistedCart {
  parkId: string;
  label: string;
  parkedAt: string;
  itemCount: number;
  totalCents: number;
}

/* ------------------------------------------------------------------ */
/*  Keys                                                               */
/* ------------------------------------------------------------------ */

const ACTIVE_CART_KEY = "afterroar-active-cart";
const PARKED_CARTS_KEY = "afterroar-parked-carts";

/* ------------------------------------------------------------------ */
/*  ID generator (cuid-like)                                           */
/* ------------------------------------------------------------------ */

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${ts}${rand}`;
}

/* ------------------------------------------------------------------ */
/*  Active cart — single current transaction                            */
/* ------------------------------------------------------------------ */

export function saveCart(cart: PersistedCart): void {
  try {
    localStorage.setItem(ACTIVE_CART_KEY, JSON.stringify({
      ...cart,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function loadCart(): PersistedCart | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CART_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCart;
    // Validate minimum shape
    if (!parsed.id || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCart(): void {
  try {
    localStorage.removeItem(ACTIVE_CART_KEY);
  } catch {}
}

export function createEmptyCart(): PersistedCart {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    items: [],
    customer: null,
    discounts: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/*  Parked carts — multiple saved transactions                          */
/* ------------------------------------------------------------------ */

function loadParkedCarts(): ParkedCart[] {
  try {
    const raw = localStorage.getItem(PARKED_CARTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ParkedCart[];
  } catch {
    return [];
  }
}

function saveParkedCarts(carts: ParkedCart[]): void {
  try {
    localStorage.setItem(PARKED_CARTS_KEY, JSON.stringify(carts));
  } catch {}
}

/** Calculate cart total in cents for display */
function calcTotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
}

/** Park the current cart. Returns the park ID. */
export function parkCart(cart: PersistedCart, label?: string): string {
  const parked = loadParkedCarts();
  const parkId = generateId();
  const nextNum = parked.length + 1;

  const parkedCart: ParkedCart = {
    ...cart,
    parkId,
    label: label?.trim() || `Cart #${nextNum}`,
    parkedAt: new Date().toISOString(),
    itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
    totalCents: calcTotalCents(cart.items),
  };

  parked.push(parkedCart);
  saveParkedCarts(parked);
  return parkId;
}

/** List all parked carts, newest first. */
export function listParkedCarts(): ParkedCart[] {
  return loadParkedCarts().sort(
    (a, b) => new Date(b.parkedAt).getTime() - new Date(a.parkedAt).getTime()
  );
}

/** Recall a parked cart by ID. Removes it from parked list. */
export function recallParkedCart(id: string): PersistedCart | null {
  const parked = loadParkedCarts();
  const idx = parked.findIndex((c) => c.parkId === id);
  if (idx === -1) return null;

  const cart = parked[idx];
  parked.splice(idx, 1);
  saveParkedCarts(parked);

  // Return as PersistedCart (strip park-specific fields)
  return {
    id: cart.id,
    items: cart.items,
    customer: cart.customer,
    discounts: cart.discounts,
    createdAt: cart.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

/** Delete a parked cart without recalling it. */
export function deleteParkedCart(id: string): void {
  const parked = loadParkedCarts();
  const filtered = parked.filter((c) => c.parkId !== id);
  saveParkedCarts(filtered);
}

/** Get count of parked carts (cheap check for badge). */
export function getParkedCartCount(): number {
  return loadParkedCarts().length;
}
