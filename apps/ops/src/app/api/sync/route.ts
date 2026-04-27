/**
 * POST /api/sync
 *
 * Register devices push batched events here when they have connectivity.
 * Each event has a client-generated UUID; the (deviceId, id) pair is
 * the idempotency key. Retries are no-ops for already-applied events.
 *
 * Auth: API key with `register:write` scope.
 *
 * Request shape:
 *   {
 *     deviceId: string,                    // stable per-tablet UUID
 *     storeId: string,                     // pos_stores.id
 *     events: [{
 *       id: string,                        // client-generated UUID
 *       lamport: number,
 *       wallTime: string (ISO),
 *       type: string,
 *       payload: object,
 *     }]
 *   }
 *
 * Response shape:
 *   {
 *     results: [{
 *       id: string,
 *       status: 'applied' | 'conflict' | 'duplicate' | 'rejected',
 *       conflict?: object,                 // if status='conflict'
 *       error?: string,                    // if status='rejected'
 *     }],
 *     // Future: serverEvents: [...] — events from other devices since
 *     // this device's last sync, so it can update its local state.
 *   }
 *
 * Limits: max 100 events per batch (caps memory + transaction size).
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/api-middleware";
import { applyEvent, type RegisterEventInput } from "@/lib/register-sync";

const MAX_BATCH = 100;

interface SyncEvent {
  id: string;
  lamport: number;
  wallTime: string;
  type: string;
  payload: Record<string, unknown>;
}

interface SyncRequest {
  deviceId: string;
  storeId: string;
  events: SyncEvent[];
}

function validateRequest(body: unknown): SyncRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.deviceId !== "string" || !b.deviceId) return { error: "deviceId required" };
  if (typeof b.storeId !== "string" || !b.storeId) return { error: "storeId required" };
  if (!Array.isArray(b.events)) return { error: "events must be an array" };
  if (b.events.length > MAX_BATCH) return { error: `max ${MAX_BATCH} events per batch` };
  for (const e of b.events) {
    if (!e || typeof e !== "object") return { error: "each event must be an object" };
    const ev = e as Record<string, unknown>;
    if (typeof ev.id !== "string") return { error: "event.id required" };
    if (typeof ev.lamport !== "number") return { error: "event.lamport required" };
    if (typeof ev.wallTime !== "string") return { error: "event.wallTime (ISO string) required" };
    if (typeof ev.type !== "string") return { error: "event.type required" };
    if (!ev.payload || typeof ev.payload !== "object") return { error: "event.payload required" };
  }
  return b as unknown as SyncRequest;
}

export const POST = withApiKey<Record<string, never>>(
  async (req: NextRequest) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

    const validated = validateRequest(body);
    if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

    const { deviceId, storeId, events } = validated;

    // Apply events in lamport order — defensive sort even though clients
    // SHOULD push in order. Catches bugs where a retry pushes an old
    // event after newer ones.
    const ordered = [...events].sort((a, b) => a.lamport - b.lamport);

    const results: Array<{
      id: string;
      status: "applied" | "conflict" | "duplicate" | "rejected";
      conflict?: Record<string, unknown>;
      error?: string;
    }> = [];

    for (const evt of ordered) {
      // Idempotency check — if we've seen (deviceId, id) before, skip.
      const existing = await prisma.registerEvent.findUnique({
        where: { RegisterEvent_idempotency: { deviceId, id: evt.id } },
        select: { id: true, status: true },
      });
      if (existing) {
        results.push({ id: evt.id, status: "duplicate" });
        continue;
      }

      // Apply the event (per-type handler in lib/register-sync.ts).
      const input: RegisterEventInput = {
        id: evt.id,
        storeId,
        deviceId,
        lamport: evt.lamport,
        wallTime: new Date(evt.wallTime),
        type: evt.type,
        payload: evt.payload,
      };

      let applyResult;
      try {
        applyResult = await applyEvent(prisma, input);
      } catch (err) {
        applyResult = {
          status: "rejected" as const,
          errorMessage: err instanceof Error ? err.message.slice(0, 500) : "apply failed",
        };
      }

      // Record the event regardless of outcome — append-only audit trail.
      await prisma.registerEvent.create({
        data: {
          id: evt.id,
          storeId,
          deviceId,
          lamport: evt.lamport,
          wallTime: input.wallTime,
          type: evt.type,
          payload: evt.payload as Prisma.InputJsonValue,
          status: applyResult.status,
          conflictData: applyResult.conflictData
            ? (applyResult.conflictData as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      results.push({
        id: evt.id,
        status: applyResult.status,
        ...(applyResult.conflictData ? { conflict: applyResult.conflictData } : {}),
        ...(applyResult.errorMessage ? { error: applyResult.errorMessage } : {}),
      });
    }

    return NextResponse.json({ results });
  },
  "register:write",
);
