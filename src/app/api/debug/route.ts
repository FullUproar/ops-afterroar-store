import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ auth: "error", message: authError.message });
    }

    if (!user) {
      return NextResponse.json({ auth: "no_user" });
    }

    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("*, stores(*)")
      .eq("user_id", user.id)
      .eq("active", true)
      .single();

    const { data: items, error: invError } = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      auth: "ok",
      user: user.email,
      userId: user.id,
      staff: staff ? { id: staff.id, role: staff.role, store: staff.stores?.name } : null,
      staffError: staffError?.message ?? null,
      inventoryCount: items,
      inventoryError: invError?.message ?? null,
    });
  } catch (e: unknown) {
    return NextResponse.json({
      error: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
