/**
 * Theme-aware chart colors via CSS variables from globals.css.
 * SVG fill accepts `var(--chart-N)` so colors track the active daisy theme.
 */

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
] as const;

export const CHART_SERIES = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  accent: "var(--chart-3)",
  info: "var(--chart-4)",
  error: "var(--chart-5)",
  success: "var(--chart-6)",
  warning: "var(--chart-7)",
  neutral: "var(--chart-neutral)",
  /** Semantic aliases used by WIP / revenue charts */
  earned: "var(--chart-2)",
  billed: "var(--chart-1)",
  estimated: "var(--chart-neutral)",
  actual: "var(--chart-4)",
  active: "var(--chart-6)",
  complete: "var(--chart-4)",
  onHold: "var(--chart-7)",
  atRisk: "var(--chart-5)",
} as const;

export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
