import { MarketingPage, ChromeNav } from '@/app/components/card-shell';
import { TYPE } from '@/app/components/ui';

export const metadata = {
  title: 'Terms of Service — Afterroar',
  description: 'Terms of service for the Afterroar platform, Passport, and related services.',
};

const h2: React.CSSProperties = { ...TYPE.displayMd, fontSize: '1.25rem', color: 'var(--cream)', marginBottom: '0.5rem', marginTop: '2rem' };
const p: React.CSSProperties = { ...TYPE.body, color: 'var(--ink-soft)', lineHeight: 1.7, fontSize: '0.92rem' };
const ul: React.CSSProperties = { ...p, paddingLeft: '1.2rem' };
const a: React.CSSProperties = { color: 'var(--orange)' };

export default function TermsPage() {
  return (
    <>
      <ChromeNav signedIn={false} />
      <MarketingPage>
        <p style={{ ...TYPE.mono, color: 'var(--orange)', fontSize: '0.7rem', letterSpacing: '0.32em', textTransform: 'uppercase', margin: '0 0 0.5rem', fontWeight: 700 }}>
          Afterroar · Terms
        </p>
        <h1 style={{ ...TYPE.display, fontSize: 'clamp(2rem, 6vw, 3rem)', color: 'var(--cream)', margin: '0 0 0.4rem', lineHeight: 0.95 }}>Terms of Service</h1>
        <p style={{ ...TYPE.mono, color: 'var(--ink-faint)', marginBottom: '1.5rem', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Last updated: May 1, 2026
        </p>

        <h2 style={h2}>What Afterroar is</h2>
        <p style={p}>Afterroar is a tabletop gaming identity and federation platform operated by Full Uproar Games, Inc. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;). It provides a cross-store player identity (&ldquo;Passport&rdquo;), loyalty points, event participation tracking, and a consent management system for the tabletop gaming community.</p>
        <p style={p}>By creating a Passport or using any Afterroar service, you agree to these terms.</p>

        <h2 style={h2}>The Afterroar Credo</h2>
        <p style={p}>These terms are governed by <a href="/credo" style={a}>the Afterroar Credo</a>, which establishes the stakeholder ordering for all platform decisions: players first, store partners second, the federation third, the broader gaming ecosystem fourth, the business last. When these terms conflict with the Credo, the Credo governs.</p>

        <h2 style={h2}>Your account</h2>
        <ul style={ul}>
          <li>
            You must be at least 18 years old to create a Passport on your own. Players aged 13 to 17 may create a Passport with active parental or legal-guardian consent. Children under 13 cannot create a Passport at this time.
          </li>
          <li>You are responsible for keeping your sign-in credentials secure.</li>
          <li>You may delete your Passport and all associated data at any time via <a href="/data" style={a}>/data</a>.</li>
          <li>We may suspend or freeze accounts engaged in fraud, abuse, or behavior that harms other users or stores. Per the Credo, this is a last resort, not a first response.</li>
        </ul>

        <h2 style={h2}>Players aged 13–17</h2>
        <p style={p}>
          A parent or legal guardian must approve every account for a player under 18. The parent maintains an active Afterroar account and remains the responsible party for the minor account. By granting consent, the parent or legal guardian represents that they are exactly that — misrepresenting the relationship is a serious offense.
        </p>
        <p style={p}>
          Minor accounts inherit privacy-by-default settings: profile visibility is restricted to approved circles, direct messages from adults outside the approved circle are blocked, public game-night discovery is limited to events hosted by verified venues and tagged appropriate for the minor&apos;s age, and the minor cannot host public events. The parent may revoke consent at any time via the parent&apos;s settings, which pauses the minor account.
        </p>
        <p style={p}>
          If the parent&apos;s subscription lapses, the minor account is paused until renewed.
        </p>

        <h2 style={h2}>Public events at venues</h2>
        <p style={p}>
          Verified venue partners (game stores, libraries, cafes, bars) may publish public events on Afterroar. Each public venue event carries an audience tag — &ldquo;all-ages,&rdquo; &ldquo;13+,&rdquo; &ldquo;18+,&rdquo; or &ldquo;21+&rdquo; — set by the venue. <strong>The venue is solely responsible</strong> for determining the age-appropriateness of its events, complying with applicable laws governing minors on its premises, and verifying the age of attendees in person. Afterroar acts as a neutral hosting platform and is not liable for the content, conduct, or age compliance of any in-person event hosted by a venue.
        </p>
        <p style={p}>
          User-hosted public events (events hosted by individuals, not verified venues) are visible only to other identity-verified Pro members and are not visible to minor accounts under any circumstances.
        </p>

        <h2 style={h2}>Identity verification</h2>
        <p style={p}>
          Pro and Connect tiers require identity verification through our verification partner. We do not collect or retain biometric data; the verification partner handles document review under its own terms and does not share biometric identifiers with Afterroar.
        </p>

        <h2 style={h2}>Data and privacy</h2>
        <p style={p}>Your data is governed by our <a href="/privacy" style={a}>Privacy Policy</a>. The short version: your data belongs to you. You can see it, export it, and delete it anytime. We never sell it.</p>

        <h2 style={h2}>Loyalty points</h2>
        <ul style={ul}>
          <li>Points are earned through participation (check-ins, purchases, events, tournaments) at participating stores.</li>
          <li>Points have no cash value and cannot be exchanged for currency.</li>
          <li>Point balances and redemption rules vary by store tier. Some stores accept network-wide points; others restrict points to their own store. See your <a href="/points" style={a}>points page</a> for your current balances.</li>
          <li>We reserve the right to adjust point balances in cases of verified fraud or system error.</li>
          <li>If you delete your Passport, your point balances are forfeited.</li>
        </ul>

        <h2 style={h2}>Third-party stores and apps</h2>
        <p style={p}>When you authorize a store or app to access your Passport via &ldquo;Log in with Afterroar,&rdquo; that store or app receives only the data you consented to share. We are not responsible for how third-party stores or apps use your data after you&apos;ve shared it with them. You can revoke access anytime, but revocation does not guarantee deletion of data already transferred — see our <a href="/privacy" style={a}>Privacy Policy</a> for details.</p>

        <h2 style={h2}>Limitation of liability</h2>
        <p style={p}>Afterroar is provided &ldquo;as is.&rdquo; We do our best to keep the platform secure, available, and accurate, but we cannot guarantee uninterrupted service or error-free operation. We are not liable for losses resulting from platform downtime, data inaccuracies, or actions taken by third-party stores or apps.</p>

        <h2 style={h2}>Changes to these terms</h2>
        <p style={p}>We may update these terms as the platform evolves. Material changes will be communicated via the platform (in-app notification or email to your registered address, if you&apos;ve consented to platform communications). Continued use of Afterroar after a change constitutes acceptance.</p>

        <h2 style={h2}>Contact</h2>
        <p style={p}>Questions about these terms: <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a></p>
        <p style={p}>Full Uproar Games, Inc., South Bend, Indiana, USA.</p>

        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: '1.5rem', marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <p style={{ ...TYPE.body, color: 'var(--ink-faint)', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            These terms exist to protect you and the community, not to protect us from you. If something in here feels wrong, tell us — afterroar@fulluproar.com.
          </p>
          <div style={{ display: 'flex', gap: '1.2rem', ...TYPE.mono, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <a href="/" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 700 }}>← Home</a>
            <a href="/credo" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>The Credo</a>
            <a href="/privacy" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Privacy</a>
            <a href="/login" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Sign in</a>
          </div>
        </div>
      </MarketingPage>
    </>
  );
}
