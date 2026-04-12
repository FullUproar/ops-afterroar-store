/* ------------------------------------------------------------------ */
/*  AI Validation Layer                                                 */
/*  Claude-powered sanity check on every import.                        */
/*  Catches what deterministic rules miss: anomalies, likely errors,    */
/*  suspicious patterns, and data quality issues.                       */
/*                                                                      */
/*  Three modes:                                                        */
/*  1. VALIDATE  — sanity check mapped data (every import)              */
/*  2. EXTRACT   — parse messy formats: PDF, images, unknown CSVs       */
/*  3. ENRICH    — fill gaps: identify game, normalize set names, etc.  */
/* ------------------------------------------------------------------ */

import Anthropic from "@anthropic-ai/sdk";

const getClient = () =>
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AIValidationResult {
  anomalies: AIAnomaly[];
  suggestions: AISuggestion[];
  confidence: number; // 0-100 overall confidence in data quality
  summary: string;
  tokenUsage: { input: number; output: number };
}

export interface AIAnomaly {
  severity: "error" | "warning" | "info";
  row?: number;
  field?: string;
  message: string;
  suggestedFix?: string;
}

export interface AISuggestion {
  type: "duplicate" | "pricing" | "mapping" | "missing" | "enrichment";
  message: string;
  affectedRows?: number[];
}

export interface AIExtractionResult {
  headers: string[];
  rows: Record<string, string>[];
  confidence: number;
  notes: string;
  tokenUsage: { input: number; output: number };
}

/**
 * Mask PII fields before sending data to external AI service.
 * Preserves data structure for validation but removes identifying info.
 */
function maskPII(row: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...row };
  // Mask email: "john@example.com" → "j***@e***.com"
  if (typeof masked.email === "string" && masked.email.includes("@")) {
    const [local, domain] = masked.email.split("@");
    masked.email = `${local[0]}***@${domain[0]}***.${domain.split(".").pop()}`;
  }
  // Mask phone: "(555) 123-4567" → "***-4567"
  if (typeof masked.phone === "string" && masked.phone.length > 4) {
    masked.phone = `***${masked.phone.slice(-4)}`;
  }
  // Mask name: "John Smith" → "J. S."
  if (typeof masked.name === "string") {
    const parts = masked.name.split(" ").filter(Boolean);
    masked.name = parts.map((p) => `${(p as string)[0]}.`).join(" ");
  }
  // Remove notes (often contain personal info)
  delete masked.notes;
  return masked;
}

/* ------------------------------------------------------------------ */
/*  MODE 1: VALIDATE — sanity check mapped data                         */
/* ------------------------------------------------------------------ */

export async function aiValidateImport(
  entityType: "inventory" | "customers",
  mappedRows: Record<string, unknown>[],
  sourceSystem: string,
  options?: { sampleSize?: number }
): Promise<AIValidationResult> {
  const client = getClient();
  const sampleSize = options?.sampleSize ?? 50;

  // Sample rows for AI review (first N + last 5 + random 5 from middle)
  const rawSample = sampleRows(mappedRows, sampleSize);
  const totalRows = mappedRows.length;

  // Mask PII before sending to external AI service
  const sample = rawSample.map((row) => maskPII(row));

  // Compute summary stats for context
  const stats = computeStats(entityType, mappedRows);

  const prompt = entityType === "inventory"
    ? buildInventoryValidationPrompt(sample, totalRows, stats, sourceSystem)
    : buildCustomerValidationPrompt(sample, totalRows, stats, sourceSystem);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseAIResponse(text);

  return {
    ...parsed,
    tokenUsage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

function sampleRows(
  rows: Record<string, unknown>[],
  maxSample: number
): Record<string, unknown>[] {
  if (rows.length <= maxSample) return rows;

  const first = rows.slice(0, Math.min(20, maxSample - 10));
  const last = rows.slice(-5);
  const middleCount = maxSample - first.length - last.length;
  const middle: Record<string, unknown>[] = [];
  const step = Math.floor(rows.length / (middleCount + 1));
  for (let i = 1; i <= middleCount; i++) {
    middle.push(rows[i * step]);
  }

  return [...first, ...middle, ...last];
}

function computeStats(
  entityType: string,
  rows: Record<string, unknown>[]
): Record<string, unknown> {
  if (entityType === "inventory") {
    const prices = rows.map((r) => Number(r.price_cents) || 0).filter((p) => p > 0);
    const quantities = rows.map((r) => Number(r.quantity) || 0);
    const categories = new Map<string, number>();
    for (const r of rows) {
      const cat = String(r.category ?? "unknown");
      categories.set(cat, (categories.get(cat) ?? 0) + 1);
    }

    return {
      total_rows: rows.length,
      price_min_cents: prices.length > 0 ? Math.min(...prices) : 0,
      price_max_cents: prices.length > 0 ? Math.max(...prices) : 0,
      price_avg_cents: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      total_quantity: quantities.reduce((a, b) => a + b, 0),
      zero_price_count: rows.filter((r) => !Number(r.price_cents)).length,
      zero_quantity_count: rows.filter((r) => !Number(r.quantity)).length,
      categories: Object.fromEntries(categories),
      unique_skus: new Set(rows.map((r) => r.sku).filter(Boolean)).size,
    };
  }

  // Customers
  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const withCredit = rows.filter((r) => Number(r.credit_balance_cents) > 0).length;
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit_balance_cents) || 0), 0);

  return {
    total_rows: rows.length,
    with_email: withEmail,
    with_phone: withPhone,
    with_credit_balance: withCredit,
    total_credit_cents: totalCredit,
  };
}

