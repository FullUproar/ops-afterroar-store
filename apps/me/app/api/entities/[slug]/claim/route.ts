import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth-config";
import { prisma } from "@/lib/prisma";
import { fileClaimContestIssue } from "@/lib/linear";

/* ------------------------------------------------------------------ */
/*  POST /api/entities/[slug]/claim                                    */
/*                                                                      */
/*  Two flows live behind the same endpoint, decided by the entity's   */
/*  current state and the body's `contest` flag:                        */
/*                                                                      */
/*  ─── Instant claim (status=unclaimed | pending) ────                 */
/*  Trust the signed-in user. Any Passport account can claim any       */
/*  unclaimed listing — we promote the Venue to AfterroarEntity, add  */
/*  the user as the owner, and flip status to active. This is the      */
/*  "Yelp for indie game stores" model: low friction wins; bad-faith   */
/*  claims get caught at the contest layer.                            */
/*                                                                      */
/*  ─── Contest (status=active, body has contest:true) ────             */
/*  An already-claimed listing gets contested. We file an EntityClaim  */
/*  with status="contest" plus the claimant's evidence. An admin       */
/*  reviews via /admin/claims and either approves (transferring        */
/*  ownership) or rejects.                                              */
/*                                                                      */
/*  Body: { contest?: boolean, contactEmail?: string, contactName?,   */
/*          contactPhone?, evidence?: Record<string, unknown> }        */
/* ------------------------------------------------------------------ */

