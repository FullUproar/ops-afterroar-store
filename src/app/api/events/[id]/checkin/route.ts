import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('event_checkins')
    .select('*, customers(name)')
    .eq('event_id', id)
    .order('checked_in_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = (data || []).map((ci: any) => ({
    ...ci,
    customer_name: ci.customers?.name ?? null,
    customers: undefined,
  }));

  return NextResponse.json(mapped);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: event_id } = await params;
  const supabase = await createClient();
  const body = await request.json();

  const { customer_id } = body;
  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  // Check for duplicate checkin
  const { data: existing } = await supabase
    .from('event_checkins')
    .select('id')
    .eq('event_id', event_id)
    .eq('customer_id', customer_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Customer already checked in' }, { status: 409 });
  }

  // Get event to check entry fee
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('entry_fee_cents')
    .eq('id', event_id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const fee_paid = event.entry_fee_cents > 0;

  // Create checkin record
  const { data: checkin, error: checkinErr } = await supabase
    .from('event_checkins')
    .insert({
      event_id,
      customer_id,
      checked_in_at: new Date().toISOString(),
      fee_paid,
    })
    .select()
    .single();

  if (checkinErr) {
    return NextResponse.json({ error: checkinErr.message }, { status: 500 });
  }

  // If there's an entry fee, create a ledger entry
  if (event.entry_fee_cents > 0) {
    await supabase.from('ledger_entries').insert({
      customer_id,
      type: 'event_fee',
      amount_cents: event.entry_fee_cents,
      description: `Event entry fee`,
      reference_type: 'event_checkin',
      reference_id: checkin.id,
    });
  }

  return NextResponse.json(checkin, { status: 201 });
}
