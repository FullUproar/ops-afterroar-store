import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const { data: ledger_entries } = await supabase
    .from('ledger_entries')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: trade_ins } = await supabase
    .from('trade_ins')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    ...customer,
    ledger_entries: ledger_entries || [],
    trade_ins: trade_ins || [],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json();

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json();

  if (body.action !== 'adjust_credit') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { amount_cents, description } = body;
  if (!amount_cents || typeof amount_cents !== 'number') {
    return NextResponse.json({ error: 'amount_cents is required and must be a number' }, { status: 400 });
  }

  // Create ledger entry
  const { error: ledgerErr } = await supabase
    .from('ledger_entries')
    .insert({
      customer_id: id,
      type: amount_cents > 0 ? 'credit_issue' : 'credit_deduct',
      amount_cents,
      description: description || null,
    });

  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  }

  // Update customer credit balance
  const { data: customer } = await supabase
    .from('customers')
    .select('credit_balance_cents')
    .eq('id', id)
    .single();

  const newBalance = (customer?.credit_balance_cents ?? 0) + amount_cents;

  const { data: updated, error: updateErr } = await supabase
    .from('customers')
    .update({ credit_balance_cents: newBalance })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