function makeToken(): string {
  return randomBytes(32).toString("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to claim a store." },
      { status: 401 },
    );
  }
  // After this point, narrow once so TS knows the id is defined.
  const userId: string = session.user.id;
  const userEmail: string = session.user.email ?? "unknown";

  const { slug } = await params;
  let body: {
    contest?: boolean;
    contactEmail?: string;
    contactName?: string;
    contactPhone?: string;
    evidence?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Resolve / lazy-promote Venue → AfterroarEntity. Public /stores/[slug]
  // reads from Venue; the canonical identity record is AfterroarEntity. We
  // create the Entity at claim-initiate time if it doesn't exist yet.
  let entity = await prisma.afterroarEntity.findUnique({ where: { slug } });
  let venue = await prisma.venue.findUnique({ where: { slug } });
  if (!entity) {
    if (!venue) {
      return NextResponse.json({ error: "Store not found." }, { status: 404 });
    }
    entity = await prisma.afterroarEntity.create({
      data: {
        slug: venue.slug,
        name: venue.name,
        type: "store",
        status: venue.status === "active" ? "active" : "unclaimed",
        contactEmail: venue.email,
        contactPhone: venue.phone,
        websiteUrl: venue.website,
        addressLine1: venue.address,
        city: venue.city,
        state: venue.state,
        postalCode: venue.zip,
        latitude: venue.lat,
        longitude: venue.lng,
        description: venue.description ?? venue.shortDescription,
        logoUrl: venue.logoUrl,
        metadata: { source: "venue_promotion", venue_id: venue.id, promoted_at: new Date().toISOString() },
      },
    });
  }
  if (entity.status === "suspended") {
    return NextResponse.json(
      { error: "This store is unavailable. Contact support." },
      { status: 410 },
    );
  }

  // ── Contest path (re-claim attempt on an already-active entity) ──
  if (entity.status === "active" || body.contest) {
    if (entity.status !== "active") {
      // Contest flag set but entity isn't claimed yet — fall through to
      // instant claim. (Defensive: don't make the user re-submit.)
    } else {
      // Deep clone + cast to Prisma.InputJsonValue. JSON round-trip ensures
      // any non-serializable values from the request body are stripped.
      const evidence = JSON.parse(JSON.stringify(body.evidence ?? {}));
      const contactEmail = (body.contactEmail ?? "").trim().toLowerCase();
      // Don't let one user spam the queue with multiple open contests on
      // the same entity. Replace any prior pending contest from this user.
      await prisma.entityClaim.deleteMany({
        where: {
          entityId: entity.id,
          claimantUserId: userId,
          status: "contest",
        },
      });

      const contest = await prisma.entityClaim.create({
        data: {
          entityId: entity.id,
          claimantUserId: userId,
          contactEmail: contactEmail || (session.user.email ?? "unknown"),
          contactName: body.contactName?.trim() || null,
          contactPhone: body.contactPhone?.trim() || null,
          // Token is required by the schema — generate one even though the
          // contest flow doesn't use it.
          token: makeToken(),
          status: "contest",
          // Long expiry: contests sit until an admin reviews. 30 days is
          // generous for the queue.
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          evidence,
        },
      });

      // Fire-and-forget: open a Linear issue so admin triage happens in
      // the same place as everything else. Failure here MUST NOT block the
      // contest; surface the issue URL on the claim if it succeeds.
      const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://afterroar.me";
      const adminUrl = `${baseUrl.replace(/\/$/, "")}/admin/claims`;
      const currentOwners = await prisma.entityMember.findMany({
        where: { entityId: entity.id, role: "owner" },
        include: { user: { select: { email: true } } },
      });
      const evidenceNote = (evidence?.note as string) ?? "";
      void fileClaimContestIssue({
        storeName: entity.name,
        storeSlug: entity.slug,
        contestantName: session.user.name ?? null,
        contestantEmail: session.user.email ?? "unknown",
        contestantContactEmail: contactEmail || null,
        evidenceNote,
        currentOwnerEmails: currentOwners.map((m) => m.user.email).filter(Boolean) as string[],
        adminUrl,
      })
        .then((issue) => {
          if (!issue) return;
          // Stash the Linear URL on the claim so the admin queue can link
          // out to comment threads.
          return prisma.entityClaim.update({
            where: { id: contest.id },
            data: {
              evidence: {
                ...(evidence as Record<string, unknown>),
                linear_issue_id: issue.identifier,
                linear_issue_url: issue.url,
              },
            },
          });
        })
        .catch((err) => console.error("[claim] linear filing failed", err));

      return NextResponse.json({
        ok: true,
        contest: true,
        message:
          "Your contest is in the admin queue. We'll review and reach out if we need more information.",
        contest_id: contest.id,
      });
    }
  }

  // ── Instant claim (status=unclaimed | pending) ──
  // Trust the signed-in user. Create EntityMember (role=owner) + flip both
  // Entity and Venue to active. Atomic.
  const result = await prisma.$transaction(async (tx) => {
    const updatedEntity = await tx.afterroarEntity.update({
      where: { id: entity!.id },
      data: {
        status: "active",
        approvedAt: new Date(),
      },
    });

    if (venue) {
      await tx.venue.update({
        where: { id: venue.id },
        data: { status: "active" },
      });
    }

    await tx.entityMember.upsert({
      where: { entityId_userId: { entityId: entity!.id, userId: userId } },
      create: {
        entityId: entity!.id,
        userId: userId,
        role: "owner",
        addedBy: "self_claim",
      },
      update: { role: "owner" },
    });

    // Audit row so we have a paper trail: who claimed when, which IP.
    // (EntityClaim with status=verified doubles as the audit record.)
    await tx.entityClaim.create({
      data: {
        entityId: entity!.id,
        claimantUserId: userId,
        contactEmail: userEmail,
        token: makeToken(),
        status: "verified",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        verifiedAt: new Date(),
        evidence: {
          flow: "instant_self_claim",
          ip_hash: hashRequestSource(request),
        },
      },
    });

    return { entity: updatedEntity };
  });

  return NextResponse.json({
    ok: true,
    contest: false,
    entity: {
      id: result.entity.id,
      slug: result.entity.slug,
      name: result.entity.name,
      status: result.entity.status,
    },
    message: `You're now the owner of ${result.entity.name}.`,
  });
}

function hashRequestSource(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  return `${xff}|${ua}`.slice(0, 80);
}
