"use client";

import { CloudRain } from "lucide-react";
import { isBadWeather, weatherBadgeClass } from "@/lib/weather";

export function WeatherBadge({
  weather,
  showIcon = true,
}: {
  weather: string | null | undefined;
  showIcon?: boolean;
}) {
  if (!weather) {
    return <span className="opacity-50">—</span>;
  }

  const bad = isBadWeather(weather);

  return (
    <span
      className={`badge badge-sm gap-1 ${weatherBadgeClass(weather)} ${bad ? "font-semibold" : ""}`}
      title={bad ? "Adverse weather — may cause delays or safety risk" : "Acceptable weather"}
    >
      {showIcon && bad ? <CloudRain className="h-3 w-3" /> : null}
      {weather}
    </span>
  );
}
