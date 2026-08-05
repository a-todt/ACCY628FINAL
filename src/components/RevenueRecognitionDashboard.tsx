"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { AlertBanner, EmptyState, SectionCard } from "@/components/ui";
import { computeWIP, type WIPCalculations } from "@/hooks/useWIPCalculations";
import { moneyExact, percent } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/client";

const CHART_COLORS = {
  earned: "#0d9488",
  billed: "#ea580c",
  estimated: "#64748b",
  actual: "#2563eb",
  active: "#22c55e",
  complete: "#3b82f6",
  atRisk: "#ef4444",
};

interface ProjectRow {
  id: string;
  project_name: string;
  client_name: string | null;
  revised_contract_value: number | null;
  estimated_total_cost: number | null;
  status: string | null;
}

interface ProjectMetrics {
  project: ProjectRow;
  calcs: WIPCalculations;
  health: "healthy" | "watch" | "at_risk";
  statusBucket: "active" | "complete" | "at_risk";
}

function num(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function shortName(name: string, len = 14): string {
  return name.length > len ? `${name.slice(0, len - 1)}…` : name;
}

function healthFromMargin(marginPct: number): ProjectMetrics["health"] {
  if (marginPct < 0) return "at_risk";
  if (marginPct <= 10) return "watch";
  return "healthy";
}

function statusBucket(
  status: string | null | undefined,
  health: ProjectMetrics["health"]
): ProjectMetrics["statusBucket"] {
  if (health === "at_risk") return "at_risk";
  const normalized = (status ?? "active").toLowerCase();
  if (normalized === "completed" || normalized === "complete") return "complete";
  return "active";
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
  const [projects, setProjects] = useState<ProjectRow[]>([]);
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
        .from("projects")
        .select(
          "id, project_name, client_name, revised_contract_value, estimated_total_cost, status"
        )
        .eq("user_id", user.id)
        .order("project_name", { ascending: true });

      if (projectsError) throw projectsError;

      const list = (projectRows ?? []) as ProjectRow[];
      setProjects(list);

      if (list.length === 0) {
        setCostsByProject({});
        setBilledByProject({});
        setRetainageByProject({});
        return;
      }

      const ids = list.map((p) => p.id);
      const [costsRes, billingsRes] = await Promise.all([
        supabase
          .from("project_costs")
          .select("project_id, amount")
          .eq("user_id", user.id)
          .in("project_id", ids),
        supabase
          .from("billings")
          .select("project_id, amount_billed, retainage_held")
          .eq("user_id", user.id)
          .in("project_id", ids),
      ]);

      if (costsRes.error) throw costsRes.error;
      if (billingsRes.error) throw billingsRes.error;

      const costs: Record<string, number> = {};
      for (const row of costsRes.data ?? []) {
        const id = String(row.project_id);
        costs[id] = (costs[id] ?? 0) + num(row.amount as number | null);
      }

      const billed: Record<string, number> = {};
      const retainage: Record<string, number> = {};
      for (const row of billingsRes.data ?? []) {
        const id = String(row.project_id);
        billed[id] = (billed[id] ?? 0) + num(row.amount_billed as number | null);
        retainage[id] = (retainage[id] ?? 0) + num(row.retainage_held as number | null);
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
        const calcs = computeWIP(
          project,
          costsByProject[project.id] ?? 0,
          billedByProject[project.id] ?? 0,
          retainageByProject[project.id] ?? 0
        );
        const health = healthFromMargin(calcs.projectedMargin);
        return {
          project,
          calcs,
          health,
          statusBucket: statusBucket(project.status, health),
        };
      }),
    [projects, costsByProject, billedByProject, retainageByProject]
  );

  const totals = useMemo(() => {
    const summed = metrics.reduce(
      (acc, { project, calcs }) => {
        acc.contractValue += num(project.revised_contract_value);
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
      metrics.map(({ project, calcs }) => ({
        name: shortName(project.project_name),
        Earned: Math.round(calcs.revenueEarned),
        Billed: Math.round(calcs.billedToDate),
      })),
    [metrics]
  );

  const costData = useMemo(
    () =>
      metrics.map(({ project, calcs }) => ({
        name: shortName(project.project_name),
        Estimated: Math.round(num(project.estimated_total_cost)),
        Actual: Math.round(calcs.actualCostsToDate),
      })),
    [metrics]
  );

  const statusPieData = useMemo(() => {
    const counts = { active: 0, complete: 0, at_risk: 0 };
    for (const row of metrics) {
      counts[row.statusBucket] += 1;
    }
    return [
      { name: "Active", value: counts.active, color: CHART_COLORS.active },
      { name: "Complete", value: counts.complete, color: CHART_COLORS.complete },
      { name: "At Risk", value: counts.at_risk, color: CHART_COLORS.atRisk },
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
        message="Add projects (and related costs/billings) to populate this dashboard."
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
          <div className="stat-desc">Contract-to-cash billings</div>
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
          <div className="stat-desc">From project billings</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Revenue Earned vs Billed to Date">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earnedVsBilledData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => moneyExact(Number(v))} width={90} />
                <Tooltip formatter={(value) => moneyExact(Number(value))} />
                <Legend />
                <Bar dataKey="Earned" fill={CHART_COLORS.earned} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Billed" fill={CHART_COLORS.billed} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Estimated Cost vs Actual Cost">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => moneyExact(Number(v))} width={90} />
                <Tooltip formatter={(value) => moneyExact(Number(value))} />
                <Legend />
                <Bar dataKey="Estimated" fill={CHART_COLORS.estimated} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Project Status Breakdown">
            <div className="h-72 max-w-xl mx-auto">
              {statusPieData.length === 0 ? (
                <p className="text-sm opacity-60 py-16 text-center">No status data.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent: p }) => `${name} ${((p ?? 0) * 100).toFixed(0)}%`}
                    >
                      {statusPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
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
              {metrics.map(({ project, calcs, health }) => (
                <tr key={project.id}>
                  <td className="font-medium">{project.project_name}</td>
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
