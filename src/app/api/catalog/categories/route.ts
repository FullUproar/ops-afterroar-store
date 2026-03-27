import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { seedCatalogCategories } from "@/lib/catalog-seed";

interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  level: number;
  product_count: number;
  children: CategoryNode[];
}

/**
 * GET /api/catalog/categories
 * Returns the full category tree (nested).
 * Optional: ?seed=true to seed defaults if empty.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const searchParams = request.nextUrl.searchParams;
    const shouldSeed = searchParams.get("seed") === "true";

    // Auto-seed if empty and requested
    const count = await prisma.posCatalogCategory.count();
    if (count === 0 && shouldSeed) {
      await seedCatalogCategories();
    }

    // Fetch all categories in one query
    const allCategories = await prisma.posCatalogCategory.findMany({
      orderBy: [{ level: "asc" }, { sort_order: "asc" }, { name: "asc" }],
    });

    // Build nested tree
    const nodeMap = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const cat of allCategories) {
      const node: CategoryNode = {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        sort_order: cat.sort_order,
        level: cat.level,
        product_count: cat.product_count,
        children: [],
      };
      nodeMap.set(cat.id, node);
    }

    for (const cat of allCategories) {
      const node = nodeMap.get(cat.id)!;
      if (cat.parent_id && nodeMap.has(cat.parent_id)) {
        nodeMap.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return NextResponse.json(roots);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/catalog/categories
 * Create a custom category.
 * Body: { name, slug, parent_id?, icon?, sort_order? }
 */
export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { name, slug, parent_id, icon, sort_order } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 }
      );
    }

    // Determine level from parent
    let level = 0;
    if (parent_id) {
      const parent = await prisma.posCatalogCategory.findUnique({
        where: { id: parent_id },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "Parent category not found" },
          { status: 404 }
        );
      }
      level = parent.level + 1;
    }

    // Check slug uniqueness
    const existing = await prisma.posCatalogCategory.findFirst({
      where: { slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A category with this slug already exists" },
        { status: 409 }
      );
    }

    const category = await prisma.posCatalogCategory.create({
      data: {
        name,
        slug,
        parent_id: parent_id || null,
        icon: icon || null,
        sort_order: sort_order ?? 0,
        level,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
