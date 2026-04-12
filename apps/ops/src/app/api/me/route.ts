import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionStoreId = (session as unknown as Record<string, unknown>).storeId as string | undefined;

  // Retry on transient DB errors (connection pool drops)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const staff = await prisma.posStaff.findFirst({
        where: {
          user_id: session.user.id,
          active: true,
          ...(sessionStoreId ? { store_id: sessionStoreId } : {}),
        },
        include: { store: true },
      });

      return NextResponse.json({ staff, store: staff?.store });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const isTransient = msg.includes("Connection terminated") || msg.includes("ECONNREFUSED") || msg.includes("connection pool");
      if (isTransient && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      console.error(`[/api/me] Failed after ${attempt} attempts:`, msg);
      return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Server error" }, { status: 500 });
}
