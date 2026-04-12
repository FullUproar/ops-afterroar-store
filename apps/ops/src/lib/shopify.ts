/* ------------------------------------------------------------------ */
/*  Shopify Admin REST API client (2024-01)                            */
/*  Used for product catalog import + inventory sync.                  */
/* ------------------------------------------------------------------ */

const API_VERSION = "2024-01";
const RATE_LIMIT_MS = 500;
const MAX_PER_PAGE = 250;

/* ---------- Types ------------------------------------------------- */

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;               // Shopify sends price as a string like "29.99"
  compare_at_price: string | null;
  inventory_item_id: number;
  inventory_quantity: number;
  weight: number | null;
  weight_unit: string | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  status: string;
}

export interface ShopifyLocation {
  id: number;
  name: string;
  address1: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  active: boolean;
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
}

/* ---------- Client ------------------------------------------------ */

export class ShopifyClient {
  private baseUrl: string;
  private accessToken: string;
  private lastRequestAt = 0;

  constructor(shopUrl: string, accessToken: string) {
    // Normalise: accept "xxx.myshopify.com" or "https://xxx.myshopify.com"
    const host = shopUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.baseUrl = `https://${host}/admin/api/${API_VERSION}`;
    this.accessToken = accessToken;
  }

  /* -- Internal fetch with rate limiting ----------------------------- */

  private async request<T>(path: string, params?: Record<string, string>): Promise<{
    data: T;
    linkNext: string | null;
  }> {
    // Enforce minimum delay between requests
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
    });

    this.lastRequestAt = Date.now();

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as T;

    // Parse cursor pagination from Link header
    const linkHeader = res.headers.get("link");
    let linkNext: string | null = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        linkNext = match[1];
      }
    }

    return { data, linkNext };
  }

  /** Fetch a URL directly (for cursor pagination follow-up). */
  private async requestUrl<T>(fullUrl: string): Promise<{
    data: T;
    linkNext: string | null;
  }> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }

    const res = await fetch(fullUrl, {
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
    });

    this.lastRequestAt = Date.now();

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as T;

    const linkHeader = res.headers.get("link");
    let linkNext: string | null = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        linkNext = match[1];
      }
    }

    return { data, linkNext };
  }

  /* -- Internal POST/PUT --------------------------------------------- */

  private async post<T>(path: string, body: unknown): Promise<T> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }

    const url = `${this.baseUrl}${path}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    this.lastRequestAt = Date.now();

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify API ${res.status}: ${text.slice(0, 300)}`);
    }

    return (await res.json()) as T;
  }

  /* -- Public methods ----------------------------------------------- */

  /** Total number of products in the store. */
  async getProductCount(): Promise<number> {
    const { data } = await this.request<{ count: number }>("/products/count.json");
    return data.count;
  }

  /**
   * Fetch all products (auto-paginating).
   * Returns every product with its variants and images.
   */
  async getProducts(params?: {
    limit?: number;
    status?: string;
  }): Promise<ShopifyProduct[]> {
    const limit = Math.min(params?.limit ?? MAX_PER_PAGE, MAX_PER_PAGE);
    const queryParams: Record<string, string> = {
      limit: String(limit),
    };
    if (params?.status) queryParams.status = params.status;

    const products: ShopifyProduct[] = [];

    // First page
    let result = await this.request<{ products: ShopifyProduct[] }>(
      "/products.json",
      queryParams,
    );
    products.push(...result.data.products);

    // Follow pagination
    while (result.linkNext) {
      result = await this.requestUrl<{ products: ShopifyProduct[] }>(result.linkNext);
      products.push(...result.data.products);
    }

    return products;
  }

  /** Fetch store locations. */
  async getLocations(): Promise<ShopifyLocation[]> {
    const { data } = await this.request<{ locations: ShopifyLocation[] }>("/locations.json");
    return data.locations;
  }

  /**
   * Fetch inventory levels for a batch of inventory item IDs at a location.
   * Shopify caps at 50 IDs per request, so this batches automatically.
   */
  async getInventoryLevels(
    locationId: number,
    inventoryItemIds: number[],
  ): Promise<ShopifyInventoryLevel[]> {
    const BATCH = 50;
    const levels: ShopifyInventoryLevel[] = [];

    for (let i = 0; i < inventoryItemIds.length; i += BATCH) {
      const batch = inventoryItemIds.slice(i, i + BATCH);
      const { data } = await this.request<{ inventory_levels: ShopifyInventoryLevel[] }>(
        "/inventory_levels.json",
        {
          location_ids: String(locationId),
          inventory_item_ids: batch.join(","),
        },
      );
      levels.push(...data.inventory_levels);
    }

    return levels;
  }

  /**
   * Set the available quantity for an inventory item at a location.
   * This is an absolute set, not a delta — pass the exact quantity you want.
   */
  async setInventoryLevel(
    locationId: number,
    inventoryItemId: number,
    available: number,
  ): Promise<ShopifyInventoryLevel> {
    const result = await this.post<{ inventory_level: ShopifyInventoryLevel }>(
      "/inventory_levels/set.json",
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available,
      },
    );
    return result.inventory_level;
  }
}
