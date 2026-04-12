import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog/products?category=&q=&limit=&offset=
 * Browse catalog products by category and/or search.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};
    if (category) {
      where.category = category;
    }
    if (q && q.length >= 2) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const [products, total] = await Promise.all([
      prisma.posCatalogProduct.findMany({
        where,
        orderBy: [{ name: "asc" }],
        take: limit,
        skip: offset,
        include: {
          pricing: {
            select: {
              avg_sale_price_cents: true,
              velocity_per_week: true,
            },
          },
        },
      }),
      prisma.posCatalogProduct.count({ where }),
    ]);

    // Compute network pricing summary
    const results = products.map((p) => {
      const prices = p.pricing
        .filter((pr) => pr.avg_sale_price_cents != null)
        .map((pr) => pr.avg_sale_price_cents!);
      const avgPrice = prices.length > 0
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        game: p.game,
        product_type: p.product_type,
        set_name: p.set_name,
        set_code: p.set_code,
        attributes: p.attributes,
        image_url: p.image_url,
        description: p.description,
        verified: p.verified,
        network_pricing: {
          avg_price_cents: avgPrice,
          min_price_cents: minPrice,
          max_price_cents: maxPrice,
          store_count: p.pricing.length,
        },
      };
    });

    return NextResponse.json({ products: results, total });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/catalog/products
 * Share an inventory item to the catalog.
 * Body: { inventory_item_id }
 */
export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { inventory_item_id } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 }
      );
    }

    // Find the inventory item (tenant-scoped)
    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id },
    });
    if (!item) {
      return NextResponse.json(
        { error: "Inventory item not found" },
        { status: 404 }
      );
    }

    // If already linked to a catalog product, just toggle sharing on
    if (item.catalog_product_id) {
      await db.posInventoryItem.update({
        where: { id: item.id },
        data: { shared_to_catalog: true, updated_at: new Date() },
      });
      return NextResponse.json({
        catalog_product_id: item.catalog_product_id,
        action: "shared",
        message: `${item.name} is now shared to the catalog`,
      });
    }

    // Create catalog product from inventory item data
    const attrs = (item.attributes as Record<string, unknown>) || {};
    const catalogProduct = await prisma.posCatalogProduct.create({
      data: {
        name: item.name,
        category: item.category,
        subcategory: attrs.subcategory as string || null,
        game: attrs.game as string || null,
        product_type: attrs.product_type as string || null,
        set_name: attrs.set_name as string || attrs.set as string || null,
        set_code: attrs.set_code as string || null,
        attributes: item.attributes || {},
        external_ids: item.external_id
          ? { primary: item.external_id }
          : {},
        image_url: item.image_url,
        contributed_by_store_id: storeId,
      },
    });

    // Link inventory item to catalog product
    await db.posInventoryItem.update({
      where: { id: item.id },
      data: {
        catalog_product_id: catalogProduct.id,
        shared_to_catalog: true,
        updated_at: new Date(),
      },
    });

    return NextResponse.json(
      {
        catalog_product_id: catalogProduct.id,
        action: "created",
        message: `${item.name} added to the catalog`,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
