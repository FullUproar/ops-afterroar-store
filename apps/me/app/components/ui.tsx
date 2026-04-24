import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

/* ============================================================
   Typography primitives
   ============================================================ */

export const TYPE = {
  display: { fontFamily: 'var(--font-display), Georgia, serif', fontWeight: 800, letterSpacing: '-0.02em' } as CSSProperties,
  displayMd: { fontFamily: 'var(--font-display), Georgia, serif', fontWeight: 700, letterSpacing: '-0.015em' } as CSSProperties,
  mono: { fontFamily: 'var(--font-mono), ui-monospace, Menlo, monospace' } as CSSProperties,
  body: { fontFamily: 'var(--font-body), system-ui, sans-serif' } as CSSProperties,
  monoLabel: {
    fontFamily: 'var(--font-mono), ui-monospace, Menlo, monospace',
    fontSize: '0.62rem',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'var(--ink-soft)',
    fontWeight: 600,
  } as CSSProperties,
};

/* ============================================================
   TitleBar — the orange bar at the top of the card
   ============================================================ */

export function TitleBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.55rem 0.9rem',
      background: 'var(--orange)',
      color: 'var(--void)',
      ...TYPE.mono,
      fontSize: '0.64rem',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontWeight: 600,
      gap: '0.5rem',
      viewTransitionName: 'ar-title-bar',
    }}>
      <span style={{
        fontWeight: 700,
        letterSpacing: '0.16em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>{left}</span>
      {right ? (
        <span style={{ fontWeight: 700, letterSpacing: '0.14em', flexShrink: 0 }}>{right}</span>
      ) : null}
    </header>
  );
}

/* ============================================================
   SecHero — standard sub-page header (breadcrumb + title + desc + actions)
   ============================================================ */

