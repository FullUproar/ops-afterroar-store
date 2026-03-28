"use client";

import { useCallback } from "react";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  quickAmounts?: number[];
  onQuickAmount?: (cents: number) => void;
  totalCents?: number;
  changeCents?: number;
  showChange?: boolean;
  processing?: boolean;
}

function haptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // not supported
  }
}

export function NumericKeypad({
  value,
  onChange,
  onSubmit,
  submitLabel = "Done",
  submitDisabled = false,
  quickAmounts = [2000, 5000, 10000],
  onQuickAmount,
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
        // Only one decimal point
        if (next.includes(".")) return;
        if (next === "") next = "0";
        next += ".";
      } else {
        // Appending a digit
        if (next === "0" && digit !== ".") {
          // Leading zero: "0" then "5" = "0.05" (not "05")
          next = "0.0" + digit;
        } else {
          next += digit;
        }

        // Enforce max 2 decimal places
        const dotIdx = next.indexOf(".");
        if (dotIdx !== -1 && next.length - dotIdx > 3) {
          return; // would exceed 2 decimal places
        }

        // Enforce max value
        const parsed = parseFloat(next || "0");
        if (parsed > 99999.99) return;
      }

      onChange(next);
    },
    [value, onChange]
  );

  const handleBackspace = useCallback(() => {
    haptic();
    if (value.length <= 1) {
      onChange("");
    } else {
      onChange(value.slice(0, -1));
    }
  }, [value, onChange]);

  const handleQuickAmount = useCallback(
    (cents: number) => {
      haptic();
      onChange((cents / 100).toFixed(2));
      onQuickAmount?.(cents);
    },
    [onChange, onQuickAmount]
  );

  const handleExact = useCallback(() => {
    haptic();
    if (totalCents != null) {
      onChange((totalCents / 100).toFixed(2));
    }
  }, [totalCents, onChange]);

  const displayValue = value || "0.00";

  // Determine change status
  const isEnough = changeCents != null && changeCents >= 0 && value !== "";
  const hasValue = value !== "" && parseFloat(value) > 0;

  const buttonBase =
    "select-none rounded-xl font-bold text-2xl flex items-center justify-center transition-transform active:scale-95";
  const digitClass = `${buttonBase} bg-card-hover text-foreground`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-card-border bg-card shadow-lg p-4">
      {/* Display */}
      <div className="rounded-xl bg-background border border-card-border px-4 py-3 text-right">
        <span className="text-4xl font-mono font-bold text-foreground tabular-nums">
          ${displayValue}
        </span>
      </div>

      {/* Number Grid — 4x3 */}
      <div className="grid grid-cols-3 gap-2">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "\u232B"].map(
          (key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "\u232B") handleBackspace();
                else handleDigit(key);
              }}
              className={
                key === "\u232B"
                  ? `${buttonBase} bg-card-hover text-red-400`
                  : digitClass
              }
              style={{
                height: 64,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {key}
            </button>
          )
        )}
      </div>

      {/* Quick amounts row */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[100, 500, 1000, 2000, 5000, 10000].map((cents) => (
          <button
            key={cents}
            type="button"
            onClick={() => handleQuickAmount(cents)}
            className="shrink-0 rounded-lg border border-card-border bg-card-hover px-3 font-medium text-foreground text-sm active:scale-95 transition-transform select-none"
            style={{
              height: 48,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              minWidth: 52,
            }}
          >
            ${cents >= 100 ? (cents / 100).toFixed(0) : (cents / 100).toFixed(2)}
          </button>
        ))}
        {totalCents != null && (
          <button
            type="button"
            onClick={handleExact}
            className="shrink-0 rounded-lg border border-card-border bg-card-hover px-3 font-medium text-foreground text-sm active:scale-95 transition-transform select-none"
            style={{
              height: 48,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              minWidth: 52,
            }}
          >
            Exact
          </button>
        )}
      </div>

      {/* Change display */}
      {showChange && (
        <div
          className={`text-center text-xl font-bold tabular-nums font-mono ${
            hasValue && isEnough
              ? "text-green-400"
              : hasValue
                ? "text-red-400"
                : "text-muted"
          }`}
        >
          {hasValue && isEnough
            ? `Change: $${(changeCents / 100).toFixed(2)}`
            : hasValue
              ? "Insufficient"
              : "Change: $0.00"}
        </div>
      )}

      {/* Done button */}
      <button
        type="button"
        onClick={() => {
          haptic();
          onSubmit();
        }}
        disabled={submitDisabled || processing}
        className="w-full rounded-xl font-bold text-white disabled:opacity-30 transition-colors active:scale-[0.98] select-none"
        style={{
          height: 56,
          fontSize: 18,
          backgroundColor: "#16a34a",
          minHeight: 56,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {processing ? "Processing..." : submitLabel}
      </button>
    </div>
  );
}
