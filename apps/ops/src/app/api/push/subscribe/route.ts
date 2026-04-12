import { NextRequest, NextResponse } from "next/server";
import { requireStaff, AuthError, NoStoreError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  POST /api/push/subscribe — save push subscription                   */
/*  DELETE /api/push/subscribe — remove push subscription               */
/*  Requires auth (owner only).                                        */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStaff();

    // Owner only (god admin bypasses)
    if (ctx.role !== "owner") {
      const session = await (await import("@/auth")).auth();
      const isGod = session?.user?.email === "info@fulluproar.com";
      if (!isGod) {
        return NextResponse.json({ error: "Owner access required" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // Get current store settings
    const store = await prisma.posStore.findUnique({
      where: { id: ctx.storeId },
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const subscriptions = (settings.push_subscriptions ?? []) as Array<{
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }>;

    // Check if already subscribed (by endpoint)
    const exists = subscriptions.some((s) => s.endpoint === endpoint);
    if (!exists) {
      subscriptions.push({ endpoint, keys });
    }

    // Save back to store settings
    await prisma.posStore.update({
      where: { id: ctx.storeId },
      data: {
        settings: { ...settings, push_subscriptions: subscriptions },
      },
    });

    return NextResponse.json({ ok: true, count: subscriptions.length });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof NoStoreError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireStaff();

    if (ctx.role !== "owner") {
      const session = await (await import("@/auth")).auth();
      const isGod = session?.user?.email === "info@fulluproar.com";
      if (!isGod) {
        return NextResponse.json({ error: "Owner access required" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
    }

    const store = await prisma.posStore.findUnique({
      where: { id: ctx.storeId },
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const subscriptions = (settings.push_subscriptions ?? []) as Array<{
      endpoint: string;
    }>;

    const filtered = subscriptions.filter((s) => s.endpoint !== endpoint);

    await prisma.posStore.update({
      where: { id: ctx.storeId },
      data: {
        settings: { ...settings, push_subscriptions: filtered },
      },
    });

    return NextResponse.json({ ok: true, count: filtered.length });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof NoStoreError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
