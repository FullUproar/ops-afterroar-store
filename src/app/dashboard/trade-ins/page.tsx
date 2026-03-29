'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/types';
import { StatusBadge } from '@/components/mobile-card';
import { PageHeader } from '@/components/page-header';

interface TradeInRow {
  id: string;
  created_at: string;
  customer_name: string;
  item_count: number;
  total_offer_cents: number;
  total_payout_cents: number;
  payout_type: 'cash' | 'credit';
  status: 'pending' | 'accepted' | 'completed' | 'rejected';
}

const statusVariants: Record<string, 'pending' | 'info' | 'success' | 'error'> = {
  pending: 'pending',
  accepted: 'info',
  completed: 'success',
  rejected: 'error',
};

export default function TradeInsPage() {
  const [tradeIns, setTradeIns] = useState<TradeInRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/trade-ins')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load trade-ins');
        return res.json();
      })
      .then((data) => setTradeIns(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade-Ins"
        action={
          <div className="flex gap-2">
            <Link
              href="/dashboard/trade-ins/bulk"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
            >
              Bulk Buylist
            </Link>
            <Link
              href="/dashboard/trade-ins/new"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-colors"
            >
              New Trade-In
            </Link>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading trade-ins...</div>
      ) : tradeIns.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center shadow-sm dark:shadow-none">
          <p className="text-muted">No trade-ins yet.</p>
          <Link
            href="/dashboard/trade-ins/new"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-colors"
          >
            Start Your First Trade-In
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {tradeIns.map((ti) => (
              <div key={ti.id} className="rounded-xl border border-card-border bg-card p-4 min-h-11 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground leading-snug">{ti.customer_name}</span>
                  <StatusBadge variant={statusVariants[ti.status] ?? 'info'} className="capitalize">
                    {ti.status}
                  </StatusBadge>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                  <span>{ti.item_count} items &middot; {ti.payout_type}</span>
                  <span className="text-foreground font-semibold tabular-nums">{formatCents(ti.total_offer_cents)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-card-border bg-card shadow-sm dark:shadow-none">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-card-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium text-right">Items</th>
                  <th className="px-4 py-3 font-medium text-right">Total Offer</th>
                  <th className="px-4 py-3 font-medium">Payout</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {tradeIns.map((ti) => (
                  <tr key={ti.id} className="text-foreground hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-muted">
                      {new Date(ti.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{ti.customer_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{ti.item_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatCents(ti.total_offer_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{ti.payout_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={statusVariants[ti.status] ?? 'info'} className="capitalize">
                        {ti.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
