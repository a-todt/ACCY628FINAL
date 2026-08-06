import { HardHat } from "lucide-react";

type NailItLogoProps = {
  className?: string;
  /** Visual size of the logo mark */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show wordmark beside a compact icon-only treatment */
  variant?: "full" | "mark";
};

const sizes = {
  sm: { width: 140, height: 36, icon: 18, text: "text-lg", pad: "px-4 py-2.5", gap: "gap-3", radius: "rounded-xl" },
  md: { width: 200, height: 52, icon: 24, text: "text-2xl", pad: "px-4 py-2.5", gap: "gap-3", radius: "rounded-xl" },
  lg: { width: 280, height: 72, icon: 32, text: "text-4xl", pad: "px-4 py-2.5", gap: "gap-3", radius: "rounded-xl" },
  xl: { width: 400, height: 104, icon: 48, text: "text-6xl", pad: "px-7 py-5", gap: "gap-4", radius: "rounded-2xl" },
} as const;

export function NailItLogo({
  className = "",
  size = "md",
  variant = "full",
}: NailItLogoProps) {
  const dim = sizes[size];

  if (variant === "mark") {
    return (
      <span
        className={`inline-flex items-center justify-center ${dim.radius} bg-primary text-primary-content shadow-md ring-1 ring-primary/20 ${className}`}
        style={{ width: dim.height, height: dim.height }}
        aria-label="Nail It"
      >
        <HardHat style={{ width: dim.icon, height: dim.icon }} aria-hidden />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center ${dim.gap} ${dim.radius} bg-primary ${dim.pad} text-primary-content shadow-md ring-1 ring-primary/20 ${className}`}
      style={{ minHeight: dim.height }}
      role="img"
      aria-label="Nail It"
    >
      <HardHat style={{ width: dim.icon, height: dim.icon }} aria-hidden className="shrink-0" />
      <span
        className={`font-display font-semibold uppercase leading-none ${dim.text}`}
        style={{ letterSpacing: "0.1em" }}
      >
        Nail It
      </span>
    </span>
  );
}
