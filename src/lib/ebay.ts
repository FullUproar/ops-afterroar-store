/**
 * eBay API Client for TCG Singles Marketplace Sync
 *
 * Uses eBay Sell APIs (Inventory, Offer, Fulfillment).
 * Auth: OAuth Bearer token from EBAY_USER_TOKEN env var.
 * Production vs sandbox detected from token prefix.
 */

const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_SANDBOX_API_BASE = "https://api.sandbox.ebay.com";

// eBay category IDs for TCG
export const EBAY_TCG_CATEGORIES: Record<string, string> = {
  MTG: "38292", // Magic the Gathering Individual Cards
  Pokemon: "183454", // Pokemon Individual Cards
  "Yu-Gi-Oh": "183452", // Yu-Gi-Oh Individual Cards
  Lorcana: "261328", // Disney Lorcana TCG Singles
};

// -- Types --

export interface EbayInventoryItem {
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
  condition: string; // e.g. "LIKE_NEW", "USED_EXCELLENT"
  product: {
    title: string;
    description: string;
    imageUrls: string[];
    aspects?: Record<string, string[]>;
  };
}

export interface EbayOffer {
  sku: string;
  marketplaceId: string;
  format: string;
  listingDescription?: string;
  availableQuantity: number;
  pricingSummary: {
    price: {
      value: string;
      currency: string;
    };
  };
  categoryId: string;
  merchantLocationKey?: string;
  listingPolicies?: {
    fulfillmentPolicyId?: string;
    paymentPolicyId?: string;
    returnPolicyId?: string;
  };
}

export interface EbayOfferResponse {
  offerId: string;
}

export interface EbayPublishResponse {
  listingId: string;
}

export interface EbayOrder {
  orderId: string;
  orderFulfillmentStatus: string;
  pricingSummary: {
    total: { value: string; currency: string };
  };
  lineItems: Array<{
    lineItemId: string;
    sku: string;
    title: string;
    quantity: number;
    total: { value: string; currency: string };
  }>;
  creationDate: string;
}

// Condition mapping: our system -> eBay condition enum
const CONDITION_MAP: Record<string, string> = {
  NM: "LIKE_NEW",
  LP: "USED_EXCELLENT",
  MP: "USED_VERY_GOOD",
  HP: "USED_GOOD",
  DMG: "USED_ACCEPTABLE",
};

function isProduction(token: string): boolean {
  return token.startsWith("v^1.1");
}

// -- Client --

export class EbayClient {
  private token: string;
  private baseUrl: string;

  constructor(token?: string) {
    this.token = token || process.env.EBAY_USER_TOKEN || "";
    if (!this.token) {
      throw new Error("eBay token not configured. Set EBAY_USER_TOKEN env var.");
    }
    this.baseUrl = isProduction(this.token)
      ? EBAY_API_BASE
      : EBAY_SANDBOX_API_BASE;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
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

  // ---- Inventory API ----

  async createOrReplaceInventoryItem(
    sku: string,
    item: EbayInventoryItem
  ): Promise<void> {
    const res = await this.request(
      "PUT",
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      item
    );
    if (!res.ok && res.status !== 204) {
      const body = await res.text();
      throw new Error(`eBay createInventoryItem failed (${res.status}): ${body}`);
    }
  }

  async getInventoryItem(sku: string): Promise<EbayInventoryItem | null> {
    const res = await this.request(
      "GET",
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`eBay getInventoryItem failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  async deleteInventoryItem(sku: string): Promise<void> {
    const res = await this.request(
      "DELETE",
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`
    );
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      const body = await res.text();
      throw new Error(`eBay deleteInventoryItem failed (${res.status}): ${body}`);
    }
  }

  // ---- Offer API ----

