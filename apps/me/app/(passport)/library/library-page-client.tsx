'use client';

import { useState } from 'react';
import { LibraryEditor } from './library-editor';
import { ShelfScanner } from './shelf-scanner';

interface GameEntry {
  title: string;
  slug?: string;
}

export function LibraryPageClient({ initialGames }: { initialGames: GameEntry[] }) {
  const [games, setGames] = useState<GameEntry[]>(initialGames);

  const handleScanAdd = async (titles: string[]) => {
    const newGames = titles
      .filter((t) => !games.some((g) => g.title.toLowerCase() === t.toLowerCase()))
      .map((t) => ({ title: t }));

    if (newGames.length === 0) return;

    const updated = [...games, ...newGames];
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
      <LibraryEditor
        key={games.length}
        initialGames={games}
      />
    </>
  );
}
