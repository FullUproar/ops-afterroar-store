import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { opLog } from "@/lib/op-log";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Customer Segmentation API                                          */
/*  GET  → segment counts (overview)                                   */
/*  POST → filtered customer list with optional CSV export             */
/* ------------------------------------------------------------------ */

export type AdvancedSegment =
  | "top_spenders"
  | "tcg_buyers"
  | "board_game_buyers"
  | "event_regulars"
  | "lapsed"
  | "new_customers"
  | "loyalty_active"
  | "high_credit"
  | "vip"
  | "at_risk"
  | "cafe_regulars"
  | "tournament_players";

// Legacy segments still used by the existing customers page
export type CustomerSegment = "vip" | "regular" | "new" | "at_risk" | "dormant" | "active";

export interface SegmentedCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_balance_cents: number;
  created_at: string;
  segment: CustomerSegment;
  lifetime_spend_cents: number;
  purchases_30d: number;
  last_purchase_date: string | null;
}

export interface SegmentCounts {
  vip: number;
  regular: number;
  new: number;
  at_risk: number;
  dormant: number;
  active: number;
  total: number;
}

interface EnrichedCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_balance_cents: number;
  loyalty_points: number;
  tags: string[];
  created_at: Date;
  deletion_requested: boolean;
  lifetime_spend_cents: number;
  last_purchase_at: string | null;
  visit_count: number;
  sale_categories: string[];
  event_checkin_count: number;
  tab_close_count: number;
  tournament_count: number;
  // purchase pattern analysis
  has_monthly_purchases: boolean;
  days_since_last_activity: number | null;
  first_purchase_at: Date | null;
}

