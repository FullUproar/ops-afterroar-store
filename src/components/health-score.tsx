"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";

/* ------------------------------------------------------------------ */
/*  Health Score — single-glance status with actionable top alert       */
/*  Shows the MOST IMPORTANT thing to do right now, not a vague count.  */
/*  One banner, one action, one tap.                                    */
/* ------------------------------------------------------------------ */

interface Insight {
  id: string;
  priority: "high" | "medium" | "low";
  type: "action" | "warning" | "opportunity" | "celebration";
  title: string;
  message: string;
  action?: { label: string; href: string };
}

type HealthLevel = "great" | "good" | "watch" | "attention";

const LEVEL_STYLES: Record<HealthLevel, { bg: string; text: string; dot: string; border: string }> = {
  great: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-500/20" },
  good: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400", border: "border-green-500/20" },
  watch: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400", border: "border-amber-500/20" },
  attention: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400 animate-pulse", border: "border-red-500/20" },
};

export function HealthScore() {
  const { can } = useStore();
  const [level, setLevel] = useState<HealthLevel>("good");
  const [topInsight, setTopInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!can("reports")) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch("/api/intelligence");
        if (res.ok) {
          const data = await res.json();
          const insights: Insight[] = data.insights ?? [];

          // Find the highest priority actionable insight
          const actionable = insights.filter(
            (i) => i.type === "action" || i.type === "warning",
          );

          const highCount = actionable.filter((i) => i.priority === "high").length;

          if (highCount >= 2) setLevel("attention");
          else if (highCount === 1) setLevel("watch");
          else if (actionable.length > 0) setLevel("good");
          else setLevel("great");

          // Pick the top insight to display
          if (actionable.length > 0) {
            // Sort: high > medium > low
            actionable.sort((a, b) => {
              const order = { high: 0, medium: 1, low: 2 };
              return order[a.priority] - order[b.priority];
            });
            setTopInsight(actionable[0]);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [can]);

  if (loading || !can("reports")) return null;

  const style = LEVEL_STYLES[level];

  // All clear — show a brief positive message
  if (!topInsight) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border ${style.border} ${style.bg} px-4 py-3`}>
        <span className={`h-3 w-3 rounded-full ${style.dot} shrink-0`} />
        <span className={`text-sm font-medium ${style.text}`}>Everything looks great</span>
      </div>
    );
  }

  // Show the top action with a direct link
  const href = topInsight.action?.href || "/dashboard/cash-flow";
  const actionLabel = topInsight.action?.label || "View Details";

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border ${style.border} ${style.bg} px-4 py-3 transition-colors hover:opacity-90`}
    >
      <span className={`h-3 w-3 rounded-full ${style.dot} shrink-0`} />
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-semibold ${style.text}`}>{topInsight.title}</span>
        <span className={`text-xs ${style.text} opacity-70 ml-2 hidden sm:inline`}>
          {topInsight.message.length > 80 ? topInsight.message.slice(0, 80) + "..." : topInsight.message}
        </span>
      </div>
      <span className={`text-xs font-medium ${style.text} shrink-0 rounded-lg px-2 py-1 border ${style.border}`}>
        {actionLabel}
      </span>
    </Link>
  );
}
