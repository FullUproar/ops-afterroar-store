import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from('events')
    .select('*, event_checkins(count)')
    .order('starts_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = (events || []).map((e: any) => ({
    ...e,
    checkin_count: e.event_checkins?.[0]?.count ?? 0,
    event_checkins: undefined,
  }));

  return NextResponse.json(mapped);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { name, event_type, starts_at, ends_at, entry_fee_cents, max_players, description } = body;

  if (!name || !event_type || !starts_at) {
    return NextResponse.json({ error: 'name, event_type, and starts_at are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('events')
    .insert({
      name,
      event_type,
      starts_at,
      ends_at: ends_at || null,
      entry_fee_cents: entry_fee_cents ?? 0,
      max_players: max_players || null,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
