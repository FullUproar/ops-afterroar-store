import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/types";
import Link from "next/link";
import { DashboardModeGuard } from "@/components/dashboard-mode-guard";
import { GettingStarted } from "@/components/getting-started";
import { IntelligenceFeed } from "@/components/intelligence-feed";
import { StoreAdvisor } from "@/components/store-advisor";
import { HealthScore } from "@/components/health-score";
import { DailyClose } from "@/components/daily-close";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">Not authenticated. Please sign in.</p>
      </div>
    );
  }

  const staff = await prisma.posStaff.findFirst({
    where: { user_id: session.user.id, active: true },
  });

  if (!staff) {
    // User exists but has no store — redirect to store creation
    redirect("/setup");
  }

  // Cashiers go straight to the register — no dashboard stats for them
  if (staff.role === "cashier") {
    redirect("/dashboard/register");
  }

  const storeId = staff.store_id;

  // Check if onboarding is needed for owners
  if (staff.role === "owner") {
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    if (!settings.onboarding_complete) {
      redirect("/dashboard/onboarding");
    }
  }

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [todaySales, todayRevenue, upcomingEvents, recentLedger] =
    await Promise.all([
      prisma.posLedgerEntry.count({
        where: { store_id: storeId, type: "sale", created_at: { gte: todayStart } },
      }),
      prisma.posLedgerEntry.aggregate({
        where: { store_id: storeId, type: "sale", created_at: { gte: todayStart } },
        _sum: { amount_cents: true },
      }),
      prisma.posEvent.count({
        where: { store_id: storeId, starts_at: { gte: new Date() } },
      }),
      prisma.posLedgerEntry.findMany({
        where: { store_id: storeId },
        orderBy: { created_at: "desc" },
        take: 8,
      }),
    ]);

  const todayRevenueCents = todayRevenue._sum.amount_cents || 0;
  const mobileLedger = recentLedger.slice(0, 5);

  return (
    <DashboardModeGuard>
    <div className="space-y-6 md:space-y-8">
      {/* Store Health — single-glance status */}
      <HealthScore />

      {/* Getting Started Checklist */}
      <GettingStarted />

      {/* Quick Actions — always visible, primary CTAs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Link
          href="/dashboard/register"
          className="flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-4 md:py-5 text-white active:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/10"
        >
          <span className="text-2xl">{"\u25C8"}</span>
          <div>
            <span className="text-sm md:text-base font-bold">Open Register</span>
            <span className="block text-xs text-emerald-100/70">Start selling</span>
          </div>
        </Link>
        <Link
          href="/dashboard/cash-flow"
          className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-4 md:py-5 text-foreground active:bg-card-hover transition-colors shadow-sm dark:shadow-none"
        >
          <span className="text-2xl text-accent">{"\u25CE"}</span>
          <div>
            <span className="text-sm md:text-base font-semibold">Cash Flow</span>
            <span className="block text-xs text-muted">{formatCents(todayRevenueCents)} today</span>
          </div>
        </Link>
        <Link
          href="/dashboard/trade-ins"
          className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-4 md:py-5 text-foreground active:bg-card-hover transition-colors shadow-sm dark:shadow-none"
        >
          <span className="text-2xl text-accent">{"\u21C4"}</span>
          <div>
            <span className="text-sm md:text-base font-semibold">Trade-Ins</span>
            <span className="block text-xs text-muted">Buy cards & games</span>
          </div>
        </Link>
        <Link
          href="/dashboard/events"
          className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-4 md:py-5 text-foreground active:bg-card-hover transition-colors shadow-sm dark:shadow-none"
        >
          <span className="text-2xl text-accent">{"\u2605"}</span>
          <div>
            <span className="text-sm md:text-base font-semibold">Events</span>
            <span className="block text-xs text-muted">{upcomingEvents} upcoming</span>
          </div>
        </Link>
      </div>

      {/* AI Store Advisor — Claude-powered business co-pilot (prominent) */}
      <StoreAdvisor />

      {/* Intelligence Feed — rule-based store alerts */}
      <IntelligenceFeed compact />

      {/* Today's Summary + Recent Activity side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Today's Numbers */}
        <div className="rounded-xl border border-card-border bg-card p-5 shadow-sm dark:shadow-none">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Today</h3>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Sales</span>
              <span className="text-lg font-bold tabular-nums text-foreground">{todaySales}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Revenue</span>
              <span className="text-lg font-bold tabular-nums text-foreground">{formatCents(todayRevenueCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Upcoming Events</span>
              <span className="text-lg font-bold tabular-nums text-foreground">{upcomingEvents}</span>
            </div>
          </div>
          <Link
            href="/dashboard/cash-flow"
            className="mt-4 block text-center text-xs text-accent hover:underline"
          >
            View full cash flow {"\u2192"}
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Recent Activity</h3>
          {recentLedger.length === 0 ? (
            <div className="rounded-xl border border-card-border bg-card p-8 text-center shadow-sm dark:shadow-none">
              <p className="text-muted">No transactions yet. Open the register to make your first sale.</p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="space-y-2 lg:hidden">
                {mobileLedger.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-card-border bg-card px-4 py-3 shadow-sm dark:shadow-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-card-border px-2 py-0.5 text-[10px] font-medium text-muted">
                          {entry.type}
                        </span>
                        <span className="text-xs text-muted">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {entry.description && (
                        <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {entry.description}
                        </div>
                      )}
                    </div>
                    <div className="ml-3 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatCents(entry.amount_cents)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: compact table */}
              <div className="hidden lg:block overflow-x-auto rounded-xl border border-card-border shadow-sm dark:shadow-none">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-card-border bg-card">
                    <tr>
                      <th className="px-4 py-2.5 text-muted font-medium text-xs">Date</th>
                      <th className="px-4 py-2.5 text-muted font-medium text-xs">Type</th>
                      <th className="px-4 py-2.5 text-muted font-medium text-xs">Description</th>
                      <th className="px-4 py-2.5 text-right text-muted font-medium text-xs">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border bg-background">
                    {recentLedger.map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-full border border-card-border px-2 py-0.5 text-[10px] text-muted font-medium">
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted truncate max-w-xs">{entry.description ?? "\u2014"}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatCents(entry.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {/* End of Day */}
      <DailyClose />
    </div>
    </DashboardModeGuard>
  );
}
