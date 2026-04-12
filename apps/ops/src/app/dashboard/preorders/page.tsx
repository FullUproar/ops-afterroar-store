'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/types';
import { EmptyState } from '@/components/shared/ui';
import { PageHeader } from '@/components/page-header';

interface Preorder {
  id: string;
  product_name: string;
  product_details: Record<string, unknown>;
  quantity: number;
  deposit_cents: number;
  total_price_cents: number;
  status: string;
  release_date: string | null;
  notes: string | null;
  created_at: string;
  customer?: { name: string } | null;
  location?: { name: string } | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  received: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  fulfilled: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function PreordersPage() {
  const [preorders, setPreorders] = useState<Preorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/preorders')
      .then((r) => r.json())
      .then((d) => setPreorders(d))
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: string) {
    try {
      await fetch('/api/preorders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      setPreorders((prev) => prev.map((p) =>
        p.id === id ? { ...p, status } : p
      ));
    } catch {
      setError('Failed to update');
    }
  }

  const pending = preorders.filter((p) => p.status === 'pending' || p.status === 'confirmed');
  const received = preorders.filter((p) => p.status === 'received');
  const fulfilled = preorders.filter((p) => p.status === 'fulfilled');

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Preorders"
        action={
          <Link href="/dashboard/preorders/new"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors">
            New Preorder
          </Link>
        }
      />

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : preorders.length === 0 ? (
        <EmptyState
          icon="&#x1F4E6;"
          title="No preorders yet"
          description="Take preorders for upcoming releases — new MTG sets, Pokemon expansions, board games."
        />
      ) : (
        <div className="space-y-6">
          {/* Pending / Confirmed */}
          {pending.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted">Awaiting Stock ({pending.length})</h2>
              <div className="space-y-2">
                {pending.map((po) => (
                  <div key={po.id} className="flex items-center justify-between rounded-xl border border-card-border bg-card p-4">
                    <div>
                      <div className="font-medium text-foreground">{po.product_name} &times;{po.quantity}</div>
                      <div className="text-sm text-muted">
                        {po.customer?.name ?? 'No customer'}
                        {po.release_date && ` · Release: ${new Date(po.release_date).toLocaleDateString()}`}
                        {po.deposit_cents > 0 && ` · Deposit: ${formatCents(po.deposit_cents)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusColors[po.status]}`}>
                        {po.status}
                      </span>
                      <button onClick={() => updateStatus(po.id, 'received')}
                        className="rounded bg-accent px-3 py-1 text-xs text-foreground hover:opacity-90">
                        Mark Received
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Received — ready to fulfill */}
          {received.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted">Ready to Fulfill ({received.length})</h2>
              <div className="space-y-2">
                {received.map((po) => (
                  <div key={po.id} className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                    <div>
                      <div className="font-medium text-foreground">{po.product_name} &times;{po.quantity}</div>
                      <div className="text-sm text-muted">
                        {po.customer?.name ?? 'No customer'}
                        {po.total_price_cents > 0 && ` · Total: ${formatCents(po.total_price_cents)}`}
                        {po.deposit_cents > 0 && ` · Deposit paid: ${formatCents(po.deposit_cents)}`}
                      </div>
                    </div>
                    <button onClick={() => updateStatus(po.id, 'fulfilled')}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-foreground hover:bg-green-500">
                      Mark Fulfilled
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fulfilled — completed */}
          {fulfilled.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted">Completed ({fulfilled.length})</h2>
              <div className="space-y-2">
                {fulfilled.slice(0, 10).map((po) => (
                  <div key={po.id} className="flex items-center justify-between rounded-xl border border-card-border bg-card-hover p-4 opacity-60">
                    <div>
                      <div className="font-medium text-foreground">{po.product_name} &times;{po.quantity}</div>
                      <div className="text-sm text-muted">{po.customer?.name} · {new Date(po.created_at).toLocaleDateString()}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusColors.fulfilled}`}>fulfilled</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
