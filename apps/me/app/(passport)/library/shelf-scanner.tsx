'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2, Check, X, Plus } from 'lucide-react';

/**
 * Shelf Scanner — snap a photo of your game shelf, AI identifies the games.
 *
 * Uses Claude Haiku vision (cheap + fast). Rate limited to 3 scans/day.
 * Client resizes images to <1MB before upload.
 */

interface ShelfScannerProps {
  existingGames: string[];
  onAdd: (titles: string[]) => void;
}

export function ShelfScanner({ existingGames, onAdd }: ShelfScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round(height * maxDim / width);
              width = maxDim;
            } else {
              width = Math.round(width * maxDim / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);
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

      const newGames = (data.games as string[]).filter(
        (g) => !existingGames.some((eg) => eg.toLowerCase() === g.toLowerCase())
      );

      setResults(newGames);
      setSelected(new Set(newGames));
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
    if (selected.size === 0) return;
    onAdd(Array.from(selected));
    setResults(null);
    setSelected(new Set());
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {!results && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '1rem',
            background: scanning ? '#374151' : 'rgba(255, 130, 0, 0.08)',
            border: `2px dashed ${scanning ? '#374151' : '#FF8200'}`,
            borderRadius: '12px',
            color: scanning ? '#6b7280' : '#FF8200',
            fontSize: '0.95rem',
            fontWeight: 700,
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

      {error && (
        <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>
      )}

      {scansRemaining !== null && !results && (
        <p style={{ color: '#4b5563', fontSize: '0.75rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
          {scansRemaining} scan{scansRemaining !== 1 ? 's' : ''} remaining today
        </p>
      )}

      {/* Results confirmation */}
      {results && (
        <div style={{
          background: '#1f2937',
          borderRadius: '12px',
          border: '2px solid #FF8200',
          padding: '1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#FF8200', fontWeight: 700, fontSize: '1rem' }}>
              {results.length > 0 ? `Found ${results.length} new game${results.length !== 1 ? 's' : ''}` : 'No new games found'}
            </h3>
            <button
              onClick={() => { setResults(null); setSelected(new Set()); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
            >
              <X size={16} />
            </button>
          </div>

          {results.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
                {results.map((title) => (
                  <button
                    key={title}
                    onClick={() => toggleGame(title)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      background: selected.has(title) ? 'rgba(255, 130, 0, 0.08)' : 'transparent',
                      border: `1px solid ${selected.has(title) ? '#FF8200' : '#374151'}`,
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      border: `2px solid ${selected.has(title) ? '#FF8200' : '#4b5563'}`,
                      background: selected.has(title) ? '#FF8200' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {selected.has(title) && <Check size={12} style={{ color: '#0a0a0a' }} />}
                    </div>
                    {title}
                  </button>
                ))}
              </div>

              <button
                onClick={confirmAdd}
                disabled={selected.size === 0}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: selected.size > 0 ? '#FF8200' : '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  color: selected.size > 0 ? '#0a0a0a' : '#6b7280',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
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
