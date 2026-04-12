"use client";

import { useEffect, useRef } from "react";
import { formatCents } from "@/lib/types";

interface CustomerDisplayProps {
  qrDataUrl: string;
  totalCents: number;
  storeName: string;
  onDismiss: () => void;
}

/**
 * Full-screen customer-facing display. Flip the tablet toward the customer.
 * Light background, large QR code, total, auto-dismisses after 30s.
 * Tap anywhere to return to the register.
 */
export function CustomerDisplay({ qrDataUrl, totalCents, storeName, onDismiss }: CustomerDisplayProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 30_000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center cursor-pointer"
      style={{ background: "#ffffff" }}
      onClick={onDismiss}
    >
      {/* Ring mark logo */}
      <div className="mb-6">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="20" stroke="#FF8200" strokeWidth="3" fill="none" />
          <circle cx="24" cy="24" r="12" stroke="#FF8200" strokeWidth="2" fill="none" />
          <circle cx="24" cy="24" r="4" fill="#FF8200" />
        </svg>
      </div>

      {/* Store name */}
      <div className="text-lg font-semibold mb-8" style={{ color: "#333" }}>
        {storeName}
      </div>

      {/* QR code */}
      <div
        className="rounded-2xl p-4 mb-6"
        style={{ background: "#f9fafb", border: "2px solid #e5e7eb" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Receipt QR Code"
          width={220}
          height={220}
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Label */}
      <div className="text-base font-medium mb-8" style={{ color: "#666" }}>
        Scan for your receipt
      </div>

      {/* Total */}
      <div className="text-5xl font-mono font-bold mb-6" style={{ color: "#111" }}>
        {formatCents(totalCents)}
      </div>

      {/* Thank you */}
      <div className="text-base mb-12" style={{ color: "#888" }}>
        Thank you for shopping with us!
      </div>

      {/* Dismiss hint */}
      <div className="text-xs" style={{ color: "#bbb" }}>
        tap anywhere to return
      </div>
    </div>
  );
}
