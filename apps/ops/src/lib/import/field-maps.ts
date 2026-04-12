/* ------------------------------------------------------------------ */
/*  Pre-built field mapping templates for known POS systems             */
/*  Auto-fills the mapping UI when a store selects their source system  */
/* ------------------------------------------------------------------ */

export interface FieldMapTemplate {
  /** Source column name (from CSV header) */
  source: string;
  /** Target field in our system */
  target: string;
  /** Transform to apply (if any) */
  transform?: "dollars_to_cents" | "normalize_condition" | "normalize_category" | "normalize_phone" | "boolean";
}

export interface SourceSystemConfig {
  name: string;
  label: string;
  inventory: FieldMapTemplate[];
  customers: FieldMapTemplate[];
}

export const SOURCE_SYSTEMS: Record<string, SourceSystemConfig> = {
  binderpos: {
    name: "binderpos",
    label: "BinderPOS",
    inventory: [
      { source: "Product Name", target: "name" },
      { source: "Category", target: "category", transform: "normalize_category" },
      { source: "SKU", target: "sku" },
      { source: "Barcode", target: "barcode" },
      { source: "Price", target: "price_cents", transform: "dollars_to_cents" },
      { source: "Cost", target: "cost_cents", transform: "dollars_to_cents" },
      { source: "Quantity", target: "quantity" },
      { source: "Condition", target: "attributes.condition", transform: "normalize_condition" },
      { source: "Set", target: "attributes.set_name" },
      { source: "Set Code", target: "attributes.set_code" },
      { source: "Foil", target: "attributes.foil", transform: "boolean" },
      { source: "Game", target: "attributes.game" },
      { source: "Language", target: "attributes.language" },
      { source: "Collector Number", target: "attributes.collector_number" },
      { source: "Rarity", target: "attributes.rarity" },
    ],
    customers: [
      { source: "Name", target: "name" },
      { source: "Email", target: "email" },
      { source: "Phone", target: "phone", transform: "normalize_phone" },
      { source: "Store Credit", target: "credit_balance_cents", transform: "dollars_to_cents" },
      { source: "Notes", target: "notes" },
    ],
  },

  square: {
    name: "square",
    label: "Square",
    inventory: [
      { source: "Item Name", target: "name" },
      { source: "Category", target: "category", transform: "normalize_category" },
      { source: "SKU", target: "sku" },
      { source: "GTIN", target: "barcode" },
      { source: "Price", target: "price_cents", transform: "dollars_to_cents" },
      { source: "Current Quantity", target: "quantity" },
    ],
    customers: [
      { source: "Given Name", target: "name" },
      { source: "Email Address", target: "email" },
      { source: "Phone Number", target: "phone", transform: "normalize_phone" },
    ],
  },

  lightspeed: {
    name: "lightspeed",
    label: "Lightspeed",
    inventory: [
      { source: "Description", target: "name" },
      { source: "Category", target: "category", transform: "normalize_category" },
      { source: "Custom SKU", target: "sku" },
      { source: "UPC", target: "barcode" },
      { source: "Default Price", target: "price_cents", transform: "dollars_to_cents" },
      { source: "Default Cost", target: "cost_cents", transform: "dollars_to_cents" },
      { source: "Qty", target: "quantity" },
    ],
    customers: [
      { source: "First Last", target: "name" },
      { source: "Email", target: "email" },
      { source: "Phone", target: "phone", transform: "normalize_phone" },
      { source: "Credit Account Balance", target: "credit_balance_cents", transform: "dollars_to_cents" },
    ],
  },

  shopify: {
    name: "shopify",
    label: "Shopify POS",
    inventory: [
      { source: "Title", target: "name" },
      { source: "Type", target: "category", transform: "normalize_category" },
      { source: "Variant SKU", target: "sku" },
      { source: "Variant Barcode", target: "barcode" },
      { source: "Variant Price", target: "price_cents", transform: "dollars_to_cents" },
      { source: "Variant Compare At Price", target: "cost_cents", transform: "dollars_to_cents" },
      { source: "Variant Inventory Qty", target: "quantity" },
    ],
    customers: [
      { source: "First Name", target: "name" },
      { source: "Email", target: "email" },
      { source: "Phone", target: "phone", transform: "normalize_phone" },
    ],
  },

  sortswift: {
    name: "sortswift",
    label: "SortSwift",
    inventory: [
      { source: "Name", target: "name" },
      { source: "Category", target: "category", transform: "normalize_category" },
      { source: "SKU", target: "sku" },
      { source: "UPC", target: "barcode" },
      { source: "Sell Price", target: "price_cents", transform: "dollars_to_cents" },
      { source: "Buy Price", target: "cost_cents", transform: "dollars_to_cents" },
      { source: "Stock", target: "quantity" },
      { source: "Condition", target: "attributes.condition", transform: "normalize_condition" },
      { source: "Set", target: "attributes.set_name" },
      { source: "Game", target: "attributes.game" },
    ],
    customers: [
      { source: "Customer Name", target: "name" },
      { source: "Email", target: "email" },
      { source: "Phone", target: "phone", transform: "normalize_phone" },
      { source: "Credit Balance", target: "credit_balance_cents", transform: "dollars_to_cents" },
    ],
  },

  shadowpos: {
    name: "shadowpos",
    label: "ShadowPOS",
    inventory: [
      { source: "Product", target: "name" },
      { source: "Category", target: "category", transform: "normalize_category" },
      { source: "SKU", target: "sku" },
      { source: "Barcode", target: "barcode" },
      { source: "Retail Price", target: "price_cents", transform: "dollars_to_cents" },
      { source: "Cost", target: "cost_cents", transform: "dollars_to_cents" },
      { source: "On Hand", target: "quantity" },
      { source: "Condition", target: "attributes.condition", transform: "normalize_condition" },
    ],
    customers: [
      { source: "Name", target: "name" },
      { source: "Email", target: "email" },
      { source: "Phone", target: "phone", transform: "normalize_phone" },
      { source: "Store Credit", target: "credit_balance_cents", transform: "dollars_to_cents" },
    ],
  },

  csv: {
    name: "csv",
    label: "Generic CSV",
    inventory: [],
    customers: [],
  },
};

