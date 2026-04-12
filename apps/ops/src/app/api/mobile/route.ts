import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";
import { compare, hash } from "bcryptjs";
import { getStoreSettings } from "@/lib/store-settings-shared";

/* ------------------------------------------------------------------ */
/*  Mobile Register API                                                */
/*  No session required — uses access code + PIN + session token       */
/*                                                                     */
/*  Security layers:                                                   */
/*  1. Store access code (proves device is authorized for this store)  */
/*  2. Staff PIN (identifies who is transacting)                       */
/*  3. Session token (tracks device, enforces limits, revocable)       */
/*  4. Guardrails (tx limits, dollar caps, no refunds, no offline)     */
/*  5. Audit trail (all mobile sales tagged, session tracked)          */
/* ------------------------------------------------------------------ */

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 10;

/**
 * GET /api/mobile?store=slug — check if mobile register is enabled
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("store");
  if (!slug) {
    return NextResponse.json({ error: "Store slug required" }, { status: 400 });
  }

  const store = await prisma.posStore.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true, settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = getStoreSettings(
    (store.settings ?? {}) as Record<string, unknown>,
  );

  return NextResponse.json({
    store: { name: store.name, slug: store.slug },
    enabled: settings.mobile_register_enabled && !!settings.mobile_access_code_hash,
    allow_cash: settings.mobile_allow_cash,
    allow_discounts: settings.mobile_allow_discounts,
  });
}

/**
 * POST /api/mobile — pair device OR process transaction
 *
 * Action: "pair" — validate access code, create session
 * Action: "activate" — validate PIN within session, set active staff
 * Action: "checkout" — process a sale through mobile register
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";

  // ---- PAIR: validate access code, create session ----
  if (action === "pair") {
    const slug = body.store_slug as string;
    const code = body.access_code as string;

    if (!slug || !code) {
      return NextResponse.json({ error: "Store slug and access code required" }, { status: 400 });
    }

    const store = await prisma.posStore.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true, settings: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const settings = getStoreSettings(
      (store.settings ?? {}) as Record<string, unknown>,
    );

    if (!settings.mobile_register_enabled) {
      return NextResponse.json({ error: "Mobile register is not enabled" }, { status: 403 });
    }
    if (!settings.mobile_access_code_hash) {
      return NextResponse.json({ error: "No access code configured" }, { status: 403 });
    }

    // Rate limit check
    const recentAttempts = await prisma.posAccessCodeAttempt.count({
      where: {
        store_id: store.id,
        ip_address: ip,
        attempted_at: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
      },
    });

    if (recentAttempts >= MAX_ATTEMPTS_PER_WINDOW) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    // Verify access code
    const codeValid = await compare(code, settings.mobile_access_code_hash);

    // Log attempt
    await prisma.posAccessCodeAttempt.create({
      data: {
        store_id: store.id,
        ip_address: ip,
        success: codeValid,
      },
    });

    if (!codeValid) {
      const remaining = MAX_ATTEMPTS_PER_WINDOW - recentAttempts - 1;
      return NextResponse.json(
        { error: `Invalid access code. ${remaining} attempts remaining.` },
        { status: 401 },
      );
    }

    // Create session
    const sessionHours = settings.mobile_session_hours || 12;
    const expiresAt = new Date(Date.now() + sessionHours * 3600000);

    const session = await prisma.posMobileSession.create({
      data: {
        store_id: store.id,
        device_name: (body.device_name as string) || null,
        expires_at: expiresAt,
        ip_address: ip,
        user_agent: ua,
      },
    });

    // Get staff list for PIN selection
    const staff = await prisma.posStaff.findMany({
      where: { store_id: store.id, active: true, pin_hash: { not: null } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      session_id: session.id,
      expires_at: expiresAt.toISOString(),
      store: { name: store.name, slug: store.slug },
      staff: staff.map((s) => ({ id: s.id, name: s.name })),
      guardrails: {
        max_tx_per_session: settings.mobile_max_tx_per_session || null,
        max_tx_cents: settings.mobile_max_tx_cents || null,
        allow_discounts: settings.mobile_allow_discounts,
        allow_refunds: settings.mobile_allow_refunds,
        allow_cash: settings.mobile_allow_cash,
      },
    }, { status: 201 });
  }

  // ---- ACTIVATE: validate PIN within session ----
  if (action === "activate") {
    const sessionId = body.session_id as string;
    const staffId = body.staff_id as string;
    const pin = body.pin as string;

    if (!sessionId || !staffId || !pin) {
      return NextResponse.json({ error: "Session, staff, and PIN required" }, { status: 400 });
    }

    // Validate session
    const session = await prisma.posMobileSession.findFirst({
      where: {
        id: sessionId,
        revoked: false,
        expires_at: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session expired or revoked. Pair again." }, { status: 401 });
    }

    // Validate staff + PIN
    const staff = await prisma.posStaff.findFirst({
      where: { id: staffId, store_id: session.store_id, active: true },
      select: { id: true, name: true, role: true, pin_hash: true },
    });

    if (!staff || !staff.pin_hash) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const pinValid = await compare(pin, staff.pin_hash);
    if (!pinValid) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Update session with active staff
    await prisma.posMobileSession.update({
      where: { id: sessionId },
      data: { staff_id: staff.id, last_active_at: new Date() },
    });

    return NextResponse.json({
      staff_name: staff.name,
      role: staff.role,
    });
  }

  // ---- CHECKOUT: process a sale ----
  if (action === "checkout") {
    const sessionId = body.session_id as string;
    const pin = body.pin as string;

    if (!sessionId || !pin) {
      return NextResponse.json({ error: "Session and PIN required" }, { status: 400 });
    }

    // Validate session
    const session = await prisma.posMobileSession.findFirst({
      where: {
        id: sessionId,
        revoked: false,
        expires_at: { gte: new Date() },
      },
    });

    if (!session || !session.staff_id) {
      return NextResponse.json({ error: "Session expired or no active user. Pair again." }, { status: 401 });
    }

    // Re-verify PIN (every transaction requires PIN confirmation)
    const staff = await prisma.posStaff.findFirst({
      where: { id: session.staff_id, store_id: session.store_id, active: true },
      select: { id: true, name: true, pin_hash: true },
    });

    if (!staff || !staff.pin_hash) {
      return NextResponse.json({ error: "Staff not found" }, { status: 401 });
    }

    const pinValid = await compare(pin, staff.pin_hash);
    if (!pinValid) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Load store settings for guardrails
    const store = await prisma.posStore.findUnique({
      where: { id: session.store_id },
      select: { settings: true },
    });
    const settings = getStoreSettings(
      (store?.settings ?? {}) as Record<string, unknown>,
    );

    // Enforce transaction count limit
    const maxTx = settings.mobile_max_tx_per_session || 0;
    if (maxTx > 0 && session.tx_count >= maxTx) {
      return NextResponse.json(
        { error: `Session transaction limit reached (${maxTx}). Start a new session.` },
        { status: 403 },
      );
    }

    // Enforce single transaction dollar limit
    const items = body.items as Array<{ inventory_item_id: string; quantity: number; price_cents: number }>;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items in transaction" }, { status: 400 });
    }

    const txTotal = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
    const maxCents = settings.mobile_max_tx_cents || 0;
    if (maxCents > 0 && txTotal > maxCents) {
      return NextResponse.json(
        { error: `Transaction exceeds mobile limit ($${(maxCents / 100).toFixed(2)}). Use the main register.` },
        { status: 403 },
      );
    }

    // Block refunds on mobile
    if (!settings.mobile_allow_refunds && body.payment_method === "refund") {
      return NextResponse.json(
        { error: "Refunds must be processed on the main register." },
        { status: 403 },
      );
    }

    // Forward to the main checkout API with mobile metadata
    const checkoutPayload = {
      items,
      customer_id: body.customer_id ?? null,
      payment_method: body.payment_method ?? "card",
      amount_tendered_cents: body.amount_tendered_cents ?? txTotal,
      credit_applied_cents: body.credit_applied_cents ?? 0,
      event_id: body.event_id ?? null,
      tax_cents: body.tax_cents,
      discount_cents: settings.mobile_allow_discounts ? (body.discount_cents ?? 0) : 0,
      allow_negative_stock: !!body.allow_negative_stock,
    };

    // Process checkout via internal fetch to reuse all checkout logic
    const db = getTenantClient(session.store_id);
    const { processPayment } = await import("@/lib/payment");
    const { formatCents } = await import("@/lib/types");
    const { calculateTaxFromSettings, getDefaultTaxRate } = await import("@/lib/tax");
    const { opLog } = await import("@/lib/op-log");

    // Calculate tax if not provided
    let taxCents = checkoutPayload.tax_cents as number | undefined;
    if (taxCents == null) {
      const storeSettings = (store?.settings ?? {}) as Record<string, unknown>;
      const taxResult = calculateTaxFromSettings(txTotal, storeSettings);
      taxCents = taxResult?.taxCents ?? Math.round(txTotal * (getDefaultTaxRate() / 100));
    }

    // Verify inventory items exist
    const itemIds = items.map((i) => i.inventory_item_id);
    const invItems = await db.posInventoryItem.findMany({
      where: { id: { in: itemIds } },
    });
    const invMap = new Map(invItems.map((i) => [i.id, i]));

    for (const item of items) {
      const inv = invMap.get(item.inventory_item_id);
      if (!inv) {
        return NextResponse.json({ error: `Item not found` }, { status: 400 });
      }
      if (inv.quantity < item.quantity && !checkoutPayload.allow_negative_stock) {
        return NextResponse.json({
          error: `${inv.name}: only ${inv.quantity} in stock`,
        }, { status: 400 });
      }
    }

    // Build item names for description
    const itemNames = items.map((i) => invMap.get(i.inventory_item_id)?.name || "Unknown").join(", ");

    // Process payment
    const paymentResult = await processPayment(
      checkoutPayload.payment_method as "cash" | "card" | "store_credit" | "gift_card" | "split",
      txTotal + (taxCents || 0),
    );

    // Create ledger entry in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const ledgerEntry = await tx.posLedgerEntry.create({
        data: {
          store_id: session.store_id,
          type: "sale",
          customer_id: (checkoutPayload.customer_id as string) || null,
          staff_id: staff.id,
          event_id: (checkoutPayload.event_id as string) || null,
          amount_cents: txTotal,
          credit_amount_cents: Number(checkoutPayload.credit_applied_cents) || 0,
          description: `Mobile sale: ${itemNames}`,
          metadata: JSON.parse(JSON.stringify({
            items,
            payment_method: checkoutPayload.payment_method,
            transaction_id: paymentResult.transaction_id,
            tax_cents: taxCents,
            mobile_session_id: session.id,
            source: "mobile_register",
            ...(checkoutPayload.discount_cents ? { discount_cents: checkoutPayload.discount_cents } : {}),
          })),
        },
      });

      // Deduct inventory
      for (const item of items) {
        await tx.posInventoryItem.updateMany({
          where: { id: item.inventory_item_id, store_id: session.store_id },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      // Update session counters
      await tx.posMobileSession.update({
        where: { id: session.id },
        data: {
          tx_count: { increment: 1 },
          tx_total_cents: { increment: txTotal },
          last_active_at: new Date(),
        },
      });

      return ledgerEntry;
    });

    // Fire-and-forget op log
    opLog({
      storeId: session.store_id,
      eventType: "mobile.sale",
      severity: "info",
      message: `Mobile sale by ${staff.name}: ${formatCents(txTotal)}`,
      metadata: {
        session_id: session.id,
        staff_name: staff.name,
        ledger_entry_id: result.id,
        items: items.length,
      },
    });

    return NextResponse.json({
      success: true,
      ledger_entry_id: result.id,
      total_cents: txTotal,
      tax_cents: taxCents,
      session_tx_count: session.tx_count + 1,
      session_remaining: maxTx > 0 ? maxTx - session.tx_count - 1 : null,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * PATCH /api/mobile — admin operations (generate code, revoke sessions)
 * Requires session auth (owner/manager)
 */
