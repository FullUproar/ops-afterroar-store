import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/types";
import type { GameEvent } from "@/lib/types";

export default async function EventROIPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("game_events")
    .select("*")
    .order("date", { ascending: false });

  const allEvents: GameEvent[] = events ?? [];

  const eventsWithRevenue = await Promise.all(
    allEvents.map(async (event) => {
      const [ledgerRes, checkinRes] = await Promise.all([
        supabase
          .from("ledger_entries")
          .select("amount_cents, type")
          .eq("event_id", event.id),
        supabase
          .from("event_checkins")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id),
      ]);

      const entries = ledgerRes.data ?? [];

      const entryFees = entries
        .filter((e) => e.type === "event_entry")
        .reduce((sum, e) => sum + e.amount_cents, 0);

      const taggedSales = entries
        .filter((e) => e.type === "sale")
        .reduce((sum, e) => sum + e.amount_cents, 0);

      const totalRevenue = entryFees + taggedSales;

      return {
        ...event,
        entry_fees: entryFees,
        tagged_sales: taggedSales,
        total_revenue: totalRevenue,
        checkin_count: checkinRes.count ?? 0,
      };
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Event ROI</h1>

      {eventsWithRevenue.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">
            No events yet. Create an event to start tracking ROI.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-zinc-400">Event Name</th>
                <th className="px-4 py-3 text-zinc-400">Date</th>
                <th className="px-4 py-3 text-zinc-400">Type</th>
                <th className="px-4 py-3 text-right text-zinc-400">
                  Entry Fees
                </th>
                <th className="px-4 py-3 text-right text-zinc-400">
                  Tagged Sales
                </th>
                <th className="px-4 py-3 text-right text-zinc-400">
                  Total Revenue
                </th>
                <th className="px-4 py-3 text-right text-zinc-400">Players</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {eventsWithRevenue.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-medium text-white">
                    {event.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                    {new Date(event.starts_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {event.event_type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-white">
                    {formatCents(event.entry_fees)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-white">
                    {formatCents(event.tagged_sales)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-white">
                    {formatCents(event.total_revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300">
                    {event.checkin_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
