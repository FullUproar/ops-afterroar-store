import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { userId, storeName, staffName } = await request.json();

  if (!userId || !storeName) {
    return NextResponse.json(
      { error: "Missing userId or storeName" },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();
  const slug = storeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Create store
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .insert({ name: storeName, slug, owner_id: userId })
    .select()
    .single();

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 });
  }

  // Create staff record for owner
  const { error: staffError } = await supabase.from("staff").insert({
    user_id: userId,
    store_id: store.id,
    role: "owner",
    name: staffName || "Owner",
  });

  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 });
  }

  return NextResponse.json({ store });
}
