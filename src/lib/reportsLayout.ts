import type { DashboardLayoutPrefs, DashboardPaneDef } from "@/lib/dashboardLayout";
import {
  defaultReportsTimeFilter,
  type ReportsTimeFilter,
  type ReportsTimeGrain,
} from "@/lib/reportsTimeFilter";

export type ReportsPaneDisplay = {
  numbers?: boolean;
  graphs?: boolean;
};

export type ReportsLayoutPrefs = DashboardLayoutPrefs & {
  /** Global default for summary StatCards. Default false. */
  showSummaryNumbers: boolean;
  /** Global default for mini charts. Default false. */
  showGraphs: boolean;
  /** Per-pane overrides; missing keys fall back to the global defaults. */
  paneDisplay: Record<string, ReportsPaneDisplay>;
  /** Mass time filter applied to all report tiles. */
  timeFilter: ReportsTimeFilter;
};

export type { DashboardPaneDef as ReportsPaneDef };

export const REPORTS_PANES: DashboardPaneDef[] = [
  { id: "period_reports", label: "Project period reports" },
  { id: "profitability", label: "Contract profitability" },
  { id: "ar_aging", label: "AR aging" },
  { id: "cash_collections", label: "Cash collections" },
  { id: "collection_rates", label: "Collection rates" },
  { id: "costs_by_category", label: "Costs by category" },
  { id: "retainage", label: "Retainage summary" },
  { id: "change_orders", label: "Change order summary" },
];

const GRAINS = new Set<ReportsTimeGrain>(["all", "year", "quarter", "month"]);

function normalizeTimeFilter(raw: unknown): ReportsTimeFilter {
  const defaults = defaultReportsTimeFilter();
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Partial<ReportsTimeFilter>;
  const grain =
    typeof obj.grain === "string" && GRAINS.has(obj.grain as ReportsTimeGrain)
      ? (obj.grain as ReportsTimeGrain)
      : defaults.grain;
  const year =
    typeof obj.year === "number" && Number.isFinite(obj.year) ? Math.trunc(obj.year) : defaults.year;
  const quarterRaw = typeof obj.quarter === "number" ? Math.trunc(obj.quarter) : defaults.quarter;
  const quarter = ([1, 2, 3, 4].includes(quarterRaw) ? quarterRaw : defaults.quarter) as
    | 1
    | 2
    | 3
    | 4;
  const monthRaw = typeof obj.month === "number" ? Math.trunc(obj.month) : defaults.month;
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : defaults.month;
  return { grain, year, quarter, month };
}

function normalizePaneDisplay(
  raw: unknown,
  allowed: Set<string>
): Record<string, ReportsPaneDisplay> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, ReportsPaneDisplay> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(id) || !value || typeof value !== "object") continue;
    const entry = value as ReportsPaneDisplay;
    const next: ReportsPaneDisplay = {};
    if (typeof entry.numbers === "boolean") next.numbers = entry.numbers;
    if (typeof entry.graphs === "boolean") next.graphs = entry.graphs;
    if (next.numbers !== undefined || next.graphs !== undefined) out[id] = next;
  }
  return out;
}

export function defaultReportsLayout(): ReportsLayoutPrefs {
  return {
    panes: REPORTS_PANES.map((pane) => pane.id),
    showSummaryNumbers: false,
    showGraphs: false,
    paneDisplay: {},
    timeFilter: defaultReportsTimeFilter(),
  };
}

export function paneShowsNumbers(layout: ReportsLayoutPrefs, paneId: string): boolean {
  const override = layout.paneDisplay[paneId]?.numbers;
  return typeof override === "boolean" ? override : layout.showSummaryNumbers;
}

export function paneShowsGraphs(layout: ReportsLayoutPrefs, paneId: string): boolean {
  const override = layout.paneDisplay[paneId]?.graphs;
  return typeof override === "boolean" ? override : layout.showGraphs;
}

/** Keep only known pane ids, preserve order, drop unknowns. */
export function normalizeReportsLayout(
  prefs: Partial<ReportsLayoutPrefs> | null | undefined
): ReportsLayoutPrefs {
  const allowed = new Set(REPORTS_PANES.map((pane) => pane.id));
  const panes = (prefs?.panes ?? [])
    .filter((id): id is string => typeof id === "string" && allowed.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index);

  const showSummaryNumbers =
    typeof prefs?.showSummaryNumbers === "boolean" ? prefs.showSummaryNumbers : false;
  const showGraphs = typeof prefs?.showGraphs === "boolean" ? prefs.showGraphs : false;
  const timeFilter = normalizeTimeFilter(prefs?.timeFilter);
  const paneDisplay = normalizePaneDisplay(prefs?.paneDisplay, allowed);

  if (panes.length === 0) {
    return {
      ...defaultReportsLayout(),
      showSummaryNumbers,
      showGraphs,
      timeFilter,
      paneDisplay,
    };
  }
  return { panes, showSummaryNumbers, showGraphs, timeFilter, paneDisplay };
}
