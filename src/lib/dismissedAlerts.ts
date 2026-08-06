import type { AlertItem } from "@/lib/alerts";

/** Drop alerts the user has dismissed from their inbox. */
export function withoutDismissedAlerts(
  alerts: AlertItem[],
  dismissedIds: ReadonlySet<string> | readonly string[]
): AlertItem[] {
  const dismissed =
    dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds);
  if (dismissed.size === 0) return alerts;
  return alerts.filter((alert) => !dismissed.has(alert.id));
}

/** Keep only dismissals that still match a live alert id. */
export function pruneDismissedAlertIds(
  dismissedIds: readonly string[],
  liveAlertIds: ReadonlySet<string> | readonly string[]
): string[] {
  const live =
    liveAlertIds instanceof Set ? liveAlertIds : new Set(liveAlertIds);
  return dismissedIds.filter((id) => live.has(id));
}
