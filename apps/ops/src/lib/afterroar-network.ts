import { prisma } from "./prisma";

/* ------------------------------------------------------------------ */
/*  Afterroar Network — Federation of FLGS stores                      */
/*  Cross-store tournaments, ELO ratings, benchmarks, inventory net.   */
/*                                                                     */
/*  The network is the moat. The POS is the ticket to entry.           */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */

export interface NetworkStore {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
}

export interface NetworkStats {
  total_stores: number;
  total_shared_items: number;
  total_events_this_month: number;
  total_tournament_players: number;
}

export interface LeaderboardEntry {
  player_name: string;
  store_name: string;
  store_slug: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  events_played: number;
  rank: number;
}

export interface StoreBenchmark {
  metric: string;
  label: string;
  your_value: number;
  network_avg: number;
  network_median: number;
  percentile: number;
  description: string;
}

/* ---- Network Discovery ---- */

export async function getNetworkStores(storeId: string): Promise<NetworkStore[]> {
  const stores = await prisma.posStore.findMany({
    where: {
      id: { not: storeId },
      settings: { path: ["network_inventory_enabled"], equals: true },
    },
    select: { id: true, name: true, slug: true, address: true, settings: true },
  });

  return stores.map((s) => {
    const addr = (s.address ?? {}) as Record<string, string>;
    const settings = (s.settings ?? {}) as Record<string, unknown>;
    const visible = settings.network_inventory_visible !== false;
    return {
      id: s.id,
      name: visible ? s.name : "Partner Store",
      slug: s.slug,
      city: visible ? addr.city || null : null,
      state: visible ? addr.state || null : null,
    };
  });
}

export async function getNetworkStats(): Promise<NetworkStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [storeCount, itemCount, eventCount, playerCount] = await Promise.all([
    prisma.posStore.count({
      where: { settings: { path: ["network_inventory_enabled"], equals: true } },
    }),
    prisma.posInventoryItem.count({
      where: {
        active: true,
        quantity: { gt: 0 },
        store: { settings: { path: ["network_inventory_enabled"], equals: true } },
      },
    }),
    prisma.posEvent.count({
      where: {
        starts_at: { gte: monthStart },
        store: { settings: { path: ["network_inventory_enabled"], equals: true } },
      },
    }),
    prisma.posNetworkPlayerRating.count(),
  ]);

  return {
    total_stores: storeCount,
    total_shared_items: itemCount,
    total_events_this_month: eventCount,
    total_tournament_players: playerCount,
  };
}

/* ---- ELO Rating ---- */

const K_FACTOR = 32;

export function calculateEloChange(
  winnerRating: number,
  loserRating: number,
): { winnerDelta: number; loserDelta: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const winnerDelta = Math.round(K_FACTOR * (1 - expectedWinner));
  const loserDelta = -winnerDelta;
  return { winnerDelta, loserDelta };
}

export async function updatePlayerRating(params: {
  playerName: string;
  customerId?: string;
  storeId: string;
  game: string;
  format?: string;
  result: "win" | "loss" | "draw";
  opponentRating?: number;
}): Promise<void> {
  const existing = await prisma.posNetworkPlayerRating.findFirst({
    where: {
      player_name: params.playerName,
      store_id: params.storeId,
      game: params.game,
      format: params.format || null,
    },
  });

  const currentRating = existing?.rating ?? 1200;
  const oppRating = params.opponentRating ?? 1200;

  let ratingDelta = 0;
  if (params.result === "win") {
    ratingDelta = calculateEloChange(currentRating, oppRating).winnerDelta;
  } else if (params.result === "loss") {
    ratingDelta = calculateEloChange(oppRating, currentRating).loserDelta;
  }
  // draws: no rating change in basic ELO

  if (existing) {
    await prisma.posNetworkPlayerRating.update({
      where: { id: existing.id },
      data: {
        rating: currentRating + ratingDelta,
        wins: params.result === "win" ? { increment: 1 } : undefined,
        losses: params.result === "loss" ? { increment: 1 } : undefined,
        draws: params.result === "draw" ? { increment: 1 } : undefined,
        events_played: { increment: 1 },
        last_played_at: new Date(),
        updated_at: new Date(),
      },
    });
  } else {
    await prisma.posNetworkPlayerRating.create({
      data: {
        player_name: params.playerName,
        customer_id: params.customerId || null,
        store_id: params.storeId,
        game: params.game,
        format: params.format || null,
        rating: 1200 + ratingDelta,
        wins: params.result === "win" ? 1 : 0,
        losses: params.result === "loss" ? 1 : 0,
        draws: params.result === "draw" ? 1 : 0,
        events_played: 1,
        last_played_at: new Date(),
      },
    });
  }
}

