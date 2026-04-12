import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  POST /api/store/create — create a new store for the logged-in user */
/*  Used by Google OAuth users who don't have a store yet.             */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = await request.json();
    const { store_name, owner_name } = body as { store_name: string; owner_name?: string };

    if (!store_name?.trim()) {
      return NextResponse.json({ error: "Store name is required" }, { status: 400 });
    }

    // Check if user already has a store
    const existingStaff = await prisma.posStaff.findFirst({
      where: { user_id: session.user.id },
    });
    if (existingStaff) {
      return NextResponse.json({ error: "You already have a store" }, { status: 400 });
    }

    // Generate slug from store name
    let slug = store_name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure slug is unique
    const existingSlug = await prisma.posStore.findFirst({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const userId = session.user.id!;

    // Create store + staff in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.posStore.create({
        data: {
          name: store_name.trim(),
          slug,
          owner_id: userId,
          settings: {
            plan: "trial",
            subscription_status: "trial",
            trial_started_at: new Date().toISOString(),
            trial_days: 14,
          },
        },
      });

      await tx.posStaff.create({
        data: {
          user_id: userId,
          store_id: store.id,
          role: "owner",
          name: owner_name?.trim() || session.user!.name || session.user!.email?.split("@")[0] || "Owner",
        },
      });

      return store;
    });

    return NextResponse.json({
      store_id: result.id,
      slug: result.slug,
    }, { status: 201 });
  } catch (error) {
    console.error("[store/create]", error);
    return NextResponse.json({ error: "Failed to create store" }, { status: 500 });
  }
}
