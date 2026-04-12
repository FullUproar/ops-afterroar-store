import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptCredential } from "@/lib/crypto";

/* ------------------------------------------------------------------ */
/*  POST /api/connect/submit — receive a credential from a store owner */
/*  Auth: Bearer token must match the store's hq_webhook_secret.       */
/*  Credential is encrypted with AES-256-GCM before storage.          */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Require Bearer token auth
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid authorization" }, { status: 401 });
  }

  let body: {
    store_slug: string;
    credential_type: string;
    credential: string;
    sender_name?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.store_slug || !body.credential || !body.credential_type) {
    return NextResponse.json(
      { error: "store_slug, credential_type, and credential are required" },
      { status: 400 },
    );
  }

  // Find the store by slug
  const store = await prisma.posStore.findFirst({
    where: { slug: body.store_slug },
    select: { id: true, settings: true },
  });

  if (!store) {
    // Don't reveal whether the store exists — accept silently
    console.log(`[Connect] Credential submitted for unknown slug: ${body.store_slug}`);
    return NextResponse.json({ ok: true });
  }

  // Verify the token matches this store's hq_webhook_secret
  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const storeSecret = settings.hq_webhook_secret as string | undefined;
  if (!storeSecret) {
    return NextResponse.json({ error: "Store not configured for credential submission" }, { status: 403 });
  }
  const crypto = require("crypto");
  if (
    token.length !== storeSecret.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(storeSecret))
  ) {
    return NextResponse.json({ error: "Invalid authorization" }, { status: 401 });
  }

  // Encrypt the credential
  const { encrypted, iv, tag } = encryptCredential(body.credential);

  // Store in the store's settings as a pending credential
  const pendingCredentials = (settings.pending_credentials ?? []) as Array<Record<string, unknown>>;

  pendingCredentials.push({
    type: body.credential_type,
    encrypted,
    iv,
    tag,
    sender_name: body.sender_name || null,
    submitted_at: new Date().toISOString(),
    consumed: false,
  });

  await prisma.posStore.update({
    where: { id: store.id },
    data: {
      settings: JSON.parse(JSON.stringify({
        ...settings,
        pending_credentials: pendingCredentials,
      })),
      updated_at: new Date(),
    },
  });

  console.log(
    `[Connect] ${body.credential_type} credential received for store ${body.store_slug} from ${body.sender_name || "unknown"}`,
  );

  return NextResponse.json({ ok: true });
}
