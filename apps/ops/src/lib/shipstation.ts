/**
 * ShipStation API Integration — Multi-Tenant
 * Ported from Full Uproar site, adapted for Store Ops multi-store model.
 *
 * Architecture: Platform ShipStation account with per-store tagging.
 * Each store is mapped to a ShipStation "store" via advancedOptions.source.
 * One account, one webhook, per-store routing via order tags.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ShipStationConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

export interface ShipAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  residential?: boolean;
}

export interface ShipDimensions {
  length: number;
  width: number;
  height: number;
  units: "inches" | "centimeters";
}

export interface ShipWeight {
  value: number;
  units: "pounds" | "ounces" | "grams";
}

export interface ShipOrderItem {
  lineItemKey?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  weight?: ShipWeight;
  options?: Array<{ name: string; value: string }>;
}

export interface CreateShipOrderRequest {
  orderNumber: string;
  orderDate: string;
  orderStatus: "awaiting_payment" | "awaiting_shipment" | "shipped" | "on_hold" | "cancelled";
  customerEmail?: string;
  customerUsername?: string;
  billTo: ShipAddress;
  shipTo: ShipAddress;
  items: ShipOrderItem[];
  amountPaid?: number;
  taxAmount?: number;
  shippingAmount?: number;
  weight?: ShipWeight;
  dimensions?: ShipDimensions;
  paymentMethod?: string;
  carrierCode?: string;
  serviceCode?: string;
  packageCode?: string;
  advancedOptions?: {
    warehouseId?: number;
    customField1?: string; // Store Ops storeId
    customField2?: string; // Store Ops orderId
    source?: string; // Store name for ShipStation routing
    [key: string]: unknown;
  };
}

export interface ShipRate {
  serviceName: string;
  serviceCode: string;
  shipmentCost: number;
  otherCost: number;
}

export interface ShipLabel {
  shipmentId: number;
  trackingNumber: string;
  labelData: string; // base64 PDF
  shipmentCost: number;
  carrierCode: string;
  serviceCode: string;
  shipDate: string;
}

/* ------------------------------------------------------------------ */
/*  API Client                                                         */
/* ------------------------------------------------------------------ */

class ShipStationAPI {
  private authHeader: string;
  private baseUrl: string;

  constructor(config: ShipStationConfig) {
    this.baseUrl = config.baseUrl || "https://ssapi.shipstation.com";
    const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
    this.authHeader = `Basic ${auth}`;
  }

  private async request<T>(endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      throw new Error(`ShipStation rate limited. Retry after: ${res.headers.get("X-Rate-Limit-Reset")}`);
    }

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`ShipStation API ${res.status}: ${error}`);
    }

    return res.json();
  }

  async createOrder(order: CreateShipOrderRequest) {
    return this.request("/orders/createorder", "POST", order);
  }

  async getRates(params: {
    carrierCode: string;
    fromPostalCode: string;
    toPostalCode: string;
    toCountry: string;
    toState?: string;
    toCity?: string;
    weight: ShipWeight;
    dimensions?: ShipDimensions;
  }): Promise<ShipRate[]> {
    return this.request("/shipments/getrates", "POST", params);
  }

  async createLabel(params: {
    orderId?: string;
    carrierCode: string;
    serviceCode: string;
    packageCode: string;
    shipDate: string;
    weight: ShipWeight;
    dimensions?: ShipDimensions;
    shipFrom: ShipAddress;
    shipTo: ShipAddress;
    testLabel?: boolean;
  }): Promise<ShipLabel> {
    return this.request("/shipments/createlabel", "POST", params);
  }

  async voidLabel(shipmentId: number): Promise<{ approved: boolean; message: string }> {
    return this.request("/shipments/voidlabel", "POST", { shipmentId });
  }

  async trackShipment(carrierCode: string, trackingNumber: string) {
    return this.request(`/shipments?carrierCode=${carrierCode}&trackingNumber=${trackingNumber}`);
  }

  async listCarriers() {
    return this.request("/carriers");
  }

  async getCarrierServices(carrierCode: string) {
    return this.request(`/carriers/listservices?carrierCode=${carrierCode}`);
  }

  async markAsShipped(params: {
    orderId: string;
    carrierCode: string;
    trackingNumber?: string;
    shipDate?: string;
    notifyCustomer?: boolean;
  }) {
    return this.request("/orders/markasshipped", "POST", params);
  }

  async registerWebhook(params: {
    target_url: string;
    event: "ORDER_NOTIFY" | "SHIP_NOTIFY" | "ITEM_SHIP_NOTIFY";
    friendly_name?: string;
  }) {
    return this.request("/webhooks/subscribe", "POST", params);
  }

  async listWebhooks() {
    return this.request("/webhooks");
  }

  async deleteWebhook(webhookId: string) {
    return this.request(`/webhooks/${webhookId}`, "DELETE");
  }
}

/* ------------------------------------------------------------------ */
/*  Multi-Tenant Helpers                                               */
/* ------------------------------------------------------------------ */

let instance: ShipStationAPI | null = null;

export function getShipStation(): ShipStationAPI | null {
  if (instance) return instance;

  const apiKey = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;

  if (!apiKey || !apiSecret) return null;

  instance = new ShipStationAPI({ apiKey, apiSecret });
  return instance;
}

export function isShipStationConfigured(): boolean {
  return !!(process.env.SHIPSTATION_API_KEY && process.env.SHIPSTATION_API_SECRET);
}

/**
 * Convert a Store Ops order to ShipStation format.
 * Tags with storeId + storeName for multi-tenant routing.
 */
