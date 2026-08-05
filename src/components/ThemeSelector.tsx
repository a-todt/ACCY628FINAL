"use client";

import { useEffect, useState } from "react";

const THEMES = [
  "jobsite",
  "jobsite-dark",
  "business",
  "dark",
  "forest",
  "light",
  "sunset",
] as const;

export type ThemeName = (typeof THEMES)[number];

const DEFAULT_THEME: ThemeName = "jobsite";

const THEME_LABELS: Record<ThemeName, string> = {
  jobsite: "Jobsite (Orange & Green)",
  "jobsite-dark": "Jobsite Dark",
  business: "Business",
  dark: "Dark",
  forest: "Forest",
  light: "Light",
  sunset: "Sunset",
};

function resolveTheme(value: string | null): ThemeName {
  // Move prior default to the new construction palette
  if (!value || value === "business") return DEFAULT_THEME;
  if ((THEMES as readonly string[]).includes(value)) {
    return value as ThemeName;
  }
  return DEFAULT_THEME;
}

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const stored = resolveTheme(window.localStorage.getItem("gc_theme"));
    setTheme(stored);
    document.documentElement.setAttribute("data-theme", stored);
    window.localStorage.setItem("gc_theme", stored);
  }, []);

  const onChange = (next: ThemeName) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("gc_theme", next);
  };

  return (
    <label className={`form-control ${compact ? "w-44" : "w-full max-w-xs"}`}>
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
            {THEME_LABELS[t]}
          </option>
        ))}
      </select>
    </label>
  );
}
