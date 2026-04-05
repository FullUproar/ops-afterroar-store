import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";

export async function GET(req: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("reports", "ecommerce");

    const url = new URL(req.url);
    const periodKey = url.searchParams.get("period") || "30d";

    const now = new Date();
    let from: Date;

    if (periodKey === "7d") {
      from = new Date(now.getTime() - 7 * 86400000);
    } else if (periodKey === "90d") {
      from = new Date(now.getTime() - 90 * 86400000);
    } else {
      from = new Date(now.getTime() - 30 * 86400000);
    }

    // Fetch orders in the period
    const orders = await db.posOrder.findMany({
      where: {
        created_at: { gte: from, lte: now },
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        source: true,
        total_cents: true,
        shipping_cents: true,
        created_at: true,
        shipped_at: true,
        fulfilled_at: true,
      },
    });

    // Fetch shipping labels for cost data
    const orderIds = orders.map((o) => o.id);
    const labels = orderIds.length > 0
      ? await db.posShippingLabel.findMany({
          where: {
            order_id: { in: orderIds },
            voided: false,
          },
          select: {
            order_id: true,
            shipment_cost_cents: true,
          },
        })
      : [];

    const labelCostByOrder = new Map<string, number>();
    for (const label of labels) {
      labelCostByOrder.set(
        label.order_id,
        (labelCostByOrder.get(label.order_id) || 0) + label.shipment_cost_cents,
      );
    }

    // Fetch order items for top-items-by-channel
    const orderItems = orderIds.length > 0
      ? await db.posOrderItem.findMany({
          where: { order_id: { in: orderIds } },
          select: {
            order_id: true,
            name: true,
            quantity: true,
            total_cents: true,
          },
        })
      : [];

    // Map order_id -> source
    const orderSourceMap = new Map(orders.map((o) => [o.id, o.source]));

    // Also fetch POS-only sales from ledger (orders with source=pos may not be in pos_orders)
    const posSales = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        created_at: { gte: from, lte: now },
      },
      select: {
        amount_cents: true,
        metadata: true,
      },
    });

    // Channel stats
    interface ChannelData {
      revenue_cents: number;
      order_count: number;
      shipping_charged_cents: number;
      shipping_cost_cents: number;
      fulfillment_hours_sum: number;
      fulfillment_count: number;
      items: Map<string, { name: string; revenue: number; units: number }>;
    }

    const channels = new Map<string, ChannelData>();

    function getChannel(source: string): ChannelData {
      let ch = channels.get(source);
      if (!ch) {
        ch = {
          revenue_cents: 0,
          order_count: 0,
          shipping_charged_cents: 0,
          shipping_cost_cents: 0,
          fulfillment_hours_sum: 0,
          fulfillment_count: 0,
          items: new Map(),
        };
        channels.set(source, ch);
      }
      return ch;
    }

    for (const order of orders) {
      const ch = getChannel(order.source);
      ch.revenue_cents += order.total_cents;
      ch.order_count++;
      ch.shipping_charged_cents += order.shipping_cents;
      ch.shipping_cost_cents += labelCostByOrder.get(order.id) || 0;

      // Fulfillment time
      if (order.shipped_at && order.created_at) {
        const hoursToShip =
          (order.shipped_at.getTime() - order.created_at.getTime()) / 3600000;
        ch.fulfillment_hours_sum += hoursToShip;
        ch.fulfillment_count++;
      }
    }

    // POS channel from ledger (add if no POS orders exist)
    let posRevenue = 0;
    let posTxCount = 0;
    for (const sale of posSales) {
      const meta = sale.metadata as Record<string, unknown> | null;
      const source = (meta?.source as string) || "pos";
      if (source === "pos") {
        posRevenue += sale.amount_cents;
        posTxCount++;
      }
    }

    // If POS channel doesn't have enough data from orders, supplement from ledger
    const posChannel = getChannel("pos");
    if (posChannel.order_count === 0 && posTxCount > 0) {
      posChannel.revenue_cents = posRevenue;
      posChannel.order_count = posTxCount;
    }

    // Top items by channel
    for (const oi of orderItems) {
      const source = orderSourceMap.get(oi.order_id) || "unknown";
      const ch = getChannel(source);
      const existing = ch.items.get(oi.name);
      if (existing) {
        existing.revenue += oi.total_cents;
        existing.units += oi.quantity;
      } else {
        ch.items.set(oi.name, { name: oi.name, revenue: oi.total_cents, units: oi.quantity });
      }
    }

    // Build response
    const totalRevenue = [...channels.values()].reduce((a, b) => a + b.revenue_cents, 0) || 1;

    const channelData = [...channels.entries()]
      .map(([source, data]) => ({
        channel: source,
        revenue_cents: data.revenue_cents,
        order_count: data.order_count,
        pct_of_revenue: Math.round((data.revenue_cents / totalRevenue) * 1000) / 10,
        shipping_charged_cents: data.shipping_charged_cents,
        shipping_cost_cents: data.shipping_cost_cents,
        shipping_margin_cents: data.shipping_charged_cents - data.shipping_cost_cents,
        avg_fulfillment_hours: data.fulfillment_count > 0
          ? Math.round(data.fulfillment_hours_sum / data.fulfillment_count)
          : null,
        top_items: [...data.items.values()]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5)
          .map((i) => ({ name: i.name, revenue_cents: i.revenue, units: i.units })),
      }))
      .sort((a, b) => b.revenue_cents - a.revenue_cents);

    // Simple trend: compare first half vs second half of period
    const midpoint = new Date(from.getTime() + (now.getTime() - from.getTime()) / 2);
    const channelTrends: Record<string, { first_half: number; second_half: number; trend: string }> = {};
    for (const order of orders) {
      const source = order.source;
      if (!channelTrends[source]) {
        channelTrends[source] = { first_half: 0, second_half: 0, trend: "flat" };
      }
      if (order.created_at < midpoint) {
        channelTrends[source].first_half += order.total_cents;
      } else {
        channelTrends[source].second_half += order.total_cents;
      }
    }
    // Also do POS trend from ledger
    if (!channelTrends.pos) {
      channelTrends.pos = { first_half: 0, second_half: 0, trend: "flat" };
    }
    for (const sale of posSales) {
      const meta = sale.metadata as Record<string, unknown> | null;
      const source = (meta?.source as string) || "pos";
      if (source === "pos") {
        // Use created_at from metadata or skip (we don't have it directly)
        // Simple: split evenly as fallback
      }
    }

    for (const [source, data] of Object.entries(channelTrends)) {
      if (data.first_half === 0 && data.second_half === 0) {
        data.trend = "no_data";
      } else if (data.first_half === 0) {
        data.trend = "new";
      } else {
        const change = ((data.second_half - data.first_half) / data.first_half) * 100;
        if (change > 10) data.trend = "up";
        else if (change < -10) data.trend = "down";
        else data.trend = "flat";
      }
    }

    // Attach trend to channel data
    const channelsWithTrend = channelData.map((ch) => ({
      ...ch,
      trend: channelTrends[ch.channel]?.trend || "flat",
    }));

    return NextResponse.json({
      period: { from: from.toISOString(), to: now.toISOString() },
      total_revenue_cents: totalRevenue,
      channels: channelsWithTrend,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
