"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ColumnAutocompleteHeader,
} from "@/components/ColumnAutocompleteHeader";
import { ExpandableChart } from "@/components/ExpandableChart";
import { ScrollableBarChart, toNamedBarRows } from "@/components/ScrollableBarChart";
import { EmptyState, SectionCard } from "@/components/ui";
import {
  computeWIP,
  projectToWIPInputs,
  type WIPCalculations,
} from "@/hooks/useWIPCalculations";
import { moneyExact, percent } from "@/lib/metrics";
import { CHART_SERIES } from "@/lib/chartColors";
import {
  WIP_DB,
  colNum,
  colStr,
  type DbRow,
} from "@/lib/wipSchema";

const P = WIP_DB.projects;

const CHART_COLORS = {
  earned: CHART_SERIES.earned,
  billed: CHART_SERIES.billed,
  estimated: CHART_SERIES.estimated,
  actual: CHART_SERIES.actual,
  active: CHART_SERIES.active,
  complete: CHART_SERIES.complete,
  onHold: CHART_SERIES.onHold,
  atRisk: CHART_SERIES.atRisk,
};

const CHART_PANEL_H = 180;
const CHART_PREVIEW_ROWS = 6;

function takeChartPreview<T>(rows: T[], mode: "preview" | "full", limit = CHART_PREVIEW_ROWS): T[] {
  if (mode === "full" || rows.length <= limit) return rows;
  return rows.slice(0, limit);
}

type ProjectStatusBucket = "active" | "completed" | "on_hold" | "other";

interface ProjectMetrics {
  project: DbRow;
  projectId: string;
  calcs: WIPCalculations;
  health: "healthy" | "watch" | "at_risk";
  statusBucket: ProjectStatusBucket;
}

function healthFromMargin(marginPct: number): ProjectMetrics["health"] {
  if (marginPct < 0) return "at_risk";
  if (marginPct <= 10) return "watch";
  return "healthy";
}

/** Map projects.status to pie buckets (DB values, not margin health). */
function statusBucket(status: string | null | undefined): ProjectStatusBucket {
  const normalized = (status ?? "active").toLowerCase().replace(/\s+/g, "_");
  if (normalized === "completed" || normalized === "complete") return "completed";
  if (normalized === "on_hold" || normalized === "onhold" || normalized === "canceled") {
    return "on_hold";
  }
  if (normalized === "active") return "active";
  return "other";
}

function healthBadge(health: ProjectMetrics["health"]) {
  if (health === "healthy") {
    return <span className="badge badge-success badge-sm">Healthy</span>;
  }
  if (health === "watch") {
    return <span className="badge badge-warning badge-sm">Watch</span>;
  }
  return <span className="badge badge-error badge-sm">At Risk</span>;
}

export type WIPDashboardData = {
  projects: DbRow[];
  costsByProject: Record<string, number>;
  billedByProject: Record<string, number>;
  retainageByProject: Record<string, number>;
};

