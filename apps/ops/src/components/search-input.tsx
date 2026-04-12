"use client";

import { useEffect, useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  autoFocus = false,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl/Cmd+K focuses search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
      // Escape clears
      if (e.key === "Escape" && document.activeElement === ref.current) {
        onChange("");
        ref.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onChange]);

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-card-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-blue-500 focus:outline-none"
      />
      <kbd className="absolute right-3 top-2 hidden rounded bg-card-hover px-1.5 py-0.5 text-[10px] text-muted sm:inline">
        Ctrl+K
      </kbd>
    </div>
  );
}
