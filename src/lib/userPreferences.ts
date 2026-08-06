/** Client-side user preferences persisted in localStorage. */

export type LandingPageOption =
  | "/home"
  | "/dashboard"
  | "/favorites"
  | "/contracts"
  | "/contracts/overview"
  | "/finance"
  | "/wip"
  | "/reports"
  | "/messages"
  | "/field-logs";

export const LANDING_PAGE_OPTIONS: Array<{ value: LandingPageOption; label: string }> = [
  { value: "/home", label: "Start here (Home)" },
  { value: "/dashboard", label: "Dashboard" },
  { value: "/favorites", label: "Favorites" },
  { value: "/contracts/overview", label: "Contracts overview" },
  { value: "/contracts", label: "All contracts" },
  { value: "/finance", label: "Finance" },
  { value: "/wip", label: "WIP schedule" },
  { value: "/reports", label: "Reports" },
  { value: "/messages", label: "Messages" },
  { value: "/field-logs", label: "Field logs" },
];

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (US)" },
  { value: "America/Chicago", label: "Central (US)" },
  { value: "America/Denver", label: "Mountain (US)" },
  { value: "America/Los_Angeles", label: "Pacific (US)" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "UTC", label: "UTC" },
] as const;

export type TimezoneOption = (typeof TIMEZONE_OPTIONS)[number]["value"];

export interface UserPreferences {
  muteInbox: boolean;
  defaultLandingPage: LandingPageOption;
  timezone: TimezoneOption;
  rememberLastFilters: boolean;
}

const STORAGE_KEY = "gcm_user_preferences";

const DEFAULTS: UserPreferences = {
  muteInbox: false,
  defaultLandingPage: "/home",
  timezone: "America/Chicago",
  rememberLastFilters: true,
};

function isLandingPage(value: unknown): value is LandingPageOption {
  return LANDING_PAGE_OPTIONS.some((option) => option.value === value);
}

function isTimezone(value: unknown): value is TimezoneOption {
  return TIMEZONE_OPTIONS.some((option) => option.value === value);
}

export function loadUserPreferences(): UserPreferences {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      muteInbox: Boolean(parsed.muteInbox),
      defaultLandingPage: isLandingPage(parsed.defaultLandingPage)
        ? parsed.defaultLandingPage
        : DEFAULTS.defaultLandingPage,
      timezone: isTimezone(parsed.timezone) ? parsed.timezone : DEFAULTS.timezone,
      rememberLastFilters:
        typeof parsed.rememberLastFilters === "boolean"
          ? parsed.rememberLastFilters
          : DEFAULTS.rememberLastFilters,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUserPreferences(next: UserPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("gcm-user-preferences-changed", { detail: next }));
}

export function updateUserPreferences(
  patch: Partial<UserPreferences>
): UserPreferences {
  const next = { ...loadUserPreferences(), ...patch };
  saveUserPreferences(next);
  return next;
}
