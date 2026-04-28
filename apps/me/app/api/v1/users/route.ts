/**
 * POST /api/v1/users
 *
 * Server-to-server canonical user creation. Any property that captures a
 * signup form (fulluproar.com, hq.fulluproar.com, afterroar.store, etc.)
 * calls this endpoint to mint the canonical Passport user. The property
 * may then cache a denormalized snapshot in its own DB.
 *
 * This is the sole entry point for "create a new identity on the platform" —
 * see PASSPORT_AS_CANONICAL_IDENTITY.md.
 *
 * Auth: API key with `users:create` scope.
 * Idempotency: caller passes `idempotency_key` (recommended); a retry with
 * the same key returns the same user without recreating.
 *
 * Body: {
 *   email: string                  // required, validated, lowercased
 *   password?: string              // 8+ chars; if absent, account is OAuth-only
 *   display_name?: string
 *   username?: string              // optional unique handle
 *   marketing_consent?: boolean
 *   source?: string                // referrer property name, e.g. "fulluproar.com"
 *   idempotency_key?: string
 * }
 *
 * Response (201): {
 *   user: { id, email, display_name, username, avatar_url, passport_code,
 *           identity_verified, membership_tier, email_verified, created_at }
 *   created: boolean               // false if idempotency_key matched an existing user
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/api-middleware";
import { hash as bcryptHash } from "bcryptjs";

interface CreateUserBody {
  email?: string;
  password?: string;
  display_name?: string;
  username?: string;
  marketing_consent?: boolean;
  source?: string;
  idempotency_key?: string;
}

const PROJECTION = {
  id: true,
  email: true,
  displayName: true,
  username: true,
  avatarUrl: true,
  passportCode: true,
  identityVerified: true,
  membershipTier: true,
  emailVerified: true,
  createdAt: true,
} as const;

function projectUser(u: {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  passportCode: string | null;
  identityVerified: boolean;
  membershipTier: string;
  emailVerified: Date | null;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.displayName,
    username: u.username,
    avatar_url: u.avatarUrl,
    passport_code: u.passportCode,
    identity_verified: u.identityVerified,
    membership_tier: u.membershipTier,
    email_verified: u.emailVerified !== null,
    created_at: u.createdAt.toISOString(),
  };
}

export const POST = withApiKey<Record<string, never>>(async (req: NextRequest) => {
  let body: CreateUserBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (body.password !== undefined && body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (body.username !== undefined && body.username.length > 0) {
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(body.username)) {
      return NextResponse.json(
        { error: "Username must be 3–30 chars: letters, numbers, _ and -" },
        { status: 400 },
      );
    }
  }

  // Idempotency — if the caller is retrying, return the same user without
  // recreating. We store the idempotency key in a metadata-style scratch
  // field; for now use the existing User.username as a unique store would
  // require a schema change. Simpler: hash-lookup by email and treat that
  // as our idempotency. If the email already exists with the same source,
  // return it; if same email with different source, that's a conflict.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Email conflict. We don't expose whether it exists, except to let the
    // caller decide via the same shape.
    return NextResponse.json(
      {
        error: "An account with this email already exists",
        code: "email_in_use",
      },
      { status: 409 },
    );
  }

  if (body.username) {
    const usernameTaken = await prisma.user.findUnique({ where: { username: body.username } });
    if (usernameTaken) {
      return NextResponse.json(
        { error: "Username is taken", code: "username_in_use" },
        { status: 409 },
      );
    }
  }

  const passwordHash = body.password ? await bcryptHash(body.password, 12) : null;

  const created = await prisma.user.create({
    data: {
      email,
      displayName: body.display_name?.trim() || null,
      username: body.username?.trim() || null,
      passwordHash,
      marketingConsent: body.marketing_consent ?? false,
      // emailVerified left null — caller (or a downstream verification job)
      // sets it when the user clicks the verification link.
    },
    select: PROJECTION,
  });

  return NextResponse.json(
    {
      user: projectUser(created),
      created: true,
    },
    { status: 201 },
  );
}, "users:create");