/** Get available source systems for the UI */
export function getSourceSystems() {
  return Object.values(SOURCE_SYSTEMS).map((s) => ({
    name: s.name,
    label: s.label,
  }));
}

/** Get field map template for a source system + entity type */
export function getFieldMapTemplate(
  sourceSystem: string,
  entityType: "inventory" | "customers"
): FieldMapTemplate[] {
  return SOURCE_SYSTEMS[sourceSystem]?.[entityType] ?? [];
}

/** Target fields available for mapping */
export const INVENTORY_TARGET_FIELDS = [
  { value: "name", label: "Name", required: true },
  { value: "category", label: "Category", required: true },
  { value: "sku", label: "SKU" },
  { value: "barcode", label: "Barcode" },
  { value: "price_cents", label: "Price" },
  { value: "cost_cents", label: "Cost" },
  { value: "quantity", label: "Quantity" },
  { value: "attributes.condition", label: "Condition (TCG)" },
  { value: "attributes.foil", label: "Foil (TCG)" },
  { value: "attributes.set_name", label: "Set Name (TCG)" },
  { value: "attributes.set_code", label: "Set Code (TCG)" },
  { value: "attributes.game", label: "Game (TCG)" },
  { value: "attributes.language", label: "Language" },
  { value: "attributes.collector_number", label: "Collector Number" },
  { value: "attributes.rarity", label: "Rarity" },
  { value: "attributes.grade", label: "Grade (PSA/BGS)" },
  { value: "attributes.grading_service", label: "Grading Service" },
  { value: "external_id", label: "External ID (Source System)" },
];

export const CUSTOMER_TARGET_FIELDS = [
  { value: "name", label: "Name", required: true },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "credit_balance_cents", label: "Store Credit Balance" },
  { value: "notes", label: "Notes" },
];
