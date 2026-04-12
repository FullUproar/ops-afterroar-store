import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getStoreSnapshot, type StoreSnapshot } from "@/lib/store-intelligence";
import { getStoreSettings } from "@/lib/store-settings-shared";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  POST /api/intelligence/advisor — Claude-powered store advisor      */
/*  Feeds real store metrics to Claude and returns personalized advice. */
/*  The store's own AI business co-pilot.                              */
/* ------------------------------------------------------------------ */

const anthropic = new Anthropic();

// In-memory rate-limit: 1 request per store per 30 seconds
const lastRequest = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

// Default daily request limit per store
const DEFAULT_DAILY_LIMIT = 20;

function buildSystemPrompt(
  storeName: string,
  tone: string,
  wpnLevel: string,
): string {
  const toneGuide =
    tone === "gamer"
      ? `You're talking to a game store owner — not an MBA student. Use game store lingo: "bench warmers" for dead stock, "hot sellers" for fast movers, "regulars going MIA" for at-risk customers. Be direct, funny where appropriate, and skip the corporate speak. Think "friend who's really good at business" not "McKinsey consultant."`
      : tone === "casual"
        ? `Keep it casual and plain English. No jargon, no acronyms, no finance-speak. Just tell them what's going on and what to do about it like you're explaining it to a smart friend who doesn't speak business.`
        : `Be professional but concise. Use standard business terminology. Focus on actionable recommendations with clear ROI reasoning.`;

  const wpnContext =
    wpnLevel !== "none"
      ? `\nThe store is WPN ${wpnLevel.charAt(0).toUpperCase() + wpnLevel.slice(1)} level. Factor WPN metrics (event frequency, unique engaged players, Tickets sold) into your advice where relevant.`
      : "";

  return `You are the AI business advisor for "${storeName}", a friendly local game store (FLGS). You help the owner make smarter decisions about inventory, cash flow, events, customers, and operations.

${toneGuide}
${wpnContext}

RULES:
- Keep responses under 300 words. Owners are busy.
- Lead with the most important thing. Don't bury the lead.
- Every insight should end with a specific action: "Do X by Y."
- Never recommend generic advice like "track your KPIs" — be specific to THIS store's numbers.
- If the numbers look healthy, say so. Don't manufacture problems.
- Understand that game stores are LOW MARGIN businesses. 35% blended margin is healthy. They compete with Amazon on price but win on community.
- Store credit is a liability, not free money. When someone spends credit, the store gives away product at cost.
- Events are the lifeblood of game stores. Empty calendar = dying store.
- January/February is the hardest time for game stores (post-holiday slump).
- Prereleases and new set launches are the biggest revenue weekends.
- TCG singles have the best margins but highest volatility.
- Sealed product has predictable margins but ties up capital.
- Board games have long tail — can sit for months before selling.

Format: Use short paragraphs. Bold key numbers. No bullet lists longer than 3 items. No headers — this is a conversation, not a report.`;
}

function buildUserPrompt(
  snapshot: StoreSnapshot,
  question: string | null,
): string {
  const metrics = `
Here are my store's current numbers (last 30 days):
- Revenue: ${formatCents(snapshot.revenue30d)}
- Payouts (trade-ins, refunds): ${formatCents(snapshot.payouts30d)}
- Net cash flow: ${formatCents(snapshot.netCash30d)}
- Monthly fixed costs: $${snapshot.monthlyFixedCosts.toLocaleString()}
- Cash runway: ~${snapshot.cashRunwayDays} days
- Average daily revenue: ${formatCents(snapshot.avgDailyRevenue)}
- Capital locked in inventory: ${formatCents(snapshot.totalInventoryCost)}
- Dead stock (no sales): ${formatCents(snapshot.deadStockValue)} across ${snapshot.deadStockCount} items
- Blended margin: ${snapshot.blendedMarginPct}%
- Total customers: ${snapshot.totalCustomers}
- At-risk regulars (haven't been in recently): ${snapshot.atRiskCustomers}
- New customers this week: ${snapshot.newCustomersWeek}
- Outstanding store credit: ${formatCents(snapshot.outstandingCredit)} across ${snapshot.creditCustomerCount} customers
- Upcoming events: ${snapshot.upcomingEventCount}
- Trade-ins processed (30d): ${snapshot.tradeInVolume30d}
- Top inventory category: ${snapshot.topCategory} (${snapshot.topCategoryCostPct}% of capital)
${snapshot.wpnLevel !== "none" ? `- WPN Level: ${snapshot.wpnLevel}` : ""}
`;

  if (question) {
    return `${metrics}\n\nMy question: ${question}`;
  }

  return `${metrics}\n\nBased on these numbers, what's the most important thing I should focus on right now? Give me your top 2-3 priorities and specific actions I can take this week.`;
}

