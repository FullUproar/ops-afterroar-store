'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Loader2, Check, ArrowRight } from 'lucide-react';

const SCOPES = [
  { icon: '👤', label: 'Identity', desc: 'Name, email, Passport code', hint: null },
  { icon: '⭐', label: 'Wishlist', desc: 'Games they want — match to your stock', hint: null },
  { icon: '📚', label: 'Library', desc: 'Games they already own — avoid suggesting duplicates', hint: 'Collection-based recommendations coming soon' },
  { icon: '🏅', label: 'Reputation & badges', desc: 'Verified status, community standing', hint: 'Cross-store verification coming soon' },
  { icon: '🎯', label: 'Loyalty points', desc: 'Award and read your own store\'s points', hint: 'Federated points across stores coming soon' },
];

export function ConnectLanding({ signedIn }: { signedIn: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'store',
    contactEmail: '',
    contactName: '',
    contactPhone: '',
    websiteUrl: '',
    city: '',
    state: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.contactEmail.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/entities/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main style={{ maxWidth: '36rem', margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', lineHeight: 1, marginBottom: '1rem' }}>✓</div>
        <h1 style={{ color: '#10b981', fontSize: '1.75rem', fontWeight: 900, margin: '0 0 0.75rem' }}>
          Application received
        </h1>
        <p style={{ color: '#e2e8f0', marginBottom: '2rem' }}>
          We&apos;ll review <strong style={{ color: '#FBDB65' }}>{form.name}</strong> and reach out within 1-2 business days.
          Early Connect partners get hands-on onboarding.
        </p>
        <Link href="/" style={{ color: '#FF8200' }}>← Back to Passport</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '56rem', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <p style={{ color: '#FF8200', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 0.75rem' }}>
          Afterroar Connect
        </p>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 900, color: '#FBDB65', margin: '0 0 1rem', lineHeight: 1.1 }}>
          Know every customer. With their permission.
        </h1>
        <p style={{ color: '#e2e8f0', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: '36rem', margin: '0 auto' }}>
          When a customer scans their Passport at your store, you see what they want, what they own,
          and what they&apos;re loyal to — because they chose to share it with you.
        </p>
      </div>

      {/* What you get */}
      <div style={{
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '16px',
        padding: '2rem 1.5rem',
        marginBottom: '2.5rem',
      }}>
        <h2 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1.25rem', textAlign: 'center' }}>
          With each customer&apos;s consent, you can see:
        </h2>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {SCOPES.map((s) => (
            <div key={s.label} style={{
              display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
              padding: '0.75rem 0.85rem',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '10px',
            }}>
              <div style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem' }}>{s.label}</p>
                <p style={{ margin: '0.15rem 0 0', color: '#9ca3af', fontSize: '0.85rem' }}>{s.desc}</p>
                {s.hint && (
                  <p style={{ margin: '0.35rem 0 0', color: '#FF8200', fontSize: '0.7rem', fontStyle: 'italic' }}>
                    {s.hint}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '2.5rem',
      }}>
        <div style={stepStyle}>
          <div style={stepNum}>1</div>
          <h3 style={stepTitle}>Apply</h3>
          <p style={stepDesc}>Tell us about your store. We approve each Connect partner manually during beta.</p>
        </div>
        <div style={stepStyle}>
          <div style={stepNum}>2</div>
          <h3 style={stepTitle}>Customers opt in</h3>
          <p style={stepDesc}>They scan, see what you&apos;re asking for, and approve (or don&apos;t). You never see anything without explicit consent.</p>
        </div>
        <div style={stepStyle}>
          <div style={stepNum}>3</div>
          <h3 style={stepTitle}>Better service</h3>
          <p style={stepDesc}>At checkout, see their wishlist matches in stock. Skip the duplicates. Award loyalty without paperwork.</p>
        </div>
      </div>

      {/* Price */}
      <div style={{
        background: 'rgba(255, 130, 0, 0.06)',
        border: '2px solid rgba(255, 130, 0, 0.3)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '2.5rem',
        textAlign: 'center',
      }}>
        <p style={{ color: '#FF8200', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>
          Beta pricing
        </p>
        <p style={{ color: '#FBDB65', fontSize: '1.5rem', fontWeight: 900, margin: '0 0 0.5rem' }}>
          $49/month
        </p>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>
          Free during beta through August 2026. Cancel anytime.
        </p>
      </div>

      {/* Credo nod — concise, not commercial */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', maxWidth: '32rem', margin: '0 auto' }}>
          Customer data belongs to the customer. We built the whole platform on that principle.{' '}
          <Link href="/credo" style={{ color: '#FF8200', textDecoration: 'none' }}>Read the Credo</Link>
        </p>
      </div>

      {/* CTA */}
      {!showForm && (
        <div style={{ textAlign: 'center' }}>
          {signedIn ? (
            <button onClick={() => setShowForm(true)} style={ctaButton}>
              Apply for Connect <ArrowRight size={18} />
            </button>
          ) : (
            <div>
              <button
                onClick={() => signIn('google', { callbackUrl: '/store' })}
                style={ctaButton}
              >
                Sign in to apply <ArrowRight size={18} />
              </button>
              <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '1rem 0 0' }}>
                Sign in with the Google account you want tied to your store.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Application form */}
      {showForm && signedIn && (
        <form onSubmit={handleSubmit} style={{
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: '16px',
          padding: '2rem 1.5rem',
        }}>
          <h2 style={{ color: '#FBDB65', fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.5rem' }}>
            Tell us about your store
          </h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <Field label="Store name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required placeholder="Level Up Games" />
            <Field label="Contact email *" type="email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} required placeholder="greg@levelup.games" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Your name" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} placeholder="Greg" />
              <Field label="Phone (optional)" value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} placeholder="555-555-5555" />
            </div>
            <Field label="Website" value={form.websiteUrl} onChange={(v) => setForm({ ...form, websiteUrl: v })} placeholder="https://levelup.games" />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="Portland" />
              <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} placeholder="OR" />
              <SelectField label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[
                { value: 'store', label: 'Game store' },
                { value: 'venue', label: 'Venue / cafe' },
                { value: 'organizer', label: 'Event organizer' },
                { value: 'publisher', label: 'Publisher' },
                { value: 'creator', label: 'Content creator' },
              ]} />
            </div>
            <TextAreaField label="Tell us about your store" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="FLGS in Portland. 4 years running. TCG focus, Magic primarily, some board games." />
          </div>

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '1rem 0 0' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" onClick={() => setShowForm(false)} style={{
              padding: '0.75rem 1.25rem', background: '#374151', border: 'none', borderRadius: '8px',
              color: '#9ca3af', fontWeight: 600, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !form.name.trim() || !form.contactEmail.trim()} style={{
              flex: 1,
              padding: '0.75rem 1.25rem',
              background: (!form.name.trim() || !form.contactEmail.trim()) ? '#374151' : '#FF8200',
              border: 'none', borderRadius: '8px',
              color: (!form.name.trim() || !form.contactEmail.trim()) ? '#6b7280' : '#0a0a0a',
              fontWeight: 700, fontSize: '0.95rem',
              cursor: submitting ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}>
              {submitting ? (<><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Submitting</>) : (<><Check size={16} /> Submit application</>)}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

function Field({ label, value, onChange, required, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} style={fieldInput} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldInput, appearance: 'none' }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...fieldInput, resize: 'vertical', minHeight: '80px' }} />
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'block', color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem',
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  background: '#0a0a0a',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const ctaButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.9rem 2rem',
  background: 'linear-gradient(135deg, #FF8200, #d97706)',
  border: 'none', borderRadius: '10px',
  color: '#0a0a0a',
  fontWeight: 900, fontSize: '1rem',
  cursor: 'pointer',
  boxShadow: '0 6px 20px rgba(255, 130, 0, 0.3)',
};

const stepStyle: React.CSSProperties = {
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '12px',
  padding: '1.25rem 1rem',
};

const stepNum: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '50%',
  background: '#FF8200', color: '#0a0a0a',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 900, fontSize: '1rem', marginBottom: '0.75rem',
};

const stepTitle: React.CSSProperties = {
  margin: '0 0 0.35rem', color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 700,
};

const stepDesc: React.CSSProperties = {
  margin: 0, color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1.5,
};