function buildInventoryValidationPrompt(
  sample: Record<string, unknown>[],
  totalRows: number,
  stats: Record<string, unknown>,
  sourceSystem: string
): string {
  return `You are a data quality validator for a game store POS migration. A store is importing ${totalRows} inventory items from ${sourceSystem}.

STATS:
${JSON.stringify(stats, null, 2)}

SAMPLE DATA (${sample.length} of ${totalRows} rows):
${JSON.stringify(sample.slice(0, 30), null, 2)}

Check for:
1. PRICING ANOMALIES: Items priced at $0.01 that shouldn't be, or $10,000+ items that look wrong. TCG singles can legitimately be $0.05 to $50,000+, but flag anything suspicious.
2. CONDITION VALUES: Are conditions standard (NM/LP/MP/HP/DMG)? Flag non-standard values.
3. CATEGORY MISMATCHES: Items in wrong categories (e.g., a booster box categorized as "tcg_single").
4. DUPLICATE PATTERNS: Multiple items with very similar names that might be duplicates.
5. MISSING DATA: Important fields that are empty across many rows (names, prices, categories).
6. QUANTITY ANOMALIES: Negative quantities, or suspiciously high quantities (>1000 for a single card).
7. SOURCE-SPECIFIC ISSUES: Known problems with ${sourceSystem} exports.
8. GENERAL DATA QUALITY: Anything else that looks off.

Respond in this exact JSON format:
{
  "anomalies": [
    {"severity": "error|warning|info", "row": null_or_number, "field": "field_name", "message": "description", "suggestedFix": "optional fix"}
  ],
  "suggestions": [
    {"type": "duplicate|pricing|mapping|missing|enrichment", "message": "description", "affectedRows": []}
  ],
  "confidence": 85,
  "summary": "One sentence summary of data quality"
}`;
}

function buildCustomerValidationPrompt(
  sample: Record<string, unknown>[],
  totalRows: number,
  stats: Record<string, unknown>,
  sourceSystem: string
): string {
  return `You are a data quality validator for a game store POS migration. A store is importing ${totalRows} customers from ${sourceSystem}.

STATS:
${JSON.stringify(stats, null, 2)}

SAMPLE DATA (${sample.length} of ${totalRows} rows):
${JSON.stringify(sample.slice(0, 30), null, 2)}

Check for:
1. DUPLICATE CUSTOMERS: Similar names/emails that might be the same person.
2. INVALID EMAILS: Malformed email addresses.
3. STORE CREDIT ANOMALIES: Unusually high balances, negative balances.
4. MISSING CONTACT INFO: Customers with no email AND no phone (hard to identify later).
5. NAME QUALITY: Empty names, "test" customers, obviously fake entries.
6. DATA COMPLETENESS: What percentage of useful fields are populated?

Respond in this exact JSON format:
{
  "anomalies": [
    {"severity": "error|warning|info", "row": null_or_number, "field": "field_name", "message": "description", "suggestedFix": "optional fix"}
  ],
  "suggestions": [
    {"type": "duplicate|pricing|mapping|missing|enrichment", "message": "description", "affectedRows": []}
  ],
  "confidence": 85,
  "summary": "One sentence summary of data quality"
}`;
}

