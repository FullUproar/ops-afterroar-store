'use client';

import { useState } from 'react';
import { Download, Loader2, Check, X } from 'lucide-react';

interface BGGGame {
  title: string;
  bggId: number;
  yearPublished: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  bggRating: number | null;
  alreadyOwned: boolean;
}

export function BGGImport({ existingGames, onImport }: {
  existingGames: string[];
  onImport: (games: Array<{ title: string; bggId: number }>) => void;
}) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BGGGame[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const handleFetch = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const res = await fetch('/api/library/import-bgg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();

      if (res.status === 202) {
        setError(data.error || 'BGG is preparing your collection. Try again in a few seconds.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Import failed');
        setLoading(false);
        return;
      }

      const newGames = (data.games as BGGGame[]).filter(
        (g) => !g.alreadyOwned && !existingGames.some((eg) => eg.toLowerCase() === g.title.toLowerCase())
      );
      setResults(newGames);
      setSelected(new Set(newGames.map((g) => g.title)));
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleGame = (title: string) => {
    const next = new Set(selected);
    if (next.has(title)) next.delete(title); else next.add(title);
    setSelected(next);
  };

  const confirmImport = () => {
    if (!results || selected.size === 0) return;
    const toImport = results
      .filter((g) => selected.has(g.title))
      .map((g) => ({ title: g.title, bggId: g.bggId }));
    onImport(toImport);
    setResults(null);
    setSelected(new Set());
    setUsername('');
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {!results ? (
        <div style={{
          display: 'flex', gap: '0.5rem', alignItems: 'center',
          background: '#1f2937', borderRadius: '8px', padding: '0.5rem 0.75rem',
          border: '1px solid #374151',
        }}>
          <Download size={16} style={{ color: '#6b7280', flexShrink: 0 }} />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFetch(); }}
            placeholder="BGG username"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: '#e2e8f0', fontSize: '0.9rem', outline: 'none',
            }}
          />
          <button onClick={handleFetch} disabled={!username.trim() || loading}
            style={{
              padding: '0.4rem 0.75rem', background: username.trim() ? '#FF8200' : '#374151',
              border: 'none', borderRadius: '6px', color: '#0a0a0a',
              fontWeight: 700, fontSize: '0.8rem',
              cursor: username.trim() && !loading ? 'pointer' : 'not-allowed',
            }}>
            {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Import'}
          </button>
        </div>
      ) : (
        <div style={{
          background: '#1f2937', borderRadius: '12px',
          border: '2px solid #3b82f6', padding: '1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, color: '#3b82f6', fontWeight: 700, fontSize: '1rem' }}>
              {results.length > 0 ? `${results.length} new game${results.length !== 1 ? 's' : ''} from BGG` : 'No new games found'}
            </h3>
            <button onClick={() => { setResults(null); setSelected(new Set()); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
              <X size={16} />
            </button>
          </div>

          {results.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                {results.map((game) => (
                  <button key={game.title} onClick={() => toggleGame(game.title)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 0.75rem', textAlign: 'left', width: '100%',
                      background: selected.has(game.title) ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                      border: `1px solid ${selected.has(game.title) ? '#3b82f6' : '#374151'}`,
                      borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.85rem',
                    }}>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                      border: `2px solid ${selected.has(game.title) ? '#3b82f6' : '#4b5563'}`,
                      background: selected.has(game.title) ? '#3b82f6' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected.has(game.title) && <Check size={10} style={{ color: '#fff' }} />}
                    </div>
                    <span style={{ flex: 1 }}>{game.title}</span>
                    {game.yearPublished && <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>({game.yearPublished})</span>}
                  </button>
                ))}
              </div>
              <button onClick={confirmImport} disabled={selected.size === 0}
                style={{
                  width: '100%', padding: '0.6rem',
                  background: selected.size > 0 ? '#3b82f6' : '#374151',
                  border: 'none', borderRadius: '6px', color: '#fff',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                }}>
                Import {selected.size} game{selected.size !== 1 ? 's' : ''}
              </button>
            </>
          ) : (
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
              All games from this BGG collection are already in your library.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  );
}