export function RevenueRecognitionDashboard({
  projects,
  costsByProject,
  billedByProject,
  retainageByProject,
}: WIPDashboardData) {
  const [showAllHealth, setShowAllHealth] = useState(false);
  const [healthProjectFilter, setHealthProjectFilter] = useState("");

  useEffect(() => {
    setShowAllHealth(false);
  }, [healthProjectFilter]);

  const metrics: ProjectMetrics[] = useMemo(
    () =>
      projects.map((project) => {
        const projectId = colStr(project, P.pk);
        const calcs = computeWIP(
          projectToWIPInputs(project),
          costsByProject[projectId] ?? 0,
          billedByProject[projectId] ?? 0,
          retainageByProject[projectId] ?? 0
        );
        const health = healthFromMargin(calcs.projectedMargin);
        return {
          project,
          projectId,
          calcs,
          health,
          statusBucket: statusBucket(colStr(project, P.status, "active")),
        };
      }),
    [projects, costsByProject, billedByProject, retainageByProject]
  );

  const totals = useMemo(() => {
    const summed = metrics.reduce(
      (acc, { project, calcs }) => {
        acc.contractValue += colNum(project, P.contractValue);
        acc.revenueEarned += calcs.revenueEarned;
        acc.billedToDate += calcs.billedToDate;
        acc.retainageHeld += calcs.retainageHeld;
        return acc;
      },
      {
        contractValue: 0,
        revenueEarned: 0,
        billedToDate: 0,
        retainageHeld: 0,
      }
    );
    return {
      ...summed,
      overbilling: Math.max(0, summed.billedToDate - summed.revenueEarned),
      underbilling: Math.max(0, summed.revenueEarned - summed.billedToDate),
    };
  }, [metrics]);

  const earnedVsBilledData = useMemo(
    () =>
      toNamedBarRows(
        metrics.map(({ project, calcs }) => ({
          fullName: colStr(project, P.name, "Untitled"),
          values: {
            Earned: Math.round(calcs.revenueEarned),
            Billed: Math.round(calcs.billedToDate),
          },
        }))
      ),
    [metrics]
  );

  const costData = useMemo(
    () =>
      toNamedBarRows(
        metrics.map(({ project, calcs }) => ({
          fullName: colStr(project, P.name, "Untitled"),
          values: {
            Estimated: Math.round(colNum(project, P.estimatedCost)),
            Actual: Math.round(calcs.actualCostsToDate),
          },
        }))
      ),
    [metrics]
  );

  const statusPieData = useMemo(() => {
    const counts: Record<ProjectStatusBucket, number> = {
      active: 0,
      completed: 0,
      on_hold: 0,
      other: 0,
    };
    for (const row of metrics) {
      counts[row.statusBucket] += 1;
    }
    return [
      { name: "Active", value: counts.active, color: CHART_COLORS.active },
      { name: "Completed", value: counts.completed, color: CHART_COLORS.complete },
      { name: "On Hold", value: counts.on_hold, color: CHART_COLORS.onHold },
      { name: "Other", value: counts.other, color: CHART_COLORS.estimated },
    ].filter((d) => d.value > 0);
  }, [metrics]);

  const healthProjectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const { project } of metrics) {
      const name = colStr(project, P.name).trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [metrics]);

  const filteredHealthRows = useMemo(() => {
    const q = healthProjectFilter.trim().toLowerCase();
    if (!q) return metrics;
    return metrics.filter(({ project }) =>
      colStr(project, P.name).toLowerCase().includes(q)
    );
  }, [metrics, healthProjectFilter]);

  const healthScrollClass = showAllHealth
    ? "overflow-visible table-sticky-head table-freeze-first"
    : "overflow-auto max-h-[calc(4.5rem+10*1.85rem)] table-sticky-head table-freeze-first";

  if (metrics.length === 0) {
    return (
      <EmptyState
        title="No revenue recognition data"
        message={`Add projects (and related costs / billings) to populate this dashboard.`}
      />
    );
  }

  const kpiItems = [
    {
      title: "Total Contract Value",
      value: moneyExact(totals.contractValue),
      desc: `${metrics.length} projects`,
      valueClass: "text-primary",
    },
    {
      title: "Revenue Earned to Date",
      value: moneyExact(totals.revenueEarned),
      desc: "Cost-to-cost recognition",
    },
    {
      title: "Billed to Date",
      value: moneyExact(totals.billedToDate),
      desc: "From billings",
    },
    {
      title: "Overbilling (Liability)",
      value: moneyExact(totals.overbilling),
      desc: "Billings in excess of revenue",
      valueClass: "text-error",
    },
    {
      title: "Underbilling (Asset)",
      value: moneyExact(totals.underbilling),
      desc: "Revenue in excess of billings",
      valueClass: "text-success",
    },
    {
      title: "Retainage Receivable",
      value: moneyExact(totals.retainageHeld),
      desc: "ASC 606 contract asset",
    },
    {
      title: "Total Contract Assets",
      value: moneyExact(totals.underbilling + totals.retainageHeld),
      desc: "Underbilling + retainage",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {kpiItems.map((kpi) => (
          <div
            key={kpi.title}
            className="rounded-box border border-base-300 bg-base-100 px-2.5 py-2 min-w-0"
          >
            <p className="text-[10px] uppercase tracking-wide opacity-60 leading-tight truncate" title={kpi.title}>
              {kpi.title}
            </p>
            <p className={`text-sm sm:text-base font-semibold tabular-nums truncate ${kpi.valueClass ?? ""}`}>
              {kpi.value}
            </p>
            <p className="text-[10px] opacity-55 truncate">{kpi.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard compact title="Revenue Earned vs Billed">
          <ExpandableChart
            title="Revenue Earned vs Billed"
            actionLabel="Show full graph"
            previewHeight={CHART_PANEL_H}
            heightBoost={28}
            moreCount={Math.max(0, earnedVsBilledData.length - CHART_PREVIEW_ROWS)}
            hasData={earnedVsBilledData.length > 0}
            empty={
              <p className="text-sm opacity-60 py-8 text-center">No earned/billed data to chart yet.</p>
            }
          >
            {(height, mode) => (
              <ScrollableBarChart
                data={takeChartPreview(earnedVsBilledData, mode)}
                panelHeight={height}
                valueFormatter={(v) => moneyExact(v)}
              >
                <Legend verticalAlign="top" height={28} />
                <Bar dataKey="Earned" fill={CHART_COLORS.earned} radius={[0, 5, 5, 0]} />
                <Bar dataKey="Billed" fill={CHART_COLORS.billed} radius={[0, 5, 5, 0]} />
              </ScrollableBarChart>
            )}
          </ExpandableChart>
        </SectionCard>

        <SectionCard compact title="Estimated vs Actual Cost">
          <ExpandableChart
            title="Estimated vs Actual Cost"
            actionLabel="Show full graph"
            previewHeight={CHART_PANEL_H}
            heightBoost={28}
            moreCount={Math.max(0, costData.length - CHART_PREVIEW_ROWS)}
            hasData={costData.length > 0}
            empty={
              <p className="text-sm opacity-60 py-8 text-center">No cost data to chart yet.</p>
            }
          >
            {(height, mode) => (
              <ScrollableBarChart
                data={takeChartPreview(costData, mode)}
                panelHeight={height}
                valueFormatter={(v) => moneyExact(v)}
              >
                <Legend verticalAlign="top" height={28} />
                <Bar dataKey="Estimated" fill={CHART_COLORS.estimated} radius={[0, 5, 5, 0]} />
                <Bar dataKey="Actual" fill={CHART_COLORS.actual} radius={[0, 5, 5, 0]} />
              </ScrollableBarChart>
            )}
          </ExpandableChart>
        </SectionCard>

        <SectionCard compact title="Project Status">
          <ExpandableChart
            title="Project Status"
            actionLabel="Show full graph"
            previewHeight={CHART_PANEL_H}
            hasData={statusPieData.length > 0}
            empty={<p className="text-sm opacity-60 py-8 text-center">No status data.</p>}
          >
            {(height, mode) => {
              const radius =
                mode === "full"
                  ? Math.min(180, Math.round(height * 0.34))
                  : Math.min(62, Math.round(height * 0.34));
              return (
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center min-h-0" style={{ height }}>
                  <div className="h-full w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={120}>
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={radius}
                          label={({ name, percent: pct }) =>
                            `${name} ${((pct ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {statusPieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${Number(value)} project(s)`, "Count"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 text-xs px-1 shrink-0">
                    {statusPieData.map((entry) => (
                      <li key={entry.name} className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden
                        />
                        <span className="font-medium">{entry.name}</span>
                        <span className="opacity-70 tabular-nums">{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          </ExpandableChart>
        </SectionCard>
      </div>

      <SectionCard compact title="Project Health">
        <div className={`rounded-box border border-base-300 bg-base-100 ${healthScrollClass}`}>
          <table className="table table-xs table-fixed w-full text-[11px]">
            <thead>
              <tr className="bg-base-200/80">
                <ColumnAutocompleteHeader
                  label="Project"
                  listId="wip-health-filter-project"
                  value={healthProjectFilter}
                  onChange={setHealthProjectFilter}
                  options={healthProjectOptions}
                  placeholder="Search…"
                />
                <th className="min-w-[140px]">Completion %</th>
                <th className="text-right">Margin %</th>
                <th className="text-center">Health</th>
              </tr>
            </thead>
            <tbody>
              {filteredHealthRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 opacity-60">
                    No projects match “{healthProjectFilter.trim()}”.
                  </td>
                </tr>
              ) : (
                filteredHealthRows.map(({ project, projectId, calcs, health }) => (
                <tr key={projectId} className="hover:bg-base-200/60">
                  <td className="font-medium truncate">{colStr(project, P.name)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <progress
                        className="progress progress-primary w-full max-w-[160px]"
                        value={Math.round(calcs.completionPercentage)}
                        max={100}
                      />
                      <span className="text-xs tabular-nums w-12 text-right">
                        {calcs.completionPercentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td
                    className={`text-right tabular-nums ${
                      calcs.projectedMargin < 0
                        ? "text-error"
                        : calcs.projectedMargin <= 10
                          ? "text-warning"
                          : "text-success"
                    }`}
                  >
                    {percent(calcs.projectedMargin / 100)}
                  </td>
                  <td className="text-center">{healthBadge(health)}</td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
        {filteredHealthRows.length > 10 ? (
          <div className="flex justify-center pt-2 pb-0.5">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowAllHealth((v) => !v)}
            >
              {showAllHealth ? "Show less" : `Show all (${filteredHealthRows.length})`}
            </button>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
