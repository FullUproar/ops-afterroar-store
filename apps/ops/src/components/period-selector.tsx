"use client";

/* ------------------------------------------------------------------ */
/*  Period Selector — consistent time period toggle across pages       */
/*  Used on Cash Flow, Reports, Dashboard stats.                       */
/* ------------------------------------------------------------------ */

export type Period = "today" | "week" | "month" | "all";

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  options?: Period[];
}

const LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

export function PeriodSelector({
  value,
  onChange,
  options = ["today", "week", "month"],
}: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 rounded-xl bg-card-hover/80 p-1 shadow-inner">
      {options.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            value === period
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground hover:bg-card-hover/50"
          }`}
          style={{ minHeight: "auto" }}
        >
          {LABELS[period]}
        </button>
      ))}
    </div>
  );
}
