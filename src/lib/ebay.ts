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
 * Get a singleton eBay client (returns null if not configured).
 */
export function getEbayClient(): EbayClient | null {
  if (!process.env.EBAY_USER_TOKEN) return null;
  try {
    return new EbayClient();
  } catch {
    return null;
  }
}
