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
  const currentCents = Math.round(parseFloat(value || "0") * 100);

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

  // ADDITIVE — tapping $20 adds $20 to current value
  const handleAddBill = useCallback(
    (cents: number) => {
      haptic();
      const newTotal = currentCents + cents;
      onChange((newTotal / 100).toFixed(2));
    },
    [currentCents, onChange]
  );

  const displayValue = value || "0.00";
  const hasValue = value !== "" && parseFloat(value) > 0;
  const isEnough = changeCents != null && changeCents >= 0 && hasValue;

  const btnStyle = {
    touchAction: "manipulation" as const,
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      {/* Display + Change */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-card-border">
        <div className="text-3xl font-mono font-bold text-foreground tabular-nums">
          ${displayValue}
        </div>
        {showChange && (
          <div className={`text-xl font-bold tabular-nums font-mono ${
            hasValue && isEnough ? "text-green-400" : hasValue ? "text-red-400" : "text-muted"
          }`}>
            {hasValue && isEnough
              ? `Change $${(changeCents / 100).toFixed(2)}`
              : hasValue ? "Short" : ""}
          </div>
        )}
      </div>

      {/* Quick bills — BIG, ADDITIVE (tap tap tap = adds up) */}
      <div className="grid grid-cols-4 gap-1.5 px-3 py-2 border-b border-card-border">
        {[100, 500, 1000, 2000].map((cents) => (
          <button
            key={cents}
            type="button"
            onClick={() => handleAddBill(cents)}
            className="rounded-xl bg-card-hover text-foreground font-bold text-lg active:scale-95 transition-transform select-none"
            style={{ height: 56, ...btnStyle }}
          >
            +${(cents / 100).toFixed(0)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleAddBill(5000)}
          className="rounded-xl bg-card-hover text-foreground font-bold text-lg active:scale-95 transition-transform select-none"
          style={{ height: 56, ...btnStyle }}
        >
          +$50
        </button>
        <button
          type="button"
          onClick={() => handleAddBill(10000)}
          className="rounded-xl bg-card-hover text-foreground font-bold text-lg active:scale-95 transition-transform select-none"
          style={{ height: 56, ...btnStyle }}
        >
          +$100
        </button>
        {totalCents != null && (
          <button
            type="button"
            onClick={() => { haptic(); onChange((totalCents / 100).toFixed(2)); }}
            className="rounded-xl bg-card-hover text-accent font-semibold text-sm active:scale-95 transition-transform select-none"
            style={{ height: 56, ...btnStyle }}
          >
            Exact
          </button>
        )}
        <button
          type="button"
          onClick={() => { haptic(); onChange(""); }}
          className="rounded-xl bg-card-hover text-muted font-semibold text-sm active:scale-95 transition-transform select-none"
          style={{ height: 56, ...btnStyle }}
        >
          Clear
        </button>
      </div>

      {/* Number Grid — compact */}
      <div className="flex-1 grid grid-cols-3 grid-rows-4 gap-1 px-3 py-1 min-h-0">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "\u232B"].map(
          (key) => (
            <button
              key={key}
              type="button"
              onClick={() => key === "\u232B" ? handleBackspace() : handleDigit(key)}
              className={`select-none rounded-xl font-bold text-lg flex items-center justify-center transition-transform active:scale-95 ${
                key === "\u232B" ? "bg-card-hover text-red-400" : "bg-card-hover text-foreground"
              }`}
              style={{ ...btnStyle, minHeight: 0 }}
            >
              {key}
            </button>
          )
        )}
      </div>

      {/* Done button */}
      <div className="p-3 pt-1 border-t border-card-border">
        <button
          type="button"
          onClick={() => { haptic(); onSubmit(); }}
          disabled={submitDisabled || processing}
          className="w-full rounded-xl font-bold text-white disabled:opacity-30 transition-colors active:scale-[0.98] select-none"
          style={{ height: 56, fontSize: 16, backgroundColor: "#16a34a", ...btnStyle }}
        >
          {processing ? "Processing..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
