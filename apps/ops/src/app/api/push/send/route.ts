import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToStore } from "@/lib/web-push";

/* ------------------------------------------------------------------ */
/*  POST /api/push/send — send push notification to a store's subs      */
/*  Internal use by synthetic bot. Requires CRON_SECRET auth.          */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { store_id, title, message, tag, url } = body;

  if (!store_id || !title) {
    return NextResponse.json({ error: "store_id and title required" }, { status: 400 });
  }

  const store = await prisma.posStore.findUnique({
    where: { id: store_id },
    select: { settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = (store.settings ?? {}) as Record<string, unknown>;

  const result = await sendPushToStore(settings, {
    title,
    body: message || "System alert",
    tag: tag || "ops-alert",
    url: url || "/ops",
  });

  // Clean up expired subscriptions
  if (result.expired.length > 0) {
    const subscriptions = (settings.push_subscriptions ?? []) as Array<{
      endpoint: string;
    }>;
    const cleaned = subscriptions.filter((s) => !result.expired.includes(s.endpoint));
    await prisma.posStore.update({
      where: { id: store_id },
      data: {
        settings: { ...settings, push_subscriptions: cleaned },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    expired_removed: result.expired.length,
  });
}