export async function POST(request: Request) {
  try {
    const { db, storeId } = await requirePermission("reports");

    // Rate limit
    const lastReq = lastRequest.get(storeId) || 0;
    if (Date.now() - lastReq < RATE_LIMIT_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastReq)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before asking again.` },
        { status: 429 },
      );
    }
    lastRequest.set(storeId, Date.now());

    // Daily usage limit (persistent via store settings)
    const storeRecord = await db.posStore.findUnique({
      where: { id: storeId },
      select: { name: true, settings: true },
    });
    const storeSettings = (storeRecord?.settings ?? {}) as Record<string, unknown>;
    const dailyLimit = (storeSettings.advisor_daily_limit as number) || DEFAULT_DAILY_LIMIT;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const usageData = (storeSettings.advisor_usage ?? {}) as Record<string, number>;
    const todayUsage = usageData[today] ?? 0;

    if (todayUsage >= dailyLimit) {
      return NextResponse.json(
        {
          error: `Daily advisor limit reached (${dailyLimit} requests). Resets at midnight.`,
          usage: { today: todayUsage, limit: dailyLimit },
        },
        { status: 429 },
      );
    }

    // Parse request
    const body = await request.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.slice(0, 500) : null;

    // Use already-fetched store settings
    const settings = getStoreSettings(storeSettings);
    const storeName = settings.store_display_name || storeRecord?.name || "Your Store";

    // Build snapshot
    const snapshot = await getStoreSnapshot(db, storeId, settings);

    // Call Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: buildSystemPrompt(
        storeName,
        settings.intel_advisor_tone || "gamer",
        settings.intel_wpn_level || "none",
      ),
      messages: [
        {
          role: "user",
          content: buildUserPrompt(snapshot, question),
        },
      ],
    });

    const advice =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Increment daily usage counter (fire-and-forget)
    const newUsage = todayUsage + 1;
    // Keep only last 7 days of usage data to prevent bloat
    const cleanedUsage: Record<string, number> = {};
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    for (const [date, count] of Object.entries(usageData)) {
      if (date >= weekAgo) cleanedUsage[date] = count;
    }
    cleanedUsage[today] = newUsage;

    prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: {
          ...storeSettings,
          advisor_usage: cleanedUsage,
        },
      },
    }).catch(() => {}); // fire-and-forget

    return NextResponse.json({
      advice,
      usage: { today: newUsage, limit: dailyLimit },
      snapshot_summary: {
        revenue30d: snapshot.revenue30d,
        cashRunwayDays: snapshot.cashRunwayDays,
        deadStockValue: snapshot.deadStockValue,
        outstandingCredit: snapshot.outstandingCredit,
        blendedMarginPct: snapshot.blendedMarginPct,
      },
    });
  } catch (error) {
    // If Anthropic API key is missing, provide a helpful error
    if (error instanceof Error && error.message.includes("API key")) {
      return NextResponse.json(
        {
          error: "AI advisor not configured. Add ANTHROPIC_API_KEY to your environment variables.",
          advice: null,
        },
        { status: 503 },
      );
    }
    return handleAuthError(error);
  }
}
