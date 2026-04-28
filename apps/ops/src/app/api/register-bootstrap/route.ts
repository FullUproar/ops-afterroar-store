/**
 * GET /api/register-bootstrap
 *
 * Pulls the snapshot a register tablet needs to operate offline:
 *   - Store info
 *   - Inventory items (lendable + sellable, active, with prices + qty)
 *   - Staff with PINs (for offline cashier login)
 *
 * The store is determined by the API key. Each register key is scoped
 * to a single store via its `register:write` permission and the staff
 * we minted it for.
 *
 * Auth: API key with `register:write` scope (same key used for /api/sync).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/api-middleware";
import { getStripe } from "@/lib/stripe";
import { resolveRegisterStoreId } from "@/lib/register-auth";

export const GET = withApiKey<Record<string, never>>(
  async (_req, { apiKey }) => {
    const storeId = await resolveRegisterStoreId(apiKey);
    if (!storeId) {
      return NextResponse.json(
        { error: "Auth has no associated store (paired device or staff record required)" },
        { status: 403 },
      );
    }

    const [store, inventory, staff] = await Promise.all([
      prisma.posStore.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, settings: true },
      }),
      prisma.posInventoryItem.findMany({
        where: { store_id: storeId, active: true },
        select: {
          id: true,
          name: true,
          price_cents: true,
          quantity: true,
          sku: true,
          category: true,
          barcode: true,
          barcodes: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.posStaff.findMany({
        where: { store_id: storeId, active: true },
        select: { id: true, name: true, role: true, pin_hash: true },
      }),
    ]);

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const settings = (store.settings ?? {}) as Record<string, unknown>;
    const taxRatePercent = typeof settings.tax_rate_percent === "number" ? settings.tax_rate_percent : 0;
    const taxIncludedInPrice = settings.tax_included_in_price === true;
    const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

    // Tap-to-Pay availability: requires the merchant's Stripe account to have
    // either `tap_to_pay_payments` capability active OR `card_present_payments`
    // (which TTPA derives from). Best-effort check — if the API call fails,
    // we let the device discover for itself rather than blocking the boot.
    let tapToPayApproved = false;
    const stripe = getStripe();
    if (stripe) {
      try {
        const acct = await stripe.accounts.retrieve();
        const caps = (acct.capabilities ?? {}) as Record<string, string>;
        tapToPayApproved =
          caps.tap_to_pay_payments === "active" ||
          caps.card_present_payments === "active";
      } catch {
        // Account capabilities lookup failed — fall through. The register's
        // own SDK init will discover whether TTPA actually works.
      }
    }

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        taxRatePercent,
        taxIncludedInPrice,
        stripePublishableKey,
        tapToPayApproved,
      },
      inventory: inventory.map((i) => ({
        id: i.id,
        name: i.name,
        priceCents: i.price_cents,
        quantity: i.quantity,
        sku: i.sku,
        category: i.category,
        barcode: i.barcode,
        barcodes: i.barcodes ?? [],
      })),
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        pinHash: s.pin_hash,
      })),
    });
  },
  "register:write",
);
