import { prisma } from "./prisma";

/* ------------------------------------------------------------------ */
/*  HQ Outbox — async, eventually consistent writes to HQ              */
/*                                                                     */
/*  All HQ writes go through this outbox. A drain job POSTs to the     */
/*  HQ webhook endpoint. The POS transaction is NEVER blocked by HQ    */
/*  availability. Data syncs when it can.                              */
/*                                                                     */
/*  Usage:                                                             */
/*    await enqueueHQ(storeId, "points_earned", {                      */
/*      userId: "...", points: 50, category: "purchase"                */
/*    });                                                              */
/* ------------------------------------------------------------------ */

export type HQEventType =
  | "checkin"
  | "points_earned"
  | "tournament_result"
  | "event_attendance"
  | "purchase_summary"
  | "customer_deletion"
  | "points_reversed"
  | "fraud_flag"
  | "order_shipped";

/**
 * Enqueue a write to HQ. Fire-and-forget — never throws, never blocks.
 */
export async function enqueueHQ(
  storeId: string,
  eventType: HQEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.posHqOutbox.create({
      data: {
        store_id: storeId,
        event_type: eventType,
        payload: JSON.parse(JSON.stringify({
          ...payload,
          timestamp: payload.timestamp || new Date().toISOString(),
        })),
      },
    });
  } catch (err) {
    // Never throw — log and move on. The POS must keep running.
    console.error("[HQ Outbox] Failed to enqueue:", err);
  }
}

/**
 * Drain the outbox — call this from a cron job or API endpoint.
 * Picks up pending rows, POSTs to HQ webhook, handles responses.
 *
 * Returns: { sent, failed, deadLettered }
 */
export async function drainOutbox(maxItems = 20): Promise<{
  sent: number;
  failed: number;
  deadLettered: number;
}> {
  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  // Pick up pending items ready for processing
  const items = await prisma.posHqOutbox.findMany({
    where: {
      status: { in: ["pending"] },
      next_retry_at: { lte: new Date() },
    },
    orderBy: { created_at: "asc" },
    take: maxItems,
    include: {
      store: { select: { settings: true } },
    },
  });

  for (const item of items) {
    // Mark as processing
    await prisma.posHqOutbox.update({
      where: { id: item.id },
      data: { status: "processing" },
    });

    // Get webhook config from store settings
    const settings = (item.store?.settings ?? {}) as Record<string, unknown>;
    const webhookUrl = (settings.hq_webhook_url as string) || "https://www.fulluproar.com/api/store-ops/webhook";
    const webhookSecret = (settings.hq_webhook_secret as string) || "";
    const venueId = (settings.venueId as string) || "";

    if (!webhookSecret) {
      // No webhook configured — mark as failed (not retryable)
      await prisma.posHqOutbox.update({
        where: { id: item.id },
        data: {
          status: "failed",
          error_message: "No webhook secret configured. Connect to Afterroar in Settings.",
        },
      });
      failed++;
      continue;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${webhookSecret}`,
          "X-Idempotency-Key": item.idempotency_key,
          "X-Store-Id": venueId,
        },
        body: JSON.stringify({
          event_type: item.event_type,
          idempotency_key: item.idempotency_key,
          store_id: venueId,
          payload: item.payload,
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (res.ok) {
        // Success — mark as sent
        await prisma.posHqOutbox.update({
          where: { id: item.id },
          data: { status: "sent", sent_at: new Date(), error_message: null },
        });
        sent++;
      } else if (res.status >= 400 && res.status < 500) {
        // Client error (422 = bad data) — don't retry
        const errorBody = await res.text().catch(() => "Unknown error");
        await prisma.posHqOutbox.update({
          where: { id: item.id },
          data: {
            status: "failed",
            error_message: `HTTP ${res.status}: ${errorBody.slice(0, 500)}`,
          },
        });
        failed++;
      } else {
        // Server error (5xx) — retry with exponential backoff
        await retryWithBackoff(item.id, item.retry_count, `HTTP ${res.status}`);
        failed++;
      }
    } catch (err) {
      // Network error or timeout — retry
      const errorMsg = err instanceof Error ? err.message : "Network error";
      await retryWithBackoff(item.id, item.retry_count, errorMsg);
      failed++;
    }
  }

  return { sent, failed, deadLettered };
}

async function retryWithBackoff(
  itemId: number,
  currentRetries: number,
  errorMsg: string,
): Promise<void> {
  const newRetryCount = currentRetries + 1;

  if (newRetryCount >= 5) {
    // Dead letter — admin reviews manually
    await prisma.posHqOutbox.update({
      where: { id: itemId },
      data: {
        status: "dead_letter",
        retry_count: newRetryCount,
        error_message: `Dead lettered after ${newRetryCount} attempts: ${errorMsg}`,
      },
    });
    return;
  }

  // Exponential backoff: 30s, 2m, 10m, 1h, 6h
  const backoffSeconds = [30, 120, 600, 3600, 21600][newRetryCount - 1] || 21600;
  const nextRetry = new Date(Date.now() + backoffSeconds * 1000);

  await prisma.posHqOutbox.update({
    where: { id: itemId },
    data: {
      status: "pending",
      retry_count: newRetryCount,
      next_retry_at: nextRetry,
      error_message: `Retry ${newRetryCount}/5: ${errorMsg}`,
    },
  });
}
