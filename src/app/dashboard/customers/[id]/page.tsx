'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Customer, LedgerEntry, formatCents, parseDollars } from '@/lib/types';
import { useStore } from '@/lib/store-context';
import { PageHeader } from '@/components/page-header';

interface LoyaltyEntry {
  id: string;
  type: string;
  points: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

interface AfterroarProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  reputationScore: number;
  identityVerified: boolean;
  trustBadge: { level: 'green' | 'yellow' | 'red'; label: string };
}

interface CustomerDetail extends Customer {
  ledger_entries: LedgerEntry[];
  trade_ins: any[];
  loyalty_entries?: LoyaltyEntry[];
  afterroar_user_id?: string | null;
}

function trustBadgeClasses(level: 'green' | 'yellow' | 'red') {
  const map = {
    green: 'text-green-400 bg-green-900/30',
    yellow: 'text-yellow-400 bg-yellow-900/30',
    red: 'text-red-400 bg-red-900/30',
  };
  return map[level];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStore();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'tradeins' | 'loyalty'>('transactions');
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditForm, setCreditForm] = useState({ amount: '', type: 'issue' as 'issue' | 'deduct', description: '' });
  const [showLoyaltyAdjust, setShowLoyaltyAdjust] = useState(false);
  const [loyaltyAdjust, setLoyaltyAdjust] = useState({ points: '', type: 'add' as 'add' | 'deduct', description: '' });

  // Afterroar linking state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkedProfile, setLinkedProfile] = useState<AfterroarProfile | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateSuccess, setMigrateSuccess] = useState('');

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

  async function handleLinkAfterroar(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true);
    setLinkError('');
    try {
      const res = await fetch('/api/afterroar/link-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: id, user_email: linkEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinkedProfile(data.user);
        setShowLinkForm(false);
        setLinkEmail('');
        loadCustomer();
      } else {
        setLinkError(data.error || 'Failed to link account');
      }
    } catch {
      setLinkError('Failed to link account');
    } finally {
      setLinking(false);
    }
  }

  async function handleMigratePoints() {
    setMigrating(true);
    setMigrateSuccess('');
    try {
      const res = await fetch('/api/afterroar/migrate-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: id }),
      });
      const data = await res.json();
      if (res.ok) {
        setMigrateSuccess(`${data.migrated_points} points migrated to Afterroar`);
        loadCustomer();
      }
    } finally {
      setMigrating(false);
    }
  }

  if (loading) return <p className="text-muted">Loading customer...</p>;
  if (!customer) return (
    <div className="space-y-4">
      <PageHeader title="Customer" backHref="/dashboard/customers" />
      <div className="rounded-xl border border-card-border bg-card p-8 text-center">
        <p className="text-muted">Customer not found.</p>
      </div>
    </div>
  );

  const isLinked = Boolean(customer.afterroar_user_id);
  const hasLocalPoints = (customer.loyalty_points ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={customer.name} backHref="/dashboard/customers" />
      {/* Header */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        {editing ? (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted mb-1">Name</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Notes</label>
                <input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-foreground rounded text-sm font-medium"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{customer.name}</h1>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <span className="px-3 py-1 rounded text-sm bg-green-900 text-green-300 font-medium">
                  Credit: {formatCents(customer.credit_balance_cents ?? 0)}
                </span>
                <span className="px-3 py-1 rounded text-sm bg-purple-900 text-purple-300 font-medium">
                  Loyalty: {customer.loyalty_points ?? 0} pts
                </span>
                {isLinked && (
                  <span className="px-3 py-1 rounded text-sm bg-indigo-900/40 text-indigo-400 border border-indigo-800/30 font-medium flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    Afterroar Linked
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => setShowCreditForm(!showCreditForm)}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 text-foreground rounded text-sm font-medium"
              >
                Adjust Credit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Afterroar Account Section */}
      <div className="bg-card border border-card-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Afterroar Account</h2>
        {isLinked ? (
          <div className="space-y-3">
            {linkedProfile ? (
              <div className="flex items-center gap-3">
                {linkedProfile.avatarUrl ? (
                  <img src={linkedProfile.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-card-hover flex items-center justify-center text-lg text-muted">
                    {(linkedProfile.displayName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">{linkedProfile.displayName || linkedProfile.email}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${trustBadgeClasses(linkedProfile.trustBadge.level)}`}>
                      {linkedProfile.trustBadge.label}
                    </span>
                    {linkedProfile.identityVerified && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-900/30 text-blue-400 font-medium">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">{linkedProfile.email}</p>
                  <p className="text-xs text-muted">Reputation: {linkedProfile.reputationScore}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-foreground/70">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Linked to Afterroar account
              </div>
            )}

            {/* Migrate points button */}
            {hasLocalPoints && (
              <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-800/30 rounded px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm text-purple-300">
                    This customer has {customer.loyalty_points} POS loyalty points that can be migrated to their Afterroar wallet.
                  </p>
                </div>
                <button
                  onClick={handleMigratePoints}
                  disabled={migrating}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-foreground rounded text-xs font-medium whitespace-nowrap"
                >
                  {migrating ? 'Migrating...' : `Migrate ${customer.loyalty_points} pts`}
                </button>
              </div>
            )}
            {migrateSuccess && (
              <p className="text-xs text-green-400">{migrateSuccess}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Link this customer to an Afterroar account to sync loyalty points, enable QR check-in, and view trust scores.
            </p>
            {!showLinkForm ? (
              <button
                onClick={() => setShowLinkForm(true)}
                className="px-4 py-2 bg-accent hover:opacity-90 text-foreground rounded text-sm font-medium"
              >
                Link Afterroar Account
              </button>
            ) : (
              <form onSubmit={handleLinkAfterroar} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">Afterroar account email</label>
                  <input
                    required
                    type="email"
                    placeholder="player@example.com"
                    value={linkEmail}
                    onChange={(e) => { setLinkEmail(e.target.value); setLinkError(''); }}
                    className="w-full max-w-md bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                  />
                </div>
                {linkError && (
                  <p className="text-xs text-red-400">{linkError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={linking}
                    className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-foreground rounded text-sm font-medium"
                  >
                    {linking ? 'Searching...' : 'Link Account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowLinkForm(false); setLinkEmail(''); setLinkError(''); }}
                    className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Credit Adjustment Form */}
      {showCreditForm && (
        <form onSubmit={handleCreditAdjust} className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Adjust Store Credit</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Type</label>
              <select
                value={creditForm.type}
                onChange={(e) => setCreditForm({ ...creditForm, type: e.target.value as 'issue' | 'deduct' })}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              >
                <option value="issue">Issue Credit</option>
                <option value="deduct">Deduct Credit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Amount ($)</label>
              <input
                required
                type="text"
                placeholder="0.00"
                value={creditForm.amount}
                onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Description</label>
              <input
                value={creditForm.description}
                onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })}
                className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-foreground rounded text-sm font-medium"
            >
              {saving ? 'Adjusting...' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreditForm(false)}
              className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-card-border">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'transactions'
              ? 'border-blue-500 text-foreground'
              : 'border-transparent text-muted hover:text-foreground/70'
          }`}
        >
          Transaction History
        </button>
        <button
          onClick={() => setActiveTab('tradeins')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'tradeins'
              ? 'border-blue-500 text-foreground'
              : 'border-transparent text-muted hover:text-foreground/70'
          }`}
        >
          Trade-In History
        </button>
        <button
          onClick={() => setActiveTab('loyalty')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'loyalty'
              ? 'border-blue-500 text-foreground'
              : 'border-transparent text-muted hover:text-foreground/70'
          }`}
        >
          Loyalty Points
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'transactions' && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          {customer.ledger_entries.length === 0 ? (
            <p className="p-4 text-muted text-sm">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {customer.ledger_entries.map((entry: LedgerEntry) => (
                  <tr key={entry.id} className="border-b border-card-border text-foreground">
                    <td className="px-4 py-3 text-foreground/70">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-card-hover text-foreground/70 uppercase">
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground/70">{entry.description || '-'}</td>
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
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          {customer.trade_ins.length === 0 ? (
            <p className="p-4 text-muted text-sm">No trade-ins yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Payout</th>
                  <th className="px-4 py-3 font-medium text-right">Offer</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {customer.trade_ins.map((ti: any) => (
                  <tr key={ti.id} className="border-b border-card-border text-foreground">
                    <td className="px-4 py-3 text-foreground/70">
                      {new Date(ti.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {ti.items?.length > 0 ? (
                        <div className="space-y-0.5">
                          {ti.items.slice(0, 3).map((item: any, idx: number) => (
                            <div key={idx} className="text-xs text-foreground/70 truncate max-w-[200px]">
                              {item.name}{item.quantity > 1 ? ` x${item.quantity}` : ""}
                            </div>
                          ))}
                          {ti.items.length > 3 && (
                            <div className="text-xs text-muted">+{ti.items.length - 3} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${
                        ti.payout_type === "credit"
                          ? "bg-blue-900/30 text-blue-400"
                          : "bg-green-900/30 text-green-400"
                      }`}>
                        {ti.payout_type || "cash"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                      {formatCents(ti.total_offer_cents || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-accent">
                      {formatCents(ti.total_payout_cents || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'loyalty' && (
        <div className="space-y-4">
          {/* Loyalty balance card */}
          <div className="bg-card border border-card-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-muted">Loyalty Points Balance</div>
              <div className="text-2xl font-bold text-purple-400">{customer.loyalty_points ?? 0} pts</div>
              {isLinked && (
                <p className="text-xs text-muted mt-1">Points now sync to Afterroar wallet on purchases</p>
              )}
            </div>
            {can('staff.manage') && (
              <button
                onClick={() => setShowLoyaltyAdjust(!showLoyaltyAdjust)}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-foreground rounded text-sm font-medium"
              >
                Adjust Points
              </button>
            )}
          </div>

          {/* Loyalty adjustment form */}
          {showLoyaltyAdjust && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                try {
                  const pts = parseInt(loyaltyAdjust.points);
                  if (!pts || pts <= 0) return;
                  const res = await fetch(`/api/customers/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'adjust_loyalty',
                      points: loyaltyAdjust.type === 'deduct' ? -pts : pts,
                      description: loyaltyAdjust.description || `Manual ${loyaltyAdjust.type}`,
                    }),
                  });
                  if (res.ok) {
                    setShowLoyaltyAdjust(false);
                    setLoyaltyAdjust({ points: '', type: 'add', description: '' });
                    loadCustomer();
                  }
                } finally {
                  setSaving(false);
                }
              }}
              className="bg-card border border-card-border rounded-xl p-4 space-y-4"
            >
              <h3 className="text-sm font-semibold text-foreground">Adjust Loyalty Points</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Type</label>
                  <select
                    value={loyaltyAdjust.type}
                    onChange={(e) => setLoyaltyAdjust({ ...loyaltyAdjust, type: e.target.value as 'add' | 'deduct' })}
                    className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                  >
                    <option value="add">Add Points</option>
                    <option value="deduct">Deduct Points</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Points</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={loyaltyAdjust.points}
                    onChange={(e) => setLoyaltyAdjust({ ...loyaltyAdjust, points: e.target.value })}
                    className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Description</label>
                  <input
                    value={loyaltyAdjust.description}
                    onChange={(e) => setLoyaltyAdjust({ ...loyaltyAdjust, description: e.target.value })}
                    className="w-full bg-card-hover border border-input-border rounded px-3 py-2 text-foreground text-sm"
                    placeholder="Reason for adjustment"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-foreground rounded text-sm font-medium">
                  {saving ? 'Adjusting...' : 'Apply'}
                </button>
                <button type="button" onClick={() => setShowLoyaltyAdjust(false)} className="px-4 py-2 bg-card-hover hover:bg-card-hover text-foreground rounded text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Loyalty history */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {!customer.loyalty_entries || customer.loyalty_entries.length === 0 ? (
              <p className="p-4 text-muted text-sm">No loyalty point activity yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-muted text-left">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium text-right">Points</th>
                    <th className="px-4 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.loyalty_entries.map((entry: LoyaltyEntry) => (
                    <tr key={entry.id} className="border-b border-card-border text-foreground">
                      <td className="px-4 py-3 text-foreground/70">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-card-hover text-foreground/70">
                          {entry.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground/70">{entry.description || '-'}</td>
                      <td className={`px-4 py-3 text-right font-medium ${entry.points >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                        {entry.points >= 0 ? '+' : ''}{entry.points}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">{entry.balance_after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
