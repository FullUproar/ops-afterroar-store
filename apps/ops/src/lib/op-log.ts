import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  Operational Logging — fire-and-forget, never throws                 */
/* ------------------------------------------------------------------ */

export type Severity = "info" | "warn" | "error" | "critical";

export type EventType =
  | "auth.login" | "auth.logout" | "auth.failed"
  | "payment.success" | "payment.failed" | "payment.refund"
  | "terminal.connected" | "terminal.disconnected" | "terminal.timeout" | "terminal.reset"
  | "terminal.payment.start" | "terminal.payment.collect" | "terminal.payment.confirm"
  | "terminal.payment.completed" | "terminal.disconnect" | "terminal.reconnect"
  | "terminal.verify"
  | "scanner.success" | "scanner.error" | "scanner.learn"
  | "inventory.adjust" | "inventory.import" | "inventory.price_change"
  | "settings.changed"
  | "checkout.complete" | "checkout.failed" | "checkout.void"
  | "trade_in.complete"
  | "issue.flagged" | "issue.resolved"
  | "sync.failed" | "sync.retry"
  | "system.error" | "system.startup"
  | "mobile.sale" | "mobile.paired" | "mobile.revoked"
  | "manager.override"
  | "passport.linked" | "passport.disconnected" | "passport.deleted"
  | "passport.frozen" | "passport.unfrozen" | "passport.updated"
  | "passport.fraud_flag";

export interface OpLogParams {
  storeId: string;
  eventType: EventType;
  severity?: Severity;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  staffName?: string;
  deviceInfo?: string;
}

/**
 * Write an operational log entry. Fire-and-forget — never throws, never
 * blocks the caller.  Safe to call from any API route without awaiting.
 */
export async function opLog(params: OpLogParams): Promise<void> {
  try {
    await prisma.posOperationalLog.create({
      data: {
        store_id: params.storeId,
        event_type: params.eventType,
        severity: params.severity ?? "info",
        message: params.message,
        metadata: JSON.parse(JSON.stringify(params.metadata ?? {})),
        user_id: params.userId,
        staff_name: params.staffName,
        device_info: params.deviceInfo,
      },
    });
  } catch {
    // Logging should never break the app — swallow all errors silently
  }
}

/**
 * Client-side helper: POST to /api/logs.
 * Fire-and-forget — catches its own errors.
 */
export async function opLogClient(params: {
  eventType: string;
  severity?: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  fetch("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}
