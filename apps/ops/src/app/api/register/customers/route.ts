/**
 * GET  /api/register/customers?q=... — search customers (name / email / phone)
 * POST /api/register/customers           — create a new customer
 *
 * The register's customer-attribution flow. Auth via the same API key as
 * /api/sync (X-API-Key header, scope `register:write`). The store the key
 * was minted for scopes the search.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/api-middleware";
import { resolveRegisterStoreId } from "@/lib/register-auth";

export const GET = withApiKey<Record<string, never>>(async (req, { apiKey }) => {
  const storeId = await resolveRegisterStoreId(apiKey);
  if (!storeId) {
    return NextResponse.json({ error: "API key has no associated store" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 50);

  const where: Record<string, unknown> = { store_id: storeId, deleted_at: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q } },
      { afterroar_user_id: q },
    ];
  }

  const customers = await prisma.posCustomer.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      credit_balance_cents: true,
      loyalty_points: true,
    },
    orderBy: q ? { name: "asc" } : { created_at: "desc" },
    take: limit,
  });

  return NextResponse.json({ customers });
}, "register:write");

export const POST = withApiKey<Record<string, never>>(async (req, { apiKey }) => {
  const storeId = await resolveRegisterStoreId(apiKey);
  if (!storeId) {
    return NextResponse.json({ error: "API key has no associated store" }, { status: 403 });
  }

  let body: { name?: string; email?: string | null; phone?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const customer = await prisma.posCustomer.create({
    data: {
      store_id: storeId,
      name: body.name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      credit_balance_cents: 0,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      credit_balance_cents: true,
      loyalty_points: true,
    },
  });

  return NextResponse.json({ customer }, { status: 201 });
}, "register:write");
