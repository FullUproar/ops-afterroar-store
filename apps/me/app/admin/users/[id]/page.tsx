import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { ChromeNav, Workbench, PlayerCard } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';
import EditUserForm from './EditUserForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage({ params }: PageProps) {
  const session = await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      passportCode: true,
      emailVerified: true,
      identityVerified: true,
      isFrozen: true,
      accountStatus: true,
      defaultVisibility: true,
      membershipTier: true,
      isMinor: true,
      dateOfBirth: true,
      createdAt: true,
      accounts: { select: { provider: true } },
      parent: { select: { id: true, email: true, displayName: true } },
      children: { select: { id: true, email: true, displayName: true } },
    },
  });

  if (!user) notFound();

  return (
    <>
      <ChromeNav signedIn email={session.user?.email} />
      <Workbench>
        <PlayerCard maxWidth="40rem">
          <TitleBar left={`Admin · ${user.email}`} />
          <div style={{ padding: '1.5rem var(--pad-x) 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <a
                href="/admin/users"
                style={{ ...TYPE.body, fontSize: '0.82rem', color: 'var(--orange)', textDecoration: 'none' }}
              >
                ← All users
              </a>
              <a
                href={`/admin/activity?userId=${user.id}`}
                style={{ ...TYPE.body, fontSize: '0.82rem', color: 'var(--orange)', textDecoration: 'none' }}
              >
                Activity log →
              </a>
            </div>

            {/* Read-only meta */}
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'var(--panel-mute)',
                border: '1px solid var(--rule)',
                borderRadius: '0.5rem',
                ...TYPE.body,
                fontSize: '0.82rem',
                color: 'var(--ink-soft)',
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong style={{ color: 'var(--cream)' }}>ID:</strong> {user.id}
              </div>
              <div>
                <strong style={{ color: 'var(--cream)' }}>Passport:</strong> {user.passportCode || '—'}
              </div>
              <div>
                <strong style={{ color: 'var(--cream)' }}>Created:</strong>{' '}
                {user.createdAt.toLocaleString()}
              </div>
              <div>
                <strong style={{ color: 'var(--cream)' }}>OAuth:</strong>{' '}
                {user.accounts.length > 0 ? user.accounts.map((a) => a.provider).join(', ') : 'none'}
              </div>
              {user.dateOfBirth && (
                <div>
                  <strong style={{ color: 'var(--cream)' }}>DOB:</strong>{' '}
                  {user.dateOfBirth.toISOString().slice(0, 10)}
                </div>
              )}
              {user.parent && (
                <div>
                  <strong style={{ color: 'var(--cream)' }}>Parent:</strong>{' '}
                  <a href={`/admin/users/${user.parent.id}`} style={{ color: 'var(--orange)' }}>
                    {user.parent.displayName || user.parent.email}
                  </a>
                </div>
              )}
              {user.children.length > 0 && (
                <div>
                  <strong style={{ color: 'var(--cream)' }}>Linked minors:</strong>{' '}
                  {user.children.map((c) => (
                    <a
                      key={c.id}
                      href={`/admin/users/${c.id}`}
                      style={{ color: 'var(--orange)', marginRight: '0.5rem' }}
                    >
                      {c.displayName || c.email}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <EditUserForm
              user={{
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                username: user.username,
                membershipTier: user.membershipTier,
                identityVerified: user.identityVerified,
                isFrozen: user.isFrozen,
                accountStatus: user.accountStatus,
                defaultVisibility: user.defaultVisibility,
                emailVerified: !!user.emailVerified,
              }}
            />
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}
