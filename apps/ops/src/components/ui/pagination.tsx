'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 0',
      borderTop: '1px solid var(--border, #374151)',
      fontSize: '0.85rem',
      color: 'var(--text-muted, #9ca3af)',
      flexWrap: 'wrap',
      gap: '0.5rem',
    }}>
      <span>
        {total === 0 ? 'No results' : `${start}–${end} of ${total.toLocaleString()}`}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            style={{
              padding: '0.35rem 0.5rem',
              background: 'var(--bg-card, #1f2937)',
              border: '1px solid var(--border, #374151)',
              borderRadius: '6px',
              color: 'var(--text, #e2e8f0)',
              fontSize: '0.8rem',
            }}
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
        )}

        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={navBtn(page <= 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        <span style={{ minWidth: '5rem', textAlign: 'center', fontWeight: 600, color: 'var(--text, #e2e8f0)' }}>
          {page} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={navBtn(page >= totalPages)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.4rem',
    background: disabled ? 'transparent' : 'var(--bg-card, #1f2937)',
    border: `1px solid ${disabled ? 'transparent' : 'var(--border, #374151)'}`,
    borderRadius: '6px',
    color: disabled ? 'var(--text-dim, #4b5563)' : 'var(--text, #e2e8f0)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
  };
}
