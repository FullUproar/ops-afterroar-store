"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { ARTICLES, CATEGORIES, type HelpArticle } from "@/lib/help-articles";

/* ------------------------------------------------------------------ */
/*  Search scoring                                                      */
/* ------------------------------------------------------------------ */
interface ScoredArticle {
  article: HelpArticle;
  score: number;
  /** Indices into body where matches start (for highlighting) */
  titleMatches: [number, number][];
  bodyMatches: [number, number][];
}

function scoreArticle(article: HelpArticle, query: string): ScoredArticle | null {
  const q = query.toLowerCase();
  let score = 0;
  const titleMatches: [number, number][] = [];
  const bodyMatches: [number, number][] = [];

  // Title match (weight 10)
  const titleLower = article.title.toLowerCase();
  let idx = titleLower.indexOf(q);
  while (idx !== -1) {
    score += 10;
    titleMatches.push([idx, idx + q.length]);
    idx = titleLower.indexOf(q, idx + 1);
  }

  // Tag match (weight 5)
  for (const tag of article.tags) {
    if (tag.toLowerCase().includes(q)) score += 5;
  }

  // Body match (weight 1)
  const bodyLower = article.body.toLowerCase();
  idx = bodyLower.indexOf(q);
  while (idx !== -1) {
    score += 1;
    bodyMatches.push([idx, idx + q.length]);
    idx = bodyLower.indexOf(q, idx + 1);
  }

  // Category / subcategory match (weight 2)
  if (article.category.toLowerCase().includes(q)) score += 2;
  if (article.subcategory?.toLowerCase().includes(q)) score += 2;

  if (score === 0) return null;
  return { article, score, titleMatches, bodyMatches };
}

