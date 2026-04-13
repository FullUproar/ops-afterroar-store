'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2, Check, X, Plus, Star, Users, Clock } from 'lucide-react';

interface ResolvedGame {
  title: string;
  bggId: number | null;
  slug: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playTime: string | null;
  complexity: number | null;
  bggRating: number | null;
  yearPublished: number | null;
  thumbnail: string | null;
  confidence: 'high' | 'medium' | 'low';
  rawGuess: string;
}

interface ShelfScannerProps {
  existingGames: string[];
  onAdd: (games: Array<{ title: string; slug?: string; bggId?: number }>) => void;
}

const confidenceColors = {
  high: '#10b981',
  medium: '#FF8200',
  low: '#6b7280',
};

export function ShelfScanner({ existingGames, onAdd }: ShelfScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ResolvedGame[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
            else { width = Math.round(width * maxDim / height); height = maxDim; }
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError('');
    setResults(null);

    try {
      const resized = await resizeImage(file);
      const res = await fetch('/api/library/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: resized }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Scan failed');
        if (data.scansRemaining !== undefined) setScansRemaining(data.scansRemaining);
        return;
      }

      const newGames = (data.games as ResolvedGame[]).filter(
        (g) => !existingGames.some((eg) => eg.toLowerCase() === g.title.toLowerCase())
      );
      setResults(newGames);
      setSelected(new Set(newGames.map((g) => g.title)));
      if (data.scansRemaining !== undefined) setScansRemaining(data.scansRemaining);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleGame = (title: string) => {
    const next = new Set(selected);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    setSelected(next);
  };

  const confirmAdd = () => {
    if (!results || selected.size === 0) return;
    const toAdd = results
      .filter((g) => selected.has(g.title))
      .map((g) => ({ title: g.title, slug: g.slug || undefined, bggId: g.bggId || undefined }));
    onAdd(toAdd);
    setResults(null);
    setSelected(new Set());
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />

      {!results && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            width: '100%', padding: '1rem',
            background: scanning ? '#374151' : 'rgba(255, 130, 0, 0.08)',
            border: `2px dashed ${scanning ? '#374151' : '#FF8200'}`,
            borderRadius: '12px',
            color: scanning ? '#6b7280' : '#FF8200',
            fontSize: '0.95rem', fontWeight: 700,
            cursor: scanning ? 'wait' : 'pointer',
          }}
        >
          {scanning ? (
            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Identifying games...</>
          ) : (
            <><Camera size={18} /> Scan your game shelf</>
          )}
        </button>
      )}

      {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>}

      {scansRemaining !== null && scansRemaining < 999 && !results && (
        <p style={{ color: '#4b5563', fontSize: '0.75rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
          {scansRemaining} scan{scansRemaining !== 1 ? 's' : ''} remaining today
        </p>
      )}

      {results && (
        <div style={{
          background: '#1f2937', borderRadius: '12px',
          border: '2px solid #FF8200', padding: '1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#FF8200', fontWeight: 700, fontSize: '1rem' }}>
              {results.length > 0 ? `Found ${results.length} new game${results.length !== 1 ? 's' : ''}` : 'No new games found'}
            </h3>
            <button onClick={() => { setResults(null); setSelected(new Set()); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
              <X size={16} />
            </button>
          </div>

          {results.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {results.map((game) => (
                  <button
                    key={game.title}
                    onClick={() => toggleGame(game.title)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.75rem', textAlign: 'left',
                      background: selected.has(game.title) ? 'rgba(255, 130, 0, 0.06)' : 'transparent',
                      border: `1px solid ${selected.has(game.title) ? '#FF8200' : '#374151'}`,
                      borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                      border: `2px solid ${selected.has(game.title) ? '#FF8200' : '#4b5563'}`,
                      background: selected.has(game.title) ? '#FF8200' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected.has(game.title) && <Check size={12} style={{ color: '#0a0a0a' }} />}
                    </div>

                    {/* Thumbnail */}
                    {game.thumbnail && (
                      <img
                        src={game.thumbnail}
                        alt=""
                        width={40} height={40}
                        style={{ borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
                      />
                    )}

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{game.title}</span>
                        {game.yearPublished && (
                          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>({game.yearPublished})</span>
                        )}
                        <span style={{
                          padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700,
                          background: `${confidenceColors[game.confidence]}20`,
                          color: confidenceColors[game.confidence],
                        }}>
                          {game.confidence === 'high' ? 'exact match' : game.confidence === 'medium' ? 'likely match' : 'unverified'}
                        </span>
                      </div>
                      {game.rawGuess !== game.title && (
                        <div style={{ color: '#4b5563', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                          Detected: &quot;{game.rawGuess}&quot;
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                        {game.minPlayers && game.maxPlayers && (
                          <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <Users size={11} /> {game.minPlayers}–{game.maxPlayers}
                          </span>
                        )}
                        {game.playTime && (
                          <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <Clock size={11} /> {game.playTime}
                          </span>
                        )}
                        {game.bggRating && (
                          <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <Star size={11} /> {game.bggRating}
                          </span>
                        )}
                        {game.complexity && (
                          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                            Weight: {game.complexity}/5
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={confirmAdd}
                disabled={selected.size === 0}
                style={{
                  width: '100%', padding: '0.75rem',
                  background: selected.size > 0 ? '#FF8200' : '#374151',
                  border: 'none', borderRadius: '8px',
                  color: selected.size > 0 ? '#0a0a0a' : '#6b7280',
                  fontWeight: 700, fontSize: '0.95rem',
                  cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                <Plus size={16} /> Add {selected.size} game{selected.size !== 1 ? 's' : ''} to library
              </button>
            </>
          ) : (
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
              Try a clearer photo with game spines/covers facing the camera.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
