import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const SECTIONS = [
  { href: '/library', label: 'Library', desc: 'Games you own. Add manually or scan a shelf.' },
  { href: '/wishlist', label: 'Wishlist', desc: 'Games you want — share with stores or family.' },
  { href: '/loans', label: 'Loans', desc: 'Track games you\'ve lent out. Never lose a copy again.' },
  { href: '/points', label: 'Points', desc: 'Loyalty balance per store, transaction history.' },
  { href: '/history', label: 'History', desc: 'Check-ins, events, tournaments — your activity log.' },
  { href: '/stores', label: 'Stores', desc: 'Find stores using Afterroar near you.' },
  { href: '/settings', label: 'Settings', desc: 'Identity, badges, connected stores, consent toggles.' },
  { href: '/data', label: 'Data', desc: 'Export everything as JSON. Delete anytime.' },
];

export default function DashboardHub() {
  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#FBDB65', margin: '0 0 0.4rem' }}>
        Dashboard
      </h1>
      <p style={{ color: '#9ca3af', fontSize: '0.95rem', margin: '0 0 2rem' }}>
        Your Passport, in detail.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '0.75rem',
      }}>
        {SECTIONS.map(({ href, label, desc }) => (
          <Link key={href} href={href} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            padding: '1.1rem 1.25rem',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '10px',
            color: '#e2e8f0',
            textDecoration: 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{label}</p>
              <p style={{ margin: '0.2rem 0 0', color: '#9ca3af', fontSize: '0.78rem', lineHeight: 1.4 }}>
                {desc}
              </p>
            </div>
            <ArrowRight size={18} strokeWidth={2} style={{ color: '#FF8200', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
