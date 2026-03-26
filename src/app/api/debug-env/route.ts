import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    AUTH_SECRET: process.env.AUTH_SECRET ? "set (" + process.env.AUTH_SECRET.length + " chars)" : "MISSING",
    AUTH_URL: process.env.AUTH_URL ?? "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set (" + process.env.NEXTAUTH_SECRET.length + " chars)" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "MISSING",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "set" : "MISSING",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "set" : "MISSING",
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "MISSING",
  });
}
