import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  POST /api/staff/invite — generate invite link for a staff member   */
/*  Owner/manager creates staff → generates token → sends email        */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { storeId, db } = await requirePermission("staff.manage");

    const body = await request.json();
    const { staff_id } = body as { staff_id: string };

    if (!staff_id) {
      return NextResponse.json({ error: "staff_id required" }, { status: 400 });
    }

    // Find the staff member
    const staff = await db.posStaff.findFirst({
      where: { id: staff_id, store_id: storeId },
      include: { store: { select: { name: true } }, user: { select: { email: true } } },
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    // Generate secure invite token (48 bytes = 64 chars base64url)
    const token = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Save token
    await prisma.posStaff.update({
      where: { id: staff_id },
      data: { invite_token: token, invite_expires_at: expiresAt },
    });

    // Build invite URL
    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://www.afterroar.store";
    const inviteUrl = `${baseUrl}/invite/${token}`;

    // Send email if we have one
    const email = staff.user?.email;
    if (email) {
      await sendEmail({
        to: email,
        subject: `You're invited to ${staff.store.name} on Afterroar Ops`,
        html: `
          <div style="font-family:system-ui;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="margin:0">Welcome to ${staff.store.name}</h2>
            <p>You've been added as <strong>${staff.role}</strong>. Set up your password and PIN to get started.</p>
            <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#FF8200;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">
              Accept Invite
            </a>
            <p style="color:#999;font-size:12px">This link expires in 7 days.</p>
          </div>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      invite_url: inviteUrl,
      email_sent: !!email,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
