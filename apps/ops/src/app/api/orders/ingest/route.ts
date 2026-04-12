import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestOrder, type IngestOrderPayload } from "@/lib/order-ingest";
import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  POST /api/orders/ingest — generic order ingestion API              */
/*  For any external e-commerce source: Shopify, WooCommerce, custom.  */
/*                                                                     */
/*  Auth: Authorization: Bearer {store_api_key}                        */
/*  Feature gate: api_access module                                    */
/*                                                                     */
/*  Same payload shape, same code path as HQ bridge — dogfood.         */
/* ------------------------------------------------------------------ */

/** Hash an API key for comparison (stored hashed in settings) */
function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function authenticateApiKey(
  authHeader: string | null,
): Promise<{ store: { id: string; name: string; settings: Record<string, unknown> } } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7);
  if (!key) return null;

  const keyHash = hashKey(key);

  // Look up store by hashed API key
  const store = await prisma.posStore.findFirst({
    where: {
      settings: { path: ["api_key_hash"], equals: keyHash },
    },
    select: { id: true, name: true, settings: true },
  });

  if (!store) return null;

  // Check api_access feature module is enabled
  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const plan = (settings.plan as string) || "free";
  const addons = (settings.addons as string[]) || [];

  // api_access is available on pro/enterprise or as an add-on
  const hasApiAccess =
    plan === "pro" || plan === "enterprise" || addons.includes("api_access");

  if (!hasApiAccess) return null;

  return { store: { id: store.id, name: store.name, settings } };
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request.headers.get("authorization"));

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid API key or api_access module not enabled" },
      { status: 401 },
    );
  }

  let body: IngestOrderPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.order_number || !body.items?.length) {
    return NextResponse.json(
      { error: "order_number and items[] are required" },
      { status: 400 },
    );
  }

  // Default source to "custom" if not specified
  if (!body.source) body.source = "custom";

  try {
    const result = await ingestOrder(auth.store.id, auth.store.name, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error("[OrderIngest] Error:", err);
    return NextResponse.json(
      { error: "Order ingestion failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
