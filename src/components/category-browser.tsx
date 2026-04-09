"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/types";
import type { InventoryItem } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
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

interface CategoryBrowserProps {
  onAddToCart: (item: InventoryItem) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function CategoryBrowser({ onAddToCart }: CategoryBrowserProps) {
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<CategoryNode[]>([]);
  const [currentChildren, setCurrentChildren] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Load category tree once (cached for entire session)
  useEffect(() => {
    if (treeLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/catalog/categories?seed=true");
        if (res.ok) {
          const data: CategoryNode[] = await res.json();
          setCategoryTree(data);
          setCurrentChildren(data);
        }
      } catch {
        // Categories unavailable
      } finally {
        setTreeLoaded(true);
      }
    })();
  }, [treeLoaded]);

  // Load inventory items for a category slug
  const loadCategoryProducts = useCallback(async (categorySlug: string) => {
    setLoadingProducts(true);
    try {
      // Map category slugs to inventory category values
      const categoryMap: Record<string, string> = {
        tcg: "tcg_single",
        mtg: "tcg_single",
        "mtg-singles": "tcg_single",
        "mtg-sealed": "sealed",
        "mtg-accessories": "accessory",
        pokemon: "tcg_single",
        lorcana: "tcg_single",
        yugioh: "tcg_single",
        swu: "tcg_single",
        "one-piece": "tcg_single",
        fab: "tcg_single",
        "board-games": "board_game",
        strategy: "board_game",
        family: "board_game",
        party: "board_game",
        cooperative: "board_game",
        solo: "board_game",
        "two-player": "board_game",
        miniatures: "miniature",
        wh40k: "miniature",
        aos: "miniature",
        "paint-supplies": "miniature",
        tools: "miniature",
        accessories: "accessory",
        sleeves: "accessory",
        "deck-boxes": "accessory",
        binders: "accessory",
        dice: "accessory",
        playmats: "accessory",
        toploaders: "accessory",
        "food-drink": "food_drink",
        "hot-drinks": "food_drink",
        "cold-drinks": "food_drink",
        snacks: "food_drink",
        meals: "food_drink",
        other: "other",
      };

      const invCategory = categoryMap[categorySlug] || categorySlug;

      // Query store inventory by category, filtered to in-stock items
      const res = await fetch(
        `/api/inventory/search?category=${encodeURIComponent(invCategory)}&in_stock=true`
      );
      if (res.ok) {
        const data = await res.json();
        // Filter by game/set for more specific categories
        let filtered = Array.isArray(data) ? data : [];

        // Further filter by game for TCG subcategories
        const gameMap: Record<string, string> = {
          mtg: "MTG",
          "mtg-singles": "MTG",
          "mtg-sealed": "MTG",
          "mtg-accessories": "MTG",
          pokemon: "Pokemon",
          lorcana: "Lorcana",
          yugioh: "Yu-Gi-Oh",
          swu: "Star Wars Unlimited",
          "one-piece": "One Piece",
          fab: "Flesh and Blood",
        };
        const game = gameMap[categorySlug];
        if (game) {
          filtered = filtered.filter((item: InventoryItem) => {
            const attrs = item.attributes as Record<string, unknown>;
            return attrs?.game === game;
          });
        }

        setProducts(filtered.filter((item: InventoryItem) => item.quantity > 0));
      }
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  function navigateToCategory(cat: CategoryNode) {
    if (cat.children.length > 0) {
      // Has subcategories -- show them
      setBreadcrumb((prev) => [...prev, cat]);
      setCurrentChildren(cat.children);
      setProducts([]);
    } else {
      // Leaf node -- load products
      setBreadcrumb((prev) => [...prev, cat]);
      setCurrentChildren([]);
      loadCategoryProducts(cat.slug);
    }
  }

  function navigateBack() {
    if (breadcrumb.length === 0) return;
    const newBreadcrumb = breadcrumb.slice(0, -1);
    setBreadcrumb(newBreadcrumb);

    if (newBreadcrumb.length === 0) {
      setCurrentChildren(categoryTree);
    } else {
      const parent = newBreadcrumb[newBreadcrumb.length - 1];
      setCurrentChildren(parent.children);
    }
    setProducts([]);
  }

  function navigateToBreadcrumb(index: number) {
    if (index < 0) {
      // Navigate to root
      setBreadcrumb([]);
      setCurrentChildren(categoryTree);
      setProducts([]);
      return;
    }
    const newBreadcrumb = breadcrumb.slice(0, index + 1);
    const target = newBreadcrumb[newBreadcrumb.length - 1];
    setBreadcrumb(newBreadcrumb);
    setCurrentChildren(target.children);
    setProducts([]);
  }

  if (!treeLoaded) {
    return (
      <div className="py-8 text-center text-muted text-sm">
        Loading categories...
      </div>
    );
  }

  if (categoryTree.length === 0) {
    return (
      <div className="py-8 text-center text-muted text-sm">
        No categories available. Categories will be created when you first use the catalog.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Breadcrumb navigation */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-sm flex-wrap">
          <button
            onClick={() => navigateToBreadcrumb(-1)}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            All
          </button>
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <span className="text-zinc-600">/</span>
              {i < breadcrumb.length - 1 ? (
                <button
                  onClick={() => navigateToBreadcrumb(i)}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {crumb.name}
                </button>
              ) : (
                <span className="text-foreground font-medium">{crumb.name}</span>
              )}
            </span>
          ))}
          <button
            onClick={navigateBack}
            className="ml-auto rounded-xl bg-card-hover px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-card-hover active:bg-card-hover transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Category tiles */}
      {currentChildren.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {currentChildren.map((cat) => (
            <button
              key={cat.id}
              onClick={() => navigateToCategory(cat)}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-card-border bg-card px-3 py-4 min-h-[64px] text-center hover:bg-card-hover hover:border-input-border active:bg-card-hover transition-colors"
            >
              {cat.icon && (
                <span className="text-xl leading-none">{cat.icon}</span>
              )}
              <span className="text-sm font-medium text-foreground leading-tight">
                {cat.name}
              </span>
              {cat.children.length > 0 && (
                <span className="text-[10px] text-muted">
                  {cat.children.length} subcategories
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Products list */}
      {currentChildren.length === 0 && (
        <>
          {loadingProducts ? (
            <div className="py-8 text-center text-muted text-sm">
              Loading products...
            </div>
          ) : products.length === 0 ? (
            <div className="py-8 text-center text-muted text-sm">
              No in-stock items in this category.
            </div>
          ) : (
            <div className="space-y-1 max-h-[60vh] md:max-h-[50vh] overflow-y-auto scroll-visible">
              {products.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-3 py-2 hover:bg-card-hover transition-colors"
                >
                  {/* Small image */}
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0 bg-card-hover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-card-hover shrink-0 flex items-center justify-center text-zinc-600 text-xs">
                      --
                    </div>
                  )}

                  {/* Name + details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {item.name}
                    </div>
                    <div className="text-xs text-muted">
                      {item.quantity} in stock
                    </div>
                  </div>

                  {/* Price + add button */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-400">
                      {formatCents(item.price_cents)}
                    </span>
                    <button
                      onClick={() => onAddToCart(item)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-foreground hover:bg-emerald-500 active:bg-emerald-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
