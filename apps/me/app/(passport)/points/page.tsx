import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function PointsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  // Get per-store balances (latest entry per storeId)
  const balanceRows = await prisma.$queryRaw<Array<{ storeId: string | null; balance: number }>>`
    SELECT DISTINCT ON ("storeId") "storeId", "balance"
    FROM "PointsLedger"
    WHERE "userId" = ${userId}
    ORDER BY "storeId", "createdAt" DESC
  `;

  const totalBalance = balanceRows.reduce((sum, r) => sum + Number(r.balance), 0);

  // Recent transactions (last 20)
  const recentTx = await prisma.pointsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      amount: true,
      balance: true,
      action: true,
      description: true,
      storeId: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#FF8200', marginBottom: '0.5rem' }}>
        Loyalty Points
      </h1>
      <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
        Points earned across all stores in the Afterroar network.
      </p>

      {/* Total balance */}
      <div style={{
        padding: '2rem',
        background: 'linear-gradient(135deg, rgba(255, 130, 0, 0.1), rgba(255, 130, 0, 0.05))',
        borderRadius: '12px',
        border: '1px solid rgba(255, 130, 0, 0.2)',
        textAlign: 'center',
        marginBottom: '2rem',
      }}>
        <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Total balance</p>
        <p style={{ color: '#FF8200', fontSize: '3rem', fontWeight: 900, margin: 0 }}>
          {totalBalance}
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
          across {balanceRows.filter(r => Number(r.balance) > 0).length} store{balanceRows.filter(r => Number(r.balance) > 0).length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Per-store breakdown */}
      {balanceRows.filter(r => Number(r.balance) > 0).length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
            By store
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {balanceRows.filter(r => Number(r.balance) > 0).map((row, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: '#1f2937',
                borderRadius: '8px',
              }}>
                <span style={{ color: '#e2e8f0' }}>
                  {row.storeId ? `Store ${row.storeId.slice(0, 8)}...` : 'Afterroar (platform)'}
                </span>
                <span style={{ color: '#FF8200', fontWeight: 700 }}>{Number(row.balance)} pts</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent transactions */}
      <section>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
          Recent transactions
        </h2>
        {recentTx.length === 0 ? (
          <div style={{
            padding: '2rem',
            background: '#1f2937',
            borderRadius: '8px',
            textAlign: 'center',
          }}>
            <p style={{ color: '#6b7280', margin: 0 }}>No points transactions yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {recentTx.map((tx, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: '#1f2937',
                borderRadius: '8px',
              }}>
                <div>
                  <p style={{ color: '#e2e8f0', margin: 0, fontSize: '0.9rem' }}>{tx.description}</p>
                  <p style={{ color: '#6b7280', margin: '0.2rem 0 0 0', fontSize: '0.75rem' }}>
                    {tx.createdAt.toLocaleDateString()} · {tx.action}
                  </p>
                </div>
                <span style={{
                  color: tx.amount >= 0 ? '#10b981' : '#ef4444',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                }}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
