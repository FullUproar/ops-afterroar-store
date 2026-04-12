"use client";

import { TrainingBadge } from "@/lib/training-mode";

interface RegisterHeaderProps {
  storeName: string;
  staffName: string;
  roleLabel: string;
  isFullscreen: boolean;
  scannerFlash: "none" | "success" | "error";
  scannerStatus: "listening" | "paused" | "processing";
  lastScanCode: string | null;
  cartLength: number;
  totalCents: number;
  onLogoTap: () => void;
  onExitClick: () => void;
}

export function RegisterHeader({
  storeName,
  staffName,
  roleLabel,
  isFullscreen,
  scannerFlash,
  scannerStatus,
  lastScanCode,
  cartLength,
  onLogoTap,
  onExitClick,
}: RegisterHeaderProps) {
  return (
    <header className="shrink-0 flex items-center justify-between px-2 sm:px-4 h-10 sm:h-12 border-b border-card-border bg-card">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {/* Scanner status dot */}
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 transition-colors duration-150 ${
            scannerFlash === "success"
              ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
              : scannerFlash === "error"
                ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"
                : scannerStatus === "listening"
                  ? "bg-green-500 animate-pulse"
                  : scannerStatus === "paused"
                    ? "bg-gray-500"
                    : "bg-amber-400 animate-pulse"
          }`}
          title={
            scannerStatus === "listening"
              ? `Scanner ready${lastScanCode ? ` — Last: ${lastScanCode}` : ""}`
              : scannerStatus === "paused"
                ? "Scanner paused"
                : "Processing scan..."
          }
        />
        <button
          onClick={onLogoTap}
          className="text-sm sm:text-base font-bold text-foreground tracking-wide uppercase truncate"
          style={{ minHeight: "auto" }}
        >
          {storeName}
        </button>
        {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") && (
          <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] sm:text-sm font-semibold uppercase tracking-wider border border-amber-500/30">
            Test
          </span>
        )}
        <TrainingBadge />
      </div>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <span className="hidden sm:inline text-sm text-muted">
          {staffName}{roleLabel ? ` \u00B7 ${roleLabel}` : ""}
        </span>
        <button
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else document.documentElement.requestFullscreen().catch(() => {});
          }}
          className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {isFullscreen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            }
          </svg>
        </button>
        <button
          onClick={onExitClick}
          className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          title="Exit register"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
