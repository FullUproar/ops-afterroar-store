import type { Metadata } from 'next';
import { MarketingPage, ChromeNav } from '@/app/components/card-shell';
import { TYPE } from '@/app/components/ui';

export const metadata: Metadata = {
  title: 'Parents — Afterroar',
  description:
    "How parental consent and account oversight work on Afterroar. For parents of players aged 13 to 17 considering an account.",
};

const h2: React.CSSProperties = {
  ...TYPE.displayMd,
  fontSize: '1.35rem',
  color: 'var(--cream)',
  marginBottom: '0.65rem',
  marginTop: '2.25rem',
};
const h3: React.CSSProperties = {
  ...TYPE.display,
  fontSize: '1.05rem',
  color: 'var(--cream)',
  marginBottom: '0.4rem',
  marginTop: '1.25rem',
};
const p: React.CSSProperties = {
  ...TYPE.body,
  color: 'var(--ink-soft)',
  lineHeight: 1.7,
  fontSize: '0.95rem',
};
const ul: React.CSSProperties = { ...p, paddingLeft: '1.2rem' };
const a: React.CSSProperties = { color: 'var(--orange)' };
const screenshotPlaceholder: React.CSSProperties = {
  width: '100%',
  maxWidth: '32rem',
  margin: '1rem 0',
  padding: '4rem 1rem',
  background: 'rgba(255, 130, 0, 0.05)',
  border: '2px dashed rgba(255, 130, 0, 0.3)',
  borderRadius: '0.6rem',
  textAlign: 'center',
  color: 'var(--ink-faint)',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '0.78rem',
  letterSpacing: '0.04em',
};

/**
 * Public parent help page. Intentionally not behind a login wall — the
 * audience is parents who haven't signed up yet and are deciding whether
 * to consent for their kid. Walks through the consent flow, the two
 * paths (Free + verification or Pro with monitoring), what monitoring
 * actually shows, and how to revoke consent.
 *
 * Screenshot placeholders are TODO; will be filled in once the consent
 * flow renders cleanly enough to capture clean shots.
 */
