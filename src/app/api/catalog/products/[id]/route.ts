import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog/products/[id]
 * Product detail with network pricing info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();

    const { id } = await params;

    const product = await prisma.posCatalogProduct.findUnique({
      where: { id },
      include: {
        pricing: {
          select: {
            avg_sale_price_cents: true,
            last_sale_price_cents: true,
            velocity_per_week: true,
          },
        },
        inventory_items: {
          where: { quantity: { gt: 0 }, active: true },
          select: { store_id: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Network pricing
    const prices = product.pricing
      .filter((p) => p.avg_sale_price_cents != null)
      .map((p) => p.avg_sale_price_cents!);
    const avgPrice = prices.length > 0
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null;
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

    // Anonymized store count
    const uniqueStores = new Set(product.inventory_items.map((i) => i.store_id));

    return NextResponse.json({
      id: product.id,
      name: product.name,
      category: product.category,
      subcategory: product.subcategory,
      game: product.game,
      product_type: product.product_type,
      set_name: product.set_name,
      set_code: product.set_code,
      attributes: product.attributes,
      image_url: product.image_url,
      description: product.description,
      verified: product.verified,
      network_pricing: {
        avg_price_cents: avgPrice,
        min_price_cents: minPrice,
        max_price_cents: maxPrice,
        store_count: product.pricing.length,
      },
      availability: {
        stores_in_stock: uniqueStores.size,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/catalog/products/[id]
 * Actions on a catalog product.
 * Body: { action: "add_to_inventory", price_cents?, quantity? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const { id } = await params;
    const body = await request.json();
    const { action, price_cents, quantity = 1 } = body;

    if (action !== "add_to_inventory") {
      return NextResponse.json(
        { error: "Unknown action. Supported: add_to_inventory" },
        { status: 400 }
      );
    }

    const product = await prisma.posCatalogProduct.findUnique({
      where: { id },
    });
    if (!product) {
      return NextResponse.json(
        { error: "Catalog product not found" },
        { status: 404 }
      );
    }

    // Check if this store already has this catalog product
    const existing = await db.posInventoryItem.findFirst({
      where: { catalog_product_id: id },
    });
    if (existing) {
      // Update quantity
      const updated = await db.posInventoryItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
          updated_at: new Date(),
        },
      });
      return NextResponse.json({
        item: updated,
        action: "updated",
        message: `${product.name} updated -- now ${updated.quantity} in stock`,
      });
    }

    // Create new inventory item from catalog product
    const item = await db.posInventoryItem.create({
      data: {
        store_id: storeId,
        name: product.name,
        category: product.category,
        price_cents: price_cents ?? 0,
        cost_cents: 0,
        quantity,
        image_url: product.image_url,
        attributes: product.attributes || {},
        catalog_product_id: product.id,
        shared_to_catalog: false, // opt-in to share back
      },
    });

    return NextResponse.json(
      {
        item,
        action: "created",
        message: `${product.name} added to inventory -- ${quantity} in stock`,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
