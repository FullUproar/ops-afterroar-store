import { prisma } from "./prisma";

interface CategoryDef {
  name: string;
  slug: string;
  icon?: string;
  sort_order: number;
  children?: CategoryDef[];
}

const CATEGORY_TREE: CategoryDef[] = [
  {
    name: "Trading Card Games",
    slug: "tcg",
    icon: "🃏",
    sort_order: 0,
    children: [
      {
        name: "Magic: The Gathering",
        slug: "mtg",
        icon: "🔮",
        sort_order: 0,
        children: [
          { name: "Singles", slug: "mtg-singles", sort_order: 0 },
          { name: "Sealed Product", slug: "mtg-sealed", sort_order: 1 },
          { name: "Accessories", slug: "mtg-accessories", sort_order: 2 },
        ],
      },
      { name: "Pokemon", slug: "pokemon", icon: "⚡", sort_order: 1 },
      { name: "Lorcana", slug: "lorcana", icon: "✨", sort_order: 2 },
      { name: "Yu-Gi-Oh", slug: "yugioh", icon: "👁", sort_order: 3 },
      { name: "Star Wars Unlimited", slug: "swu", icon: "⭐", sort_order: 4 },
      { name: "One Piece", slug: "one-piece", icon: "🏴‍☠️", sort_order: 5 },
      { name: "Flesh and Blood", slug: "fab", icon: "⚔", sort_order: 6 },
    ],
  },
  {
    name: "Board Games",
    slug: "board-games",
    icon: "🎲",
    sort_order: 1,
    children: [
      { name: "Strategy", slug: "strategy", sort_order: 0 },
      { name: "Family", slug: "family", sort_order: 1 },
      { name: "Party", slug: "party", sort_order: 2 },
      { name: "Cooperative", slug: "cooperative", sort_order: 3 },
      { name: "Solo", slug: "solo", sort_order: 4 },
      { name: "Two-Player", slug: "two-player", sort_order: 5 },
    ],
  },
  {
    name: "Miniatures & Wargaming",
    slug: "miniatures",
    icon: "⚔",
    sort_order: 2,
    children: [
      { name: "Warhammer 40K", slug: "wh40k", sort_order: 0 },
      { name: "Age of Sigmar", slug: "aos", sort_order: 1 },
      { name: "Paint & Supplies", slug: "paint-supplies", sort_order: 2 },
      { name: "Tools", slug: "tools", sort_order: 3 },
    ],
  },
  {
    name: "Accessories & Supplies",
    slug: "accessories",
    icon: "🛡",
    sort_order: 3,
    children: [
      { name: "Card Sleeves", slug: "sleeves", sort_order: 0 },
      { name: "Deck Boxes", slug: "deck-boxes", sort_order: 1 },
      { name: "Binders & Storage", slug: "binders", sort_order: 2 },
      { name: "Dice", slug: "dice", sort_order: 3 },
      { name: "Playmats", slug: "playmats", sort_order: 4 },
      { name: "Toploaders & Holders", slug: "toploaders", sort_order: 5 },
    ],
  },
  {
    name: "Food & Drink",
    slug: "food-drink",
    icon: "☕",
    sort_order: 4,
    children: [
      { name: "Hot Drinks", slug: "hot-drinks", sort_order: 0 },
      { name: "Cold Drinks", slug: "cold-drinks", sort_order: 1 },
      { name: "Snacks", slug: "snacks", sort_order: 2 },
      { name: "Meals", slug: "meals", sort_order: 3 },
    ],
  },
  {
    name: "Other",
    slug: "other",
    icon: "📦",
    sort_order: 5,
  },
];

async function insertCategory(
  def: CategoryDef,
  parentId: string | null,
  level: number
): Promise<void> {
  // Check if already exists by slug
  const existing = await prisma.posCatalogCategory.findFirst({
    where: { slug: def.slug },
  });

  let categoryId: string;

  if (existing) {
    categoryId = existing.id;
  } else {
    const created = await prisma.posCatalogCategory.create({
      data: {
        name: def.name,
        slug: def.slug,
        parent_id: parentId,
        icon: def.icon ?? null,
        sort_order: def.sort_order,
        level,
      },
    });
    categoryId = created.id;
  }

  if (def.children) {
    for (const child of def.children) {
      await insertCategory(child, categoryId, level + 1);
    }
  }
}

/**
 * Seeds the default catalog category tree.
 * Safe to call multiple times (skips existing slugs).
 */
export async function seedCatalogCategories(): Promise<{ created: number; skipped: number }> {
  const beforeCount = await prisma.posCatalogCategory.count();

  for (const root of CATEGORY_TREE) {
    await insertCategory(root, null, 0);
  }

  const afterCount = await prisma.posCatalogCategory.count();
  const created = afterCount - beforeCount;

  return { created, skipped: beforeCount };
}
