"use client";

import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store-context";
import { useStoreSettings } from "@/lib/store-settings";
import { StaffLockScreen } from "@/components/staff-lock-screen";

/* ------------------------------------------------------------------ */
/*  Staff Lock Gate — wraps dashboard to enforce Layer 2 auth          */
/*  If staff_lock_enabled and no active staff, shows lock screen.      */
/*  If disabled, passes through.                                       */
/* ------------------------------------------------------------------ */

export function StaffLockGate({ children }: { children: React.ReactNode }) {
  const { store, staffLocked, activeStaff, setActiveStaff, endShift } = useStore();
  const settings = useStoreSettings();
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Track activity for auto-lock
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!settings.staff_lock_enabled || settings.staff_lock_timeout_minutes <= 0) return;

    window.addEventListener("mousemove", resetActivity);
    window.addEventListener("keydown", resetActivity);
    window.addEventListener("touchstart", resetActivity);

    // Check for idle every 30 seconds
    idleTimerRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const timeoutMs = settings.staff_lock_timeout_minutes * 60 * 1000;
      if (idle >= timeoutMs && activeStaff) {
        endShift();
      }
    }, 30000);

    return () => {
      window.removeEventListener("mousemove", resetActivity);
      window.removeEventListener("keydown", resetActivity);
      window.removeEventListener("touchstart", resetActivity);
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [settings.staff_lock_enabled, settings.staff_lock_timeout_minutes, activeStaff, endShift, resetActivity]);

  // If lock is not enabled, pass through
  if (!settings.staff_lock_enabled) {
    return <>{children}</>;
  }

  // If locked (no active staff), show lock screen
  if (staffLocked) {
    return (
      <StaffLockScreen
        storeName={store?.name || "Store"}
        onUnlock={(staff) => setActiveStaff(staff)}
      />
    );
  }

  return <>{children}</>;
}
