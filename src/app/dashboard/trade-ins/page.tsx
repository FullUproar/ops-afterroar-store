'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TradeIn, formatCents } from '@/lib/types';

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

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  accepted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Trade-Ins</h1>
        <Link
          href="/dashboard/trade-ins/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          New Trade-In
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-400">Loading trade-ins...</div>
      ) : tradeIns.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No trade-ins yet. Create your first one to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Total Offer</th>
                <th className="px-4 py-3 font-medium">Payout</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {tradeIns.map((ti) => (
                <tr key={ti.id} className="text-white hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3 text-zinc-300">
                    {new Date(ti.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">{ti.customer_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{ti.item_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCents(ti.total_offer_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize">{ti.payout_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[ti.status] ?? ''}`}
                    >
                      {ti.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