function parseAIResponse(text: string): Omit<AIValidationResult, "tokenUsage"> {
  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        anomalies: [],
        suggestions: [{ type: "mapping", message: "AI validation returned non-JSON response", affectedRows: [] }],
        confidence: 50,
        summary: "AI validation completed but response was not parseable",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      anomalies: parsed.anomalies ?? [],
      suggestions: parsed.suggestions ?? [],
      confidence: parsed.confidence ?? 50,
      summary: parsed.summary ?? "Validation complete",
    };
  } catch {
    return {
      anomalies: [],
      suggestions: [],
      confidence: 50,
      summary: "AI validation completed but response could not be parsed",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  MODE 2: EXTRACT — parse messy formats into structured data          */
/* ------------------------------------------------------------------ */

export async function aiExtractFromText(
  text: string,
  entityType: "inventory" | "customers",
  context?: string
): Promise<AIExtractionResult> {
  const client = getClient();

  const fieldGuide = entityType === "inventory"
    ? "name, category (tcg_single/sealed/board_game/miniature/accessory/food_drink/other), sku, barcode, price (dollars), cost (dollars), quantity, condition (NM/LP/MP/HP/DMG), game, set_name, language, foil (yes/no)"
    : "name, email, phone, credit_balance (dollars), notes";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are a data extraction engine for a game store POS migration. Extract structured ${entityType} data from the following text/document.

${context ? `Context: ${context}\n` : ""}
TARGET FIELDS: ${fieldGuide}

SOURCE TEXT:
${text.slice(0, 8000)}

Extract every ${entityType === "inventory" ? "product/item" : "customer"} you can find. Return as JSON:
{
  "headers": ["field1", "field2", ...],
  "rows": [
    {"field1": "value1", "field2": "value2"},
    ...
  ],
  "confidence": 75,
  "notes": "Any issues or uncertainties about the extraction"
}

Be aggressive about extraction — it's better to extract something imperfect that the user can review than to miss data. Use best judgment for ambiguous values.`,
      },
    ],
  });

  const text2 = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text2.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      headers: parsed.headers ?? [],
      rows: parsed.rows ?? [],
      confidence: parsed.confidence ?? 50,
      notes: parsed.notes ?? "",
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch {
    return {
      headers: [],
      rows: [],
      confidence: 0,
      notes: "Failed to parse AI extraction response",
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  MODE 3: ENRICH — fill gaps in mapped data                           */
/* ------------------------------------------------------------------ */

export async function aiEnrichInventory(
  items: Array<{ name: string; category?: string; attributes?: Record<string, unknown> }>,
  options?: { batchSize?: number }
): Promise<{
  enriched: Array<{
    index: number;
    game?: string;
    set_name?: string;
    condition?: string;
    language?: string;
    foil?: boolean;
    suggested_category?: string;
  }>;
  tokenUsage: { input: number; output: number };
}> {
  const client = getClient();
  const batchSize = options?.batchSize ?? 50;

  // Only enrich items missing game/set data
  const needsEnrichment = items
    .map((item, index) => ({ ...item, index }))
    .filter((item) => {
      const attrs = item.attributes ?? {};
      return !attrs.game || !attrs.set_name;
    })
    .slice(0, batchSize);

  if (needsEnrichment.length === 0) {
    return { enriched: [], tokenUsage: { input: 0, output: 0 } };
  }

  const itemList = needsEnrichment.map((item) => ({
    index: item.index,
    name: item.name,
    category: item.category,
    existing_attributes: item.attributes,
  }));

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are a trading card game expert. For each item below, identify the game, set, and any other TCG attributes you can determine from the name.

Games: MTG (Magic: The Gathering), Pokemon, Yu-Gi-Oh, Flesh and Blood, Lorcana, One Piece, Star Wars Unlimited, other
Conditions: NM, LP, MP, HP, DMG
Languages: EN, JP, DE, FR, IT, ES, PT, ZH, KO

Items to identify:
${JSON.stringify(itemList, null, 2)}

Return JSON array:
[
  {"index": 0, "game": "mtg", "set_name": "Alpha", "condition": "NM", "language": "EN", "foil": false, "suggested_category": "tcg_single"},
  ...
]

Only include fields you're confident about. Omit uncertain fields rather than guessing.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      enriched: parsed,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch {
    return {
      enriched: [],
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}
