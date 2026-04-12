/**
 * CardTrader API Client for TCG Singles Marketplace Sync
 *
 * Uses CardTrader REST API v2.
 * Auth: Bearer token from CARDTRADER_API_TOKEN env var or per-store settings.
 * Docs: https://api.cardtrader.com/api/v2
 */

const CARDTRADER_API_BASE = "https://api.cardtrader.com/api/v2";

// CardTrader game categories
export const CARDTRADER_CATEGORIES: Record<string, string> = {
  MTG: "Magic",
  Pokemon: "Pokemon",
  "Yu-Gi-Oh": "Yu-Gi-Oh!",
  Lorcana: "Lorcana",
};

// -- Types --

export interface CardTraderProduct {
  id: number;
  blueprint_id: number;
  name_en: string;
  quantity: number;
  price_cents: number;
  condition: string;
  description?: string;
  graded?: boolean;
  foil?: boolean;
  signed?: boolean;
  altered?: boolean;
}

export interface CardTraderProductInput {
  blueprint_id: number;
  price_cents: number;
  quantity: number;
  condition: string;
  description?: string;
  graded?: boolean;
  foil?: boolean;
  signed?: boolean;
  altered?: boolean;
}

export interface CardTraderOrder {
  id: number;
  code: string;
  state: string;
  total_cents: number;
  currency: string;
  created_at: string;
  items: Array<{
    id: number;
    product_id: number;
    blueprint_id: number;
    name_en: string;
    quantity: number;
    price_cents: number;
  }>;
  buyer?: {
    username: string;
    email?: string;
  };
}

// Condition mapping: our system -> CardTrader condition string
const CONDITION_MAP: Record<string, string> = {
  NM: "Near Mint",
  LP: "Slightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

// Reverse mapping: CardTrader -> our system
const CONDITION_REVERSE: Record<string, string> = {
  "Near Mint": "NM",
  "Slightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "DMG",
};

export function toCardTraderCondition(condition: string): string {
  return CONDITION_MAP[condition] || "Near Mint";
}

export function fromCardTraderCondition(condition: string): string {
  return CONDITION_REVERSE[condition] || "NM";
}

// -- Client --

export class CardTraderClient {
  private token: string;
  private baseUrl: string;

  constructor(token?: string) {
    this.token = token || process.env.CARDTRADER_API_TOKEN || "";
    if (!this.token) {
      throw new Error("CardTrader token not configured. Set CARDTRADER_API_TOKEN env var.");
    }
    this.baseUrl = CARDTRADER_API_BASE;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    return res;
  }

  // ---- Product (Listing) API ----

  async listProduct(product: CardTraderProductInput): Promise<CardTraderProduct> {
    const res = await this.request("POST", "/products", product);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`CardTrader listProduct failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  async updateProduct(
    productId: number | string,
    updates: Partial<CardTraderProductInput>,
  ): Promise<void> {
    const res = await this.request(
      "PUT",
      `/products/${encodeURIComponent(productId)}`,
      updates,
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`CardTrader updateProduct failed (${res.status}): ${body}`);
    }
  }

  async deleteProduct(productId: number | string): Promise<void> {
    const res = await this.request(
      "DELETE",
      `/products/${encodeURIComponent(productId)}`,
    );
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      const body = await res.text();
      throw new Error(`CardTrader deleteProduct failed (${res.status}): ${body}`);
    }
  }

  async getProducts(params?: {
    category?: string;
    limit?: number;
    page?: number;
  }): Promise<CardTraderProduct[]> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.page) searchParams.set("page", String(params.page));
    const qs = searchParams.toString();
    const path = `/products${qs ? `?${qs}` : ""}`;

    const res = await this.request("GET", path);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.products || [];
  }

  // ---- Order API ----

  async getOrders(params?: {
    state?: string;
    since?: string;
  }): Promise<CardTraderOrder[]> {
    const searchParams = new URLSearchParams();
    if (params?.state) searchParams.set("state", params.state);
    if (params?.since) searchParams.set("since", params.since);
    const qs = searchParams.toString();
    const path = `/orders${qs ? `?${qs}` : ""}`;

    const res = await this.request("GET", path);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.orders || [];
  }

  /**
   * Quick quantity update — updates existing product quantity only.
   */
  async updateQuantity(productId: number | string, quantity: number): Promise<void> {
    await this.updateProduct(productId, {
      quantity: Math.max(0, quantity),
    });
  }

  // ---- Helper: list a TCG single ----

  async listSingle(params: {
    blueprintId: number;
    title: string;
    condition: string;
    priceCents: number;
    quantity: number;
    description?: string;
    foil?: boolean;
    game?: string;
  }): Promise<{ productId: number }> {
    const ctCondition = toCardTraderCondition(params.condition);

    const product = await this.listProduct({
      blueprint_id: params.blueprintId,
      price_cents: params.priceCents,
      quantity: params.quantity,
      condition: ctCondition,
      description: params.description || `${params.title} - ${params.condition} condition`,
      foil: params.foil || false,
    });

    return { productId: product.id };
  }
}

/**
 * Get a CardTrader client using the platform-level token (env var).
 */
export function getCardTraderClient(): CardTraderClient | null {
  if (!process.env.CARDTRADER_API_TOKEN) return null;
  try {
    return new CardTraderClient();
  } catch {
    return null;
  }
}

/**
 * Get a CardTrader client for a specific store using their token.
 * Falls back to platform-level token if store doesn't have one.
 */
export function getCardTraderClientForStore(
  storeSettings: Record<string, unknown>,
): CardTraderClient | null {
  const storeToken = storeSettings.cardtrader_api_token as string | undefined;
  if (storeToken) {
    try {
      return new CardTraderClient(storeToken);
    } catch {
      // Fall through to platform token
    }
  }
  return getCardTraderClient();
}
