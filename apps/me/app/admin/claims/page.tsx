import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';
import { audit } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

/**
 * /admin/claims — admin queue for contested store claims.
 *
 * A "contest" is filed when someone hits POST /api/entities/[slug]/claim
 * on an already-active entity. The current owner stays in place until an
 * admin approves the contest, at which point ownership transfers to the
 * contestant and the prior owner's EntityMember row is removed.
 *
 * Restricted to ADMIN_EMAILS via lib/admin.ts.
 */
export default async function AdminClaimsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/admin/claims');
  if (!isAdmin(session.user.email)) {
    return (
      <main style={{ maxWidth: '32rem', margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 900 }}>Not authorized</h1>
        <p style={{ color: '#9ca3af' }}>This panel is admin-only.</p>
        <Link href="/" style={{ color: '#FF8200' }}>← Back</Link>
      </main>
    );
  }

  const contests = await prisma.entityClaim.findMany({
    where: { status: 'contest' },
    orderBy: { createdAt: 'desc' },
    include: {
      entity: {
        include: {
          members: {
            include: { user: { select: { id: true, email: true, displayName: true } } },
          },
        },
      },
      user: { select: { id: true, email: true, displayName: true, createdAt: true } },
    },
  });

  // Resolve a contest. Either:
  //   approve   → transfer ownership: deactivate old owners, add contestant
  //   reject    → mark contest rejected, no ownership change
  //   note_only → leave pending, just attach a note (extend review)
  async function resolveContest(formData: FormData) {
    'use server';
    const session = await auth();
    if (!isAdmin(session?.user?.email)) return;
    const claimId = formData.get('claim_id') as string;
    const action = formData.get('action') as string;
    const note = (formData.get('note') as string | null) ?? null;
    if (!claimId || !action) return;

    const claim = await prisma.entityClaim.findUnique({
      where: { id: claimId },
      include: { entity: true },
    });
    if (!claim) return;

    if (action === 'approve') {
      await prisma.$transaction(async (tx) => {
        // Remove existing owners for this entity. We keep their User
        // record intact — only the EntityMember linkage is severed.
        await tx.entityMember.deleteMany({
          where: { entityId: claim.entityId, role: 'owner' },
        });
        // Add the contestant as the new owner.
        await tx.entityMember.upsert({
          where: { entityId_userId: { entityId: claim.entityId, userId: claim.claimantUserId } },
          create: {
            entityId: claim.entityId,
            userId: claim.claimantUserId,
            role: 'owner',
            addedBy: 'contest_approved',
          },
          update: { role: 'owner' },
        });
        await tx.entityClaim.update({
          where: { id: claim.id },
          data: {
            status: 'verified',
            verifiedAt: new Date(),
            notes: note,
          },
        });
      });
      await audit({
        actorUserId: session?.user?.id ?? null,
        actorEmail: session?.user?.email ?? null,
        actorRole: 'admin',
        action: 'entity_claim.contest_approved',
        targetType: 'AfterroarEntity',
        targetId: claim.entityId,
        entityId: claim.entityId,
        metadata: { claim_id: claim.id, new_owner: claim.claimantUserId, note },
      });
    } else if (action === 'reject') {
      await prisma.entityClaim.update({
        where: { id: claim.id },
        data: { status: 'rejected', notes: note },
      });
      await audit({
        actorUserId: session?.user?.id ?? null,
        actorEmail: session?.user?.email ?? null,
        actorRole: 'admin',
        action: 'entity_claim.contest_rejected',
        targetType: 'AfterroarEntity',
        targetId: claim.entityId,
        entityId: claim.entityId,
        metadata: { claim_id: claim.id, contestant: claim.claimantUserId, note },
      });
    } else if (action === 'note_only' && note) {
      await prisma.entityClaim.update({
        where: { id: claim.id },
        data: { notes: note },
      });
    }

    revalidatePath('/admin/claims');
  }

  // ── Layout ──
  return (
    <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.25rem', color: '#e2e8f0', minHeight: '100vh' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.66rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: '#FF8200', fontWeight: 800, margin: 0 }}>
          Admin · Claims
        </p>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 900, margin: '0.4rem 0 0', color: '#fff' }}>
          Contested Claims Queue
        </h1>
        <p style={{ fontSize: '0.92rem', color: '#94a3b8', margin: '0.6rem 0 0', lineHeight: 1.5 }}>
          {contests.length} contest{contests.length === 1 ? '' : 's'} awaiting review. Approving transfers
          ownership; rejecting leaves the current owner in place. The contestant always sees the outcome.
        </p>
        <p style={{ fontSize: '0.78rem', margin: '0.5rem 0 0' }}>
          <Link href="/admin/entities" style={{ color: '#FF8200' }}>Entities →</Link>
          <span style={{ color: '#475569' }}>{' · '}</span>
          <Link href="/" style={{ color: '#94a3b8' }}>Home</Link>
        </p>
      </header>

      {contests.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed #334155', color: '#64748b' }}>
          No contests in the queue. 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {contests.map((c) => {
            const currentOwners = c.entity.members.filter((m) => m.role === 'owner');
            const evidenceNote = (c.evidence as Record<string, unknown> | null)?.note as string | undefined;
            return (
              <article
                key={c.id}
                style={{
                  border: '1.5px solid #334155',
                  background: '#0f172a',
                  padding: '1.1rem 1.25rem',
                }}
              >
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.85rem' }}>
                  <div>
                    <Link
                      href={`/stores/${c.entity.slug}`}
                      style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', textDecoration: 'none' }}
                    >
                      {c.entity.name}
                    </Link>
                    <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.1rem 0 0', fontFamily: 'monospace' }}>
                      {c.entity.slug} · filed {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span style={{
                    fontSize: '0.6rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: '#FF8200',
                    padding: '2px 6px',
                    border: '1px solid #FF8200',
                    background: 'rgba(255,130,0,0.08)',
                  }}>
                    Pending review
                  </span>
                </header>

                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.85rem' }}>
                  <div>
                    <p style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 0.4rem', fontWeight: 700 }}>
                      Current owner{currentOwners.length === 1 ? '' : 's'}
                    </p>
                    {currentOwners.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>No active owner</p>
                    ) : (
                      currentOwners.map((m) => (
                        <p key={m.id} style={{ fontSize: '0.85rem', color: '#e2e8f0', margin: '0 0 0.2rem' }}>
                          {m.user.displayName ?? '—'} <span style={{ color: '#64748b' }}>· {m.user.email}</span>
                        </p>
                      ))
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 0.4rem', fontWeight: 700 }}>
                      Contestant
                    </p>
                    <p style={{ fontSize: '0.85rem', color: '#e2e8f0', margin: '0 0 0.2rem' }}>
                      {c.user.displayName ?? '—'} <span style={{ color: '#64748b' }}>· {c.user.email}</span>
                    </p>
                    <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.2rem 0 0' }}>
                      Passport joined {new Date(c.user.createdAt).toLocaleDateString()}
                      {c.contactEmail && c.contactEmail !== c.user.email && (
                        <> · prefers <code style={{ color: '#cbd5e1' }}>{c.contactEmail}</code></>
                      )}
                    </p>
                  </div>
                </div>

                {evidenceNote && (
                  <div style={{ marginBottom: '0.85rem' }}>
                    <p style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 0.4rem', fontWeight: 700 }}>
                      Submitted evidence
                    </p>
                    <p style={{ fontSize: '0.88rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: '#020617', padding: '0.7rem 0.85rem', border: '1px solid #1e293b' }}>
                      {evidenceNote}
                    </p>
                  </div>
                )}
                {(() => {
                  const ev = (c.evidence as Record<string, unknown> | null) ?? {};
                  const linearUrl = ev.linear_issue_url as string | undefined;
                  const linearId = ev.linear_issue_id as string | undefined;
                  if (!linearUrl) return null;
                  return (
                    <p style={{ fontSize: '0.78rem', margin: '0 0 0.85rem' }}>
                      <a href={linearUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#5E6AD2', textDecoration: 'underline' }}>
                        Linear: {linearId ?? 'discuss'} →
                      </a>
                      <span style={{ color: '#475569', marginLeft: '0.4rem' }}>
                        Use Linear comments for back-and-forth with the contestant.
                      </span>
                    </p>
                  );
                })()}

                {c.notes && (
                  <p style={{ fontSize: '0.78rem', color: '#FF8200', margin: '0 0 0.85rem' }}>
                    Admin note: {c.notes}
                  </p>
                )}

                <form action={resolveContest} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #1e293b', paddingTop: '0.85rem' }}>
                  <input type="hidden" name="claim_id" value={c.id} />
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="Internal note (optional — visible to other admins)"
                    style={{
                      padding: '0.55rem 0.7rem',
                      background: '#020617',
                      border: '1px solid #334155',
                      color: '#e2e8f0',
                      fontSize: '0.82rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      name="action"
                      value="note_only"
                      style={btnSecondary}
                    >
                      Save note
                    </button>
                    <button
                      name="action"
                      value="reject"
                      style={btnReject}
                      formNoValidate
                    >
                      Reject contest
                    </button>
                    <button
                      name="action"
                      value="approve"
                      style={btnApprove}
                      formNoValidate
                    >
                      Transfer ownership →
                    </button>
                  </div>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

const btnSecondary = {
  padding: '0.5rem 0.9rem',
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #334155',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
};
const btnReject = {
  padding: '0.5rem 0.9rem',
  background: 'transparent',
  color: '#fca5a5',
  border: '1px solid #ef4444',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
};
const btnApprove = {
  padding: '0.5rem 0.9rem',
  background: '#FF8200',
  color: '#0a0a0a',
  border: 'none',
  fontSize: '0.82rem',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
};
