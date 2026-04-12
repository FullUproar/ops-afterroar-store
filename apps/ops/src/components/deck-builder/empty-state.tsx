"use client";

/* ------------------------------------------------------------------ */
/*  Deck Builder Empty State — welcoming, game-aware                    */
/* ------------------------------------------------------------------ */

export function DeckBuilderEmptyState({
  format,
}: {
  format: string;
}) {
  const isCommander = format === "commander";
  const isPokemon = format === "pokemon";
  const isYugioh = format === "yugioh";

  const message = isCommander
    ? "Search for a commander to see synergy cards matched against your inventory."
    : isPokemon
      ? "Browse tournament decks or paste a decklist to check your store's stock."
      : isYugioh
        ? "Search for cards or paste a decklist to see what your store has available."
        : "Pick an archetype above, search for cards, or paste a decklist. We'll show what's in stock and suggest substitutes.";

  const emoji = isCommander ? "\u2694\uFE0F" : isPokemon ? "\u26A1" : isYugioh ? "\uD83C\uDFB4" : "\u2660\uFE0F";

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="text-5xl mb-4 opacity-30">{emoji}</div>
      <h2 className="text-lg font-semibold text-foreground/80 mb-2">
        Build a deck from your shelves
      </h2>
      <p className="text-sm text-muted max-w-sm leading-relaxed">
        {message}
      </p>
    </div>
  );
}
