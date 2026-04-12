"use client";

/* ------------------------------------------------------------------ */
/*  Format Selector — grouped by game with visual game labels           */
/*  MTG formats grouped under "Magic: The Gathering" header             */
/* ------------------------------------------------------------------ */

const GAME_GROUPS = [
  {
    game: "mtg",
    label: "Magic: The Gathering",
    color: "#FF8200",
    formats: [
      { key: "standard", label: "Standard", desc: "Last 2 years" },
      { key: "modern", label: "Modern", desc: "2003+" },
      { key: "pioneer", label: "Pioneer", desc: "2012+" },
      { key: "commander", label: "Commander", desc: "100-card" },
    ],
  },
  {
    game: "pokemon",
    label: "Pokemon TCG",
    color: "#FFCB05",
    formats: [{ key: "pokemon", label: "Standard", desc: "Tournament" }],
  },
  {
    game: "yugioh",
    label: "Yu-Gi-Oh!",
    color: "#7B2D8E",
    formats: [{ key: "yugioh", label: "Standard", desc: "Competitive" }],
  },
];

export function FormatSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (format: string) => void;
}) {
  return (
    <div className="space-y-3">
      {GAME_GROUPS.map((group) => (
        <div key={group.game}>
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: group.color }}
            />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {group.label}
            </span>
          </div>
          <div className="flex gap-1.5">
            {group.formats.map((f) => {
              const isActive = value === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => onChange(f.key)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-accent text-white shadow-md shadow-accent/20"
                      : "bg-card hover:bg-card-hover text-muted hover:text-foreground border border-card-border"
                  }`}
                >
                  {f.label}
                  {!isActive && (
                    <span className="hidden sm:inline ml-1.5 text-xs opacity-50">
                      {f.desc}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
