"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useMode } from "@/lib/mode-context";
import { signOut } from "next-auth/react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { RegisterNav } from "@/components/register-nav";
import { NetworkStatusBar } from "@/components/network-status-bar";
import { NotificationCenter } from "@/components/notification-center";

function HeaderActions() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
      {/* Refresh */}
      <button
        onClick={() => window.location.reload()}
        className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        title="Refresh"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.015 4.356v4.992" />
        </svg>
      </button>

      {/* Fullscreen */}
      <button
        onClick={() => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else document.documentElement.requestFullscreen().catch(() => {});
        }}
        className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {isFullscreen
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          }
        </svg>
      </button>

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        title="Sign out"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  const pathname = usePathname();

  // Register page is full-screen — no sidebar, no nav, no top bar
  const isRegisterPage = pathname === "/dashboard/register";

  if (isRegisterPage) {
    return <>{children}</>;
  }

  if (mode === "register") {
    return (
      <div className="flex h-full bg-background overflow-hidden max-w-[100vw]">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
          <div className="flex items-center gap-2 p-2 pb-0">
            <div className="flex-1 min-w-0">
              <NetworkStatusBar />
            </div>
          </div>
          {children}
        </main>
        <RegisterNav />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background overflow-hidden max-w-[100vw]">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden lg:pb-0" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
        {/* Fixed top nav bar — never scrolls */}
        <div className="shrink-0 flex items-center gap-1 px-2 h-11 sm:h-12 sm:px-3 lg:px-6 border-b border-card-border/50 bg-background/95 backdrop-blur-sm">
          <div className="flex-1 min-w-0">
            <NetworkStatusBar />
          </div>
          <NotificationCenter />
          <HeaderActions />
        </div>
        {/* Page content — fills remaining height, pages control their own overflow */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2 sm:px-3 sm:py-3 lg:px-6 lg:py-4">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
