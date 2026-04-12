/**
 * Mana Pool API Client for TCG Singles Marketplace Sync
 *
 * Uses Mana Pool REST API v1.
 * Auth: API key via X-Api-Key header.
 * Docs: https://api.manapool.com/v1
 */

const MANAPOOL_API_BASE = "https://api.manapool.com/v1";

// -- Types --

export interface ManaPoolListing {
  id: string;
  title: string;
  price_cents: number;
  quantity: number;
  condition: string;
  game: string;
  set_name?: string;
  description?: string;
  image_url?: string;
  foil?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManaPoolListingInput {
  title: string;
  price_cents: number;
  quantity: number;
  condition: string;
  game: string;
  set_name?: string;
  description?: string;
  image_url?: string;
  foil?: boolean;
  sku?: string;
}

export interface ManaPoolOrder {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
  items: Array<{
    id: string;
    listing_id: string;
    title: string;
    quantity: number;
    price_cents: number;
    sku?: string;
  }>;
  buyer?: {
    name: string;
    email?: string;
  };
}

// Condition mapping: our system -> Mana Pool
const CONDITION_MAP: Record<string, string> = {
  NM: "near_mint",
  LP: "lightly_played",
  MP: "moderately_played",
  HP: "heavily_played",
  DMG: "damaged",
};

// Reverse mapping
const CONDITION_REVERSE: Record<string, string> = {
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

export function toManaPoolCondition(condition: string): string {
  return CONDITION_MAP[condition] || "near_mint";
}

export function fromManaPoolCondition(condition: string): string {
  return CONDITION_REVERSE[condition] || "NM";
}

// -- Client --

export class ManaPoolClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.MANAPOOL_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("Mana Pool API key not configured. Set MANAPOOL_API_KEY env var.");
    }
    this.baseUrl = MANAPOOL_API_BASE;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
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

  // ---- Listing API ----

  async createListing(listing: ManaPoolListingInput): Promise<ManaPoolListing> {
    const res = await this.request("POST", "/listings", listing);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mana Pool createListing failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  async updateListing(
    listingId: string,
    updates: Partial<ManaPoolListingInput>,
  ): Promise<void> {
    const res = await this.request(
      "PUT",
      `/listings/${encodeURIComponent(listingId)}`,
      updates,
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mana Pool updateListing failed (${res.status}): ${body}`);
    }
  }

  async deleteListing(listingId: string): Promise<void> {
    const res = await this.request(
      "DELETE",
      `/listings/${encodeURIComponent(listingId)}`,
    );
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      const body = await res.text();
      throw new Error(`Mana Pool deleteListing failed (${res.status}): ${body}`);
    }
  }

  async getListings(params?: {
    game?: string;
    limit?: number;
    offset?: number;
  }): Promise<ManaPoolListing[]> {
    const searchParams = new URLSearchParams();
    if (params?.game) searchParams.set("game", params.game);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    const path = `/listings${qs ? `?${qs}` : ""}`;

    const res = await this.request("GET", path);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.listings || [];
  }

  // ---- Order API ----

  async getOrders(params?: {
    status?: string;
    since?: string;
  }): Promise<ManaPoolOrder[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.since) searchParams.set("since", params.since);
    const qs = searchParams.toString();
    const path = `/orders${qs ? `?${qs}` : ""}`;

    const res = await this.request("GET", path);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.orders || [];
  }

  /**
   * Quick quantity update — updates existing listing quantity only.
   */
  async updateQuantity(listingId: string, quantity: number): Promise<void> {
    await this.updateListing(listingId, {
      quantity: Math.max(0, quantity),
    });
  }

  // ---- Helper: list a TCG single ----

  async listSingle(params: {
    sku: string;
    title: string;
    condition: string;
    priceCents: number;
    quantity: number;
    description?: string;
    imageUrl?: string;
    foil?: boolean;
    game?: string;
    setName?: string;
  }): Promise<{ listingId: string }> {
    const mpCondition = toManaPoolCondition(params.condition);

    const listing = await this.createListing({
      title: params.title,
      price_cents: params.priceCents,
      quantity: params.quantity,
      condition: mpCondition,
      game: params.game || "MTG",
      set_name: params.setName,
      description: params.description || `${params.title} - ${params.condition} condition`,
      image_url: params.imageUrl,
      foil: params.foil || false,
      sku: params.sku,
    });

    return { listingId: listing.id };
  }
}

/**
 * Get a Mana Pool client using the platform-level API key (env var).
 */
export function getManaPoolClient(): ManaPoolClient | null {
  if (!process.env.MANAPOOL_API_KEY) return null;
  try {
    return new ManaPoolClient();
  } catch {
    return null;
  }
}

/**
 * Get a Mana Pool client for a specific store using their API key.
 * Falls back to platform-level key if store doesn't have one.
 */
export function getManaPoolClientForStore(
  storeSettings: Record<string, unknown>,
): ManaPoolClient | null {
  const storeKey = storeSettings.manapool_api_key as string | undefined;
  if (storeKey) {
    try {
      return new ManaPoolClient(storeKey);
    } catch {
      // Fall through to platform key
    }
  }
  return getManaPoolClient();
}
