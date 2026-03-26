import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { findAfterroarUser, linkCustomerToAfterroar, getTrustBadge, isIdentityVerified } from "@/lib/hq-bridge";

export async function POST(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const body = await request.json();
    const { customer_id, user_email } = body;

    if (!customer_id || !user_email) {
      return NextResponse.json(
        { error: "customer_id and user_email are required" },
        { status: 400 }
      );
    }

    // Verify customer exists and belongs to this store
    const customer = await db.posCustomer.findFirst({
      where: { id: customer_id },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (customer.afterroar_user_id) {
      return NextResponse.json(
        { error: "Customer is already linked to an Afterroar account" },
        { status: 409 }
      );
    }

    // Find the Afterroar user by email
    const user = await findAfterroarUser(user_email);
    if (!user) {
      return NextResponse.json(
        { error: "No Afterroar account found with that email" },
        { status: 404 }
      );
    }

    // Link the customer
    await linkCustomerToAfterroar(customer_id, user.id);

    const badge = getTrustBadge(user.reputationScore);
    const verified = isIdentityVerified(user.identityVerified);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        reputationScore: user.reputationScore,
        identityVerified: verified,
        trustBadge: badge,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
