'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, X, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface Loan {
  id: string;
  gameTitle: string;
  borrowerName: string;
  borrowerContact?: string;
  lentAt: string;
  dueDate?: string;
  returnedAt?: string;
  condition?: string;
  notes?: string;
}

export default function LoansPage() {
  const [loans, setLoans] = useState<{ active: Loan[]; returned: Loan[] }>({ active: [], returned: [] });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ gameTitle: '', borrowerName: '', borrowerContact: '', dueDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchLoans = async () => {
    const res = await fetch('/api/loans');
    if (res.ok) setLoans(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchLoans(); }, []);

  const handleLend = async () => {
    if (!form.gameTitle.trim() || !form.borrowerName.trim()) return;
    setSaving(true);
    await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ gameTitle: '', borrowerName: '', borrowerContact: '', dueDate: '', notes: '' });
    setShowForm(false);
    setSaving(false);
    fetchLoans();
  };

  const handleReturn = async (id: string) => {
    await fetch('/api/loans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchLoans();
  };

  const daysSince = (date: string) => Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  const isOverdue = (loan: Loan) => loan.dueDate && !loan.returnedAt && new Date(loan.dueDate) < new Date();

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#FF8200', margin: 0 }}>
          Game Loans
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 1rem',
            background: '#FF8200', border: 'none', borderRadius: '6px',
            color: '#0a0a0a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Lend a game
        </button>
      </div>
      <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
        Track who has your games and when they&apos;re coming back.
      </p>

      {/* New loan form */}
      {showForm && (
        <div style={{
          background: '#1f2937', borderRadius: '12px', padding: '1.25rem',
          border: '2px solid #FF8200', marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <input placeholder="Game title *" value={form.gameTitle} onChange={(e) => setForm({ ...form, gameTitle: e.target.value })}
              style={{ padding: '0.6rem 0.75rem', background: '#0a0a0a', border: '1px solid #374151', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none' }} />
            <input placeholder="Borrower name *" value={form.borrowerName} onChange={(e) => setForm({ ...form, borrowerName: e.target.value })}
              style={{ padding: '0.6rem 0.75rem', background: '#0a0a0a', border: '1px solid #374151', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none' }} />
            <input placeholder="Contact (email/phone)" value={form.borrowerContact} onChange={(e) => setForm({ ...form, borrowerContact: e.target.value })}
              style={{ padding: '0.6rem 0.75rem', background: '#0a0a0a', border: '1px solid #374151', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none' }} />
            <input type="date" placeholder="Due date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              style={{ padding: '0.6rem 0.75rem', background: '#0a0a0a', border: '1px solid #374151', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleLend} disabled={!form.gameTitle.trim() || !form.borrowerName.trim() || saving}
              style={{
                padding: '0.6rem 1.25rem', background: form.gameTitle.trim() && form.borrowerName.trim() ? '#FF8200' : '#374151',
                border: 'none', borderRadius: '6px', color: '#0a0a0a', fontWeight: 700, fontSize: '0.85rem',
                cursor: form.gameTitle.trim() && form.borrowerName.trim() ? 'pointer' : 'not-allowed',
              }}>
              {saving ? 'Saving...' : 'Record loan'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '0.6rem 1rem', background: '#374151', border: 'none', borderRadius: '6px', color: '#9ca3af', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active loans */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
        Currently out ({loans.active.length})
      </h2>
      {loans.active.length === 0 ? (
        <div style={{ padding: '2rem', background: '#1f2937', borderRadius: '12px', textAlign: 'center', color: '#6b7280', marginBottom: '2rem' }}>
          No games currently lent out. Your shelf is complete.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
          {loans.active.map((loan) => (
            <div key={loan.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.75rem 1rem', background: '#1f2937', borderRadius: '8px',
              border: isOverdue(loan) ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #374151',
              flexWrap: 'wrap', gap: '0.5rem',
            }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>{loan.gameTitle}</span>
                  {isOverdue(loan) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#ef4444', fontSize: '0.7rem', fontWeight: 700 }}>
                      <AlertCircle size={12} /> Overdue
                    </span>
                  )}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                  → {loan.borrowerName} · {daysSince(loan.lentAt)} days ago
                  {loan.dueDate && ` · Due ${new Date(loan.dueDate).toLocaleDateString()}`}
                </div>
              </div>
              <button onClick={() => handleReturn(loan.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.4rem 0.75rem', background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px',
                  color: '#10b981', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                }}>
                <Check size={14} /> Returned
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Returned history */}
      {loans.returned.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
            History ({loans.returned.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {loans.returned.slice(0, 20).map((loan) => (
              <div key={loan.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 1rem', background: '#1f2937', borderRadius: '6px',
                opacity: 0.6,
              }}>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{loan.gameTitle} → {loan.borrowerName}</span>
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  {daysSince(loan.lentAt)} days · returned {new Date(loan.returnedAt!).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
