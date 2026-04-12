import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Ops Monitor — Afterroar",
  description: "Real-time system health monitoring for Afterroar Store Ops",
  manifest: "/manifest-ops.json",
  icons: {
    icon: "/logo-ring-favicon.png",
    apple: "/logo-ring.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ops Monitor",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FF8200",
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
