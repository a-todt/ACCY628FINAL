import type { DashboardLayoutPrefs, DashboardPaneDef } from "@/lib/dashboardLayout";

export type { DashboardLayoutPrefs as WipLayoutPrefs, DashboardPaneDef as WipPaneDef };

export const WIP_PANES: DashboardPaneDef[] = [
  { id: "kpi_summary", label: "Summary KPIs", fullWidth: true },
  { id: "chart_earned_vs_billed", label: "Revenue earned vs billed" },
  { id: "chart_est_vs_actual", label: "Estimated vs actual cost" },
  { id: "chart_project_status", label: "Project status" },
  { id: "project_health", label: "Project health", fullWidth: true },
  { id: "wip_schedule", label: "WIP schedule", fullWidth: true },
];

export function defaultWipLayout(): DashboardLayoutPrefs {
  return { panes: WIP_PANES.map((pane) => pane.id) };
}

/** Keep only known pane ids, preserve order, drop unknowns. */
export function normalizeWipLayout(
  prefs: DashboardLayoutPrefs | null | undefined
): DashboardLayoutPrefs {
  const allowed = new Set(WIP_PANES.map((pane) => pane.id));
  const panes = (prefs?.panes ?? [])
    .filter((id): id is string => typeof id === "string" && allowed.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index);

  if (panes.length === 0) {
    return defaultWipLayout();
  }
  return { panes };
}
