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

  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("store_id", staff.store_id)
    .or(`name.ilike.%${q}%,barcode.eq.${q},sku.ilike.%${q}%`)
    .order("name")
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
