import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Phone, Mail, Globe, Clock, Star } from 'lucide-react';
import { TitleBar, SecHero, Panel, TYPE } from '@/app/components/ui';
import { StoreClaimPanel } from './StoreClaimPanel';

export default async function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      phone: true,
      email: true,
      website: true,
      description: true,
      shortDescription: true,
      googleRating: true,
      reviewCount: true,
      venueType: true,
      hours: true,
      amenities: true,
    },
  });

  if (!venue) notFound();

  const location = [venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(', ');

  return (
    <>
      <TitleBar left={venue.name} right={venue.city && venue.state ? `${venue.city}, ${venue.state}` : undefined} />
      <SecHero
        fieldNum="06"
        fieldType="Store"
        title={venue.name}
        desc={location || undefined}
        actions={
          venue.googleRating ? (
            <span style={{ ...TYPE.mono, color: 'var(--yellow)', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Star size={14} fill="currentColor" strokeWidth={0} />
              {venue.googleRating} <span style={{ color: 'var(--ink-faint)' }}>· {venue.reviewCount} reviews</span>
            </span>
          ) : undefined
        }
      />

      {/* Claim panel — shows differently per venue status:
          unclaimed/pending → instant claim CTA.
          active → low-key 'request review' affordance for owner contests. */}
      {(venue.status === 'unclaimed' || venue.status === 'pending' || venue.status === 'active') && (
        <StoreClaimPanel
          slug={venue.slug}
          storeName={venue.name}
          status={venue.status}
          websiteUrl={venue.website ?? null}
        />
      )}

      <div style={{ padding: '1rem var(--pad-x) 1.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Panel>
          <h2 style={{ ...TYPE.mono, fontSize: '0.65rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 0.6rem' }}>About</h2>
          <p style={{ ...TYPE.body, color: 'var(--ink)', margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
            {venue.description || venue.shortDescription || 'No description available.'}
          </p>
        </Panel>

        <Panel>
          <h2 style={{ ...TYPE.mono, fontSize: '0.65rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 0.6rem' }}>Contact</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', ...TYPE.body, fontSize: '0.85rem' }}>
            {venue.phone ? (
              <p style={{ color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={14} color="var(--orange)" /> {venue.phone}
              </p>
            ) : null}
            {venue.email ? (
              <p style={{ color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={14} color="var(--orange)" /> {venue.email}
              </p>
            ) : null}
            {venue.website ? (
              <a href={venue.website} target="_blank" rel="noopener noreferrer" style={{
                color: 'var(--orange)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                textDecoration: 'none',
              }}>
                <Globe size={14} /> {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            ) : null}
            {venue.hours ? (
              <p style={{ color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={14} color="var(--orange)" /> {venue.hours}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <p style={{
        margin: '0 var(--pad-x) 1.5rem',
        ...TYPE.mono,
        fontSize: '0.66rem',
        letterSpacing: '0.1em',
        color: 'var(--ink-faint)',
        textAlign: 'center',
        fontStyle: 'italic',
      }}>
        The canonical Afterroar page for {venue.name} · <Link href="/stores" style={{ color: 'var(--orange)', textDecoration: 'none' }}>back to directory</Link>
      </p>
    </>
  );
}
