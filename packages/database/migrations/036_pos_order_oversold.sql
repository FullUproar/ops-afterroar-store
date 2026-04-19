-- 036: Mark orders that ingested with insufficient inventory.
--
-- Context: when a marketplace (eBay, Shopify, generic API) tells us
-- about an order, we hard-decrement on-hand quantity in the same
-- transaction so POS can't sell what's already been bought online.
-- If the inventory is short, we still create the order (we already
-- accepted it externally and can't refuse it) but we tag it so the
-- fulfillment UI can surface a banner and let the cashier choose:
-- backorder / cancel+refund / reconcile-actual-stock.
--
-- We use a boolean flag rather than overloading `status` because
-- status drives the workflow (processing → shipped → delivered) and
-- "oversold" is orthogonal to that.

ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS is_oversold BOOLEAN NOT NULL DEFAULT false;

-- Partial index — most orders are not oversold, so a partial index
-- is faster than a full one for the fulfillment-time "needs attention"
-- query.
CREATE INDEX IF NOT EXISTS idx_pos_orders_oversold
  ON pos_orders (store_id, fulfillment_status)
  WHERE is_oversold = true;
