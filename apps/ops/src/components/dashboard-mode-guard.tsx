"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMode } from "@/lib/mode-context";

/**
 * When in register mode, redirects from the dashboard home to /dashboard/register.
 * Wraps server-rendered dashboard content — shows nothing until mode is resolved.
 */
export function DashboardModeGuard({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  const router = useRouter();

  useEffect(() => {
    if (mode === "register") {
      router.replace("/dashboard/register");
    }
  }, [mode, router]);

  if (mode === "register") {
    return null;
  }

  return <>{children}</>;
}
