import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { migratePointsToHQ } from "@/lib/hq-bridge";

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const body = await request.json();
    const { customer_id } = body;

    if (!customer_id) {
      return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }

    // Get customer and verify they belong to this store
    const customer = await db.posCustomer.findFirst({
      where: { id: customer_id },
      select: {
        id: true,
        loyalty_points: true,
        afterroar_user_id: true,
        name: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (!customer.afterroar_user_id) {
      return NextResponse.json(
        { error: "Customer must be linked to an Afterroar account before migrating points" },
        { status: 400 }
      );
    }

    if (customer.loyalty_points <= 0) {
      return NextResponse.json(
        { error: "No loyalty points to migrate" },
        { status: 400 }
      );
    }

    const pointsToMigrate = customer.loyalty_points;

    // Write to HQ PointsLedger
    await migratePointsToHQ({
      userId: customer.afterroar_user_id,
      points: pointsToMigrate,
      storeId,
    });

    // Zero out POS-local points and record the migration
    await prisma.$transaction(async (tx) => {
      await tx.posCustomer.update({
        where: { id: customer_id },
        data: { loyalty_points: 0 },
      });

      await tx.posLoyaltyEntry.create({
        data: {
          store_id: storeId,
          customer_id,
          type: "adjust",
          points: -pointsToMigrate,
          balance_after: 0,
          description: `Migrated ${pointsToMigrate} points to Afterroar account`,
        },
      });
    });

    return NextResponse.json({
      success: true,
      migrated_points: pointsToMigrate,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
