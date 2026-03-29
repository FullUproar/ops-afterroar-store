import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public routes
  const isPublic =
    path === "/" ||
    path === "/login" ||
    path === "/signup" ||
    path === "/ops" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/debug") ||
    path.startsWith("/api/debug-") ||
    path.startsWith("/api/ebay/") ||
    path.startsWith("/api/stripe/webhook") ||
    path.startsWith("/api/test-barcodes") ||
    path === "/brand" ||
    path.startsWith("/test-barcodes") ||
    path.startsWith("/r/");

  // JWT check (no DB access needed — runs on Edge)
  // NextAuth v5 uses "authjs" cookie prefix, not "next-auth"
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    cookieName: "__Secure-authjs.session-token",
  }) || await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    cookieName: "authjs.session-token",
  });

  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (token && (path === "/" || path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