/* ------------------------------------------------------------------ */
/*  GET /api/customers/segments                                        */
/*  Returns both legacy segment list AND advanced segment counts       */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("customers.view");

    const advanced = request.nextUrl.searchParams.get("advanced");

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const customers = await db.posCustomer.findMany({
      where: { deletion_requested: false },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        loyalty_points: true,
        tags: true,
        created_at: true,
        deletion_requested: true,
        ledger_entries: {
          where: { type: "sale" },
          select: { amount_cents: true, created_at: true, metadata: true },
          orderBy: { created_at: "desc" as const },
        },
        event_checkins: {
          select: { checked_in_at: true },
        },
        tabs: {
          where: { status: "closed" },
          select: { id: true },
        },
        tournament_players: {
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // If advanced param is set, return advanced segment counts
    if (advanced === "true") {
      const enriched = customers.map((c) => enrichCustomer(c, now, ninetyDaysAgo));
      const counts = computeAdvancedSegmentCounts(enriched, ninetyDaysAgo, now);
      return NextResponse.json({ segments: counts, store_id: storeId });
    }

    // Legacy: return segmented customer list for existing customers page
    const segmentCounts: SegmentCounts = {
      vip: 0,
      regular: 0,
      new: 0,
      at_risk: 0,
      dormant: 0,
      active: 0,
      total: customers.length,
    };

    const segmented: SegmentedCustomer[] = customers.map((c) => {
      const lifetimeSpend = c.ledger_entries.reduce((s, e) => s + e.amount_cents, 0);
      const purchases30d = c.ledger_entries.filter(
        (e) => new Date(e.created_at) >= thirtyDaysAgo,
      ).length;
      const lastPurchase = c.ledger_entries.length > 0 ? c.ledger_entries[0].created_at : null;
      const lastPurchaseDate = lastPurchase ? new Date(lastPurchase) : null;

      let segment: CustomerSegment;

      if (lifetimeSpend >= 50000) {
        segment = "vip";
      } else if (purchases30d >= 3) {
        segment = "regular";
      } else if (new Date(c.created_at) >= fourteenDaysAgo) {
        segment = "new";
      } else if (
        lifetimeSpend >= 10000 &&
        lastPurchaseDate &&
        lastPurchaseDate < thirtyDaysAgo
      ) {
        if (lastPurchaseDate < sixtyDaysAgo) {
          segment = "dormant";
        } else {
          segment = "at_risk";
        }
      } else {
        segment = "active";
      }

      segmentCounts[segment]++;

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        credit_balance_cents: c.credit_balance_cents,
        created_at: c.created_at.toISOString(),
        segment,
        lifetime_spend_cents: lifetimeSpend,
        purchases_30d: purchases30d,
        last_purchase_date: lastPurchase
          ? new Date(lastPurchase).toISOString()
          : null,
      };
    });

    return NextResponse.json({ customers: segmented, counts: segmentCounts });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/customers/segments — filtered list for export            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requirePermission("customers.view");

    const body = await request.json();
    const {
      segment,
      days = 90,
      min_spend_cents,
      has_email,
      format = "json",
    } = body as {
      segment: AdvancedSegment;
      days?: number;
      min_spend_cents?: number;
      has_email?: boolean;
      format?: "json" | "csv";
    };

    if (!segment) {
      return NextResponse.json({ error: "segment is required" }, { status: 400 });
    }

    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - days);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const customers = await db.posCustomer.findMany({
      where: { deletion_requested: false },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        loyalty_points: true,
        tags: true,
        created_at: true,
        deletion_requested: true,
        ledger_entries: {
          where: { type: "sale" },
          select: { amount_cents: true, created_at: true, metadata: true },
          orderBy: { created_at: "desc" as const },
        },
        event_checkins: {
          select: { checked_in_at: true },
        },
        tabs: {
          where: { status: "closed" },
          select: { id: true },
        },
        tournament_players: {
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const enriched = customers.map((c) => enrichCustomer(c, now, windowStart));

    // Filter by segment
    let filtered = filterBySegment(enriched, segment, windowStart, now);

    // Apply additional filters
    if (min_spend_cents) {
      filtered = filtered.filter((c) => c.lifetime_spend_cents >= min_spend_cents);
    }
    if (has_email) {
      filtered = filtered.filter((c) => c.email && c.email.length > 0);
    }

    // Compute tags for each customer
    const result = filtered.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      lifetime_spend_cents: c.lifetime_spend_cents,
      last_purchase_at: c.last_purchase_at,
      visit_count: c.visit_count,
      loyalty_points: c.loyalty_points,
      tags: computeTags(c, ninetyDaysAgo, now),
    }));

    // Log the export
    opLog({
      storeId,
      eventType: "settings.changed",
      severity: "info",
      message: `Customer segment exported: ${segment} (${result.length} customers, format: ${format})`,
      staffName: staff.name,
      metadata: { segment, count: result.length, format, days, has_email, min_spend_cents },
    });

    if (format === "csv") {
      const csvHeader = "# This data is for your store's use only. Do not share or sell customer data.\n";
      const columns = "Name,Email,Phone,Lifetime Spend,Last Purchase,Loyalty Points";
      const rows = result.map((c) => {
        const name = csvEscape(c.name);
        const email = csvEscape(c.email || "");
        const phone = csvEscape(c.phone || "");
        const spend = formatCents(c.lifetime_spend_cents);
        const lastPurchase = c.last_purchase_at ? c.last_purchase_at.slice(0, 10) : "Never";
        return `${name},${email},${phone},${spend},${lastPurchase},${c.loyalty_points}`;
      });

      const csv = csvHeader + columns + "\n" + rows.join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="customers-${segment}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      segment,
      count: result.length,
      customers: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

type RawCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_balance_cents: number;
  loyalty_points: number;
  tags: string[];
  created_at: Date;
  deletion_requested: boolean;
  ledger_entries: { amount_cents: number; created_at: Date; metadata: unknown }[];
  event_checkins: { checked_in_at: Date }[];
  tabs: { id: string }[];
  tournament_players: { id: string }[];
};

function enrichCustomer(c: RawCustomer, now: Date, windowStart: Date): EnrichedCustomer {
  const lifetimeSpend = c.ledger_entries.reduce((s, e) => s + e.amount_cents, 0);
  const lastPurchase = c.ledger_entries.length > 0 ? c.ledger_entries[0].created_at : null;
  const firstPurchase = c.ledger_entries.length > 0
    ? c.ledger_entries[c.ledger_entries.length - 1].created_at
    : null;

  // Collect sale categories from metadata
  const categories = new Set<string>();
  for (const entry of c.ledger_entries) {
    const meta = entry.metadata as Record<string, unknown> | null;
    if (meta?.items && Array.isArray(meta.items)) {
      for (const item of meta.items) {
        if ((item as Record<string, unknown>)?.category) {
          categories.add((item as Record<string, unknown>).category as string);
        }
      }
    }
    if (meta?.category) {
      categories.add(meta.category as string);
    }
  }

  // Check if customer had monthly purchases (at least one purchase per month for 3+ months)
  const monthSet = new Set<string>();
  for (const entry of c.ledger_entries) {
    const d = new Date(entry.created_at);
    monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  const hasMonthlyPurchases = monthSet.size >= 3;

  // Days since last activity (purchase or event checkin)
  let lastActivityDate = lastPurchase ? new Date(lastPurchase) : null;
  for (const checkin of c.event_checkins) {
    const d = new Date(checkin.checked_in_at);
    if (!lastActivityDate || d > lastActivityDate) lastActivityDate = d;
  }
  const daysSinceLastActivity = lastActivityDate
    ? Math.floor((now.getTime() - lastActivityDate.getTime()) / 86400000)
    : null;

  // Event checkins within window
  const eventCheckinsInWindow = c.event_checkins.filter(
    (ci) => new Date(ci.checked_in_at) >= windowStart,
  ).length;

  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    credit_balance_cents: c.credit_balance_cents,
    loyalty_points: c.loyalty_points,
    tags: c.tags || [],
    created_at: c.created_at,
    deletion_requested: c.deletion_requested,
    lifetime_spend_cents: lifetimeSpend,
    last_purchase_at: lastPurchase ? new Date(lastPurchase).toISOString() : null,
    visit_count: c.ledger_entries.length,
    sale_categories: [...categories],
    event_checkin_count: eventCheckinsInWindow,
    tab_close_count: c.tabs.length,
    tournament_count: c.tournament_players.length,
    has_monthly_purchases: hasMonthlyPurchases,
    days_since_last_activity: daysSinceLastActivity,
    first_purchase_at: firstPurchase ? new Date(firstPurchase) : null,
  };
}

function filterBySegment(
  customers: EnrichedCustomer[],
  segment: AdvancedSegment,
  windowStart: Date,
  now: Date,
): EnrichedCustomer[] {
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  switch (segment) {
    case "top_spenders": {
      // Top 20% by lifetime spend (within the window)
      const sorted = [...customers].sort((a, b) => b.lifetime_spend_cents - a.lifetime_spend_cents);
      const cutoff = Math.max(1, Math.ceil(sorted.length * 0.2));
      return sorted.slice(0, cutoff);
    }

    case "tcg_buyers":
      return customers.filter(
        (c) => c.sale_categories.includes("tcg_single") || c.sale_categories.includes("sealed"),
      );

    case "board_game_buyers":
      return customers.filter((c) => c.sale_categories.includes("board_game"));

    case "event_regulars":
      return customers.filter((c) => c.event_checkin_count >= 3);

    case "lapsed":
      return customers.filter((c) => {
        if (c.visit_count < 2) return false;
        return c.days_since_last_activity !== null && c.days_since_last_activity >= 60;
      });

    case "new_customers":
      return customers.filter((c) => {
        if (!c.first_purchase_at) return false;
        return c.first_purchase_at >= thirtyDaysAgo;
      });

    case "loyalty_active":
      return customers.filter((c) => c.loyalty_points > 0);

    case "high_credit":
      return customers.filter((c) => c.credit_balance_cents > 1000); // > $10

    case "vip":
      return customers.filter((c) => c.lifetime_spend_cents >= 50000); // > $500

    case "at_risk":
      return customers.filter((c) => {
        if (!c.has_monthly_purchases) return false;
        return c.days_since_last_activity !== null && c.days_since_last_activity >= 30;
      });

    case "cafe_regulars":
      return customers.filter((c) => c.tab_close_count >= 5);

    case "tournament_players":
      return customers.filter((c) => c.tournament_count > 0);

    default:
      return [];
  }
}

function computeTags(c: EnrichedCustomer, ninetyDaysAgo: Date, now: Date): string[] {
  const tags: string[] = [];
  if (c.lifetime_spend_cents >= 50000) tags.push("vip");
  if (c.tournament_count > 0) tags.push("tournament_player");
  if (c.event_checkin_count >= 3) tags.push("event_regular");
  if (c.sale_categories.includes("tcg_single") || c.sale_categories.includes("sealed")) tags.push("tcg_buyer");
  if (c.sale_categories.includes("board_game")) tags.push("board_game_buyer");
  if (c.tab_close_count >= 5) tags.push("cafe_regular");
  if (c.loyalty_points > 0) tags.push("loyalty_active");
  if (c.credit_balance_cents > 1000) tags.push("high_credit");
  if (c.has_monthly_purchases && c.days_since_last_activity !== null && c.days_since_last_activity >= 30) tags.push("at_risk");
  return tags;
}

function computeAdvancedSegmentCounts(
  customers: EnrichedCustomer[],
  windowStart: Date,
  now: Date,
): Record<AdvancedSegment, number> {
  const segments: AdvancedSegment[] = [
    "top_spenders", "tcg_buyers", "board_game_buyers", "event_regulars",
    "lapsed", "new_customers", "loyalty_active", "high_credit",
    "vip", "at_risk", "cafe_regulars", "tournament_players",
  ];

  const counts = {} as Record<AdvancedSegment, number>;
  for (const seg of segments) {
    counts[seg] = filterBySegment(customers, seg, windowStart, now).length;
  }
  return counts;
}
