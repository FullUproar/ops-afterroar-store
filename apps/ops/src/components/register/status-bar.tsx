"use client";

import { useState, useEffect, useRef } from "react";
import { formatCents } from "@/lib/types";
import type { Customer } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Status Bar — bottom of register, display only                      */
/*  Left: date | Center: status messages | Right: heartbeat clock      */
/*  The heartbeat pulses on each successful health check.              */
/* ------------------------------------------------------------------ */

interface StatusBarProps {
  customer: Customer | null;
  parkedCount: number;
  activeEventName: string | null;
}

export function StatusBar({
  customer,
  parkedCount,
  activeEventName,
}: StatusBarProps) {
  const [now, setNow] = useState(new Date());
  const [heartbeat, setHeartbeat] = useState(true); // pulse animation trigger
  const [systemOk, setSystemOk] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Clock updates every second
  useEffect(() => {
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Health check every 30 seconds — pulse heartbeat on success
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/me", { signal: AbortSignal.timeout(5000) });
        setSystemOk(res.ok);
        if (res.ok) {
          setHeartbeat(true);
          setTimeout(() => setHeartbeat(false), 600);
        }
      } catch {
        setSystemOk(false);
      }
    }

    checkHealth();
    heartbeatRef.current = setInterval(checkHealth, 30000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, []);

  // Status message (center)
  let statusMessage = "";
  if (customer) {
    statusMessage = customer.name;
    if (customer.credit_balance_cents > 0) statusMessage += ` \u00B7 ${formatCents(customer.credit_balance_cents)} credit`;
    if (customer.loyalty_points > 0) statusMessage += ` \u00B7 ${customer.loyalty_points} pts`;
  }
  if (parkedCount > 0) {
    statusMessage += `${statusMessage ? " \u00B7 " : ""}${parkedCount} parked`;
  }
  if (activeEventName) {
    statusMessage += `${statusMessage ? " \u00B7 " : ""}${activeEventName}`;
  }

  return (
    <div className="shrink-0 hidden sm:flex items-center justify-between px-4 h-8 border-t border-card-border bg-card/30 text-[11px] text-muted font-mono tabular-nums">
      {/* Left: date */}
      <span>
        {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
      </span>

      {/* Center: status */}
      <span className="truncate max-w-[60%] text-center text-muted/70">
        {statusMessage}
      </span>

      {/* Right: heartbeat clock */}
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full transition-all duration-300 ${
            !systemOk
              ? "bg-red-500"
              : heartbeat
                ? "bg-green-400 scale-150 shadow-[0_0_6px_rgba(74,222,128,0.8)]"
                : "bg-green-500/50"
          }`}
        />
        <span className={systemOk ? "" : "text-red-400"}>
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </span>
      </span>
    </div>
  );
}
