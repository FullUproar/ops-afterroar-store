import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Mobile Register — Afterroar",
  description: "Mobile point of sale for Afterroar Store Ops",
  manifest: "/manifest-mobile.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Register",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
