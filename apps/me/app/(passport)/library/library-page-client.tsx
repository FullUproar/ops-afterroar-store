'use client';

import { useState } from 'react';
import { LibraryEditor } from './library-editor';
import { ShelfScanner } from './shelf-scanner';

interface GameEntry {
  title: string;
  slug?: string;
  bggId?: number;
}

export function LibraryPageClient({ initialGames }: { initialGames: GameEntry[] }) {
  const [games, setGames] = useState<GameEntry[]>(initialGames);

  const handleScanAdd = async (newGames: Array<{ title: string; slug?: string; bggId?: number }>) => {
    const deduped = newGames.filter(
      (ng) => !games.some((g) => g.title.toLowerCase() === ng.title.toLowerCase())
    );
    if (deduped.length === 0) return;

    const updated = [...games, ...deduped];
    setGames(updated);

    await fetch('/api/library/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games: updated }),
    });
  };

  return (
    <>
      <ShelfScanner
        existingGames={games.map((g) => g.title)}
        onAdd={handleScanAdd}
      />
      <LibraryEditor key={games.length} initialGames={games} />
    </>
  );
}