export async function PATCH(request: NextRequest) {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const caller = await prisma.posStaff.findFirst({
    where: { user_id: session.user.id, active: true },
    include: { store: { select: { settings: true } } },
  });
  if (!caller || (caller.role !== "owner" && caller.role !== "manager")) {
    return NextResponse.json({ error: "Only owners and managers can manage mobile access" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const operation = body.operation as string;

  // Generate new access code
  if (operation === "generate_code") {
    // Generate a random 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hash(code, 10);

    const settings = (caller.store?.settings ?? {}) as Record<string, unknown>;
    await prisma.posStore.update({
      where: { id: caller.store_id },
      data: {
        settings: JSON.parse(JSON.stringify({
          ...settings,
          mobile_register_enabled: true,
          mobile_access_code_hash: codeHash,
        })),
      },
    });

    // Revoke all existing sessions (new code = old devices kicked)
    await prisma.posMobileSession.updateMany({
      where: { store_id: caller.store_id, revoked: false },
      data: { revoked: true },
    });

    return NextResponse.json({
      code, // Show the code ONCE — it's hashed after this
      message: "New access code generated. Share it with your team. All existing mobile sessions have been revoked.",
    });
  }

  // Revoke all sessions
  if (operation === "revoke_all") {
    const result = await prisma.posMobileSession.updateMany({
      where: { store_id: caller.store_id, revoked: false },
      data: { revoked: true },
    });

    return NextResponse.json({
      revoked: result.count,
      message: `${result.count} mobile session${result.count !== 1 ? "s" : ""} revoked.`,
    });
  }

  // Revoke single session
  if (operation === "revoke_session") {
    const sessionId = body.session_id as string;
    if (!sessionId) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }

    await prisma.posMobileSession.updateMany({
      where: { id: sessionId, store_id: caller.store_id },
      data: { revoked: true },
    });

    return NextResponse.json({ success: true });
  }

  // List active sessions
  if (operation === "list_sessions") {
    const sessions = await prisma.posMobileSession.findMany({
      where: {
        store_id: caller.store_id,
        revoked: false,
        expires_at: { gte: new Date() },
      },
      include: { staff: { select: { name: true } } },
      orderBy: { last_active_at: "desc" },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        staff_name: s.staff?.name ?? "Not activated",
        device_name: s.device_name,
        paired_at: s.paired_at,
        last_active_at: s.last_active_at,
        expires_at: s.expires_at,
        tx_count: s.tx_count,
        tx_total_cents: s.tx_total_cents,
      })),
    });
  }

  return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
}
