"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, ActionButton, EmptyState, SectionHeader } from "@/components/shared/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price_cents: number;
  fulfilled: boolean;
  fulfillment_type: string;
  fulfillment_provider: string | null;
  inventory_item?: {
    id: string;
    sku: string | null;
    barcode: string | null;
    image_url: string | null;
    category: string;
    weight_oz: number | null;
  } | null;
}

interface ShippingLabel {
  id: string;
  carrier_code: string;
  service_code: string;
  tracking_number: string | null;
  shipment_cost_cents: number;
  created_at: string;
}

interface FulfillmentOrder {
  id: string;
  order_number: string;
  source: string;
  status: string;
  fulfillment_status: string;
  fulfillment_type: string;
  total_cents: number;
  shipping_cents: number;
  shipping_method: string | null;
  shipping_carrier: string | null;
  shipping_address: Record<string, string> | null;
  tracking_number: string | null;
  weight_oz: number | null;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  items: OrderItem[];
  shipping_labels: ShippingLabel[];
}

interface Summary {
  unfulfilled: number;
  picking: number;
  packed: number;
  shipped: number;
  delivered: number;
}

interface ShippingRate {
  carrier: string;
  name: string;
  code: string;
  totalCents: number;
}

type TabFilter = "unfulfilled" | "picking,packed" | "shipped" | "all";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FULFILLMENT_COLORS: Record<string, string> = {
  unfulfilled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  picking: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  packed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  shipped: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const SOURCE_LABELS: Record<string, string> = {
  online: "Online",
  shopify: "Shopify",
  phone: "Phone",
  pos: "In-Store",
  marketplace: "Marketplace",
};

const FULFILLMENT_TYPE_ICONS: Record<string, { label: string; color: string }> = {
  merchant: { label: "Self-Fulfill", color: "text-blue-600 dark:text-blue-400" },
  pod: { label: "Print-on-Demand", color: "text-orange-600 dark:text-orange-400" },
  "3pl": { label: "3PL", color: "text-purple-600 dark:text-purple-400" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FulfillmentPage() {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({ unfulfilled: 0, picking: 0, packed: 0, shipped: 0, delivered: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("unfulfilled");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pullSheetLoading, setPullSheetLoading] = useState(false);

  // Rate shopping state
  const [rateOrderId, setRateOrderId] = useState<string | null>(null);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);
  const [generatingLabel, setGeneratingLabel] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/fulfillment?status=${tab}`);
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders);
      setSummary(data.summary);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(fetchOrders, 30_000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  const updateFulfillment = async (orderId: string, data: Record<string, unknown>) => {
    setActionLoading(orderId);
    try {
      const res = await fetch("/api/fulfillment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, ...data }),
      });
      if (res.ok) await fetchOrders();
    } finally {
      setActionLoading(null);
    }
  };

  const fetchRates = async (order: FulfillmentOrder) => {
    setRateOrderId(order.id);
    setLoadingRates(true);
    setRates([]);
    setSelectedRate(null);

    try {
      // Build items from order for weight calculation
      const items = order.items.map((item) => ({
        category: item.inventory_item?.category || "other",
        quantity: item.quantity,
        weight_oz: item.inventory_item?.weight_oz || undefined,
      }));

      const addr = order.shipping_address || {};
      const res = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          to_zip: addr.zip || addr.postalCode || "",
          to_state: addr.state || "",
          to_country: addr.country || "US",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRates(data.rates || []);
        if (data.rates?.length > 0) setSelectedRate(data.rates[0]);
      }
    } finally {
      setLoadingRates(false);
    }
  };

  const generateLabel = async (orderId: string) => {
    if (!selectedRate) return;
    setGeneratingLabel(true);

    try {
      const res = await fetch("/api/shipping/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          carrier_code: selectedRate.carrier,
          service_code: selectedRate.code,
        }),
      });

      if (res.ok) {
        setRateOrderId(null);
        setRates([]);
        setSelectedRate(null);
        await fetchOrders();
      }
    } finally {
      setGeneratingLabel(false);
    }
  };

  const printPullSheet = async () => {
    setPullSheetLoading(true);
    try {
      const res = await fetch(`/api/fulfillment/pull-sheet?status=${tab}`);
      if (!res.ok) return;
      const data = await res.json();

      const sections = (data.sections || []) as {
        category: string;
        items: {
          name: string;
          sku: string | null;
          total_quantity: number;
          orders: string[];
          location: string | null;
        }[];
      }[];

      // Build print-friendly HTML
      const html = `<!DOCTYPE html>
<html><head>
<title>Pull Sheet - ${new Date(data.generated_at).toLocaleDateString()}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Courier New", Courier, monospace; font-size: 12px; padding: 20px; color: #000; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .section { margin-bottom: 16px; }
  .section-header { font-size: 14px; font-weight: bold; text-transform: uppercase; background: #eee; padding: 4px 8px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #999; padding: 2px 4px; }
  td { padding: 4px; border-bottom: 1px dotted #ccc; vertical-align: top; }
  .cb { width: 20px; text-align: center; }
  .qty { width: 40px; text-align: center; font-weight: bold; }
  .sku { width: 120px; font-size: 11px; color: #555; }
  .loc { width: 120px; font-size: 11px; color: #555; }
  .orders { font-size: 10px; color: #777; }
  @media print { body { padding: 10px; } }
</style>
</head><body>
<h1>Pull Sheet</h1>
<div class="meta">
  Generated: ${new Date(data.generated_at).toLocaleString()} &nbsp;|&nbsp;
  Orders: ${data.order_count} &nbsp;|&nbsp;
  Total items: ${data.total_items}
</div>
${sections.map((s: typeof sections[number]) => `
<div class="section">
  <div class="section-header">${s.category.replace(/_/g, " ")}</div>
  <table>
    <tr><th class="cb"></th><th class="qty">Qty</th><th>Item</th><th class="sku">SKU</th><th class="loc">Location</th><th>Orders</th></tr>
    ${s.items.map((item: typeof s.items[number]) => `
    <tr>
      <td class="cb">&#9744;</td>
      <td class="qty">${item.total_quantity}</td>
      <td>${item.name}</td>
      <td class="sku">${item.sku || "-"}</td>
      <td class="loc">${item.location || "-"}</td>
      <td class="orders">${item.orders.join(", ")}</td>
    </tr>`).join("")}
  </table>
</div>`).join("")}
</body></html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        // Auto-trigger print dialog after a brief render
        setTimeout(() => win.print(), 400);
      }
    } finally {
      setPullSheetLoading(false);
    }
  };

  const formatAddress = (addr: Record<string, string> | null) => {
    if (!addr) return "No address";
    const parts = [addr.street1 || addr.street, addr.street2, addr.city, addr.state, addr.zip || addr.postalCode].filter(Boolean);
    return parts.join(", ") || "No address";
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "< 1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "unfulfilled", label: "To Fulfill", count: summary.unfulfilled },
    { key: "picking,packed", label: "In Progress", count: summary.picking + summary.packed },
    { key: "shipped", label: "Shipped", count: summary.shipped },
    { key: "all", label: "All", count: summary.unfulfilled + summary.picking + summary.packed + summary.shipped + summary.delivered },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Fulfillment Queue" />
        <ActionButton
          variant="secondary"
          onClick={printPullSheet}
          loading={pullSheetLoading}
        >
          {!pullSheetLoading && <span>&#x1F5A8;</span>}
          Print Pull Sheet
        </ActionButton>
      </div>

      {/* Tab bar with counts */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-[#FF8200] text-[#FF8200]"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                tab === t.key
                  ? "bg-[#FF8200]/10 text-[#FF8200]"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <span className="mr-2 animate-spin inline-block">&#9696;</span>
          Loading orders...
        </div>
      )}

      {/* Empty state */}
      {!loading && orders.length === 0 && (
        <EmptyState
          icon="&#x2714;"
          title={tab === "unfulfilled" ? "All caught up!" : "No orders"}
          description={tab === "unfulfilled"
            ? "No orders waiting to be fulfilled"
            : "No orders match this filter"}
        />
      )}

      {/* Order list */}
      <div className="space-y-3">
        {orders.map((order) => {
          const isExpanded = expandedOrder === order.id;
          const isShowingRates = rateOrderId === order.id;
          const merchantItems = order.items.filter((i) => i.fulfillment_type === "merchant");
          const podItems = order.items.filter((i) => i.fulfillment_type === "pod");
          const thirdPartyItems = order.items.filter((i) => i.fulfillment_type === "3pl");
          const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
          const typeInfo = FULFILLMENT_TYPE_ICONS[order.fulfillment_type] || FULFILLMENT_TYPE_ICONS.merchant;

          return (
            <div
              key={order.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Order header — always visible */}
              <button
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">
                      #{order.order_number}
                    </span>
                    <StatusBadge status={order.fulfillment_status} size="xs" />
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                      {SOURCE_LABELS[order.source] || order.source}
                    </span>
                    {order.fulfillment_type !== "merchant" && (
                      <span className={`text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>{order.customer?.name || "Guest"}</span>
                    <span>&middot;</span>
                    <span>{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
                    <span>&middot;</span>
                    <span>{formatCents(order.total_cents)}</span>
                    <span>&middot;</span>
                    <span>{timeAgo(order.created_at)}</span>
                  </div>
                </div>

                {order.tracking_number && (
                  <div className="text-xs text-green-600 dark:text-green-400 font-mono shrink-0">
                    <span className="mr-1">&#x1F69A;</span>
                    {order.tracking_number}
                  </div>
                )}

                {isExpanded ? (
                  <span className="text-gray-400 shrink-0">&#x25B2;</span>
                ) : (
                  <span className="text-gray-400 shrink-0">&#x25BC;</span>
                )}
              </button>

              {/* Expanded order details */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-4">
                  {/* Ship-to address */}
                  <div className="flex items-start gap-3">
                    <span className="text-gray-400 mt-0.5 shrink-0">&#x1F4E6;</span>
                    <div className="text-sm">
                      <p className="font-medium">{order.customer?.name || "Guest"}</p>
                      <p className="text-gray-500">{formatAddress(order.shipping_address)}</p>
                      {order.customer?.email && (
                        <p className="text-gray-400 text-xs">{order.customer.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Pick list — merchant items */}
                  {merchantItems.length > 0 && (
                    <div>
                      <SectionHeader className="text-xs uppercase tracking-wide mb-2">Pick List</SectionHeader>
                      <div className="space-y-1.5">
                        {merchantItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 text-sm p-2 rounded ${
                              item.fulfilled
                                ? "bg-green-50 dark:bg-green-900/10 line-through text-gray-400"
                                : "bg-gray-50 dark:bg-gray-800"
                            }`}
                          >
                            {item.inventory_item?.image_url ? (
                              <img
                                src={item.inventory_item.image_url}
                                alt=""
                                className="w-8 h-8 object-cover rounded"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                                <span className="text-gray-400 text-xs">&#x25A1;</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{item.name}</p>
                              {item.inventory_item?.sku && (
                                <p className="text-xs text-gray-400">SKU: {item.inventory_item.sku}</p>
                              )}
                            </div>
                            <span className="font-mono text-sm font-semibold">
                              &times;{item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* POD items */}
                  {podItems.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">
                        Print-on-Demand
                      </h4>
                      <div className="space-y-1.5">
                        {podItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 text-sm p-2 rounded bg-orange-50 dark:bg-orange-900/10"
                          >
                            <span className="text-orange-500 text-xs">&#x1F3F7;</span>
                            <span className="flex-1 truncate">{item.name}</span>
                            <span className="text-xs text-orange-600">
                              {item.fulfillment_provider || "POD"}
                            </span>
                            <span className="font-mono text-sm">&times;{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3PL items */}
                  {thirdPartyItems.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">
                        Third-Party Logistics
                      </h4>
                      <div className="space-y-1.5">
                        {thirdPartyItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 text-sm p-2 rounded bg-purple-50 dark:bg-purple-900/10"
                          >
                            <span className="text-purple-500 text-xs">&#x1F69A;</span>
                            <span className="flex-1 truncate">{item.name}</span>
                            <span className="text-xs text-purple-600">
                              {item.fulfillment_provider || "3PL"}
                            </span>
                            <span className="font-mono text-sm">&times;{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Existing labels */}
                  {order.shipping_labels.length > 0 && (
                    <div>
                      <SectionHeader className="text-xs uppercase tracking-wide mb-2">Shipping Labels</SectionHeader>
                      {order.shipping_labels.map((label) => (
                        <div
                          key={label.id}
                          className="flex items-center gap-3 text-sm bg-green-50 dark:bg-green-900/10 p-2 rounded"
                        >
                          <span className="text-green-600 text-xs">&#x2705;</span>
                          <span className="font-mono">{label.tracking_number}</span>
                          <span className="text-gray-400">
                            {label.carrier_code} &middot; {formatCents(label.shipment_cost_cents)}
                          </span>
                          <a
                            href={`/api/shipping/labels/${label.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            &#x1F5A8; Print
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rate shopping panel */}
                  {isShowingRates && (
                    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/10">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        &#x1F69A; Select Shipping Rate
                      </h4>
                      {loadingRates ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span className="animate-spin inline-block">&#9696;</span> Fetching rates...
                        </div>
                      ) : rates.length === 0 ? (
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          &#x26A0; No rates available. Check ShipStation config.
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-visible">
                            {rates.map((rate, i) => (
                              <button
                                key={`${rate.carrier}-${rate.code}`}
                                onClick={() => setSelectedRate(rate)}
                                className={`w-full flex items-center gap-3 p-2.5 rounded text-sm text-left transition-colors ${
                                  selectedRate?.code === rate.code && selectedRate?.carrier === rate.carrier
                                    ? "bg-blue-100 dark:bg-blue-800/50 border border-blue-300 dark:border-blue-600"
                                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300"
                                }`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium">{rate.name}</p>
                                  <p className="text-xs text-gray-400">{rate.carrier.toUpperCase()}</p>
                                </div>
                                <span className="font-semibold">
                                  {formatCents(rate.totalCents)}
                                </span>
                                {order.shipping_cents > 0 && rate.totalCents < order.shipping_cents && (
                                  <span className="text-xs text-green-600">
                                    +{formatCents(order.shipping_cents - rate.totalCents)} margin
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-3">
                            <ActionButton
                              variant="accent"
                              onClick={() => generateLabel(order.id)}
                              disabled={!selectedRate}
                              loading={generatingLabel}
                              className="flex-1"
                            >
                              {!generatingLabel && <span>&#x1F5A8;</span>}
                              {generatingLabel ? "Creating..." : "Buy Label"}
                            </ActionButton>
                            <ActionButton
                              variant="secondary"
                              onClick={() => { setRateOrderId(null); setRates([]); }}
                            >
                              Cancel
                            </ActionButton>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {order.notes && (
                    <p className="text-sm text-gray-500 italic bg-yellow-50 dark:bg-yellow-900/10 p-2 rounded">
                      {order.notes}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100 dark:border-gray-800">
                    {order.fulfillment_status === "unfulfilled" && (
                      <ActionButton
                        variant="primary"
                        size="sm"
                        onClick={() => updateFulfillment(order.id, { fulfillment_status: "picking" })}
                        loading={actionLoading === order.id}
                      >
                        {actionLoading !== order.id && <span>&#x1F4E6;</span>}
                        Start Picking
                      </ActionButton>
                    )}

                    {(order.fulfillment_status === "picking" || order.fulfillment_status === "unfulfilled") && (
                      <ActionButton
                        variant="primary"
                        size="sm"
                        onClick={() => updateFulfillment(order.id, { fulfillment_status: "packed" })}
                        disabled={actionLoading === order.id}
                      >
                        &#x1F4E6; Mark Packed
                      </ActionButton>
                    )}

                    {(order.fulfillment_status === "picking" || order.fulfillment_status === "packed") && !isShowingRates && (
                      <ActionButton
                        variant="accent"
                        size="sm"
                        onClick={() => fetchRates(order)}
                      >
                        &#x1F69A; Buy Shipping Label
                      </ActionButton>
                    )}

                    {(order.fulfillment_status === "packed" || order.shipping_labels.length > 0) && (
                      <ActionButton
                        variant="primary"
                        size="sm"
                        onClick={() => updateFulfillment(order.id, { fulfillment_status: "shipped" })}
                        loading={actionLoading === order.id}
                      >
                        {actionLoading !== order.id && <span>&#x1F69A;</span>}
                        Mark Shipped
                      </ActionButton>
                    )}

                    {order.fulfillment_status === "shipped" && (
                      <ActionButton
                        variant="primary"
                        size="sm"
                        onClick={() => updateFulfillment(order.id, { fulfillment_status: "delivered" })}
                        loading={actionLoading === order.id}
                      >
                        {actionLoading !== order.id && <span>&#x2705;</span>}
                        Mark Delivered
                      </ActionButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
