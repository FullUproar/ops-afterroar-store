"use client";

import { useState, useRef } from "react";
import { useStore } from "@/lib/store-context";

/* ------------------------------------------------------------------ */
/*  Store Advisor — "Ask your store's AI"                              */
/*  Claude-powered business advisor that knows your actual numbers.    */
/* ------------------------------------------------------------------ */

interface AdvisorResponse {
  advice: string;
  usage?: { today: number; limit: number };
  snapshot_summary?: {
    revenue30d: number;
    cashRunwayDays: number;
    deadStockValue: number;
    outstandingCredit: number;
    blendedMarginPct: number;
  };
}

const QUICK_QUESTIONS = [
  "What should I focus on this week?",
  "How's my cash flow looking?",
  "Which inventory should I markdown?",
  "Should I run a promotion?",
  "Am I scheduling enough events?",
  "How can I bring back lapsed customers?",
];

export function StoreAdvisor() {
  const { can } = useStore();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AdvisorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!can("reports")) return null;

  async function askAdvisor(q?: string) {
    const actualQuestion = q || question.trim();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/intelligence/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: actualQuestion || null,
        }),
      });

      if (res.status === 429) {
        const data = await res.json();
        setError(data.error || "Please wait before asking again.");
        setLoading(false);
        return;
      }

      if (res.status === 503) {
        setError("Store Advisor isn't configured yet. Ask your admin to add the ANTHROPIC_API_KEY.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Something went wrong. Try again in a moment.");
        setLoading(false);
        return;
      }

      const data: AdvisorResponse = await res.json();
      setResponse(data);
      setQuestion("");
      setExpanded(true);
    } catch {
      setError("Couldn't reach the advisor. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-950/20 to-card shadow-sm dark:shadow-none overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 md:px-5 md:py-4 text-left hover:bg-purple-950/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 text-sm font-bold">
            {"\u{1F9E0}"}
          </span>
          <div>
            <h3 className="text-sm md:text-base font-semibold text-foreground">
              Store Advisor
            </h3>
            <p className="text-xs text-muted">
              Ask anything about your business
            </p>
          </div>
        </div>
        <span
          className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          {"\u25BC"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-purple-500/10 px-4 py-4 md:px-5 md:py-5 space-y-4">
          {/* Quick Questions */}
          {!response && !loading && (
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => askAdvisor(q)}
                  className="rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-500/15 hover:border-purple-500/40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Custom Question Input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !loading) askAdvisor();
              }}
              placeholder="Ask about your inventory, cash flow, events..."
              className="flex-1 rounded-xl border border-input-border bg-input-bg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-purple-500 focus:outline-none"
              disabled={loading}
            />
            <button
              onClick={() => askAdvisor()}
              disabled={loading}
              className="shrink-0 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Thinking...</span>
                </span>
              ) : (
                "Ask"
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center gap-3 py-6">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="text-sm text-muted">
                Analyzing your store data...
              </p>
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="space-y-3">
              <div className="rounded-xl border border-purple-500/15 bg-card/80 p-4 md:p-5">
                <div className="prose prose-sm prose-invert max-w-none">
                  {response.advice.split("\n").map((paragraph, i) => {
                    if (!paragraph.trim()) return null;
                    // Bold markdown **text** rendering
                    const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <p
                        key={i}
                        className="text-sm text-foreground/90 leading-relaxed mb-3 last:mb-0"
                      >
                        {parts.map((part, j) => {
                          if (part.startsWith("**") && part.endsWith("**")) {
                            return (
                              <strong key={j} className="text-foreground font-semibold">
                                {part.slice(2, -2)}
                              </strong>
                            );
                          }
                          return part;
                        })}
                      </p>
                    );
                  })}
                </div>
              </div>

              {/* Ask Follow-up */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setResponse(null);
                    setExpanded(true);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Ask a follow-up question
                </button>
                <span className="text-xs text-muted">|</span>
                <button
                  onClick={() => askAdvisor()}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Refresh analysis
                </button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted/60">
                  Powered by Claude. Advice is based on your store data and may not account for external factors.
                </p>
                {response.usage && (
                  <p className="text-[10px] text-muted/60">
                    {response.usage.limit - response.usage.today} of {response.usage.limit} requests remaining today
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
