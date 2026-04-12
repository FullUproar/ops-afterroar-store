import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getRecommendationsForCustomer, type Recommendation } from "@/lib/recommendations";

/* ------------------------------------------------------------------ */
/*  GET /api/recommendations?customer_id=xxx                            */
/*  Returns personalized product recommendations for a customer.        */
/*  Cached for 5 minutes per customer to keep the register snappy.      */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  data: { games: Recommendation[]; cards: Recommendation[]; events: Recommendation[] };
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up stale entries periodically (avoid unbounded growth)
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL * 2) {
      cache.delete(key);
    }
  }
}

export async function GET(request: Request) {
  try {
    const { db, storeId } = await requirePermission("checkout");

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customer_id");

    if (!customerId) {
      return NextResponse.json(
        { error: "customer_id is required" },
        { status: 400 },
      );
    }

    // Verify customer belongs to this store
    const customer = await db.posCustomer.findFirst({
      where: { id: customerId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Check cache
    const cacheKey = `${storeId}:${customerId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        ...cached.data,
        customer_name: customer.name,
        cached: true,
        generated_at: new Date(cached.timestamp).toISOString(),
      });
    }

    // Generate fresh recommendations
    const recs = await getRecommendationsForCustomer(db, customerId, storeId);

    // Update cache
    cache.set(cacheKey, { data: recs, timestamp: Date.now() });

    // Prune occasionally
    if (cache.size > 100) pruneCache();

    return NextResponse.json({
      ...recs,
      customer_name: customer.name,
      cached: false,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
