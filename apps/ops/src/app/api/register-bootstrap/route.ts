/**
 * GET /api/register-bootstrap
 *
 * Pulls the snapshot a register tablet needs to operate offline:
 *   - Store info
 *   - Inventory items (lendable + sellable, active, with prices + qty)
 *   - Staff with PINs (for offline cashier login)
 *
 * The store is determined by the API key. Each register key is scoped
 * to a single store via its `register:write` permission and the staff
 * we minted it for.
 *
 * Auth: API key with `register:write` scope (same key used for /api/sync).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/api-middleware";

export const GET = withApiKey<Record<string, never>>(
  async (_req, { apiKey }) => {
    // Resolve the store the key was minted for. ApiKey.createdBy points
    // at the User who owns it; that User has a posStaff record on the
    // store. For demo, single-store assumption — a key belongs to one
    // store.
    const keyOwner = await prisma.apiKey.findUnique({
      where: { id: apiKey.id },
      select: { createdById: true },
    });
    if (!keyOwner?.createdById) {
      return NextResponse.json({ error: "API key has no associated user" }, { status: 403 });
    }
    const staffRecord = await prisma.posStaff.findFirst({
      where: { user_id: keyOwner.createdById, active: true },
      select: { store_id: true },
    });
    if (!staffRecord) {
      return NextResponse.json({ error: "API key owner has no active staff record" }, { status: 403 });
    }
    const storeId = staffRecord.store_id;

    const [store, inventory, staff] = await Promise.all([
      prisma.posStore.findUnique({
        where: { id: storeId },
        select: { id: true, name: true },
      }),
      prisma.posInventoryItem.findMany({
        where: { store_id: storeId, active: true },
        select: {
          id: true,
          name: true,
          price_cents: true,
          quantity: true,
          sku: true,
          category: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.posStaff.findMany({
        where: { store_id: storeId, active: true },
        select: { id: true, name: true, role: true, pin_hash: true },
      }),
    ]);

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    return NextResponse.json({
      store,
      inventory: inventory.map((i) => ({
        id: i.id,
        name: i.name,
        priceCents: i.price_cents,
        quantity: i.quantity,
        sku: i.sku,
        category: i.category,
      })),
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        pinHash: s.pin_hash,
      })),
    });
  },
  "register:write",
);