  async createOffer(offer: EbayOffer): Promise<EbayOfferResponse> {
    const res = await this.request("POST", "/sell/inventory/v1/offer", offer);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`eBay createOffer failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  async publishOffer(offerId: string): Promise<EbayPublishResponse> {
    const res = await this.request(
      "POST",
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`eBay publishOffer failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  async getOffers(sku: string): Promise<EbayOffer[]> {
    const res = await this.request(
      "GET",
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.offers || [];
  }

  async updateOffer(
    offerId: string,
    offer: Partial<EbayOffer>
  ): Promise<void> {
    const res = await this.request(
      "PUT",
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
      offer
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`eBay updateOffer failed (${res.status}): ${body}`);
    }
  }

  async deleteOffer(offerId: string): Promise<void> {
    const res = await this.request(
      "DELETE",
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`
    );
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      const body = await res.text();
      throw new Error(`eBay deleteOffer failed (${res.status}): ${body}`);
    }
  }

  // ---- Order API (Fulfillment) ----

  async getOrders(filter?: string): Promise<EbayOrder[]> {
    let path = "/sell/fulfillment/v1/order";
    if (filter) path += `?filter=${encodeURIComponent(filter)}`;
    const res = await this.request("GET", path);
    if (!res.ok) return [];
    const data = await res.json();
    return data.orders || [];
  }

  /**
   * Get orders created after a given date.
   * eBay filter format: creationdate:[2026-04-01T00:00:00.000Z..]
   */
  async getOrdersSince(since: Date): Promise<EbayOrder[]> {
    const filter = `creationdate:[${since.toISOString()}..]`;
    return this.getOrders(filter);
  }

  /**
   * Mark an order as shipped in eBay.
   */
  async createShippingFulfillment(
    orderId: string,
    params: {
      trackingNumber: string;
      shippingCarrier: string;
      lineItemIds: string[];
    },
  ): Promise<void> {
    const res = await this.request(
      "POST",
      `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`,
      {
        lineItems: params.lineItemIds.map((id) => ({
          lineItemId: id,
          quantity: 1,
        })),
        shippingCarrierCode: params.shippingCarrier,
        trackingNumber: params.trackingNumber,
      },
    );
    if (!res.ok && res.status !== 204) {
      const body = await res.text();
      throw new Error(`eBay createShippingFulfillment failed (${res.status}): ${body}`);
    }
  }

  /**
   * Quick quantity update — updates existing inventory item quantity only.
   * Much faster than a full createOrReplaceInventoryItem call.
   */
  async updateQuantity(sku: string, quantity: number): Promise<void> {
    await this.createOrReplaceInventoryItem(sku, {
      availability: {
        shipToLocationAvailability: { quantity: Math.max(0, quantity) },
      },
      // Minimal required fields — eBay merges with existing data
      condition: "LIKE_NEW",
      product: { title: "", description: "", imageUrls: [] },
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
    imageUrls?: string[];
    game?: string;
    setName?: string;
    rarity?: string;
  }): Promise<{ listingId: string; offerId: string }> {
    const ebayCondition = CONDITION_MAP[params.condition] || "LIKE_NEW";
    const categoryId =
      EBAY_TCG_CATEGORIES[params.game || "MTG"] || EBAY_TCG_CATEGORIES.MTG;

    // Build aspects for better search visibility on eBay
    const aspects: Record<string, string[]> = {};
    if (params.game) aspects["Game"] = [params.game];
    if (params.setName) aspects["Set"] = [params.setName];
    if (params.rarity) aspects["Rarity"] = [params.rarity];
    if (params.condition) aspects["Card Condition"] = [params.condition];

    // 1. Create or replace inventory item
    const inventoryItem: EbayInventoryItem = {
      availability: {
        shipToLocationAvailability: { quantity: params.quantity },
      },
      condition: ebayCondition,
      product: {
        title: params.title,
        description:
          params.description || `${params.title} - ${params.condition} condition`,
        imageUrls: params.imageUrls || [],
        aspects,
      },
    };

    await this.createOrReplaceInventoryItem(params.sku, inventoryItem);

    // 2. Create offer
    const offer: EbayOffer = {
      sku: params.sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: params.quantity,
      pricingSummary: {
        price: {
          value: (params.priceCents / 100).toFixed(2),
          currency: "USD",
        },
      },
      categoryId,
    };

    const { offerId } = await this.createOffer(offer);

    // 3. Publish
    const { listingId } = await this.publishOffer(offerId);

    return { listingId, offerId };
  }
}

/**
 * Get an eBay client using the platform-level token (env var).
 */
export function getEbayClient(): EbayClient | null {
  if (!process.env.EBAY_USER_TOKEN) return null;
  try {
    return new EbayClient();
  } catch {
    return null;
  }
}

/**
 * Get an eBay client for a specific store using their OAuth tokens.
 * Falls back to platform-level token if store doesn't have one.
 */
export function getEbayClientForStore(
  storeSettings: Record<string, unknown>,
): EbayClient | null {
  const storeToken = storeSettings.ebay_access_token as string | undefined;
  if (storeToken) {
    try {
      return new EbayClient(storeToken);
    } catch {
      // Fall through to platform token
    }
  }
  return getEbayClient();
}

/* ------------------------------------------------------------------ */
/*  OAuth helpers — exchange code, refresh tokens                      */
/* ------------------------------------------------------------------ */

const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";

const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/commerce.taxonomy.readonly",
].join(" ");

/**
 * Generate the eBay OAuth authorization URL for a store to connect.
 */
export function getEbayAuthUrl(storeId: string): string | null {
  const clientId = process.env.EBAY_CLIENT_ID;
  const redirectUri = process.env.EBAY_REDIRECT_URI;

  if (!clientId || !redirectUri) return null;

  // Sign the state to prevent spoofing (storeId.hmac_signature)
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const crypto = require("crypto");
  const sig = crypto.createHmac("sha256", secret).update(storeId).digest("hex").slice(0, 16);
  const signedState = `${storeId}.${sig}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: EBAY_SCOPES,
    state: signedState,
  });

  return `${EBAY_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeEbayCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
} | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = process.env.EBAY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) return null;

  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    console.error("[eBay OAuth] Token exchange failed:", await res.text());
    return null;
  }

  return res.json();
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshEbayToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: EBAY_SCOPES,
    }),
  });

  if (!res.ok) {
    console.error("[eBay OAuth] Token refresh failed:", await res.text());
    return null;
  }

  return res.json();
}
