import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { compare } from "bcryptjs";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/staff/override — verify manager/owner PIN for one-time   */
/*  action escalation. Cashier requests, manager enters PIN.           */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { storeId, staff: requestingStaff } = await requireStaff();

    const body = await request.json();
    const { pin, action } = body as { pin: string; action?: string };

    if (!pin) {
      return NextResponse.json({ error: "PIN required" }, { status: 400 });
    }

    // Find all managers/owners with PINs in this store
    const managers = await prisma.posStaff.findMany({
      where: {
        store_id: storeId,
        role: { in: ["owner", "manager"] },
        active: true,
        pin_hash: { not: null },
      },
      select: { id: true, name: true, role: true, pin_hash: true },
    });

    if (managers.length === 0) {
      return NextResponse.json(
        { error: "No managers have PINs set up. Set PINs in Staff settings." },
        { status: 400 },
      );
    }

    // Try each manager's PIN
    for (const manager of managers) {
      if (!manager.pin_hash) continue;
      const match = await compare(pin, manager.pin_hash);
      if (match) {
        // Log the override
        opLog({
          storeId,
          eventType: "manager.override",
          message: `${manager.name} (${manager.role}) authorized action${action ? `: ${action}` : ""} for ${requestingStaff.name}`,
          metadata: {
            manager_id: manager.id,
            manager_name: manager.name,
            requesting_staff_id: requestingStaff.id,
            requesting_staff_name: requestingStaff.name,
            action: action || "unspecified",
          },
          staffName: manager.name,
          userId: undefined,
        });

        return NextResponse.json({
          authorized: true,
          manager: { id: manager.id, name: manager.name, role: manager.role },
        });
      }
    }

    return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
  } catch (error) {
    return handleAuthError(error);
  }
}
