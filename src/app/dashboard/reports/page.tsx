import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const sessionStoreId = (session as unknown as Record<string, unknown>).storeId as string | undefined;
  const staff = await prisma.posStaff.findFirst({
    where: {
      user_id: session.user.id,
      active: true,
      ...(sessionStoreId ? { store_id: sessionStoreId } : {}),
    },
  });
  if (!staff) return null;

  const events = await prisma.posEvent.findMany({
    where: { store_id: staff.store_id },
    orderBy: { starts_at: "desc" },
    include: {
      ledger_entries: { select: { amount_cents: true, type: true } },
      _count: { select: { checkins: true } },
    },
  });

  const results = events.map((event) => {
    const entry_fees = event.ledger_entries
      .filter((e) => e.type === "event_fee")
      .reduce((sum, e) => sum + e.amount_cents, 0);
    const tagged_sales = event.ledger_entries
      .filter((e) => e.type === "sale")
      .reduce((sum, e) => sum + e.amount_cents, 0);

    return {
      id: event.id,
      name: event.name,
      starts_at: event.starts_at,
      event_type: event.event_type,
      entry_fees,
      tagged_sales,
      total_revenue: entry_fees + tagged_sales,
      checkin_count: event._count.checkins,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Event ROI" />

      {results.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-muted">No events yet.</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {results.map((event) => (
              <div key={event.id} className="rounded-xl border border-card-border bg-card p-3 min-h-11">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground truncate mr-2">{event.name}</span>
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">{formatCents(event.total_revenue)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>
                    <span className="rounded bg-card-hover px-1.5 py-0.5 text-xs text-foreground/70">{event.event_type}</span>
                    <span className="ml-2">{event.checkin_count} players</span>
                  </span>
                  <span>{new Date(event.starts_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-card-border scroll-visible">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-card-border bg-card">
                <tr>
                  <th className="px-4 py-3 text-muted">Event</th>
                  <th className="px-4 py-3 text-muted">Date</th>
                  <th className="px-4 py-3 text-muted">Type</th>
                  <th className="px-4 py-3 text-right text-muted">Entry Fees</th>
                  <th className="px-4 py-3 text-right text-muted">Tagged Sales</th>
                  <th className="px-4 py-3 text-right text-muted">Total</th>
                  <th className="px-4 py-3 text-right text-muted">Players</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-background">
                {results.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{event.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground/70">
                      {new Date(event.starts_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-card-hover px-2 py-0.5 text-xs text-foreground/70">
                        {event.event_type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-foreground">
                      {formatCents(event.entry_fees)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-foreground">
                      {formatCents(event.tagged_sales)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">
                      {formatCents(event.total_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground/70">{event.checkin_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
