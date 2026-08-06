import type { ReactNode } from "react";

/** Renders a 1–5 star rating (supports half values like 4.5). */
export function StarRating({
  value,
  size = "sm",
  showValue = true,
  emptyLabel = "Not rated",
}: {
  value: number | null | undefined;
  size?: "xs" | "sm" | "md";
  showValue?: boolean;
  emptyLabel?: string;
}): ReactNode {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className="text-xs opacity-50">{emptyLabel}</span>;
  }

  const rating = Math.max(0, Math.min(5, Number(value)));
  const textSize = size === "xs" ? "text-xs" : size === "md" ? "text-base" : "text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1 ${textSize}`}
      title={`${rating.toFixed(1)} / 5`}
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      <span className="text-warning tracking-tight" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => {
          if (rating >= n) return <span key={n}>★</span>;
          if (rating >= n - 0.5) return <span key={n} className="opacity-60">★</span>;
          return (
            <span key={n} className="opacity-25">
              ★
            </span>
          );
        })}
      </span>
      {showValue ? <span className="opacity-70 tabular-nums">{rating.toFixed(1)}</span> : null}
    </span>
  );
}
