'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Customer, LedgerEntry, formatCents, parseDollars } from '@/lib/types';

interface CustomerDetail extends Customer {
  ledger_entries: LedgerEntry[];
  trade_ins: any[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'tradeins'>('transactions');
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditForm, setCreditForm] = useState({ amount: '', type: 'issue' as 'issue' | 'deduct', description: '' });

  const loadCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer(data);
        setEditForm({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          notes: data.notes || '',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditing(false);
        loadCustomer();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCreditAdjust(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const amountCents = parseDollars(creditForm.amount);
      const res = await fetch(`/api/customers/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjust_credit',
          amount_cents: creditForm.type === 'deduct' ? -amountCents : amountCents,
          description: creditForm.description || `Credit ${creditForm.type}`,
        }),
      });
      if (res.ok) {
        setCreditForm({ amount: '', type: 'issue', description: '' });
        setShowCreditForm(false);
        loadCustomer();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-zinc-400">Loading customer...</p>;
  if (!customer) return <p className="text-zinc-400">Customer not found.</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        {editing ? (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Notes</label>
                <input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
              <div className="mt-2 space-y-1 text-sm text-zinc-400">
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
              </div>
              <div className="mt-3">
                <span className="px-3 py-1 rounded text-sm bg-green-900 text-green-300 font-medium">
                  Credit: {formatCents(customer.credit_balance_cents ?? 0)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => setShowCreditForm(!showCreditForm)}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-medium"
              >
                Adjust Credit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Credit Adjustment Form */}
      {showCreditForm && (
        <form onSubmit={handleCreditAdjust} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">Adjust Store Credit</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Type</label>
              <select
                value={creditForm.type}
                onChange={(e) => setCreditForm({ ...creditForm, type: e.target.value as 'issue' | 'deduct' })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              >
                <option value="issue">Issue Credit</option>
                <option value="deduct">Deduct Credit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Amount ($)</label>
              <input
                required
                type="text"
                placeholder="0.00"
                value={creditForm.amount}
                onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <input
                value={creditForm.description}
                onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {saving ? 'Adjusting...' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreditForm(false)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'transactions'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-zinc-400 hover:text-zinc-300'
          }`}
        >
          Transaction History
        </button>
        <button
          onClick={() => setActiveTab('tradeins')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'tradeins'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-zinc-400 hover:text-zinc-300'
          }`}
        >
          Trade-In History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'transactions' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {customer.ledger_entries.length === 0 ? (
            <p className="p-4 text-zinc-400 text-sm">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {customer.ledger_entries.map((entry: LedgerEntry) => (
                  <tr key={entry.id} className="border-b border-zinc-800 text-white">
                    <td className="px-4 py-3 text-zinc-300">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-zinc-700 text-zinc-300 uppercase">
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{entry.description || '-'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      entry.amount_cents >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {entry.amount_cents >= 0 ? '+' : ''}{formatCents(entry.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'tradeins' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {customer.trade_ins.length === 0 ? (
            <p className="p-4 text-zinc-400 text-sm">No trade-ins yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium text-right">Credit Issued</th>
                </tr>
              </thead>
              <tbody>
                {customer.trade_ins.map((ti: any) => (
                  <tr key={ti.id} className="border-b border-zinc-800 text-white">
                    <td className="px-4 py-3 text-zinc-300">
                      {new Date(ti.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{ti.item_count ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-medium">
                      {formatCents(ti.credit_amount_cents ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
