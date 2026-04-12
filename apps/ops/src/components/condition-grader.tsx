"use client";

import { CONDITIONS, CONDITION_PERCENT, type Condition } from "@/lib/tcg-pricing";
import { HelpTooltip } from "@/components/help-tooltip";

interface ConditionGraderProps {
  value: Condition;
  onChange: (condition: Condition) => void;
  size?: "normal" | "large";
}

const CONDITION_COLORS: Record<Condition, { active: string; ring: string }> = {
  NM: {
    active: "bg-green-600 text-white border-green-500",
    ring: "ring-green-500/40",
  },
  LP: {
    active: "bg-blue-600 text-white border-blue-500",
    ring: "ring-blue-500/40",
  },
  MP: {
    active: "bg-yellow-600 text-white border-yellow-500",
    ring: "ring-yellow-500/40",
  },
  HP: {
    active: "bg-orange-600 text-white border-orange-500",
    ring: "ring-orange-500/40",
  },
  DMG: {
    active: "bg-red-600 text-white border-red-500",
    ring: "ring-red-500/40",
  },
};

const INACTIVE =
  "bg-card-hover text-muted border-input-border hover:text-foreground hover:border-foreground/30";

export function ConditionGrader({
  value,
  onChange,
  size = "normal",
}: ConditionGraderProps) {
  const isLarge = size === "large";

  return (
    <div className="space-y-1.5">
    <div className="flex gap-1.5">
      {CONDITIONS.map((c) => {
        const isActive = value === c;
        const colors = CONDITION_COLORS[c];
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`
              flex-1 rounded-xl border font-semibold transition-all
              ${isLarge ? "min-h-[56px] text-sm px-2 py-3" : "min-h-[40px] text-xs px-1.5 py-2"}
              ${isActive ? `${colors.active} ring-2 ${colors.ring} shadow-sm` : INACTIVE}
            `}
          >
            <div className="leading-tight">{c}</div>
            {isLarge && (
              <div
                className={`text-[10px] mt-0.5 leading-none ${isActive ? "text-white/80" : "text-muted"}`}
              >
                {CONDITION_PERCENT[c]}%
              </div>
            )}
          </button>
        );
      })}
    </div>
    {isLarge && (
      <div className="flex justify-end">
        <HelpTooltip text="NM (Near Mint): Looks unplayed. LP (Lightly Played): Minor edge wear. MP (Moderately Played): Noticeable wear. HP (Heavily Played): Significant wear or creases. DMG (Damaged): Major damage like bends or tears." />
      </div>
    )}
    </div>
  );
}
