import type { Metadata } from 'next';
import { Bricolage_Grotesque, Archivo, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '700', '800'],
});

const body = Archivo({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Afterroar — Your Tabletop Identity',
  description: 'Your tabletop identity, your rules. One login across every store and app in the Afterroar ecosystem. Manage your data, control your consent, delete anytime.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Afterroar',
  },
};

export const viewport = {
  themeColor: '#FF8200',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
