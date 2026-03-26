import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: events, error: eventsError } = await supabase
    .from("game_events")
    .select("*")
    .order("date", { ascending: false });

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const results = await Promise.all(
    (events ?? []).map(async (event) => {
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

      const entry_fees = entries
        .filter((e) => e.type === "event_entry")
        .reduce((sum, e) => sum + e.amount_cents, 0);

      const tagged_sales = entries
        .filter((e) => e.type === "sale")
        .reduce((sum, e) => sum + e.amount_cents, 0);

      return {
        id: event.id,
        name: event.name,
        date: event.date,
        type: event.type,
        entry_fees,
        tagged_sales,
        total: entry_fees + tagged_sales,
        checkin_count: checkinRes.count ?? 0,
      };
    })
  );

  return NextResponse.json(results);
}
