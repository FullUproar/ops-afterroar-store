import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/passport/link                                            */
/*  Link an Afterroar user to a POS customer (new or existing).        */
/*                                                                     */
/*  Auth: requireStaff()                                               */
/*  Body: { afterroar_user_id: string, customer_id?: string }          */
/*  - If customer_id: link existing customer                           */
/*  - If no customer_id: create new customer from HQ profile           */
/* ------------------------------------------------------------------ */

interface HQUserRow {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requireStaff();

    let body: { afterroar_user_id: string; customer_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { afterroar_user_id, customer_id } = body;
    if (!afterroar_user_id) {
      return NextResponse.json(
        { error: "afterroar_user_id required" },
        { status: 400 },
      );
    }

    // Safety: ensure no other customer in this store is already linked
    const alreadyLinked = await db.posCustomer.findFirst({
      where: { afterroar_user_id },
      select: { id: true, name: true },
    });

    if (alreadyLinked) {
      return NextResponse.json({
        error: "This Afterroar account is already linked to a customer at this store",
        existing_customer_id: alreadyLinked.id,
        existing_customer_name: alreadyLinked.name,
      }, { status: 409 });
    }

    let customer;

    if (customer_id) {
      // Link to existing customer
      customer = await db.posCustomer.findFirst({
        where: { id: customer_id },
        select: { id: true, name: true, afterroar_user_id: true },
      });

      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 },
        );
      }

      if (customer.afterroar_user_id) {
        return NextResponse.json(
          { error: "Customer is already linked to a different Afterroar account" },
          { status: 409 },
        );
      }

      // Use global prisma for update since tenant client's update requires
      // unique where clause with store_id, which customer.id + store_id handles
      await prisma.posCustomer.update({
        where: { id: customer.id },
        data: { afterroar_user_id },
      });

      // Re-fetch with full fields
      customer = await db.posCustomer.findFirst({
        where: { id: customer_id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          credit_balance_cents: true,
          loyalty_points: true,
          afterroar_user_id: true,
          created_at: true,
        },
      });
    } else {
      // Create new customer from HQ profile
      const rows = await prisma.$queryRawUnsafe<HQUserRow[]>(
        `SELECT id, "displayName", "avatarUrl"
         FROM "User"
         WHERE id = $1
         LIMIT 1`,
        afterroar_user_id,
      );

      const hqUser = rows[0];
      const displayName = hqUser?.displayName || "Afterroar Player";

      customer = await db.posCustomer.create({
        data: {
          store_id: storeId,
          name: displayName,
          afterroar_user_id,
          credit_balance_cents: 0,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          credit_balance_cents: true,
          loyalty_points: true,
          afterroar_user_id: true,
          created_at: true,
        },
      });
    }

    opLog({
      storeId,
      eventType: "passport.linked",
      severity: "info",
      message: `Afterroar Passport linked to customer "${customer?.name}"`,
      metadata: {
        afterroar_user_id,
        customer_id: customer?.id,
        linked_existing: !!customer_id,
      },
      staffName: staff.name,
    });

    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    return handleAuthError(error);
  }
}
