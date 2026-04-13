'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Star, Loader2, Share2, Check } from 'lucide-react';

interface WishlistItem {
  id: string;
  gameTitle: string;
  bggId?: number;
  priority: number;
  notes?: string;
  addedAt: string;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Must have', color: '#ef4444' },
  2: { label: 'Want', color: '#FF8200' },
  3: { label: 'Interested', color: '#3b82f6' },
  4: { label: 'Maybe someday', color: '#6b7280' },
};

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ gameTitle: '', priority: 3, notes: '' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchWishlist = async () => {
    const res = await fetch('/api/wishlist');
    if (res.ok) { const data = await res.json(); setItems(data.items); }
    setLoading(false);
  };

  useEffect(() => { fetchWishlist(); }, []);

  const handleAdd = async () => {
    if (!form.gameTitle.trim()) return;
    setSaving(true);
    await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ gameTitle: '', priority: 3, notes: '' });
    setShowForm(false);
    setSaving(false);
    fetchWishlist();
  };

  const handleRemove = async (id: string) => {
    await fetch(`/api/wishlist?id=${id}`, { method: 'DELETE' });
    fetchWishlist();
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/wishlist/share`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#FF8200', margin: 0 }}>
          Wishlist
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {items.length > 0 && (
            <button onClick={handleShare}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.5rem 0.75rem', background: '#1f2937',
                border: '1px solid #374151', borderRadius: '6px',
                color: copied ? '#10b981' : '#9ca3af', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
              }}>
              {copied ? <><Check size={14} /> Copied!</> : <><Share2 size={14} /> Share</>}
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.5rem 1rem', background: '#FF8200', border: 'none', borderRadius: '6px',
              color: '#0a0a0a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}>
            <Plus size={16} /> Add game
          </button>
        </div>
      </div>
      <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
        Games you want. Share this list with family for gift ideas,
        or let stores see it when you scan your Passport.
      </p>

      {/* Add form */}
      {showForm && (
        <div style={{
          background: '#1f2937', borderRadius: '12px', padding: '1.25rem',
          border: '2px solid #FF8200', marginBottom: '1.5rem',
        }}>
          <input placeholder="Game title *" value={form.gameTitle} onChange={(e) => setForm({ ...form, gameTitle: e.target.value })}
            autoFocus
            style={{ width: '100%', padding: '0.6rem 0.75rem', background: '#0a0a0a', border: '1px solid #374151', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {Object.entries(PRIORITY_LABELS).map(([val, { label, color }]) => (
              <button key={val} onClick={() => setForm({ ...form, priority: Number(val) })}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  background: form.priority === Number(val) ? `${color}20` : 'transparent',
                  border: `1px solid ${form.priority === Number(val) ? color : '#374151'}`,
                  color: form.priority === Number(val) ? color : '#6b7280',
                }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleAdd} disabled={!form.gameTitle.trim() || saving}
              style={{
                padding: '0.6rem 1.25rem', background: form.gameTitle.trim() ? '#FF8200' : '#374151',
                border: 'none', borderRadius: '6px', color: '#0a0a0a', fontWeight: 700, fontSize: '0.85rem',
                cursor: form.gameTitle.trim() ? 'pointer' : 'not-allowed',
              }}>
              {saving ? 'Adding...' : 'Add to wishlist'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '0.6rem 1rem', background: '#374151', border: 'none', borderRadius: '6px', color: '#9ca3af', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Wishlist items */}
      {items.length === 0 ? (
        <div style={{ padding: '3rem', background: '#1f2937', borderRadius: '12px', textAlign: 'center', color: '#6b7280' }}>
          <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>Your wishlist is empty</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>Add games you want — share the list with family or let stores see it at checkout.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((item) => {
            const pri = PRIORITY_LABELS[item.priority] || PRIORITY_LABELS[3];
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem', background: '#1f2937', borderRadius: '8px',
                borderLeft: `3px solid ${pri.color}`,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>{item.gameTitle}</span>
                    <span style={{ color: pri.color, fontSize: '0.7rem', fontWeight: 700 }}>{pri.label}</span>
                  </div>
                  {item.notes && <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>{item.notes}</p>}
                </div>
                <button onClick={() => handleRemove(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#4b5563' }}>
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <p style={{ color: '#4b5563', fontSize: '0.75rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
            {items.length} game{items.length !== 1 ? 's' : ''} on your wishlist
          </p>
        </div>
      )}
    </div>
  );
}
