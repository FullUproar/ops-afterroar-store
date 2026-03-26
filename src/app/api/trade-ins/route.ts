import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  GET /api/trade-ins — list trade-ins for store                     */
/* ------------------------------------------------------------------ */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('trade_ins')
    .select(`
      id,
      created_at,
      total_offer_cents,
      total_payout_cents,
      payout_type,
      status,
      customers ( name ),
      trade_in_items ( id )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((ti: any) => ({
    id: ti.id,
    created_at: ti.created_at,
    customer_name: ti.customers?.name ?? 'Unknown',
    item_count: ti.trade_in_items?.length ?? 0,
    total_offer_cents: ti.total_offer_cents,
    total_payout_cents: ti.total_payout_cents,
    payout_type: ti.payout_type,
    status: ti.status,
  }));

  return NextResponse.json(rows);
}

/* ------------------------------------------------------------------ */
/*  POST /api/trade-ins — create a new trade-in                       */
/* ------------------------------------------------------------------ */

interface TradeInItemInput {
  name: string;
  category: string;
  attributes: Record<string, any>;
  quantity: number;
  market_price_cents: number;
  offer_price_cents: number;
}

interface CreateTradeInBody {
  customer_id: string;
  items: TradeInItemInput[];
  payout_type: 'cash' | 'credit';
  credit_bonus_percent: number;
  notes: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let body: CreateTradeInBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { customer_id, items, payout_type, credit_bonus_percent, notes } = body;

  if (!customer_id || !items?.length) {
    return NextResponse.json(
      { error: 'customer_id and at least one item are required' },
      { status: 400 },
    );
  }

  // Calculate totals
  const total_offer_cents = items.reduce(
    (sum, i) => sum + i.offer_price_cents * i.quantity,
    0,
  );

  const total_payout_cents =
    payout_type === 'credit'
      ? Math.round(total_offer_cents * (1 + (credit_bonus_percent || 0) / 100))
      : total_offer_cents;

  // Create trade-in record
  const { data: tradeIn, error: tradeInError } = await supabase
    .from('trade_ins')
    .insert({
      customer_id,
      total_offer_cents,
      total_payout_cents,
      payout_type,
      credit_bonus_percent: credit_bonus_percent || 0,
      status: 'completed',
      notes,
    })
    .select('id')
    .single();

  if (tradeInError) {
    return NextResponse.json({ error: tradeInError.message }, { status: 500 });
  }

  // Create trade-in items
  const itemRows = items.map((i) => ({
    trade_in_id: tradeIn.id,
    name: i.name,
    category: i.category,
    attributes: i.attributes,
    quantity: i.quantity,
    market_price_cents: i.market_price_cents,
    offer_price_cents: i.offer_price_cents,
  }));

  const { error: itemsError } = await supabase
    .from('trade_in_items')
    .insert(itemRows);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Create ledger entry (negative amount = cash going out)
  const { error: ledgerError } = await supabase.from('ledger_entries').insert({
    type: 'trade_in',
    reference_id: tradeIn.id,
    amount_cents: -total_payout_cents,
    description: `Trade-in: ${items.length} item(s) — ${payout_type}`,
    customer_id,
  });

  if (ledgerError) {
    console.error('Ledger entry failed:', ledgerError.message);
  }

  // If store credit, update customer credit balance
  if (payout_type === 'credit') {
    const { error: creditError } = await supabase.rpc('increment_credit_balance', {
      p_customer_id: customer_id,
      p_amount: total_payout_cents,
    });

    // Fallback if RPC doesn't exist: fetch-then-update
    if (creditError) {
      const { data: customer } = await supabase
        .from('customers')
        .select('credit_balance_cents')
        .eq('id', customer_id)
        .single();

      if (customer) {
        await supabase
          .from('customers')
          .update({
            credit_balance_cents: (customer.credit_balance_cents || 0) + total_payout_cents,
          })
          .eq('id', customer_id);
      }
    }
  }

  return NextResponse.json({ id: tradeIn.id, total_offer_cents, total_payout_cents }, { status: 201 });
}
