import type { UserRole } from "@/lib/types";

export type DashboardPaneDef = {
  id: string;
  label: string;
  /** KPI strips and similar blocks that should span the full grid width. */
  fullWidth?: boolean;
};

export type DashboardLayoutPrefs = {
  /** Enabled panes in display order. */
  panes: string[];
};

const ADMIN_PANES: DashboardPaneDef[] = [
  { id: "money_pulse", label: "Money pulse" },
  { id: "operations", label: "Operations" },
  { id: "chart_contract_value", label: "Top contracts by value" },
  { id: "chart_billed_vs_collected", label: "Lowest collection rates" },
  { id: "chart_costs_by_category", label: "Costs by category" },
  { id: "chart_change_order_value", label: "Jobs with approved COs" },
  { id: "chart_gross_profit", label: "Lowest gross profit" },
  { id: "alerts", label: "Needs attention" },
];

const FIELD_PANES: DashboardPaneDef[] = [
  { id: "kpi_stats", label: "Field KPIs", fullWidth: true },
  { id: "assigned_projects", label: "Assigned projects" },
  { id: "recent_field_logs", label: "My recent field logs" },
  { id: "alerts", label: "Needs attention" },
];

const SUB_PANES: DashboardPaneDef[] = [
  { id: "kpi_stats", label: "Engagement KPIs", fullWidth: true },
  { id: "open_bid_packages", label: "Open bid packages" },
  { id: "engagements", label: "My subcontract engagements" },
  { id: "recent_field_logs", label: "My recent field logs" },
  { id: "alerts", label: "Needs attention" },
];

const CLIENT_PANES: DashboardPaneDef[] = [
  { id: "kpi_stats", label: "Project KPIs", fullWidth: true },
  { id: "my_projects", label: "My projects" },
  { id: "approved_change_orders", label: "Approved change orders" },
  { id: "invoices", label: "Invoices & payment status" },
  { id: "alerts", label: "Needs attention" },
];

export function dashboardRoleKey(role: UserRole): string {
  if (role === "admin" || role === "owner" || role === "project_manager") {
    return "admin";
  }
  if (role === "field_supervisor") return "field";
  if (role === "subcontractor") return "subcontractor";
  return "client";
}

export function panesForRole(role: UserRole): DashboardPaneDef[] {
  switch (dashboardRoleKey(role)) {
    case "admin":
      return ADMIN_PANES;
    case "field":
      return FIELD_PANES;
    case "subcontractor":
      return SUB_PANES;
    default:
      return CLIENT_PANES;
  }
}

export function defaultLayoutForRole(role: UserRole): DashboardLayoutPrefs {
  return { panes: panesForRole(role).map((pane) => pane.id) };
}

/** Keep only known pane ids, preserve order, drop unknowns. */
export function normalizeLayout(
  role: UserRole,
  prefs: DashboardLayoutPrefs | null | undefined
): DashboardLayoutPrefs {
  const catalog = panesForRole(role);
  const allowed = new Set(catalog.map((pane) => pane.id));
  const panes = (prefs?.panes ?? [])
    .filter((id): id is string => typeof id === "string" && allowed.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index);

  if (panes.length === 0) {
    return defaultLayoutForRole(role);
  }
  return { panes };
}

export function layoutCatalogOrder(
  role: UserRole,
  layout: DashboardLayoutPrefs
): Array<DashboardPaneDef & { enabled: boolean }> {
  const catalog = panesForRole(role);
  const enabled = new Set(layout.panes);
  const orderedEnabled = layout.panes
    .map((id) => catalog.find((pane) => pane.id === id))
    .filter((pane): pane is DashboardPaneDef => !!pane)
    .map((pane) => ({ ...pane, enabled: true }));

  const disabled = catalog
    .filter((pane) => !enabled.has(pane.id))
    .map((pane) => ({ ...pane, enabled: false }));

  return [...orderedEnabled, ...disabled];
}

/** Suggested chart panel height based on how many panes are visible. */
export function chartPanelHeight(visiblePaneCount: number): number {
  // Keep plots readable; the page scrolls when many panes are enabled.
  if (visiblePaneCount <= 3) return 280;
  if (visiblePaneCount <= 5) return 240;
  return 220;
}

/** Grid column count for non-full-width panes. */
export function paneGridColumns(nonFullWidthCount: number): number {
  if (nonFullWidthCount <= 1) return 1;
  if (nonFullWidthCount <= 2) return 2;
  return 3;
}
