"use client";

import { labelize } from "@/lib/metrics";

export function StatusFilterChips({
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  const chips = ["all", ...options];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filters">
      {chips.map((chip) => {
        const active = value === chip;
        return (
          <button
            key={chip}
            type="button"
            className={`btn btn-xs px-3 h-7 min-h-7 whitespace-nowrap ${
              active ? "btn-primary" : "btn-ghost border border-base-300"
            }`}
            onClick={() => onChange(chip)}
            aria-pressed={active}
          >
            {chip === "all" ? allLabel : labelize(chip)}
          </button>
        );
      })}
    </div>
  );
}
