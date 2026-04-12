import { NextResponse } from 'next/server';

/**
 * TEMPORARY diagnostic endpoint — remove after env var audit.
 * Reports env var lengths and trailing whitespace without revealing values.
 */
export async function GET() {
  const vars = [
    'AUTH_SECRET',
    'AUTH_URL',
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'NEXTAUTH_URL',
    'OAUTH_CLIENT_SECRET_FULLUPROAR',
    'OAUTH_CLIENT_SECRET_HQ',
    'OAUTH_CLIENT_SECRET_OPS',
  ];

  const audit = vars.map((name) => {
    const val = process.env[name];
    if (!val) return { name, status: 'NOT_SET' };
    const trimmed = val.trim();
    return {
      name,
      len: val.length,
      trimmed_len: trimmed.length,
      has_trailing_ws: val.length !== trimmed.length,
      prefix: val.slice(0, 4),
      suffix_hex: Buffer.from(val.slice(-4)).toString('hex'),
    };
  });

  return NextResponse.json({ project: 'afterroar-me', audit });
}
