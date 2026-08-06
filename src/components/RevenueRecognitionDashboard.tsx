"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollableBarChart, toNamedBarRows } from "@/components/ScrollableBarChart";
import { AlertBanner, EmptyState, SectionCard } from "@/components/ui";
import {
  computeWIP,
  projectToWIPInputs,
  type WIPCalculations,
} from "@/hooks/useWIPCalculations";
import { moneyExact, percent } from "@/lib/metrics";
import { CHART_SERIES } from "@/lib/chartColors";
import { createClient } from "@/lib/supabase/client";
import {
  WIP_DB,
  colNum,
  colStr,
  selectList,
  type DbRow,
} from "@/lib/wipSchema";

const P = WIP_DB.projects;
const C = WIP_DB.projectCosts;
const B = WIP_DB.billings;

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

export function RevenueRecognitionDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<DbRow[]>([]);
  const [costsByProject, setCostsByProject] = useState<Record<string, number>>({});
  const [billedByProject, setBilledByProject] = useState<Record<string, number>>({});
  const [retainageByProject, setRetainageByProject] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: projectRows, error: projectsError } = await supabase
        .from(P.table)
        .select(
          selectList(
            P.pk,
            P.name,
            P.clientName,
            P.contractValue,
            P.estimatedCost,
            P.status
          )
        )
        .eq(P.userId, user.id)
        .order(P.name, { ascending: true });

      if (projectsError) throw projectsError;

      const list = (projectRows ?? []) as unknown as DbRow[];
      setProjects(list);

      if (list.length === 0) {
        setCostsByProject({});
        setBilledByProject({});
        setRetainageByProject({});
        return;
      }

      const ids = list.map((row) => colStr(row, P.pk));
      const [costsRes, billingsRes] = await Promise.all([
        supabase
          .from(C.table)
          .select(selectList(C.fk, C.amount))
          .eq(C.userId, user.id)
          .in(C.fk, ids),
        supabase
          .from(B.table)
          .select(selectList(B.fk, B.amountBilled, B.retainageHeld))
          .eq(B.userId, user.id)
          .in(B.fk, ids),
      ]);

      if (costsRes.error) throw costsRes.error;
      if (billingsRes.error) throw billingsRes.error;

      const costs: Record<string, number> = {};
      for (const row of (costsRes.data ?? []) as unknown as DbRow[]) {
        const id = colStr(row, C.fk);
        costs[id] = (costs[id] ?? 0) + colNum(row, C.amount);
      }

      const billed: Record<string, number> = {};
      const retainage: Record<string, number> = {};
      for (const row of (billingsRes.data ?? []) as unknown as DbRow[]) {
        const id = colStr(row, B.fk);
        billed[id] = (billed[id] ?? 0) + colNum(row, B.amountBilled);
        retainage[id] = (retainage[id] ?? 0) + colNum(row, B.retainageHeld);
      }

      setCostsByProject(costs);
      setBilledByProject(billed);
      setRetainageByProject(retainage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revenue dashboard");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  if (metrics.length === 0) {
    return (
      <EmptyState
        title="No revenue recognition data"
        message={`Add rows to ${P.table} (and related ${C.table} / ${B.table}) to populate this dashboard.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="stats stats-vertical lg:stats-horizontal shadow w-full bg-base-100 border border-base-300">
        <div className="stat">
          <div className="stat-title">Total Contract Value</div>
          <div className="stat-value text-xl sm:text-2xl text-primary">
            {moneyExact(totals.contractValue)}
          </div>
          <div className="stat-desc">{metrics.length} projects</div>
        </div>
        <div className="stat">
          <div className="stat-title">Revenue Earned to Date</div>
          <div className="stat-value text-xl sm:text-2xl">{moneyExact(totals.revenueEarned)}</div>
          <div className="stat-desc">Cost-to-cost recognition</div>
        </div>
        <div className="stat">
          <div className="stat-title">Billed to Date</div>
          <div className="stat-value text-xl sm:text-2xl">{moneyExact(totals.billedToDate)}</div>
          <div className="stat-desc">From {B.table}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Overbilling (Liability)</div>
          <div className="stat-value text-xl sm:text-2xl text-error">
            {moneyExact(totals.overbilling)}
          </div>
          <div className="stat-desc">Billings in excess of revenue</div>
        </div>
        <div className="stat">
          <div className="stat-title">Underbilling (Asset)</div>
          <div className="stat-value text-xl sm:text-2xl text-success">
            {moneyExact(totals.underbilling)}
          </div>
          <div className="stat-desc">Revenue in excess of billings</div>
        </div>
        <div className="stat">
          <div className="stat-title">Retainage Held</div>
          <div className="stat-value text-xl sm:text-2xl">{moneyExact(totals.retainageHeld)}</div>
          <div className="stat-desc">Column {B.retainageHeld}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Revenue Earned vs Billed to Date">
          <ScrollableBarChart data={earnedVsBilledData} valueFormatter={(v) => moneyExact(v)}>
            <Legend verticalAlign="top" height={32} />
            <Bar dataKey="Earned" fill={CHART_COLORS.earned} radius={[0, 5, 5, 0]} />
            <Bar dataKey="Billed" fill={CHART_COLORS.billed} radius={[0, 5, 5, 0]} />
          </ScrollableBarChart>
        </SectionCard>

        <SectionCard title="Estimated Cost vs Actual Cost">
          <ScrollableBarChart data={costData} valueFormatter={(v) => moneyExact(v)}>
            <Legend verticalAlign="top" height={32} />
            <Bar dataKey="Estimated" fill={CHART_COLORS.estimated} radius={[0, 5, 5, 0]} />
            <Bar dataKey="Actual" fill={CHART_COLORS.actual} radius={[0, 5, 5, 0]} />
          </ScrollableBarChart>
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Project Status Breakdown">
            <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="h-72 w-full min-w-0">
                {statusPieData.length === 0 ? (
                  <p className="text-sm opacity-60 py-16 text-center">No status data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={288} minWidth={200}>
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        label={({ name, percent }) =>
                          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {statusPieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`${Number(value)} project(s)`, "Count"]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <ul className="space-y-2 text-sm px-2">
                {statusPieData.map((entry) => (
                  <li key={entry.name} className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-sm shrink-0"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden
                    />
                    <span className="font-medium">{entry.name}</span>
                    <span className="opacity-70 tabular-nums">{entry.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Project Health">
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Project</th>
                <th className="min-w-[140px]">Completion %</th>
                <th className="text-right">Margin %</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(({ project, projectId, calcs, health }) => (
                <tr key={projectId}>
                  <td className="font-medium">{colStr(project, P.name)}</td>
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
                  <td>{healthBadge(health)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
