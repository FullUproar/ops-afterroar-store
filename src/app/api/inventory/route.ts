import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("store_id")
    .eq("user_id", user.id)
    .single();

  if (!staff) {
    return NextResponse.json(
      { error: "No store assignment found" },
      { status: 403 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("store_id", staff.store_id)
    .order("name")
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("store_id")
    .eq("user_id", user.id)
    .single();

  if (!staff) {
    return NextResponse.json(
      { error: "No store assignment found" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, category, price_cents, cost_cents, quantity, barcode, attributes } =
    body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      store_id: staff.store_id,
      name: name.trim(),
      category: category || "other",
      price_cents: price_cents ?? 0,
      cost_cents: cost_cents ?? 0,
      quantity: quantity ?? 0,
      barcode: barcode || null,
      attributes: attributes || {},
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("store_id")
    .eq("user_id", user.id)
    .single();

  if (!staff) {
    return NextResponse.json(
      { error: "No store assignment found" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Item id is required" },
      { status: 400 }
    );
  }

  // Only allow updating known fields
  const allowedFields = [
    "name",
    "category",
    "price_cents",
    "cost_cents",
    "quantity",
    "barcode",
    "attributes",
    "status",
  ];

  const sanitized: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      sanitized[key] = updates[key];
    }
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update(sanitized)
    .eq("id", id)
    .eq("store_id", staff.store_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