export function convertPosOrderToShipStation(
  order: {
    id: string;
    order_number: string;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    shipping_address: Record<string, string> | null;
    items: Array<{ name: string; quantity: number; price_cents: number; sku?: string }>;
    subtotal_cents: number;
    tax_cents: number;
    shipping_cents: number;
    total_cents: number;
    status: string;
    created_at: string;
  },
  storeId: string,
  storeName: string,
): CreateShipOrderRequest {
  const addr = order.shipping_address || {};

  return {
    orderNumber: order.order_number,
    orderDate: new Date(order.created_at).toISOString(),
    orderStatus: order.status === "paid" ? "awaiting_shipment" : "awaiting_payment",
    customerEmail: order.customer_email || undefined,
    customerUsername: order.customer_name,
    billTo: {
      name: order.customer_name,
      street1: addr.street || addr.street1 || "",
      street2: addr.street2 || undefined,
      city: addr.city || "",
      state: addr.state || "",
      postalCode: addr.zip || addr.postalCode || "",
      country: addr.country || "US",
      phone: order.customer_phone || undefined,
    },
    shipTo: {
      name: order.customer_name,
      street1: addr.street || addr.street1 || "",
      street2: addr.street2 || undefined,
      city: addr.city || "",
      state: addr.state || "",
      postalCode: addr.zip || addr.postalCode || "",
      country: addr.country || "US",
      phone: order.customer_phone || undefined,
      residential: true,
    },
    items: order.items.map((item) => ({
      lineItemKey: item.sku || undefined,
      sku: item.sku || undefined,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price_cents / 100,
    })),
    amountPaid: order.total_cents / 100,
    taxAmount: order.tax_cents / 100,
    shippingAmount: order.shipping_cents / 100,
    paymentMethod: "Stripe",
    advancedOptions: {
      customField1: storeId,
      customField2: order.id,
      source: storeName,
    },
  };
}

/**
 * Sync a POS order to ShipStation. Non-throwing — logs errors.
 */
export async function syncOrderToShipStation(
  order: Parameters<typeof convertPosOrderToShipStation>[0],
  storeId: string,
  storeName: string,
): Promise<boolean> {
  const ss = getShipStation();
  if (!ss) return false;

  try {
    const ssOrder = convertPosOrderToShipStation(order, storeId, storeName);
    await ss.createOrder(ssOrder);
    return true;
  } catch (err) {
    console.error(`[ShipStation] Failed to sync order ${order.id}:`, err);
    return false;
  }
}

/**
 * Parse a comma-separated address string into components.
 * Ported from Full Uproar site.
 */
export function parseAddressString(addressString: string): {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
} {
  const parts = addressString.split(",").map((s) => s.trim());

  if (parts.length >= 5) {
    const stateZip = parts[3].split(" ").filter(Boolean);
    return { street1: parts[0], street2: parts[1], city: parts[2], state: stateZip[0] || "", postalCode: stateZip.slice(1).join(" "), country: parts[4] || "US" };
  }
  if (parts.length >= 4) {
    const stateZip = parts[2].split(" ").filter(Boolean);
    return { street1: parts[0], city: parts[1], state: stateZip[0] || "", postalCode: stateZip.slice(1).join(" "), country: parts[3] || "US" };
  }
  if (parts.length >= 3) {
    const stateZip = parts[2].split(" ").filter(Boolean);
    return { street1: parts[0], city: parts[1], state: stateZip[0] || "", postalCode: stateZip.slice(1).join(" "), country: "US" };
  }
  return { street1: addressString, city: "", state: "", postalCode: "", country: "US" };
}

/* ------------------------------------------------------------------ */
/*  Default box sizes by product category                              */
/* ------------------------------------------------------------------ */

export const CATEGORY_WEIGHTS: Record<string, number> = {
  board_game: 32,    // oz
  sealed: 24,        // oz (booster box)
  tcg_single: 2,     // oz
  miniature: 16,     // oz
  accessory: 4,      // oz
  food_drink: 12,    // oz
  other: 16,         // oz
};

export const DEFAULT_BOX = {
  length: 12,
  width: 9,
  height: 3,
  units: "inches" as const,
};

/**
 * Calculate total weight for a list of items.
 */
export function calculateOrderWeight(
  items: Array<{ category: string; quantity: number; weight_oz?: number }>,
): ShipWeight {
  let totalOz = 0;
  for (const item of items) {
    const itemWeight = item.weight_oz || CATEGORY_WEIGHTS[item.category] || 16;
    totalOz += itemWeight * item.quantity;
  }
  return { value: totalOz, units: "ounces" };
}

/**
 * Fallback shipping rates when ShipStation is unavailable.
 */
export const FALLBACK_RATES: Array<{ name: string; code: string; baseCents: number; perLbCents: number }> = [
  { name: "USPS Ground Advantage", code: "usps_ground_advantage", baseCents: 450, perLbCents: 50 },
  { name: "USPS Priority Mail", code: "usps_priority_mail", baseCents: 800, perLbCents: 75 },
  { name: "FedEx Ground", code: "fedex_ground", baseCents: 900, perLbCents: 60 },
  { name: "FedEx Express Saver", code: "fedex_express_saver", baseCents: 1500, perLbCents: 125 },
];

export function calculateFallbackRates(weightOz: number): Array<{ name: string; code: string; totalCents: number }> {
  const lbs = weightOz / 16;
  return FALLBACK_RATES.map((rate) => ({
    name: rate.name,
    code: rate.code,
    totalCents: rate.baseCents + Math.round(rate.perLbCents * lbs),
  }));
}

export default ShipStationAPI;
