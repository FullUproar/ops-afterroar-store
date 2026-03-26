import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/types";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-zinc-400">Not authenticated. Please sign in.</p>
      </div>
    );
  }

  const staff = await prisma.posStaff.findFirst({
    where: { user_id: session.user.id, active: true },
  });

  if (!staff) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-zinc-400">No store found. Please contact support.</p>
      </div>
    );
  }

  // Cashiers go straight to the register — no dashboard stats for them
  if (staff.role === "cashier") {
    redirect("/dashboard/checkout");
  }

  const storeId = staff.store_id;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [inventoryCount, customerCount, todayTradeIns, upcomingEvents, recentLedger] =
    await Promise.all([
      prisma.posInventoryItem.count({ where: { store_id: storeId } }),
      prisma.posCustomer.count({ where: { store_id: storeId } }),
      prisma.posLedgerEntry.count({
        where: { store_id: storeId, type: "trade_in", created_at: { gte: todayStart } },
      }),
      prisma.posEvent.count({
        where: { store_id: storeId, starts_at: { gte: new Date() } },
      }),
      prisma.posLedgerEntry.findMany({
        where: { store_id: storeId },
        orderBy: { created_at: "desc" },
        take: 10,
      }),
    ]);

  const stats = [
    { label: "Inventory", value: inventoryCount, href: "/dashboard/inventory" },
    { label: "Customers", value: customerCount, href: "/dashboard/customers" },
    { label: "Trade-Ins Today", value: todayTradeIns, href: "/dashboard/trade-ins" },
    { label: "Upcoming Events", value: upcomingEvents, href: "/dashboard/events" },
  ];

  // On mobile, show only last 5 ledger entries
  const mobileLedger = recentLedger.slice(0, 5);

  return (
    <div className="space-y-6 md:space-y-8">
      <h1 className="text-xl md:text-2xl font-bold text-white">Welcome back</h1>

      {/* Quick Actions — mobile-first, most common staff tasks */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Link
          href="/dashboard/checkout"
          className="flex flex-col items-center gap-2 rounded-xl bg-emerald-600 px-3 py-4 text-white active:bg-emerald-700 transition-colors"
        >
          <span className="text-2xl">{"\u25C8"}</span>
          <span className="text-xs font-semibold">New Sale</span>
        </Link>
        <Link
          href="/dashboard/trade-ins"
          className="flex flex-col items-center gap-2 rounded-xl bg-blue-600 px-3 py-4 text-white active:bg-blue-700 transition-colors"
        >
          <span className="text-2xl">{"\u21C4"}</span>
          <span className="text-xs font-semibold">Trade-In</span>
        </Link>
        <Link
          href="/dashboard/events"
          className="flex flex-col items-center gap-2 rounded-xl bg-purple-600 px-3 py-4 text-white active:bg-purple-700 transition-colors"
        >
          <span className="text-2xl">{"\u2605"}</span>
          <span className="text-xs font-semibold">Check In</span>
        </Link>
      </div>

      {/* Stat cards — 2x2 on mobile, 4 across on desktop */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:p-6 active:bg-zinc-800 transition-colors"
          >
            <p className="text-xs md:text-sm text-zinc-400">{stat.label}</p>
            <p className="mt-1 md:mt-2 text-2xl md:text-3xl font-semibold text-white">
              {stat.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Recent Ledger Entries */}
      <div>
        <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-white">
          Recent Activity
        </h2>
        {recentLedger.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-zinc-400">No ledger entries yet.</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list (no table) */}
            <div className="space-y-0 rounded-lg border border-zinc-800 bg-zinc-900 md:hidden">
              {mobileLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b border-zinc-800 last:border-b-0 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                        {entry.type}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {entry.description && (
                      <div className="mt-0.5 truncate text-xs text-zinc-400">
                        {entry.description}
                      </div>
                    )}
                  </div>
                  <div className="ml-3 shrink-0 text-sm font-semibold text-white">
                    {formatCents(entry.amount_cents)}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3 text-zinc-400">Date</th>
                    <th className="px-4 py-3 text-zinc-400">Type</th>
                    <th className="px-4 py-3 text-zinc-400">Description</th>
                    <th className="px-4 py-3 text-right text-zinc-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                  {recentLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                          {entry.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{entry.description ?? "\u2014"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-white">
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
  );
}
