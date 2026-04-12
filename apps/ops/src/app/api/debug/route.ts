import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll().map(c => c.name);

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ auth: "no_user", cookies: allCookies });
    }

    const sessionStoreId = (session as unknown as Record<string, unknown>).storeId as string | undefined;
    const staff = await prisma.posStaff.findFirst({
      where: {
        user_id: session.user.id,
        active: true,
        ...(sessionStoreId ? { store_id: sessionStoreId } : {}),
      },
      include: { store: true },
    });

    // SECURITY: always scope to store_id — never count all stores' inventory
    const inventoryCount = staff
      ? await prisma.posInventoryItem.count({ where: { store_id: staff.store_id } })
      : 0;

    return NextResponse.json({
      auth: "ok",
      user: session.user.email,
      userId: session.user.id,
      staff: staff
        ? { id: staff.id, role: staff.role, store: staff.store?.name }
        : null,
      inventoryCount,
    });
  } catch (e: unknown) {
    return NextResponse.json({
      error: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
