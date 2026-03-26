import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip auth middleware for auth API routes and debug
  if (path.startsWith("/api/auth") || path.startsWith("/api/debug") || path.startsWith("/api/setup")) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/|api/debug|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
