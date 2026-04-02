import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Clock In — Afterroar",
  description: "Employee time clock",
  manifest: "/manifest-clock.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Clock In",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ClockLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
