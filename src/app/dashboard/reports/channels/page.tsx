"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { formatCents } from "@/lib/types";
import { FeatureGate } from "@/components/feature-gate";
import { StatCard, SectionHeader, EmptyState, MonoValue } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TopItem {
  name: string;
  revenue_cents: number;
  units: number;
}

interface ChannelInfo {
  channel: string;
  revenue_cents: number;
  order_count: number;
  pct_of_revenue: number;
  shipping_charged_cents: number;
  shipping_cost_cents: number;
  shipping_margin_cents: number;
  avg_fulfillment_hours: number | null;
  top_items: TopItem[];
  trend: string;
}

interface ChannelData {
  period: { from: string; to: string };
  total_revenue_cents: number;
  channels: ChannelInfo[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const CHANNEL_LABELS: Record<string, string> = {
  pos: "In-Store (POS)",
  ebay: "eBay",
  shopify: "Shopify",
  website: "Website",
  api: "External API",
  online: "Online",
  phone: "Phone Order",
};

const CHANNEL_COLORS: Record<string, string> = {
  pos: "bg-green-500",
  ebay: "bg-blue-500",
  shopify: "bg-emerald-500",
  website: "bg-purple-500",
  api: "bg-amber-500",
  online: "bg-cyan-500",
  phone: "bg-pink-500",
};

function channelLabel(ch: string) {
  return CHANNEL_LABELS[ch] || ch.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function channelColor(ch: string) {
  return CHANNEL_COLORS[ch] || "bg-zinc-500";
}

function TrendIndicator({ trend }: { trend: string }) {
  if (trend === "up") {
    return <span className="text-green-400 font-bold text-sm" title="Growing">&#9650; Growing</span>;
  }
  if (trend === "down") {
    return <span className="text-red-400 font-bold text-sm" title="Declining">&#9660; Declining</span>;
  }
  if (trend === "new") {
    return <span className="text-blue-400 font-bold text-sm" title="New channel">&#9733; New</span>;
  }
  if (trend === "no_data") {
    return <span className="text-muted text-sm">No data</span>;
  }
  return <span className="text-muted text-sm">&#9644; Steady</span>;
}

function formatHours(hours: number | null) {
  if (hours === null) return "N/A";
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""}`;
}

/* ------------------------------------------------------------------ */
/*  Period                                                              */
/* ------------------------------------------------------------------ */

type PeriodKey = "7d" | "30d" | "90d";
const PERIOD_LABELS: Record<PeriodKey, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChannelsPage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [data, setData] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/channels?period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <FeatureGate module="ecommerce">
      <div className="space-y-6">
        <PageHeader title="Channel Performance" backHref="/dashboard/reports" />

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "90d"] as PeriodKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === key
                  ? "bg-accent text-white"
                  : "bg-card border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center">
            <p className="text-muted">Loading channel data...</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Total revenue */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Revenue" value={formatCents(data.total_revenue_cents)} accent="green" />
              <StatCard label="Active Channels" value={data.channels.length.toString()} />
              <StatCard
                label="Top Channel"
                value={data.channels[0] ? channelLabel(data.channels[0].channel) : "None"}
              />
            </div>

            {/* Revenue by Channel — stacked bar */}
            {data.channels.length > 0 && (
              <section className="space-y-3">
                <SectionHeader>Revenue by Channel</SectionHeader>
                <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
                  <div className="h-6 rounded-full overflow-hidden flex">
                    {data.channels.map((ch) => (
                      <div
                        key={ch.channel}
                        className={`${channelColor(ch.channel)} transition-all`}
                        style={{ width: `${ch.pct_of_revenue}%` }}
                        title={`${channelLabel(ch.channel)}: ${ch.pct_of_revenue}%`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {data.channels.map((ch) => (
                      <div key={ch.channel} className="flex items-center gap-2 text-sm">
                        <div className={`w-3 h-3 rounded-full ${channelColor(ch.channel)}`} />
                        <span className="text-foreground">{channelLabel(ch.channel)}</span>
                        <span className="text-muted">{ch.pct_of_revenue}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Per-Channel Cards */}
            <section className="space-y-3">
              <SectionHeader>Channel Details</SectionHeader>
              <div className="space-y-4">
                {data.channels.map((ch) => (
                  <div key={ch.channel} className="rounded-xl border border-card-border bg-card p-4 space-y-4">
                    {/* Channel header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${channelColor(ch.channel)}`} />
                        <h3 className="text-lg font-semibold text-foreground">{channelLabel(ch.channel)}</h3>
                      </div>
                      <TrendIndicator trend={ch.trend} />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-muted">Revenue</p>
                        <p className="font-mono font-bold text-foreground text-lg">{formatCents(ch.revenue_cents)}</p>
                        <p className="text-xs text-muted">{ch.pct_of_revenue}% of total</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Orders</p>
                        <p className="font-mono font-bold text-foreground text-lg">{ch.order_count.toLocaleString()}</p>
                      </div>
                      {ch.channel !== "pos" && (
                        <div>
                          <p className="text-xs text-muted">Avg Fulfillment</p>
                          <p className="font-mono font-bold text-foreground">
                            {formatHours(ch.avg_fulfillment_hours)}
                          </p>
                        </div>
                      )}
                      {ch.channel !== "pos" && (ch.shipping_charged_cents > 0 || ch.shipping_cost_cents > 0) && (
                        <div>
                          <p className="text-xs text-muted">Shipping Margin</p>
                          <p className={`font-mono font-bold ${ch.shipping_margin_cents >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {formatCents(ch.shipping_margin_cents)}
                          </p>
                          <p className="text-xs text-muted">
                            Charged {formatCents(ch.shipping_charged_cents)} / Cost {formatCents(ch.shipping_cost_cents)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Top items for this channel */}
                    {ch.top_items.length > 0 && (
                      <div>
                        <p className="text-xs text-muted mb-2">Top Items</p>
                        <div className="space-y-1">
                          {ch.top_items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-foreground truncate mr-2">
                                <span className="text-muted mr-1">{i + 1}.</span>
                                {item.name}
                              </span>
                              <span className="text-muted shrink-0 font-mono text-xs">
                                {formatCents(item.revenue_cents)} &middot; {item.units} units
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {!loading && !error && data && data.channels.length === 0 && (
          <EmptyState
            icon={"\u25CE"}
            title="No channel data in this period"
            description="Sales from different channels (POS, eBay, Shopify) will appear here."
          />
        )}
      </div>
    </FeatureGate>
  );
}
