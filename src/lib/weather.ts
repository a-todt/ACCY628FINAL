/** Weather helpers for field logs — flag unsafe/delay-prone conditions in red. */

export const WEATHER_OPTIONS = [
  "Clear",
  "Cloudy",
  "Rain",
  "Snow",
  "Extreme Heat",
  "Wind",
  "Storm",
  "Fog",
] as const;

export type WeatherOption = (typeof WEATHER_OPTIONS)[number];

const BAD_WEATHER_KEYWORDS = [
  "rain",
  "snow",
  "storm",
  "thunder",
  "lightning",
  "hail",
  "wind",
  "extreme heat",
  "extreme cold",
  "blizzard",
  "sleet",
  "ice",
  "flood",
  "tornado",
  "hurricane",
  "gale",
  "downpour",
  "freezing",
];

export function isBadWeather(weather: string | null | undefined): boolean {
  if (!weather) return false;
  const value = weather.trim().toLowerCase();
  if (!value) return false;
  return BAD_WEATHER_KEYWORDS.some((keyword) => value.includes(keyword));
}

export function weatherBadgeClass(weather: string | null | undefined): string {
  if (!weather) return "badge-ghost";
  return isBadWeather(weather) ? "badge-error" : "badge-success";
}
