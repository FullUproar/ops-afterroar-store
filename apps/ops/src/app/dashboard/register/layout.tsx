import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Afterroar Register",
  manifest: "/manifest-register.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Register",
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
