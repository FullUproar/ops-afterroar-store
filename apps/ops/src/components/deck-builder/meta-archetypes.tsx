"use client";

/* ------------------------------------------------------------------ */
/*  Meta Archetypes — clickable deck archetype chips with meta share    */
/*  Shows what's winning in the current format.                         */
/* ------------------------------------------------------------------ */

interface LiveMetaResult {
  name: string;
  metaShare: number;
  format: string;
  deckUrl?: string;
}

export function MetaArchetypes({
  decks,
  loading,
  onSelect,
}: {
  decks: LiveMetaResult[];
  loading: boolean;
  onSelect: (archetype: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted py-3">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        Loading live meta data...
      </div>
    );
  }

  if (decks.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
        Popular Archetypes — tap to build
      </label>
      <div className="flex flex-wrap gap-2">
        {decks.slice(0, 12).map((deck) => (
          <button
            key={deck.name}
            onClick={() => onSelect(deck.name)}
            className="group rounded-xl border border-card-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-accent/50 hover:bg-card-hover active:scale-95 transition-all"
          >
            {deck.name}
            {deck.metaShare > 0 && (
              <span className="ml-1.5 text-xs text-accent font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                {deck.metaShare.toFixed(1)}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