/* ------------------------------------------------------------------ */
/*  Highlight helper                                                    */
/* ------------------------------------------------------------------ */
function highlightText(
  text: string,
  matches: [number, number][],
): React.ReactNode {
  if (matches.length === 0) return text;

  // Merge overlapping ranges
  const sorted = [...matches].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="bg-accent/30 text-foreground rounded-sm px-0.5">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/* ------------------------------------------------------------------ */
/*  Related articles                                                    */
/* ------------------------------------------------------------------ */
function getRelatedArticles(article: HelpArticle, max = 3): HelpArticle[] {
  const scored: { a: HelpArticle; overlap: number }[] = [];
  for (const other of ARTICLES) {
    if (other.id === article.id) continue;
    const overlap = article.tags.filter((t) => other.tags.includes(t)).length;
    if (overlap > 0) scored.push({ a: other, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, max).map((s) => s.a);
}

/* ------------------------------------------------------------------ */
/*  Popular articles                                                    */
/* ------------------------------------------------------------------ */
const POPULAR_ARTICLES = ARTICLES.filter((a) => a.popular);

/* ------------------------------------------------------------------ */
/*  Help Center Page                                                    */
/* ------------------------------------------------------------------ */
export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search (200ms)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 200);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Score and filter articles
  const { filtered, matchCountByCategory } = useMemo(() => {
    const q = debouncedSearch.trim();
    const counts: Record<string, number> = {};

    if (!q) {
      // No search — filter by category only
      const result = selectedCategory
        ? ARTICLES.filter((a) => a.category === selectedCategory)
        : ARTICLES;

      for (const cat of CATEGORIES) {
        counts[cat] = ARTICLES.filter((a) => a.category === cat).length;
      }

      return {
        filtered: result.map((a) => ({
          article: a,
          score: 0,
          titleMatches: [] as [number, number][],
          bodyMatches: [] as [number, number][],
        })),
        matchCountByCategory: counts,
      };
    }

    // Score all articles
    const scored: ScoredArticle[] = [];
    for (const article of ARTICLES) {
      const result = scoreArticle(article, q);
      if (result) scored.push(result);
    }
    scored.sort((a, b) => b.score - a.score);

    // Count matches per category
    for (const cat of CATEGORIES) {
      counts[cat] = scored.filter((s) => s.article.category === cat).length;
    }

    // Apply category filter
    const result = selectedCategory
      ? scored.filter((s) => s.article.category === selectedCategory)
      : scored;

    return { filtered: result, matchCountByCategory: counts };
  }, [debouncedSearch, selectedCategory]);

  // Group by category
  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      articles: filtered.filter((s) => s.article.category === cat),
    })).filter((g) => g.articles.length > 0);
  }, [filtered]);

  const isSearching = debouncedSearch.trim().length > 0;
  const totalMatches = filtered.length;
  const showPopular = !isSearching && !selectedCategory;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8 min-w-0">
      <PageHeader title="Help Center" backHref="/dashboard" />

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search help articles..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full rounded-xl border border-input-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {isSearching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {totalMatches} result{totalMatches !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Category pills */}
      <div className="overflow-hidden w-full">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-visible">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
            !selectedCategory
              ? "bg-accent text-foreground"
              : "bg-card-hover text-muted hover:text-foreground"
          }`}
        >
          All
          <span className="ml-1 text-xs opacity-70">{ARTICLES.length}</span>
        </button>
        {CATEGORIES.map((cat) => {
          const count = matchCountByCategory[cat] ?? 0;
          if (isSearching && count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() =>
                setSelectedCategory(selectedCategory === cat ? null : cat)
              }
              className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-accent text-foreground"
                  : "bg-card-hover text-muted hover:text-foreground"
              }`}
            >
              {cat}
              <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      </div>

      {/* Popular articles (shown when no search and no category filter) */}
      {showPopular && POPULAR_ARTICLES.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2 px-1">
            Popular
          </h2>
          <div className="rounded-xl border border-card-border bg-card divide-y divide-card-border overflow-hidden">
            {POPULAR_ARTICLES.map((article) => (
              <button
                key={article.id}
                onClick={() =>
                  setExpandedArticle(
                    expandedArticle === article.id ? null : article.id,
                  )
                }
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-card-hover transition-colors"
              >
                <span className="text-accent text-xs shrink-0">&#9733;</span>
                <span className="text-sm font-medium text-foreground">
                  {article.title}
                </span>
                <span className="ml-auto text-xs text-muted shrink-0">
                  {article.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Articles */}
      {grouped.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted text-sm">No articles match your search.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2 px-1">
                {group.category}
              </h2>
              <div className="rounded-xl border border-card-border bg-card divide-y divide-card-border overflow-hidden">
                {group.articles.map(({ article, titleMatches, bodyMatches }) => {
                  const isExpanded = expandedArticle === article.id;
                  const related = isExpanded
                    ? getRelatedArticles(article)
                    : [];

                  return (
                    <div key={article.id}>
                      <button
                        onClick={() =>
                          setExpandedArticle(isExpanded ? null : article.id)
                        }
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-card-hover transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground">
                            {isSearching && titleMatches.length > 0
                              ? highlightText(article.title, titleMatches)
                              : article.title}
                          </span>
                          {/* Tag pills */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {article.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-card-hover text-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="text-muted text-xs shrink-0 ml-2">
                          {isExpanded ? "\u25B2" : "\u25BC"}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3">
                          <p className="text-sm text-muted leading-relaxed">
                            {isSearching && bodyMatches.length > 0
                              ? highlightText(article.body, bodyMatches)
                              : article.body}
                          </p>

                          {/* Tips */}
                          {article.tips && article.tips.length > 0 && (
                            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-1.5">
                              <div className="text-xs font-semibold text-accent">
                                Tips
                              </div>
                              {article.tips.map((tip, i) => (
                                <div
                                  key={i}
                                  className="text-xs text-muted leading-relaxed flex items-start gap-2"
                                >
                                  <span className="text-accent shrink-0 mt-0.5">
                                    &#8226;
                                  </span>
                                  <span>{tip}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Related articles */}
                          {related.length > 0 && (
                            <div className="pt-2 border-t border-card-border">
                              <div className="text-xs font-semibold text-muted mb-1.5">
                                Related
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {related.map((rel) => (
                                  <button
                                    key={rel.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedArticle(rel.id);
                                    }}
                                    className="text-xs px-2.5 py-1 rounded-lg bg-card-hover text-foreground hover:bg-accent/20 transition-colors"
                                  >
                                    {rel.title}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
