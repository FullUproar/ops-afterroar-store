import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import Stripe from "stripe";

/**
 * POST /api/stripe/terminal/register
 * Register a Stripe Terminal reader using its pairing code.
 * The reader displays this code when in pairing mode.
 */
export async function POST(request: Request) {
  try {
    const { storeId } = await requireStaff();

    const { registration_code, label } = await request.json();

    if (!registration_code) {
      return NextResponse.json(
        { error: "Registration code is required" },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // First, create a location for this store (required by Terminal)
    // Check if we already have one
    const { prisma } = await import("@/lib/prisma");
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true, name: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    let locationId = settings.stripe_terminal_location_id as string | undefined;

    if (!locationId) {
      // Create a Stripe Terminal location
      const location = await stripe.terminal.locations.create({
        display_name: store?.name || "Store",
        address: {
          line1: "123 Main St", // Required — can be updated later
          city: "South Bend",
          state: "IN",
          country: "US",
          postal_code: "46601",
        },
      });
      locationId = location.id;

      // Save location ID to store settings
      await prisma.posStore.update({
        where: { id: storeId },
        data: {
          settings: JSON.parse(JSON.stringify({
            ...settings,
            stripe_terminal_location_id: locationId,
          })),
        },
      });
    }

    // Register the reader
    const reader = await stripe.terminal.readers.create({
      registration_code,
      label: label || "Register 1",
      location: locationId,
    });

    // Save reader ID to store settings
    const updatedSettings = {
      ...settings,
      stripe_terminal_location_id: locationId,
      stripe_terminal_reader_id: reader.id,
      stripe_terminal_reader_label: reader.label,
      stripe_terminal_reader_type: reader.device_type,
    };

    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: JSON.parse(JSON.stringify(updatedSettings)),
      },
    });

    return NextResponse.json({
      success: true,
      reader: {
        id: reader.id,
        label: reader.label,
        device_type: reader.device_type,
        status: reader.status,
        location: locationId,
      },
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 400 }
      );
    }
    return handleAuthError(error);
  }
}

/**
 * GET /api/stripe/terminal/register
 * Get the current reader status
 */
export async function GET() {
  try {
    const { storeId } = await requireStaff();

    const { prisma } = await import("@/lib/prisma");
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const readerId = settings.stripe_terminal_reader_id as string | undefined;

    if (!readerId) {
      return NextResponse.json({ registered: false });
    }

    // Check reader status with Stripe
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        registered: true,
        reader: {
          id: readerId,
          label: settings.stripe_terminal_reader_label,
          device_type: settings.stripe_terminal_reader_type,
          status: "unknown",
        },
      });
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const reader = await stripe.terminal.readers.retrieve(readerId) as Stripe.Terminal.Reader;

      return NextResponse.json({
        registered: true,
        reader: {
          id: reader.id,
          label: reader.label || null,
          device_type: reader.device_type || null,
          status: reader.status || null,
          ip_address: reader.ip_address || null,
          serial_number: reader.serial_number || null,
        },
      });
    } catch {
      return NextResponse.json({
        registered: true,
        reader: {
          id: readerId,
          label: settings.stripe_terminal_reader_label,
          status: "unreachable",
        },
      });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
