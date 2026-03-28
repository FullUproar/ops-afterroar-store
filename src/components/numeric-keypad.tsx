"use client";

import { useCallback } from "react";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  totalCents?: number;
  changeCents?: number;
  showChange?: boolean;
  processing?: boolean;
}

function haptic() {
  try { navigator.vibrate?.(10); } catch {}
}

export function NumericKeypad({
  value,
  onChange,
  onSubmit,
  submitLabel = "Done",
  submitDisabled = false,
  totalCents,
  changeCents = 0,
  showChange = false,
  processing = false,
}: NumericKeypadProps) {
  const handleDigit = useCallback(
    (digit: string) => {
      haptic();
      let next = value;
      if (digit === ".") {
        if (next.includes(".")) return;
        if (next === "") next = "0";
        next += ".";
      } else {
        if (next === "0" && digit !== ".") {
          next = "0.0" + digit;
        } else {
          next += digit;
        }
        const dotIdx = next.indexOf(".");
        if (dotIdx !== -1 && next.length - dotIdx > 3) return;
        if (parseFloat(next || "0") > 99999.99) return;
      }
      onChange(next);
    },
    [value, onChange]
  );

  const handleBackspace = useCallback(() => {
    haptic();
    onChange(value.length <= 1 ? "" : value.slice(0, -1));
  }, [value, onChange]);

  const handleQuickAmount = useCallback(
    (cents: number) => {
      haptic();
      onChange((cents / 100).toFixed(2));
    },
    [onChange]
  );

  const displayValue = value || "0.00";
  const hasValue = value !== "" && parseFloat(value) > 0;
  const isEnough = changeCents != null && changeCents >= 0 && hasValue;

  const btnStyle = {
    touchAction: "manipulation" as const,
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <div className="flex flex-col h-full max-h-[100dvh] overflow-hidden">
      {/* Display + Change — compact header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border bg-card">
        <div className="text-3xl font-mono font-bold text-foreground tabular-nums">
          ${displayValue}
        </div>
        {showChange && (
          <div className={`text-lg font-bold tabular-nums font-mono ${
            hasValue && isEnough ? "text-green-400" : hasValue ? "text-red-400" : "text-muted"
          }`}>
            {hasValue && isEnough
              ? `+$${(changeCents / 100).toFixed(2)}`
              : hasValue ? "Short" : ""}
          </div>
        )}
      </div>

      {/* Quick amounts — compact single row */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-card-border bg-card overflow-x-auto">
        {[500, 1000, 2000, 5000, 10000].map((cents) => (
          <button
            key={cents}
            type="button"
            onClick={() => handleQuickAmount(cents)}
            className="shrink-0 flex-1 rounded-lg bg-card-hover text-foreground text-xs font-semibold active:scale-95 transition-transform select-none"
            style={{ height: 36, minWidth: 44, ...btnStyle }}
          >
            ${(cents / 100).toFixed(0)}
          </button>
        ))}
        {totalCents != null && (
          <button
            type="button"
            onClick={() => { haptic(); onChange((totalCents / 100).toFixed(2)); }}
            className="shrink-0 flex-1 rounded-lg bg-card-hover text-accent text-xs font-semibold active:scale-95 transition-transform select-none"
            style={{ height: 36, minWidth: 44, ...btnStyle }}
          >
            Exact
          </button>
        )}
      </div>

      {/* Number Grid — fills available space */}
      <div className="flex-1 grid grid-cols-3 grid-rows-4 gap-1 p-2 bg-card min-h-0">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "\u232B"].map(
          (key) => (
            <button
              key={key}
              type="button"
              onClick={() => key === "\u232B" ? handleBackspace() : handleDigit(key)}
              className={`select-none rounded-xl font-bold text-xl flex items-center justify-center transition-transform active:scale-95 ${
                key === "\u232B" ? "bg-card-hover text-red-400" : "bg-card-hover text-foreground"
              }`}
              style={{ ...btnStyle, minHeight: 0 }}
            >
              {key}
            </button>
          )
        )}
      </div>

      {/* Done button — always at bottom */}
      <div className="p-2 pt-1 bg-card border-t border-card-border">
        <button
          type="button"
          onClick={() => { haptic(); onSubmit(); }}
          disabled={submitDisabled || processing}
          className="w-full rounded-xl font-bold text-white disabled:opacity-30 transition-colors active:scale-[0.98] select-none"
          style={{ height: 52, fontSize: 16, backgroundColor: "#16a34a", ...btnStyle }}
        >
          {processing ? "Processing..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
