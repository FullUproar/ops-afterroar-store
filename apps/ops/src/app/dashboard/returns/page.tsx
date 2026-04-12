'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents, RETURN_REASONS } from '@/lib/types';
import { EmptyState } from '@/components/shared/ui';
import { PageHeader } from '@/components/page-header';

interface ReturnRow {
  id: string;
  created_at: string;
  customer_name: string;
  item_count: number;
  total_refund_cents: number;
  refund_method: 'cash' | 'store_credit';
  reason: string;
  status: string;
}

const reasonLabel = (reason: string) =>
  RETURN_REASONS.find((r) => r.value === reason)?.label ?? reason;

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/returns')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load returns');
        return res.json();
      })
      .then((data) => setReturns(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Returns"
        action={
          <Link
            href="/dashboard/returns/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-colors"
          >
            New Return
          </Link>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading returns...</div>
      ) : returns.length === 0 ? (
        <EmptyState
          icon="&#x21A9;"
          title="No returns yet"
          description="Process returns and exchanges. Stock is automatically restored and credit applied."
          action={{ label: "Process a Return", href: "/dashboard/returns/new" }}
        />
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {returns.map((r) => (
              <div key={r.id} className="rounded-xl border border-card-border bg-card p-4 min-h-11 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground leading-snug">{r.customer_name}</span>
                  <span className="text-sm text-red-600 dark:text-red-400 font-semibold tabular-nums">-{formatCents(r.total_refund_cents)}</span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {r.item_count} items &middot; {r.refund_method === 'store_credit' ? 'Store Credit' : 'Cash'} &middot; {reasonLabel(r.reason)}
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
                  <th className="px-4 py-3 font-medium text-right">Refund</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {returns.map((r) => (
                  <tr key={r.id} className="text-foreground hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-muted">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.customer_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.item_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400 font-semibold">
                      -{formatCents(r.total_refund_cents)}
                    </td>
                    <td className="px-4 py-3">
                      {r.refund_method === 'store_credit' ? 'Store Credit' : 'Cash'}
                    </td>
                    <td className="px-4 py-3 text-muted">{reasonLabel(r.reason)}</td>
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
