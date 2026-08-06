"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { RevenueRecognitionDashboard } from "@/components/RevenueRecognitionDashboard";
import {
  ColumnAutocompleteHeader,
  ColumnCheckboxFilterHeader,
  ColumnSortHeader,
  matchesCheckboxFilter,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { compareValues } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { downloadCsv } from "@/lib/export";
import { moneyExact, percent } from "@/lib/metrics";
import { canViewCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import {
  WIP_DB,
  colNum,
  colStr,
  selectList,
  type DbRow,
} from "@/lib/wipSchema";
import {
  computeWIP,
  projectToWIPInputs,
  type WIPCalculations,
} from "@/hooks/useWIPCalculations";

const P = WIP_DB.projects;
const C = WIP_DB.projectCosts;
const B = WIP_DB.billings;

type SortKey =
  | "health"
  | "name"
  | "contractValue"
  | "estimatedCost"
  | "costsToDate"
  | "completion"
  | "revenueEarned"
  | "billedToDate"
  | "overbilling"
  | "underbilling"
  | "retainageHeld"
  | "projectedProfit"
  | "projectedMargin";

interface WIPRow {
  project: DbRow;
  projectId: string;
  calcs: WIPCalculations;
  health: "healthy" | "watch" | "at_risk";
}

const HEALTH_RANK: Record<WIPRow["health"], number> = {
  healthy: 0,
  watch: 1,
  at_risk: 2,
};

const HEALTH_FILTER_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "watch", label: "Watch" },
  { value: "at_risk", label: "At Risk" },
];

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