/* ---- Leaderboard ---- */

export async function getNetworkLeaderboard(options?: {
  game?: string;
  format?: string;
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const where: Record<string, unknown> = {};
  if (options?.game) where.game = options.game;
  if (options?.format) where.format = options.format;

  const ratings = await prisma.posNetworkPlayerRating.findMany({
    where,
    orderBy: { rating: "desc" },
    take: options?.limit || 50,
    include: {
      store: { select: { name: true, slug: true } },
    },
  });

  return ratings.map((r, i) => ({
    player_name: r.player_name,
    store_name: r.store.name,
    store_slug: r.store.slug,
    rating: r.rating,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    events_played: r.events_played,
    rank: i + 1,
  }));
}

/* ---- Benchmarks ---- */

export async function getStoreBenchmarks(storeId: string): Promise<StoreBenchmark[]> {
  // Get all network stores with benchmarking enabled
  const networkStores = await prisma.posStore.findMany({
    where: {
      settings: { path: ["opt_in_benchmarking"], equals: true },
    },
    select: { id: true },
  });

  if (networkStores.length < 3) {
    return []; // Not enough data for meaningful benchmarks
  }

  const storeIds = networkStores.map((s) => s.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  // Calculate metrics for each store
  const storeMetrics: Array<{
    storeId: string;
    avgTransaction: number;
    transactionCount: number;
    eventAttendance: number;
    customerCount: number;
  }> = [];

  for (const sid of storeIds) {
    const [sales, events, customers] = await Promise.all([
      prisma.posLedgerEntry.aggregate({
        where: { store_id: sid, type: "sale", created_at: { gte: thirtyDaysAgo } },
        _avg: { amount_cents: true },
        _count: true,
      }),
      prisma.posEventCheckin.count({
        where: { event: { store_id: sid }, checked_in_at: { gte: thirtyDaysAgo } },
      }),
      prisma.posCustomer.count({
        where: { store_id: sid, deletion_requested: { not: true } },
      }),
    ]);

    storeMetrics.push({
      storeId: sid,
      avgTransaction: sales._avg.amount_cents || 0,
      transactionCount: sales._count,
      eventAttendance: events,
      customerCount: customers,
    });
  }

  // Find this store's metrics
  const mine = storeMetrics.find((m) => m.storeId === storeId);
  if (!mine) return [];

  function percentile(values: number[], myValue: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const below = sorted.filter((v) => v < myValue).length;
    return Math.round((below / sorted.length) * 100);
  }

  function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function avg(values: number[]): number {
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  }

  const allAvgTx = storeMetrics.map((m) => m.avgTransaction);
  const allTxCount = storeMetrics.map((m) => m.transactionCount);
  const allEvents = storeMetrics.map((m) => m.eventAttendance);
  const allCustomers = storeMetrics.map((m) => m.customerCount);

  return [
    {
      metric: "avg_transaction",
      label: "Average Transaction",
      your_value: Math.round(mine.avgTransaction),
      network_avg: Math.round(avg(allAvgTx)),
      network_median: Math.round(median(allAvgTx)),
      percentile: percentile(allAvgTx, mine.avgTransaction),
      description: mine.avgTransaction > avg(allAvgTx)
        ? "Your average sale is above the network — your upselling game is strong"
        : "Your average sale is below the network — consider bundling or accessory suggestions",
    },
    {
      metric: "transaction_volume",
      label: "Monthly Transactions",
      your_value: mine.transactionCount,
      network_avg: Math.round(avg(allTxCount)),
      network_median: Math.round(median(allTxCount)),
      percentile: percentile(allTxCount, mine.transactionCount),
      description: mine.transactionCount > avg(allTxCount)
        ? "You're busier than most network stores — great foot traffic"
        : "Traffic is below average — events and social media can help drive visits",
    },
    {
      metric: "event_attendance",
      label: "Event Attendance (30d)",
      your_value: mine.eventAttendance,
      network_avg: Math.round(avg(allEvents)),
      network_median: Math.round(median(allEvents)),
      percentile: percentile(allEvents, mine.eventAttendance),
      description: mine.eventAttendance > avg(allEvents)
        ? "Your events are pulling strong crowds — keep it up"
        : "Events are your best traffic driver — consider adding more weekly events",
    },
    {
      metric: "customer_base",
      label: "Customer Base",
      your_value: mine.customerCount,
      network_avg: Math.round(avg(allCustomers)),
      network_median: Math.round(median(allCustomers)),
      percentile: percentile(allCustomers, mine.customerCount),
      description: mine.customerCount > avg(allCustomers)
        ? "Strong customer base — focus on retention and loyalty"
        : "Growing your customer base should be a priority — loyalty programs help",
    },
  ];
}
