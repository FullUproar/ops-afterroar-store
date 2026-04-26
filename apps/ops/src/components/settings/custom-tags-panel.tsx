"use client";

import { useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Custom Tags Panel                                                  */
/*  Lets the owner define a store-specific taxonomy on top of the      */
/*  built-in `category` enum. Tags are applied to inventory via        */
/*  attributes.tags[] (see Phase 2 inventory edit form) and can be     */
/*  referenced by promotions via scope=tag, scope_value=<tag.id>.      */
/*                                                                      */
/*  The Celerant-using prospect calls these "6 other categories" —     */
/*  things like "Asmodee exclusive", "Clearance", "Holiday gift". We   */
/*  don't cap at 6; the UI just renders them in a list.                */
/* ------------------------------------------------------------------ */

export interface CustomTag {
  id: string;
  label: string;
  color: string;
}

interface CustomTagsPanelProps {
  value: CustomTag[];
  onChange: (next: CustomTag[]) => void;
  saving: boolean;
}

const PALETTE: { value: string; label: string }[] = [
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#fbbf24", label: "Yellow" },
  { value: "#10b981", label: "Emerald" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#64748b", label: "Slate" },
];

function generateId(): string {
  return `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function CustomTagsPanel({ value, onChange, saving }: CustomTagsPanelProps) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState(PALETTE[0].value);

  const tags = value || [];

  const addTag = useCallback(() => {
    const label = draftLabel.trim();
    if (!label) return;
    if (tags.some((t) => t.label.toLowerCase() === label.toLowerCase())) return;
    const next = [...tags, { id: generateId(), label, color: draftColor }];
    onChange(next);
    setDraftLabel("");
  }, [draftLabel, draftColor, tags, onChange]);

  const removeTag = useCallback(
    (id: string) => {
      onChange(tags.filter((t) => t.id !== id));
    },
    [tags, onChange],
  );

  const updateTag = useCallback(
    (id: string, patch: Partial<CustomTag>) => {
      onChange(tags.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [tags, onChange],
  );

  const moveTag = useCallback(
    (id: string, dir: "up" | "down") => {
      const idx = tags.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const swapWith = dir === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= tags.length) return;
      const copy = [...tags];
      [copy[idx], copy[swapWith]] = [copy[swapWith], copy[idx]];
      onChange(copy);
    },
    [tags, onChange],
  );

  return (
    <div className="px-5 py-5 space-y-4">
      <p className="text-ink-soft" style={{ fontSize: "0.88rem", lineHeight: 1.5, marginTop: "-0.5rem" }}>
        Custom tags are merchandising labels you apply to inventory items, on
        top of the built-in category. Use them for things like distributor
        exclusives, clearance, staff picks, or holiday themes. Tags filter
        inventory and can power promotions (e.g. 20% off everything tagged
        Clearance).
      </p>

      {/* Existing tags */}
      {tags.length > 0 ? (
        <div className="border border-rule">
          {tags.map((tag, idx) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderBottom: idx < tags.length - 1 ? "1px solid var(--rule-faint)" : "none",
                background: idx % 2 === 0 ? "transparent" : "var(--panel-mute)",
              }}
            >
              {/* Color swatch picker */}
              <div className="relative" style={{ flexShrink: 0 }}>
                <select
                  value={tag.color}
                  onChange={(e) => updateTag(tag.id, { color: e.target.value })}
                  aria-label="Tag color"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  style={{ width: 28, height: 28 }}
                >
                  {PALETTE.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 28,
                    height: 28,
                    background: tag.color,
                    border: "1px solid var(--rule-hi)",
                  }}
                />
              </div>

              {/* Label input */}
              <input
                type="text"
                value={tag.label}
                onChange={(e) => updateTag(tag.id, { label: e.target.value })}
                className="flex-1 bg-transparent border-0 text-ink focus:outline-none"
                style={{ fontSize: "0.95rem", fontWeight: 500 }}
              />

              {/* Reorder + delete */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveTag(tag.id, "up")}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="text-ink-faint hover:text-ink disabled:opacity-30 px-2"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
                >
                  ↑
                </button>
                <button
                  onClick={() => moveTag(tag.id, "down")}
                  disabled={idx === tags.length - 1}
                  aria-label="Move down"
                  className="text-ink-faint hover:text-ink disabled:opacity-30 px-2"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
                >
                  ↓
                </button>
                <button
                  onClick={() => removeTag(tag.id)}
                  aria-label="Delete tag"
                  className="text-red hover:opacity-80 px-2"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="border border-dashed border-rule px-4 py-6 text-center text-ink-faint"
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", letterSpacing: "0.12em" }}
        >
          NO TAGS YET — ADD YOUR FIRST ONE BELOW
        </div>
      )}

      {/* Add new tag */}
      <div
        className="border border-rule-hi p-3 flex items-center gap-3"
        style={{ background: "var(--panel-mute)" }}
      >
        <select
          value={draftColor}
          onChange={(e) => setDraftColor(e.target.value)}
          aria-label="New tag color"
          className="border border-rule-hi bg-panel text-ink"
          style={{ width: 60, height: 40, padding: "0 4px", fontSize: "0.85rem" }}
        >
          {PALETTE.map((p) => (
            <option key={p.value} value={p.value} style={{ background: p.value }}>
              {p.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 28,
            height: 28,
            background: draftColor,
            border: "1px solid var(--rule-hi)",
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTag();
          }}
          placeholder="e.g. Asmodee Exclusive, Clearance, Staff Pick"
          className="flex-1 border border-rule-hi bg-panel text-ink px-3"
          style={{ height: 40, fontSize: "0.95rem" }}
        />
        <button
          onClick={addTag}
          disabled={!draftLabel.trim() || saving}
          className="bg-orange text-void disabled:opacity-30 transition-opacity"
          style={{
            height: 40,
            padding: "0 1rem",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "0.85rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Add Tag
        </button>
      </div>

      {saving && (
        <div
          className="text-ink-faint"
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase" }}
        >
          Saving…
        </div>
      )}
    </div>
  );
}
