"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { RevenueRecognitionDashboard } from "@/components/RevenueRecognitionDashboard";
import { AlertBanner, EmptyState, PageHeader } from "@/components/ui";
import { downloadCsv } from "@/lib/export";
import { moneyExact, percent } from "@/lib/metrics";
import { canViewCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import {
  computeWIP,
  type WIPCalculations,
  type WIPProject,
} from "@/hooks/useWIPCalculations";

interface ProjectRow extends WIPProject {
  project_name: string;
  client_name: string | null;
  original_contract_value: number | null;
  status: string | null;
}

interface WIPRow {
  project: ProjectRow;
  calcs: WIPCalculations;
  health: "healthy" | "watch" | "at_risk";
}

function healthFromMargin(marginPct: number): WIPRow["health"] {
  if (marginPct < 0) return "at_risk";
  if (marginPct <= 10) return "watch";
  return "healthy";
}

function healthBadge(health: WIPRow["health"]) {
  if (health === "healthy") {
    return <span className="badge badge-success badge-sm">Healthy</span>;
  }
  if (health === "watch") {
    return <span className="badge badge-warning badge-sm">Watch</span>;
  }
  return <span className="badge badge-error badge-sm">At Risk</span>;
}

function num(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function WIPSchedulePage() {
  const { user, effectiveRole } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [costsByProject, setCostsByProject] = useState<Record<string, number>>({});
  const [billedByProject, setBilledByProject] = useState<Record<string, number>>({});
  const [retainageByProject, setRetainageByProject] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allowed = canViewCosts(effectiveRole);

  const load = useCallback(async () => {
    if (!user || !allowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: projectRows, error: projectsError } = await supabase
        .from("projects")
        .select("*")
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
      setError(err instanceof Error ? err.message : "Failed to load WIP schedule");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: WIPRow[] = useMemo(
    () =>
      projects.map((project) => {
        const calcs = computeWIP(
          project,
          costsByProject[project.id] ?? 0,
          billedByProject[project.id] ?? 0,
          retainageByProject[project.id] ?? 0
        );
        return {
          project,
          calcs,
          health: healthFromMargin(calcs.projectedMargin),
        };
      }),
    [projects, costsByProject, billedByProject, retainageByProject]
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, { project, calcs }) => {
        acc.revisedValue += num(project.revised_contract_value);
        acc.estimatedCost += num(project.estimated_total_cost);
        acc.costsToDate += calcs.actualCostsToDate;
        acc.revenueEarned += calcs.revenueEarned;
        acc.billedToDate += calcs.billedToDate;
        acc.retainageHeld += calcs.retainageHeld;
        return acc;
      },
      {
        revisedValue: 0,
        estimatedCost: 0,
        costsToDate: 0,
        revenueEarned: 0,
        billedToDate: 0,
        retainageHeld: 0,
      }
    );
  }, [rows]);

  const totalsCompletion =
    totals.estimatedCost > 0
      ? Math.min((totals.costsToDate / totals.estimatedCost) * 100, 100)
      : 0;
  // Portfolio over/under from combined earned vs billed (not sum of per-row flags).
  const totalsOverbilling = Math.max(0, totals.billedToDate - totals.revenueEarned);
  const totalsUnderbilling = Math.max(0, totals.revenueEarned - totals.billedToDate);
  // Projected profit must equal revised − estimate.
  const totalsProjectedProfit = totals.revisedValue - totals.estimatedCost;
  const totalsMarginPct =
    totals.revisedValue > 0 ? totalsProjectedProfit / totals.revisedValue : 0;

  const exportCsv = () => {
    const exportRows = [
      ...rows.map(({ project, calcs, health }) => ({
        Project: project.project_name,
        "Contract Value": num(project.revised_contract_value),
        "Estimated Total Cost": num(project.estimated_total_cost),
        "Costs to Date": calcs.actualCostsToDate,
        "Completion %": Number(calcs.completionPercentage.toFixed(1)),
        "Revenue Earned": Number(calcs.revenueEarned.toFixed(2)),
        "Billed to Date": calcs.billedToDate,
        Overbilling: calcs.overbilling,
        Underbilling: calcs.underbilling,
        "Retainage Held": calcs.retainageHeld,
        "Projected Profit": Number(calcs.projectedProfit.toFixed(2)),
        "Projected Margin %": Number(calcs.projectedMargin.toFixed(1)),
        Health: health,
      })),
      {
        Project: "TOTALS",
        "Contract Value": totals.revisedValue,
        "Estimated Total Cost": totals.estimatedCost,
        "Costs to Date": totals.costsToDate,
        "Completion %": Number(totalsCompletion.toFixed(1)),
        "Revenue Earned": Number(totals.revenueEarned.toFixed(2)),
        "Billed to Date": totals.billedToDate,
        Overbilling: totalsOverbilling,
        Underbilling: totalsUnderbilling,
        "Retainage Held": totals.retainageHeld,
        "Projected Profit": Number(totalsProjectedProfit.toFixed(2)),
        "Projected Margin %": Number((totalsMarginPct * 100).toFixed(1)),
        Health: "",
      },
    ];
    downloadCsv("wip-schedule.csv", exportRows);
  };

  if (!allowed) {
    return (
      <div>
        <PageHeader title="WIP Schedule" subtitle="Work in Progress" />
        <AlertBanner type="error">
          Access denied. Cost-based WIP metrics are only available to internal roles.
        </AlertBanner>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="WIP Schedule"
        subtitle="Work in Progress — cost-to-cost revenue recognition by project"
        actions={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      />

      <RevenueRecognitionDashboard />

      {rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          message="Create a project and add costs/billings to populate the WIP schedule."
          action={
            <Link href="/projects" className="btn btn-primary btn-sm mt-2">
              Go to Projects
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table table-sm min-w-[1100px]">
            <thead>
              <tr>
                <th>Health</th>
                <th>Project Name</th>
                <th className="text-right">Contract Value</th>
                <th className="text-right">Est. Total Cost</th>
                <th className="text-right">Costs to Date</th>
                <th className="min-w-[140px]">Completion %</th>
                <th className="text-right">Revenue Earned</th>
                <th className="text-right">Billed to Date</th>
                <th className="text-right">Overbilling</th>
                <th className="text-right">Underbilling</th>
                <th className="text-right">Retainage Held</th>
                <th className="text-right">Projected Profit</th>
                <th className="text-right">Projected Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project, calcs, health }) => (
                <tr key={project.id} className="hover:bg-base-200/50">
                  <td>{healthBadge(health)}</td>
                  <td className="font-medium whitespace-nowrap">{project.project_name}</td>
                  <td className="text-right whitespace-nowrap">
                    {moneyExact(project.revised_contract_value)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {moneyExact(project.estimated_total_cost)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {moneyExact(calcs.actualCostsToDate)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <progress
                        className="progress progress-primary w-full"
                        value={Math.round(calcs.completionPercentage)}
                        max={100}
                      />
                      <span className="text-xs tabular-nums w-12 text-right shrink-0">
                        {calcs.completionPercentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">{moneyExact(calcs.revenueEarned)}</td>
                  <td className="text-right whitespace-nowrap">{moneyExact(calcs.billedToDate)}</td>
                  <td
                    className={`text-right whitespace-nowrap ${
                      calcs.overbilling > 0 ? "text-error font-semibold" : ""
                    }`}
                  >
                    {calcs.overbilling > 0 ? moneyExact(calcs.overbilling) : "—"}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap ${
                      calcs.underbilling > 0 ? "text-success font-semibold" : ""
                    }`}
                  >
                    {calcs.underbilling > 0 ? moneyExact(calcs.underbilling) : "—"}
                  </td>
                  <td className="text-right whitespace-nowrap">{moneyExact(calcs.retainageHeld)}</td>
                  <td
                    className={`text-right whitespace-nowrap ${
                      calcs.projectedProfit < 0 ? "text-error" : ""
                    }`}
                  >
                    {moneyExact(calcs.projectedProfit)}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap ${
                      calcs.projectedMargin < 0
                        ? "text-error"
                        : calcs.projectedMargin <= 10
                          ? "text-warning"
                          : "text-success"
                    }`}
                  >
                    {percent(calcs.projectedMargin / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-base-200">
                <td />
                <td>TOTALS</td>
                <td className="text-right whitespace-nowrap">{moneyExact(totals.revisedValue)}</td>
                <td className="text-right whitespace-nowrap">{moneyExact(totals.estimatedCost)}</td>
                <td className="text-right whitespace-nowrap">{moneyExact(totals.costsToDate)}</td>
                <td>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <progress
                      className="progress progress-secondary w-full"
                      value={Math.round(totalsCompletion)}
                      max={100}
                    />
                    <span className="text-xs tabular-nums w-12 text-right shrink-0">
                      {totalsCompletion.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">{moneyExact(totals.revenueEarned)}</td>
                <td className="text-right whitespace-nowrap">{moneyExact(totals.billedToDate)}</td>
                <td
                  className={`text-right whitespace-nowrap ${
                    totalsOverbilling > 0 ? "text-error" : ""
                  }`}
                >
                  {totalsOverbilling > 0 ? moneyExact(totalsOverbilling) : "—"}
                </td>
                <td
                  className={`text-right whitespace-nowrap ${
                    totalsUnderbilling > 0 ? "text-success" : ""
                  }`}
                >
                  {totalsUnderbilling > 0 ? moneyExact(totalsUnderbilling) : "—"}
                </td>
                <td className="text-right whitespace-nowrap">{moneyExact(totals.retainageHeld)}</td>
                <td
                  className={`text-right whitespace-nowrap ${
                    totalsProjectedProfit < 0 ? "text-error" : ""
                  }`}
                >
                  {moneyExact(totalsProjectedProfit)}
                </td>
                <td className="text-right whitespace-nowrap">
                  {percent(totalsMarginPct)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
