export const metadata = {
  title: 'Terms of Service — Afterroar',
  description: 'Terms of service for the Afterroar platform, Passport, and related services.',
};

export default function TermsPage() {
  return (
    <main style={{
      maxWidth: '48rem',
      margin: '0 auto',
      padding: '3rem 1.5rem',
      color: '#e2e8f0',
      lineHeight: 1.8,
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#FF8200', marginBottom: '0.5rem' }}>
        Terms of Service
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.85rem' }}>
        Last updated: April 12, 2026
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          What Afterroar is
        </h2>
        <p style={{ color: '#9ca3af' }}>
          Afterroar is a gaming identity and federation platform operated by Full Uproar
          Games, Inc. ("we," "us," "our"). It provides a cross-store player identity
          ("Passport"), loyalty points, event participation tracking, and a consent
          management system for the tabletop gaming community.
        </p>
        <p style={{ color: '#9ca3af' }}>
          By creating a Passport or using any Afterroar service, you agree to these terms.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          The Afterroar Credo
        </h2>
        <p style={{ color: '#9ca3af' }}>
          These terms are governed by the{' '}
          <a href="https://github.com/FullUproar/full-uproar-site/blob/main/docs/CREDO.md" style={{ color: '#FF8200' }}>
            Afterroar Credo
          </a>
          , which establishes the stakeholder ordering for all platform decisions:
          players first, store partners second, the federation third, the broader gaming
          ecosystem fourth, the business last. When these terms conflict with the Credo,
          the Credo governs.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Your account
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem' }}>
          <li>You must be at least 13 years old to create a Passport.</li>
          <li>You are responsible for keeping your sign-in credentials secure.</li>
          <li>You may delete your Passport and all associated data at any time via <a href="/settings" style={{ color: '#FF8200' }}>settings</a>.</li>
          <li>We may suspend or freeze accounts engaged in fraud, abuse, or behavior that harms other users or stores. Per the Credo, this is a last resort, not a first response.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Data and privacy
        </h2>
        <p style={{ color: '#9ca3af' }}>
          Your data is governed by our <a href="/privacy" style={{ color: '#FF8200' }}>Privacy Policy</a>.
          The short version: your data belongs to you. You can see it, export it, and
          delete it anytime. We never sell it.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Loyalty points
        </h2>
        <ul style={{ color: '#9ca3af', paddingLeft: '1.5rem' }}>
          <li>Points are earned through participation (check-ins, purchases, events, tournaments) at participating stores.</li>
          <li>Points have no cash value and cannot be exchanged for currency.</li>
          <li>Point balances and redemption rules vary by store tier. Some stores accept network-wide points; others restrict points to their own store. See your <a href="/points" style={{ color: '#FF8200' }}>points page</a> for your current balances.</li>
          <li>We reserve the right to adjust point balances in cases of verified fraud or system error.</li>
          <li>If you delete your Passport, your point balances are forfeited.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Third-party stores and apps
        </h2>
        <p style={{ color: '#9ca3af' }}>
          When you authorize a store or app to access your Passport via "Log in with
          Afterroar," that store or app receives only the data you consented to share.
          We are not responsible for how third-party stores or apps use your data after
          you've shared it with them. You can revoke access anytime, but revocation
          does not guarantee deletion of data already transferred — see our{' '}
          <a href="/privacy" style={{ color: '#FF8200' }}>Privacy Policy</a> for details.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Limitation of liability
        </h2>
        <p style={{ color: '#9ca3af' }}>
          Afterroar is provided "as is." We do our best to keep the platform secure,
          available, and accurate, but we cannot guarantee uninterrupted service or
          error-free operation. We are not liable for losses resulting from platform
          downtime, data inaccuracies, or actions taken by third-party stores or apps.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Changes to these terms
        </h2>
        <p style={{ color: '#9ca3af' }}>
          We may update these terms as the platform evolves. Material changes will be
          communicated via the platform (in-app notification or email to your registered
          address, if you've consented to platform communications). Continued use of
          Afterroar after a change constitutes acceptance.
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Contact
        </h2>
        <p style={{ color: '#9ca3af' }}>
          Questions about these terms:{' '}
          <a href="mailto:afterroar@fulluproar.com" style={{ color: '#FF8200' }}>afterroar@fulluproar.com</a>
        </p>
        <p style={{ color: '#9ca3af' }}>
          Full Uproar Games, Inc., South Bend, Indiana, USA.
        </p>
      </section>

      <div style={{ borderTop: '1px solid #1f2937', paddingTop: '1.5rem', marginTop: '2rem' }}>
        <p style={{ color: '#4b5563', fontSize: '0.8rem', textAlign: 'center' }}>
          These terms exist to protect you and the community, not to protect us from you.
          If something in here feels wrong, tell us — afterroar@fulluproar.com.
        </p>
      </div>
    </main>
  );
}
