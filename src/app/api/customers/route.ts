import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  GET /api/customers — list / search customers                      */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const q = request.nextUrl.searchParams.get('q')?.trim();

  let query = supabase
    .from('customers')
    .select('id, name, email, phone, credit_balance_cents, created_at')
    .order('name', { ascending: true })
    .limit(50);

  if (q) {
    query = query.ilike('name', `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

/* ------------------------------------------------------------------ */
/*  POST /api/customers — create a new customer                       */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let body: { name: string; email?: string | null; phone?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: body.name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      credit_balance_cents: 0,
    })
    .select('id, name, email, phone, credit_balance_cents, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
