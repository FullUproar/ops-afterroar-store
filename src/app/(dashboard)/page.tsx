import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/types";
import type { LedgerEntry } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [inventoryRes, customersRes, tradeInsRes, eventsRes, ledgerRes] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("ledger_entries")
        .select("id", { count: "exact", head: true })
        .eq("type", "trade_in")
        .gte(
          "created_at",
          new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        ),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", new Date().toISOString()),
      supabase
        .from("ledger_entries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const stats = [
    {
      label: "Total Inventory Items",
      value: inventoryRes.count ?? 0,
    },
    {
      label: "Active Customers",
      value: customersRes.count ?? 0,
    },
    {
      label: "Today's Trade-Ins",
      value: tradeInsRes.count ?? 0,
    },
    {
      label: "Upcoming Events",
      value: eventsRes.count ?? 0,
    },
  ];

  const recentEntries: LedgerEntry[] = ledgerRes.data ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Welcome back</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
          >
            <p className="text-sm text-zinc-400">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Recent Ledger Entries
        </h2>
        {recentEntries.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-zinc-400">
              No ledger entries yet. Transactions will appear here as they come
              in.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900">
                <tr>
                  <th className="px-4 py-3 text-zinc-400">Date</th>
                  <th className="px-4 py-3 text-zinc-400">Type</th>
                  <th className="px-4 py-3 text-zinc-400">Description</th>
                  <th className="px-4 py-3 text-right text-zinc-400">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                {recentEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {entry.description ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-white">
                      {formatCents(entry.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
