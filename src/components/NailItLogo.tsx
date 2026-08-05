import { HardHat } from "lucide-react";

type NailItLogoProps = {
  className?: string;
  /** Visual size of the logo mark */
  size?: "sm" | "md" | "lg";
  /** Show wordmark beside a compact icon-only treatment */
  variant?: "full" | "mark";
};

const sizes = {
  sm: { width: 140, height: 36, icon: 18, text: "text-lg" },
  md: { width: 200, height: 52, icon: 24, text: "text-2xl" },
  lg: { width: 280, height: 72, icon: 32, text: "text-4xl" },
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
        className={`inline-flex items-center justify-center rounded-xl bg-primary text-primary-content shadow-sm ${className}`}
        style={{ width: dim.height, height: dim.height }}
        aria-label="Nail It"
      >
        <HardHat style={{ width: dim.icon, height: dim.icon }} aria-hidden />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-3 rounded-xl bg-primary px-4 py-2.5 text-primary-content shadow-sm ${className}`}
      style={{ minHeight: dim.height }}
      role="img"
      aria-label="Nail It"
    >
      <HardHat style={{ width: dim.icon, height: dim.icon }} aria-hidden className="shrink-0" />
      <span
        className={`font-black tracking-wide uppercase leading-none ${dim.text}`}
        style={{ letterSpacing: "0.06em" }}
      >
        Nail It
      </span>
    </span>
  );
}