export function SecHero({
  fieldNum,
  fieldTotal = 8,
  fieldType,
  title,
  count,
  desc,
  actions,
  showBack = true,
}: {
  fieldNum?: string;
  fieldTotal?: number;
  fieldType?: string;
  title: string;
  count?: string;
  desc?: ReactNode;
  actions?: ReactNode;
  showBack?: boolean;
}) {
  return (
    <section style={{
      padding: '1.1rem var(--pad-x) 1.1rem',
      borderBottom: '1px solid var(--rule)',
    }}>
      {showBack ? (
        <Link href="/dashboard" style={{
          ...TYPE.mono,
          fontSize: '0.62rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--orange)',
          fontWeight: 700,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginBottom: '0.7rem',
          padding: '0.3rem 0',
        }}>
          <ArrowLeft size={12} strokeWidth={2.5} />
          Player Card
        </Link>
      ) : null}

      {fieldNum ? (
        <p style={{
          ...TYPE.mono,
          fontSize: '0.58rem',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--ink-soft)',
          fontWeight: 600,
          margin: '0 0 0.4rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          flexWrap: 'wrap',
        }}>
          <span>Field</span>
          <span style={{ color: 'var(--ink-faint)' }}>·</span>
          <span style={{ color: 'var(--orange)' }}>{fieldNum} / {String(fieldTotal).padStart(2, '0')}</span>
          {fieldType ? (
            <>
              <span style={{ color: 'var(--ink-faint)' }}>·</span>
              <span>{fieldType}</span>
            </>
          ) : null}
        </p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
        <h1 style={{
          ...TYPE.display,
          fontSize: 'clamp(1.7rem, 7vw, 3rem)',
          lineHeight: 0.95,
          margin: 0,
          color: 'var(--cream)',
        }}>{title}</h1>
        {count ? (
          <span style={{
            ...TYPE.mono,
            fontSize: '0.8rem',
            color: 'var(--ink-soft)',
            letterSpacing: '0.08em',
          }}>{count}</span>
        ) : null}
      </div>

      {desc ? (
        <p style={{
          ...TYPE.body,
          fontSize: '0.9rem',
          color: 'var(--ink-soft)',
          margin: '0.5rem 0 0',
          lineHeight: 1.5,
          maxWidth: '42rem',
        }}>{desc}</p>
      ) : null}

      {actions ? (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {actions}
        </div>
      ) : null}
    </section>
  );
}

/* ============================================================
   Button
   ============================================================ */

const BTN_BASE: CSSProperties = {
  ...TYPE.display,
  fontSize: '0.85rem',
  letterSpacing: '0.03em',
  padding: '0.65rem 1rem',
  border: '2px solid var(--orange)',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  transition: 'transform 0.2s ease, background 0.2s ease, color 0.2s ease',
  whiteSpace: 'nowrap',
};

export function Button({
  children,
  onClick,
  href,
  variant = 'primary',
  disabled,
  type,
  formAction,
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  formAction?: (formData: FormData) => void | Promise<void>;
  size?: 'sm' | 'md';
}) {
  const colors: Record<string, CSSProperties> = {
    primary: { background: 'var(--orange)', color: 'var(--void)', borderColor: 'var(--orange)' },
    ghost: { background: 'transparent', color: 'var(--orange)', borderColor: 'var(--orange)' },
    danger: { background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' },
  };
  const sz: CSSProperties = size === 'sm'
    ? { fontSize: '0.75rem', padding: '0.45rem 0.8rem', borderWidth: '1.5px' }
    : {};
  const style: CSSProperties = {
    ...BTN_BASE,
    ...colors[variant],
    ...sz,
    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
  };
  if (href) return <Link href={href} style={style}>{children}</Link>;
  return (
    <button type={type ?? 'button'} onClick={onClick} formAction={formAction} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

/* ============================================================
   Chip — small status/filter pill
   ============================================================ */

export function Chip({ children, tone = 'neutral', on }: { children: ReactNode; tone?: 'neutral' | 'orange' | 'yellow' | 'red' | 'green' | 'blue'; on?: boolean }) {
  const tones: Record<string, { bg: string; fg: string; border: string }> = {
    neutral: { bg: 'var(--panel-mute)', fg: 'var(--ink-soft)', border: 'var(--rule)' },
    orange: { bg: 'var(--orange-weak)', fg: 'var(--orange)', border: 'var(--orange)' },
    yellow: { bg: 'var(--yellow-mute)', fg: 'var(--yellow)', border: 'rgba(251, 219, 101, 0.3)' },
    red: { bg: 'var(--red-mute)', fg: 'var(--red)', border: 'rgba(196, 77, 77, 0.3)' },
    green: { bg: 'var(--green-mute)', fg: 'var(--green)', border: 'rgba(125, 184, 125, 0.3)' },
    blue: { bg: 'var(--blue-mute)', fg: 'var(--blue)', border: 'rgba(107, 144, 199, 0.3)' },
  };
  const t = on ? tones.orange : tones[tone];
  return (
    <span style={{
      ...TYPE.mono,
      fontSize: '0.62rem',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      fontWeight: 600,
      padding: '0.25rem 0.6rem',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.border}`,
      whiteSpace: 'nowrap',
      display: 'inline-block',
    }}>{children}</span>
  );
}

/* ============================================================
   EmptyState
   ============================================================ */

export function EmptyState({ title, desc }: { title: string; desc?: ReactNode }) {
  return (
    <div style={{
      padding: '2.5rem 1.25rem',
      background: 'var(--panel-mute)',
      border: '1px solid var(--rule)',
      textAlign: 'center',
    }}>
      <p style={{ ...TYPE.displayMd, fontSize: '1.1rem', color: 'var(--cream)', margin: '0 0 0.4rem' }}>{title}</p>
      {desc ? (
        <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>{desc}</p>
      ) : null}
    </div>
  );
}

/* ============================================================
   Panel — inset rectangle used throughout for content blocks
   ============================================================ */

export function Panel({ children, style, as: As = 'div' }: { children: ReactNode; style?: CSSProperties; as?: 'div' | 'section' }) {
  return (
    <As style={{
      background: 'var(--panel-mute)',
      border: '1px solid var(--rule)',
      padding: '1rem 1.1rem',
      ...style,
    }}>{children}</As>
  );
}

/* ============================================================
   ListRow — generic horizontal row used for games/loans/stores/transactions
   ============================================================ */

export function ListRow({
  href,
  leading,
  title,
  meta,
  trailing,
  onClick,
  tone,
}: {
  href?: string;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'warn' | 'ok';
}) {
  const borderColor = tone === 'warn' ? 'rgba(196, 77, 77, 0.3)'
    : tone === 'ok' ? 'rgba(125, 184, 125, 0.3)'
    : 'var(--rule-soft)';

  const content = (
    <>
      {leading ? <div style={{ flexShrink: 0 }}>{leading}</div> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.displayMd, fontSize: '1rem', color: 'var(--cream)' }}>{title}</div>
        {meta ? (
          <div style={{ ...TYPE.mono, fontSize: '0.66rem', color: 'var(--ink-soft)', letterSpacing: '0.04em', marginTop: '0.15rem' }}>{meta}</div>
        ) : null}
      </div>
      {trailing ? <div style={{ flexShrink: 0 }}>{trailing}</div> : null}
    </>
  );

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    padding: '0.9rem 1rem',
    background: 'var(--panel-mute)',
    borderBottom: `1px solid ${borderColor}`,
    color: 'inherit',
    textDecoration: 'none',
    cursor: href || onClick ? 'pointer' : 'default',
    transition: 'background 0.2s ease',
  };

  if (href) return <Link href={href} className="ar-lstripe" style={style}>{content}</Link>;
  if (onClick) return <button onClick={onClick} className="ar-lstripe" style={{ ...style, border: 'none', width: '100%', textAlign: 'left' }}>{content}</button>;
  return <div style={style}>{content}</div>;
}

/* ============================================================
   ActionTile — dashboard action tile (horizontal on mobile, vertical on desktop)
   ============================================================ */

export function ActionTile({
  href,
  n,
  icon,
  title,
  desc,
}: {
  href: string;
  n: string;
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="ar-stripe" style={{
      position: 'relative',
      padding: '1rem',
      background: 'var(--panel-mute)',
      color: 'inherit',
      textDecoration: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: '0.9rem',
      minHeight: '72px',
    }}>
      <span style={{ flexShrink: 0, color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          ...TYPE.mono,
          fontSize: '0.54rem',
          letterSpacing: '0.28em',
          color: 'var(--ink-faint)',
          fontWeight: 600,
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: '0.15rem',
        }}>{n}</span>
        <div style={{
          ...TYPE.display,
          fontSize: '1.15rem',
          lineHeight: 1,
          color: 'var(--cream)',
          marginBottom: '0.2rem',
        }}>{title}</div>
        <p style={{
          ...TYPE.body,
          fontSize: '0.78rem',
          lineHeight: 1.35,
          color: 'var(--ink-soft)',
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical' as CSSProperties['WebkitBoxOrient'],
        }}>{desc}</p>
      </div>
      <ArrowRight size={16} strokeWidth={2} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
    </Link>
  );
}

/* ============================================================
   Input — text input with consistent styling
   ============================================================ */

export function inputStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    width: '100%',
    background: 'var(--panel-mute)',
    border: '1px solid var(--rule)',
    color: 'var(--cream)',
    ...TYPE.body,
    fontSize: '0.88rem',
    padding: '0.6rem 0.85rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    ...extra,
  };
}

/* ============================================================
   SpinnerInline — small loading indicator
   ============================================================ */

export function SpinnerInline({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="ar-spin" style={{ color: 'var(--orange)' }} />;
}
