"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const storeName = formData.get("storeName") as string;
  const staffName = (formData.get("staffName") as string) || email.split("@")[0];

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    // Create store + staff using service role
    const { createServiceClient } = await import("@/lib/supabase/server");
    const adminClient = await createServiceClient();

    const slug = storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const { data: store, error: storeError } = await adminClient
      .from("stores")
      .insert({ name: storeName, slug, owner_id: data.user.id })
      .select()
      .single();

    if (storeError) {
      return { error: storeError.message };
    }

    const { error: staffError } = await adminClient.from("staff").insert({
      user_id: data.user.id,
      store_id: store.id,
      role: "owner",
      name: staffName,
    });

    if (staffError) {
      return { error: staffError.message };
    }
  }

  redirect("/dashboard");
}