export default function ParentsPage() {
  return (
    <>
      <ChromeNav signedIn={false} />
      <MarketingPage>
        <p
          style={{
            ...TYPE.mono,
            color: 'var(--orange)',
            fontSize: '0.7rem',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            margin: '0 0 0.5rem',
            fontWeight: 700,
          }}
        >
          Afterroar · Parents
        </p>
        <h1
          style={{
            ...TYPE.display,
            fontSize: 'clamp(2rem, 6vw, 3rem)',
            color: 'var(--cream)',
            margin: '0 0 0.4rem',
            lineHeight: 0.95,
          }}
        >
          For Parents
        </h1>
        <p style={{ ...p, fontSize: '1rem', marginTop: '0.75rem' }}>
          Your kid wants to set up an Afterroar Passport. Here&apos;s what that means, what
          we ask of you, and what we do (and don&apos;t do) to keep them safe.
        </p>

        <h2 style={h2}>The short version</h2>
        <p style={p}>
          Afterroar is a tabletop gaming Passport. Players use it to find local game stores,
          track the games they play, and earn badges for showing up at events. We require
          parental consent for any account holder under 18.
        </p>
        <p style={p}>
          When your child sends you a consent request, you&apos;ll need to:
        </p>
        <ul style={ul}>
          <li>Set up your own Afterroar account (the inform path back to you)</li>
          <li>Verify your identity (one quick photo of your ID via Persona)</li>
          <li>Choose how to maintain consent: a <strong>$5 one-time verification fee</strong> or a <strong>$5/month Pro subscription</strong> (which adds activity monitoring)</li>
          <li>Confirm you&apos;re the parent or legal guardian</li>
        </ul>
        <p style={p}>
          That&apos;s the whole flow. Once it&apos;s done, your kid&apos;s Passport activates
          and they can use Afterroar within the limits we describe below.
        </p>

        <h2 style={h2}>The consent flow, step by step</h2>

        <h3 style={h3}>1. Your kid starts the request</h3>
        <p style={p}>
          On the signup page they pick &quot;13 to 17&quot; from the age question. We ask
          for their email, their display name, and your email. We never collect a
          date of birth from them at this stage — that&apos;s deliberately minimal.
        </p>
        <div style={screenshotPlaceholder}>[ screenshot: kid&apos;s signup form ]</div>

        <h3 style={h3}>2. You get an email</h3>
        <p style={p}>
          We email you with a one-time approval link. The email is clearly identified as
          coming from Afterroar; if you didn&apos;t expect it, you can safely ignore it
          and no account will be created.
        </p>
        <div style={screenshotPlaceholder}>[ screenshot: parent consent email ]</div>

        <h3 style={h3}>3. You sign in or create your account</h3>
        <p style={p}>
          Click the link, and we&apos;ll walk you through setting up your own Afterroar
          account if you don&apos;t already have one. Email + password or Google sign-in,
          your choice.
        </p>

        <h3 style={h3}>4. You verify your identity</h3>
        <p style={p}>
          We use Persona to verify ID. It&apos;s a quick photo of a government-issued ID
          (driver&apos;s license, passport, etc.) and a selfie. <strong>We don&apos;t
          store biometric data on Afterroar&apos;s side</strong>; Persona handles the
          comparison, returns a yes/no, and we keep only the result.
        </p>
        <div style={screenshotPlaceholder}>[ screenshot: Persona ID flow ]</div>

        <h3 style={h3}>5. You choose a path</h3>
        <p style={p}>Two options, both fully approve your kid&apos;s account:</p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '0.75rem',
            margin: '1rem 0',
          }}
        >
          <div
            style={{
              padding: '1.1rem 1.2rem',
              background: 'var(--panel-mute)',
              border: '1.5px solid var(--rule)',
              borderRadius: '0.6rem',
            }}
          >
            <div style={{ ...TYPE.display, fontSize: '0.95rem', color: 'var(--ink-soft)', fontWeight: 700 }}>
              Free path
            </div>
            <div style={{ ...TYPE.display, fontSize: '1.5rem', color: 'var(--cream)', fontWeight: 800, margin: '0.25rem 0' }}>
              $5 once
            </div>
            <p style={{ ...p, fontSize: '0.86rem', margin: 0 }}>
              Covers our Persona ID-check cost. Approves your kid&apos;s account. Your
              own Afterroar account stays free, no recurring charges.
            </p>
            <p style={{ ...p, fontSize: '0.85rem', margin: '0.6rem 0 0', color: 'var(--ink-faint)' }}>
              You won&apos;t see your kid&apos;s in-app activity, but you have an
              inform path through your account email.
            </p>
          </div>

          <div
            style={{
              padding: '1.1rem 1.2rem',
              background: 'rgba(255, 130, 0, 0.05)',
              border: '1.5px solid rgba(255, 130, 0, 0.4)',
              borderRadius: '0.6rem',
            }}
          >
            <div style={{ ...TYPE.display, fontSize: '0.95rem', color: 'var(--orange)', fontWeight: 700 }}>
              Pro path · Monitored
            </div>
            <div style={{ ...TYPE.display, fontSize: '1.5rem', color: 'var(--cream)', fontWeight: 800, margin: '0.25rem 0' }}>
              $5/mo
            </div>
            <p style={{ ...p, fontSize: '0.86rem', margin: 0 }}>
              First month covers the consent fee. You get the parent monitoring
              dashboard plus all your own Pro perks (verified badge, public hosting,
              larger crews, etc.).
            </p>
            <p style={{ ...p, fontSize: '0.85rem', margin: '0.6rem 0 0', color: 'var(--ink-faint)' }}>
              Cancel any time. If your subscription lapses, you lose monitoring but
              your kid&apos;s account stays active.
            </p>
          </div>
        </div>

        <h2 style={h2}>Passport is identity. The apps are separate.</h2>
        <p style={p}>
          This is the most important thing to understand about how Afterroar works:
          your child&apos;s Passport is an <strong>identity layer</strong>. They use that
          identity to sign in to gaming apps and check in at participating game stores.
          Each app and each store is a separate service with its own data and its own
          privacy policies. Afterroar doesn&apos;t see inside those apps; we just provide
          the sign-in.
        </p>
        <p style={p}>
          What that means for parental oversight: the Pro monitoring dashboard at{' '}
          <a href="/parent-dashboard" style={a}>/parent-dashboard</a> shows what your kid
          is doing <em>at the Passport level</em>, not what they&apos;re doing inside any
          individual app.
        </p>

        <h2 style={h2}>What the Pro dashboard shows</h2>
        <p style={p}>Identity-level activity that Afterroar (the Passport platform) records:</p>
        <ul style={ul}>
          <li><strong>Where they&apos;re using their Passport</strong>: which apps they&apos;ve signed in to, which stores they&apos;ve checked in at</li>
          <li><strong>Badges earned</strong> across the network</li>
          <li><strong>Loyalty points</strong> and store memberships at participating stores</li>
          <li><strong>Account-level alerts</strong>: new device sign-in, identity changes, parent-relevant notifications from the apps your kid uses (when those apps choose to surface them to Passport)</li>
        </ul>
        <div style={screenshotPlaceholder}>[ screenshot: parent dashboard view ]</div>

        <h2 style={h2}>What the dashboard does NOT show</h2>
        <p style={p}>
          The dashboard does <strong>not</strong> show what your kid does inside any
          individual app. Each app is its own service:
        </p>
        <ul style={ul}>
          <li>Activity inside Game Night HQ (RSVPs, chats, photos, crews, recaps) is held by HQ, not Passport</li>
          <li>Activity inside any third-party app that uses Passport for sign-in is held by that app</li>
          <li>Purchases or behavior inside individual game stores is held by those stores</li>
        </ul>
        <p style={p}>
          For oversight inside a specific app, you&apos;ll want to engage with that app
          directly. Each app the kid signs into shows up on the Passport dashboard with a
          link to that app&apos;s parent help page (if they offer one) or contact info so
          you can ask questions.
        </p>
        <p style={p}>
          Why we built it this way: Afterroar&apos;s job is identity. Surveillance across
          a federated network of apps is the wrong shape — it would centralize data we
          shouldn&apos;t hold and create a target for attackers. Each app is responsible
          for its own data and its own parental tools, and we&apos;re responsible for the
          identity layer underneath. If you want stronger oversight, layer Afterroar with
          whatever family-controls software fits your situation.
        </p>

        <h2 style={h2}>Privacy by default for minor accounts</h2>
        <p style={p}>
          Whether you choose Free or Pro path, every minor account on Afterroar runs
          with the most restrictive privacy settings by default:
        </p>
        <ul style={ul}>
          <li><strong>Profile is Circle-only.</strong> Only people they&apos;ve approved into their Circle can see their profile, activity, or game-night attendance.</li>
          <li><strong>No DMs from adults outside their Circle.</strong> An 18+ user they&apos;ve never met can&apos;t message them at all.</li>
          <li><strong>Public game-night discovery is restricted</strong> to events at verified venues (game stores, libraries, cafes) tagged appropriate for their age. They can&apos;t stumble into a public event at a private home.</li>
          <li><strong>They can&apos;t host public events.</strong> That requires identity verification, which is 18+ only.</li>
          <li><strong>21+ events are invisible</strong> to them.</li>
        </ul>

        <h2 style={h2}>How to revoke consent</h2>
        <p style={p}>
          You can revoke parental consent any time:
        </p>
        <ul style={ul}>
          <li>From your Afterroar account settings, under Linked Accounts</li>
          <li>By deleting your own Afterroar account (your kid&apos;s account also goes)</li>
          <li>By emailing <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a> if you&apos;re locked out for any reason</li>
        </ul>
        <p style={p}>
          When consent is revoked, your kid&apos;s account is paused immediately. They
          can&apos;t sign in, post, RSVP, or be discoverable. After 30 days the data is
          permanently deleted unless consent is restored.
        </p>

        <h2 style={h2}>What happens when your kid turns 18</h2>
        <p style={p}>
          On their 18th birthday, the parental link auto-detaches. Their account becomes
          a standalone adult account governed by their own consent. They can opt into Pro,
          public hosting, all the adult features. The link from your dashboard to their
          activity ends; the inform path to you ends.
        </p>
        <p style={p}>
          You both get an email a week before this happens so it&apos;s not a surprise.
        </p>

        <h2 style={h2}>What if my kid lies about their age?</h2>
        <p style={p}>
          We rely on self-attestation at signup, just like every other consumer site that
          asks for date of birth. It&apos;s not a perfect filter — a determined teen who
          claims to be 18 will pass through. We don&apos;t pretend otherwise.
        </p>
        <p style={p}>
          If you discover your kid created an adult account without going through this
          consent flow, email <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a>
          and we&apos;ll take it down.
        </p>

        <h2 style={h2}>Frequently asked questions</h2>

        <h3 style={h3}>Why $5? It feels arbitrary.</h3>
        <p style={p}>
          Persona&apos;s ID verification has a per-check cost — typically a few dollars.
          The $5 fee covers that with a small margin. We don&apos;t make money on it; if
          anything we under-charge for the service. The recurring Pro tier is where the
          actual business model lives, and it&apos;s genuinely optional.
        </p>

        <h3 style={h3}>Why do I have to verify my identity? My kid just wants to play board games.</h3>
        <p style={p}>
          Two reasons. First, COPPA-style accountability: when we know a real adult
          consented, we have a legal record of that consent. Second, anti-abuse: requiring
          ID verification means a bad actor can&apos;t set up a fake parent account with
          a stolen email. The friction is the point.
        </p>

        <h3 style={h3}>What about my kid&apos;s privacy from ME, the parent?</h3>
        <p style={p}>
          We deliberately limit what Passport shows you to identity-level activity: which
          apps they use, which stores they check in at, which badges they earn. We don&apos;t
          have access to what they do inside any individual app, so we can&apos;t share it
          with you even if we wanted to. Each app is its own service. Your kid sees a
          &quot;Supervised by [your name]&quot; badge on their Passport profile so they
          know identity-level oversight is on. We believe transparency between parent and
          kid produces healthier outcomes than stealth surveillance.
        </p>

        <h3 style={h3}>I have multiple kids. Do I pay multiple times?</h3>
        <p style={p}>
          Each kid&apos;s consent has its own Persona check, so the $5 verification fee
          applies once per kid. The Pro subscription is per-parent and covers monitoring
          for all linked kids — one Pro subscription, all your linked kid accounts visible
          on the dashboard.
        </p>

        <h3 style={h3}>What if I disagree with how Afterroar handles something?</h3>
        <p style={p}>
          Email <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a>.
          We read every parent message; you&apos;ll get a real human reply within 48 hours.
          Per the <a href="/credo" style={a}>Afterroar Credo</a>, players come first and that
          includes the safety of minor players.
        </p>

        <h2 style={h2}>Contact</h2>
        <p style={p}>
          Questions, concerns, or anything that doesn&apos;t feel right:{' '}
          <a href="mailto:afterroar@fulluproar.com" style={a}>afterroar@fulluproar.com</a>
        </p>
        <p style={p}>Afterroar is operated by Full Uproar Games, Inc., South Bend, Indiana, USA.</p>

        <div
          style={{
            borderTop: '1px solid var(--rule)',
            paddingTop: '1.5rem',
            marginTop: '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <p
            style={{
              ...TYPE.body,
              color: 'var(--ink-faint)',
              fontSize: '0.85rem',
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            We&apos;re building Afterroar to be the kind of platform we&apos;d trust our
            own kids to use. If anything on this page felt wrong or unclear, please tell us.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '1.2rem',
              ...TYPE.mono,
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <a href="/" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 700 }}>
              ← Home
            </a>
            <a href="/credo" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>
              The Credo
            </a>
            <a href="/privacy" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>
              Privacy
            </a>
            <a href="/terms" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>
              Terms
            </a>
          </div>
        </div>
      </MarketingPage>
    </>
  );
}
