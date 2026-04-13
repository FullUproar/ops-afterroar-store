export const metadata = {
  title: 'The Afterroar Credo',
  description: 'The five-tier stakeholder hierarchy that governs every Afterroar platform decision. Players first, always.',
};

export default function CredoPage() {
  const tiers = [
    {
      rank: '1',
      who: 'Players',
      principle: 'Your data belongs to you. Your identity is yours. Every feature, every policy, every line of code answers to you first.',
      color: '#FF8200',
    },
    {
      rank: '2',
      who: 'Store owners',
      principle: 'The stores that build community deserve tools that respect them — fair pricing, no vendor lock-in, no hidden fees, no surveillance of their customers.',
      color: '#e2e8f0',
    },
    {
      rank: '3',
      who: 'The federation',
      principle: 'Afterroar belongs to its participants, not its publisher. Governance decisions prioritize the health of the network over any single member.',
      color: '#e2e8f0',
    },
    {
      rank: '4',
      who: 'The broader gaming ecosystem',
      principle: 'A rising tide lifts all ships. Afterroar should make tabletop gaming better for everyone, not just its members.',
      color: '#9ca3af',
    },
    {
      rank: '5',
      who: 'The business',
      principle: 'Full Uproar Games, Inc. operates under this Credo like every other participant. The company comes last. If the business can\'t survive while honoring this order, the model is wrong — not the Credo.',
      color: '#6b7280',
    },
  ];

  return (
    <main style={{
      maxWidth: '48rem',
      margin: '0 auto',
      padding: '3rem 1.5rem',
      color: '#e2e8f0',
      lineHeight: 1.8,
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#FF8200', marginBottom: '0.5rem' }}>
        The Afterroar Credo
      </h1>
      <p style={{ color: '#9ca3af', marginBottom: '2.5rem', fontSize: '0.95rem' }}>
        Every decision on this platform — product, policy, code, business — follows
        this stakeholder hierarchy. When priorities conflict, the higher tier wins. No exceptions.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '3rem' }}>
        {tiers.map((tier) => (
          <div key={tier.rank} style={{
            display: 'flex',
            gap: '1.25rem',
            alignItems: 'flex-start',
            padding: '1.25rem',
            background: '#1f2937',
            borderRadius: '8px',
            borderLeft: `3px solid ${tier.color}`,
          }}>
            <span style={{
              fontSize: '1.75rem',
              fontWeight: 900,
              color: tier.color,
              lineHeight: 1,
              minWidth: '2rem',
              textAlign: 'center',
            }}>
              {tier.rank}
            </span>
            <div>
              <p style={{ fontWeight: 700, color: tier.color, margin: '0 0 0.35rem 0', fontSize: '1rem' }}>
                {tier.who}
              </p>
              <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.875rem', lineHeight: 1.7 }}>
                {tier.principle}
              </p>
            </div>
          </div>
        ))}
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          What this means for you
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
          <li>Your data is never sold, shared with advertisers, or used for behavioral targeting.</li>
          <li>You can see everything we know about you, export it, and delete it — anytime, no questions.</li>
          <li>No store — including Full Uproar Games — gets back-door access to your data.</li>
          <li>When these principles conflict with our Terms of Service, the Credo governs.</li>
        </ul>
      </section>

      <div style={{
        borderTop: '1px solid #1f2937',
        paddingTop: '1.5rem',
        marginTop: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <p style={{ color: '#4b5563', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Questions about the Credo? Think something should change?{' '}
          <a href="mailto:afterroar@fulluproar.com" style={{ color: '#FF8200' }}>
            afterroar@fulluproar.com
          </a>
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
          <a href="/" style={{ color: '#FF8200', textDecoration: 'none' }}>← Home</a>
          <a href="/privacy" style={{ color: '#6b7280', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>Terms</a>
          <a href="/login" style={{ color: '#6b7280', textDecoration: 'none' }}>Sign in</a>
        </div>
      </div>
    </main>
  );
}
