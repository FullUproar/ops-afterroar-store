import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Afterroar — Your Tabletop Identity',
  description: 'Your tabletop identity, your rules. One login across every store and app in the Afterroar ecosystem. Manage your data, control your consent, delete anytime.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#0a0a0a',
        color: '#e2e8f0',
        minHeight: '100vh',
        overflowX: 'hidden',
      }}>
        {children}
      </body>
    </html>
  );
}
