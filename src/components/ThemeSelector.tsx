"use client";

import { useEffect, useState } from "react";

const THEMES = [
  "business",
  "dark",
  "night",
  "dim",
  "luxury",
  "forest",
  "corporate",
  "light",
  "nord",
  "sunset",
] as const;

export type ThemeName = (typeof THEMES)[number];

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeName>("business");

  useEffect(() => {
    const stored = (window.localStorage.getItem("gc_theme") as ThemeName) || "business";
    setTheme(stored);
    document.documentElement.setAttribute("data-theme", stored);
  }, []);

  const onChange = (next: ThemeName) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("gc_theme", next);
  };

  return (
    <label className={`form-control ${compact ? "w-36" : "w-full max-w-xs"}`}>
      {!compact && (
        <div className="label py-1">
          <span className="label-text text-xs uppercase tracking-wide opacity-70">
            Theme
          </span>
        </div>
      )}
      <select
        className="select select-bordered select-sm"
        value={theme}
        onChange={(e) => onChange(e.target.value as ThemeName)}
        aria-label="Theme selector"
      >
        {THEMES.map((t) => (
          <option key={t} value={t}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}