export default function WIPSchedulePage() {
  const { user, effectiveRole } = useAuth();
  const [projects, setProjects] = useState<DbRow[]>([]);
  const [costsByProject, setCostsByProject] = useState<Record<string, number>>({});
  const [billedByProject, setBilledByProject] = useState<Record<string, number>>({});
  const [retainageByProject, setRetainageByProject] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("asc");
  const [projectFilter, setProjectFilter] = useState("");
  const [healthSelected, setHealthSelected] = useState<string[]>([]);
  const [showAllRows, setShowAllRows] = useState(false);

  const allowed = canViewCosts(effectiveRole);

  useEffect(() => {
    setShowAllRows(false);
  }, [projectFilter, healthSelected]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" || key === "health" ? "asc" : "desc");
  };

  const load = useCallback(async () => {
    if (!user || !allowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const projectSelect = selectList(
        P.pk,
        P.userId,
        P.name,
        P.clientName,
        P.originalValue,
        P.contractValue,
        P.estimatedCost,
        P.status,
        P.createdAt
      );

      const { data: projectRows, error: projectsError } = await supabase
        .from(P.table)
        .select(projectSelect)
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

      const ids = list.map((row) => String(row[P.pk]));

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
        const projectId = colStr(project, P.pk);
        const calcs = computeWIP(
          projectToWIPInputs(project),
          costsByProject[projectId] ?? 0,
          billedByProject[projectId] ?? 0,
          retainageByProject[projectId] ?? 0
        );
        return {
          project,
          projectId,
          calcs,
          health: healthFromMargin(calcs.projectedMargin),
        };
      }),
    [projects, costsByProject, billedByProject, retainageByProject]
  );

  const projectNameOptions = useMemo(() => {
    const names = rows
      .map(({ project }) => colStr(project, P.name).trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    return rows.filter(({ project, health }) => {
      if (q) {
        const name = colStr(project, P.name).toLowerCase();
        const client = colStr(project, P.clientName).toLowerCase();
        if (!name.includes(q) && !client.includes(q)) return false;
      }
      if (!matchesCheckboxFilter(health, healthSelected)) return false;
      return true;
    });
  }, [rows, projectFilter, healthSelected]);

  const sortedRows = useMemo(() => {
    const next = [...filteredRows];
    next.sort((a, b) => {
      switch (sortKey) {
        case "health":
          return compareValues(HEALTH_RANK[a.health], HEALTH_RANK[b.health], sortDir);
        case "name":
          return compareValues(colStr(a.project, P.name), colStr(b.project, P.name), sortDir);
        case "contractValue":
          return compareValues(
            colNum(a.project, P.contractValue),
            colNum(b.project, P.contractValue),
            sortDir
          );
        case "estimatedCost":
          return compareValues(
            colNum(a.project, P.estimatedCost),
            colNum(b.project, P.estimatedCost),
            sortDir
          );
        case "costsToDate":
          return compareValues(a.calcs.actualCostsToDate, b.calcs.actualCostsToDate, sortDir);
        case "completion":
          return compareValues(
            a.calcs.completionPercentage,
            b.calcs.completionPercentage,
            sortDir
          );
        case "revenueEarned":
          return compareValues(a.calcs.revenueEarned, b.calcs.revenueEarned, sortDir);
        case "billedToDate":
          return compareValues(a.calcs.billedToDate, b.calcs.billedToDate, sortDir);
        case "overbilling":
          return compareValues(a.calcs.overbilling, b.calcs.overbilling, sortDir);
        case "underbilling":
          return compareValues(a.calcs.underbilling, b.calcs.underbilling, sortDir);
        case "retainageHeld":
          return compareValues(a.calcs.retainageHeld, b.calcs.retainageHeld, sortDir);
        case "projectedProfit":
          return compareValues(a.calcs.projectedProfit, b.calcs.projectedProfit, sortDir);
        case "projectedMargin":
          return compareValues(a.calcs.projectedMargin, b.calcs.projectedMargin, sortDir);
        default:
          return 0;
      }
    });
    return next;
  }, [filteredRows, sortKey, sortDir]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, { project, calcs }) => {
        acc.contractValue += colNum(project, P.contractValue);
        acc.estimatedCost += colNum(project, P.estimatedCost);
        acc.costsToDate += calcs.actualCostsToDate;
        acc.revenueEarned += calcs.revenueEarned;
        acc.billedToDate += calcs.billedToDate;
        acc.retainageHeld += calcs.retainageHeld;
        return acc;
      },
      {
        contractValue: 0,
        estimatedCost: 0,
        costsToDate: 0,
        revenueEarned: 0,
        billedToDate: 0,
        retainageHeld: 0,
      }
    );
  }, [filteredRows]);

  const totalsCompletion =
    totals.estimatedCost > 0
      ? Math.min((totals.costsToDate / totals.estimatedCost) * 100, 100)
      : 0;
  const totalsOverbilling = Math.max(0, totals.billedToDate - totals.revenueEarned);
  const totalsUnderbilling = Math.max(0, totals.revenueEarned - totals.billedToDate);
  const totalsProjectedProfit = totals.contractValue - totals.estimatedCost;
  const totalsMarginPct =
    totals.contractValue > 0 ? totalsProjectedProfit / totals.contractValue : 0;

  const exportCsv = () => {
    const exportRows = [
      ...sortedRows.map(({ project, calcs, health }) => ({
        Project: colStr(project, P.name),
        "Contract Value": colNum(project, P.contractValue),
        "Estimated Total Cost": colNum(project, P.estimatedCost),
        "Costs to Date": calcs.actualCostsToDate,
        "Completion %": Number(calcs.completionPercentage.toFixed(1)),
        "Revenue Earned": Number(calcs.revenueEarned.toFixed(2)),
        "Billed to Date": calcs.billedToDate,
        Overbilling: calcs.overbilling,
        Underbilling: calcs.underbilling,
        "Retainage Receivable": calcs.retainageHeld,
        "Projected Profit": Number(calcs.projectedProfit.toFixed(2)),
        "Projected Margin %": Number(calcs.projectedMargin.toFixed(1)),
        Health: health,
      })),
      {
        Project: "TOTALS",
        "Contract Value": totals.contractValue,
        "Estimated Total Cost": totals.estimatedCost,
        "Costs to Date": totals.costsToDate,
        "Completion %": Number(totalsCompletion.toFixed(1)),
        "Revenue Earned": Number(totals.revenueEarned.toFixed(2)),
        "Billed to Date": totals.billedToDate,
        Overbilling: totalsOverbilling,
        Underbilling: totalsUnderbilling,
        "Retainage Receivable": totals.retainageHeld,
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
        <PageHeader compact title="WIP Schedule" />
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

  const tableScrollClass = showAllRows
    ? "overflow-visible table-sticky-head table-freeze-first"
    : "overflow-auto max-h-[calc(4.5rem+10*1.85rem)] table-sticky-head table-freeze-first";

  return (
    <div className="space-y-3">
      <PageHeader
        compact
        title="WIP Schedule"
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

      <RevenueRecognitionDashboard
        projects={projects}
        costsByProject={costsByProject}
        billedByProject={billedByProject}
        retainageByProject={retainageByProject}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          message={`No rows in ${P.table} for your user. Create a project and add ${C.table} / ${B.table} entries.`}
          action={
            <Link href="/projects" className="btn btn-primary btn-sm mt-2">
              Go to Projects
            </Link>
          }
        />
      ) : (
        <SectionCard compact title="WIP Schedule">
        <div className={`rounded-box border border-base-300 bg-base-100 ${tableScrollClass}`}>
          <table className="table table-xs table-fixed w-full text-[11px]">
            <thead>
              <tr className="bg-base-200/80">
                <ColumnCheckboxFilterHeader
                  label="Health"
                  options={HEALTH_FILTER_OPTIONS}
                  selected={healthSelected}
                  onChange={setHealthSelected}
                  sortActive={sortKey === "health"}
                  sortDir={sortDir}
                  onSort={() => onSort("health")}
                />
                <ColumnAutocompleteHeader
                  label="Project Name"
                  listId="wip-filter-project"
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={projectNameOptions}
                  placeholder="Search…"
                  sortActive={sortKey === "name"}
                  sortDir={sortDir}
                  onSort={() => onSort("name")}
                />
                <ColumnSortHeader
                  label="Contract Value"
                  sortActive={sortKey === "contractValue"}
                  sortDir={sortDir}
                  onSort={() => onSort("contractValue")}
                />
                <ColumnSortHeader
                  label="Est. Total Cost"
                  sortActive={sortKey === "estimatedCost"}
                  sortDir={sortDir}
                  onSort={() => onSort("estimatedCost")}
                  className="hidden xl:table-cell"
                />
                <ColumnSortHeader
                  label="Costs to Date"
                  sortActive={sortKey === "costsToDate"}
                  sortDir={sortDir}
                  onSort={() => onSort("costsToDate")}
                />
                <ColumnSortHeader
                  label="Completion %"
                  sortActive={sortKey === "completion"}
                  sortDir={sortDir}
                  onSort={() => onSort("completion")}
                  className="min-w-[140px]"
                />
                <ColumnSortHeader
                  label="Revenue Earned"
                  sortActive={sortKey === "revenueEarned"}
                  sortDir={sortDir}
                  onSort={() => onSort("revenueEarned")}
                />
                <ColumnSortHeader
                  label="Billed to Date"
                  sortActive={sortKey === "billedToDate"}
                  sortDir={sortDir}
                  onSort={() => onSort("billedToDate")}
                />
                <ColumnSortHeader
                  label="Overbilling"
                  sortActive={sortKey === "overbilling"}
                  sortDir={sortDir}
                  onSort={() => onSort("overbilling")}
                  className="hidden xl:table-cell"
                />
                <ColumnSortHeader
                  label="Underbilling"
                  sortActive={sortKey === "underbilling"}
                  sortDir={sortDir}
                  onSort={() => onSort("underbilling")}
                  className="hidden xl:table-cell"
                />
                <ColumnSortHeader
                  label="Retainage Receivable"
                  sortActive={sortKey === "retainageHeld"}
                  sortDir={sortDir}
                  onSort={() => onSort("retainageHeld")}
                  className="hidden xl:table-cell"
                />
                <ColumnSortHeader
                  label="Projected Profit"
                  sortActive={sortKey === "projectedProfit"}
                  sortDir={sortDir}
                  onSort={() => onSort("projectedProfit")}
                />
                <ColumnSortHeader
                  label="Projected Margin %"
                  sortActive={sortKey === "projectedMargin"}
                  sortDir={sortDir}
                  onSort={() => onSort("projectedMargin")}
                  className="hidden xl:table-cell"
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-8 opacity-60">
                    {projectFilter.trim() || healthSelected.length > 0
                      ? "No projects match the current filters."
                      : "No projects to show."}
                  </td>
                </tr>
              ) : (
                sortedRows.map(({ project, projectId, calcs, health }) => (
                <tr key={projectId} className="hover:bg-base-200/60">
                  <td className="text-center">{healthBadge(health)}</td>
                  <td className="font-medium truncate">{colStr(project, P.name)}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    {moneyExact(colNum(project, P.contractValue))}
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums hidden xl:table-cell">
                    {moneyExact(colNum(project, P.estimatedCost))}
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">
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
                  <td className="text-right whitespace-nowrap tabular-nums">{moneyExact(calcs.revenueEarned)}</td>
                  <td
                    className="text-right whitespace-nowrap tabular-nums"
                    title={`Over: ${calcs.overbilling > 0 ? moneyExact(calcs.overbilling) : "—"} · Under: ${calcs.underbilling > 0 ? moneyExact(calcs.underbilling) : "—"} · Retainage receivable: ${moneyExact(calcs.retainageHeld)}`}
                  >
                    {moneyExact(calcs.billedToDate)}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap tabular-nums hidden xl:table-cell ${
                      calcs.overbilling > 0 ? "text-error font-semibold" : ""
                    }`}
                  >
                    {calcs.overbilling > 0 ? moneyExact(calcs.overbilling) : "—"}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap tabular-nums hidden xl:table-cell ${
                      calcs.underbilling > 0 ? "text-success font-semibold" : ""
                    }`}
                  >
                    {calcs.underbilling > 0 ? moneyExact(calcs.underbilling) : "—"}
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums hidden xl:table-cell">
                    {moneyExact(calcs.retainageHeld)}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap tabular-nums ${
                      calcs.projectedProfit < 0 ? "text-error" : ""
                    }`}
                    title={`Margin: ${percent(calcs.projectedMargin / 100)} · Est. cost: ${moneyExact(colNum(project, P.estimatedCost))}`}
                  >
                    {moneyExact(calcs.projectedProfit)}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap tabular-nums hidden xl:table-cell ${
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
              ))
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-base-200/50">
                <td />
                <td>TOTALS</td>
                <td className="text-right whitespace-nowrap tabular-nums">{moneyExact(totals.contractValue)}</td>
                <td className="text-right whitespace-nowrap tabular-nums hidden xl:table-cell">
                  {moneyExact(totals.estimatedCost)}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">{moneyExact(totals.costsToDate)}</td>
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
                <td className="text-right whitespace-nowrap tabular-nums">{moneyExact(totals.revenueEarned)}</td>
                <td className="text-right whitespace-nowrap tabular-nums">{moneyExact(totals.billedToDate)}</td>
                <td
                  className={`text-right whitespace-nowrap tabular-nums hidden xl:table-cell ${
                    totalsOverbilling > 0 ? "text-error" : ""
                  }`}
                >
                  {totalsOverbilling > 0 ? moneyExact(totalsOverbilling) : "—"}
                </td>
                <td
                  className={`text-right whitespace-nowrap tabular-nums hidden xl:table-cell ${
                    totalsUnderbilling > 0 ? "text-success" : ""
                  }`}
                >
                  {totalsUnderbilling > 0 ? moneyExact(totalsUnderbilling) : "—"}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums hidden xl:table-cell">
                  {moneyExact(totals.retainageHeld)}
                </td>
                <td
                  className={`text-right whitespace-nowrap tabular-nums ${
                    totalsProjectedProfit < 0 ? "text-error" : ""
                  }`}
                >
                  {moneyExact(totalsProjectedProfit)}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums hidden xl:table-cell">
                  {percent(totalsMarginPct)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {sortedRows.length > 10 ? (
          <div className="flex justify-center pt-2 pb-0.5">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowAllRows((v) => !v)}
            >
              {showAllRows ? "Show less" : `Show all (${sortedRows.length})`}
            </button>
          </div>
        ) : null}
        </SectionCard>
      )}
    </div>
  );
}
