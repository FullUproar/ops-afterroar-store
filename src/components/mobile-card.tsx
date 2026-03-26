"use client";

import React from "react";

interface MobileCardProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function MobileCard({ title, subtitle, right, onClick, children }: MobileCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-3 text-left transition-colors ${
        onClick ? "active:bg-zinc-800 cursor-pointer" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-white">{title}</div>
        {subtitle && (
          <div className="truncate text-xs text-zinc-500">{subtitle}</div>
        )}
        {children}
      </div>
      {right && <div className="shrink-0">{right}</div>}
      {onClick && (
        <span className="shrink-0 text-zinc-600 text-sm">&#x203A;</span>
      )}
    </Wrapper>
  );
}
