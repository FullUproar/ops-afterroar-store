import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  // Use basic client for sign-in (not SSR) to avoid cookie interference
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.status, email_received: email, password_length: password?.length },
      { status: 401 }
    );
  }

  // Manually set auth cookies from the session
  const cookieStore = await cookies();
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  };

  if (data.session) {
    cookieStore.set(
      "sb-bkrzpgtomyvsxrbngkib-auth-token",
      JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + data.session.expires_in,
        expires_in: data.session.expires_in,
        token_type: "bearer",
        type: "access",
      }),
      cookieOptions
    );
  }

  return NextResponse.json({ success: true });
}
