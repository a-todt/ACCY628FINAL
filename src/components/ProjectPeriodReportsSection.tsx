"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { AlertBanner, ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { money } from "@/lib/metrics";
import {
  buildPeriodRows,
  type PeriodReportRow,
  type WipBillingLike,
  type WipCostLike,
  type WipProjectLike,
} from "@/lib/periodReports";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { canListCompanyProjects } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import {
  reportsFilterMonths,
  type ReportsTimeFilter,
} from "@/lib/reportsTimeFilter";
import { WIP_DB, colNum, colStr, type DbRow } from "@/lib/wipSchema";
import type { ChangeOrder, Contract, CostEntry, Invoice, Payment } from "@/lib/types";

type Props = {
  contracts: Contract[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  changeOrders: ChangeOrder[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
  /** Mass reports time filter — locks year when not "all". */
  timeFilter?: ReportsTimeFilter;
};

function sumRows(rows: PeriodReportRow[]) {
  let expenses = 0;
  let billed = 0;
  let collected = 0;
  let earnedPeriod = 0;
  let earnedYtd = 0;
  let wipExpenses = 0;
  let wipBilled = 0;
  let anyWipExp = false;
  let anyWipBilled = false;
  let hasWipMatch = false;
  for (const r of rows) {
    expenses += r.expenses;
    billed += r.billed;
    collected += r.collected;
    earnedPeriod += r.earnedPeriod;
    earnedYtd += r.earnedYtd;
    hasWipMatch = hasWipMatch || r.hasWipMatch;
    if (r.wipExpenses != null) {
      wipExpenses += r.wipExpenses;
      anyWipExp = true;
    }
    if (r.wipBilled != null) {
      wipBilled += r.wipBilled;
      anyWipBilled = true;
    }
  }
  return {
    expenses,
    billed,
    collected,
    earnedPeriod,
    earnedYtd,
    grossBilled: billed - expenses,
    grossEarned: earnedPeriod - expenses,
    wipExpenses: anyWipExp ? wipExpenses : null,
    wipBilled: anyWipBilled ? wipBilled : null,
    hasWipMatch,
  };
}

export function ProjectPeriodReportsSection({
  contracts,
  costEntries,
  invoices,
  payments,
  changeOrders,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
  timeFilter,
}: Props) {
  const { user, effectiveRole } = useAuth();
  const listCompanyProjects = canListCompanyProjects(effectiveRole);
  const lockYear = Boolean(timeFilter && timeFilter.grain !== "all");
  const [year, setYear] = useState(() => timeFilter?.year ?? new Date().getFullYear());
  const [contractId, setContractId] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<WipProjectLike[]>([]);
  const [projectCosts, setProjectCosts] = useState<WipCostLike[]>([]);
  const [billings, setBillings] = useState<WipBillingLike[]>([]);
  const [wipLoading, setWipLoading] = useState(true);
  const [wipError, setWipError] = useState<string | null>(null);

  useEffect(() => {
    if (lockYear && timeFilter) setYear(timeFilter.year);
  }, [lockYear, timeFilter]);

  const loadWip = useCallback(async () => {
    if (!user) {
      setWipLoading(false);
      return;
    }
    setWipLoading(true);
    setWipError(null);
    const supabase = createClient();
    try {
      const P = WIP_DB.projects;
      const C = WIP_DB.projectCosts;
      const B = WIP_DB.billings;
      let projQuery = supabase.from(P.table).select("*");
      let costQuery = supabase.from(C.table).select("*");
      let billQuery = supabase.from(B.table).select("*");
      if (!listCompanyProjects) {
        projQuery = projQuery.eq(P.userId, user.id);
        costQuery = costQuery.eq(C.userId, user.id);
        billQuery = billQuery.eq(B.userId, user.id);
      }
      const [projRes, costRes, billRes] = await Promise.all([projQuery, costQuery, billQuery]);
      if (projRes.error) throw projRes.error;
      if (costRes.error) throw costRes.error;
      if (billRes.error) throw billRes.error;

      setProjects(
        (projRes.data ?? []).map((row) => {
          const r = row as DbRow;
          return {
            id: colStr(r, P.pk),
            project_name: colStr(r, P.name),
            contract_id: colStr(r, P.contractId) || null,
            estimated_total_cost: colNum(r, P.estimatedCost),
            revised_contract_value: colNum(r, P.contractValue),
          };
        })
      );
      setProjectCosts(
        (costRes.data ?? []).map((row) => {
          const r = row as DbRow;
          return {
            project_id: colStr(r, C.fk),
            amount: colNum(r, C.amount),
            cost_date: colStr(r, C.costDate) || null,
          };
        })
      );
      setBillings(
        (billRes.data ?? []).map((row) => {
          const r = row as DbRow;
          return {
            project_id: colStr(r, B.fk),
            amount_billed: colNum(r, B.amountBilled),
            billing_date: colStr(r, B.billingDate) || null,
          };
        })
      );
    } catch (err) {
      setWipError(err instanceof Error ? err.message : "Failed to load WIP project data");
      setProjects([]);
      setProjectCosts([]);
      setBillings([]);
    } finally {
      setWipLoading(false);
    }
  }, [user, listCompanyProjects]);

  useEffect(() => {
    void loadWip();
  }, [loadWip]);

  const projectNames = useMemo(() => {
    const names = new Set<string>();
    for (const contract of contracts) {
      const name = contract.contract_name?.trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const projectNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const contract of contracts) {
      const name = contract.contract_name?.trim();
      if (name && !map.has(name)) map.set(name, contract.id);
    }
    return map;
  }, [contracts]);

  function applyProjectQuery(value: string) {
    setProjectQuery(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setContractId("");
      return;
    }
    const id = projectNameToId.get(trimmed);
    if (id) setContractId(id);
  }

  const report = useMemo(
    () =>
      buildPeriodRows({
        contracts,
        costEntries,
        invoices,
        payments,
        changeOrders,
        projects,
        projectCosts,
        billings,
        mode: "month",
        year,
        contractId: contractId || null,
        // All contracts: skip empty months. Single project: keep full year for that job.
        activityOnly: !contractId,
      }),
    [
      contracts,
      costEntries,
      invoices,
      payments,
      changeOrders,
      projects,
      projectCosts,
      billings,
      year,
      contractId,
    ]
  );

  useEffect(() => {
    if (lockYear) return;
    if (report.availableYears.length > 0 && !report.availableYears.includes(year)) {
      setYear(report.availableYears[0]);
    }
  }, [report.availableYears, year, lockYear]);

  const monthFilter = timeFilter ? reportsFilterMonths(timeFilter) : null;

  const filteredRows = useMemo(() => {
    if (!monthFilter) return report.rows;
    return report.rows.filter((row) => {
      const parts = row.periodKey.split("-");
      const month = Number(parts[1] ?? 0);
      return monthFilter.includes(month);
    });
  }, [report.rows, monthFilter]);

  const filteredUnspecified =
    monthFilter && report.unspecified ? null : report.unspecified;

  const totals = useMemo(() => {
    const base = sumRows(filteredRows);
    if (filteredUnspecified) {
      const u = filteredUnspecified;
      return sumRows([...filteredRows, u]);
    }
    return { ...base, hasWipMatch: base.hasWipMatch || report.totals.hasWipMatch };
  }, [filteredRows, filteredUnspecified, report.totals.hasWipMatch]);

  const chartData = useMemo(() => {
    const byMonth = new Map<string, { billed: number; expenses: number; label: string }>();
    for (const row of filteredRows) {
      const cur = byMonth.get(row.periodKey) ?? {
        billed: 0,
        expenses: 0,
        label: row.periodLabel,
      };
      cur.billed += row.billed;
      cur.expenses += row.expenses;
      byMonth.set(row.periodKey, cur);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        name: v.label,
        value: v.billed,
        value2: v.expenses,
      }));
  }, [filteredRows]);

  function exportCsv() {
    downloadCsv(
      "project-period-reports.csv",
      periodReportCsvRows(filteredRows, filteredUnspecified, {
        expenses: totals.expenses,
        billed: totals.billed,
        collected: totals.collected,
        earnedPeriod: totals.earnedPeriod,
        earnedYtd: totals.earnedYtd,
        grossBilled: totals.grossBilled,
        grossEarned: totals.grossEarned,
        wipExpenses: totals.wipExpenses ?? 0,
        wipBilled: totals.wipBilled ?? 0,
      })
    );
  }

  function exportPdf() {
    const csvRows = periodReportCsvRows(filteredRows, filteredUnspecified, {
      expenses: totals.expenses,
      billed: totals.billed,
      collected: totals.collected,
      earnedPeriod: totals.earnedPeriod,
      earnedYtd: totals.earnedYtd,
      grossBilled: totals.grossBilled,
      grossEarned: totals.grossEarned,
      wipExpenses: totals.wipExpenses ?? 0,
      wipBilled: totals.wipBilled ?? 0,
    });
    downloadPdfTables("project-period-reports.pdf", "General Contract Management — Project Period Reports", [
      {
        title: "Project Period Reports",
        columns: ["Project", "Period", "Expenses", "Billed", "Collected", "Earned", "Gross Billed"],
        rows: csvRows.map((row) => [
          String(row.Project ?? ""),
          String(row.Period ?? ""),
          money(Number(row.Expenses ?? 0)),
          money(Number(row.Billed ?? 0)),
          money(Number(row.Collected ?? 0)),
          money(Number(row["Earned (period)"] ?? 0)),
          money(Number(row["Gross (Billed)"] ?? 0)),
        ]),
      },
    ]);
  }

  const yearOptions = useMemo(() => {
    const years = new Set(report.availableYears);
    years.add(year);
    return Array.from(years).sort((a, b) => b - a);
  }, [report.availableYears, year]);

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Project Period Reports"
      subtitle="Monthly billed, earned, and cost activity by project. WIP columns appear when a Projects row matches the contract name."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {wipError ? <AlertBanner type="warning">{wipError}</AlertBanner> : null}

      <div className="mb-1 flex flex-wrap items-end gap-2">
        {lockYear ? null : (
          <label className="flex w-28 shrink-0 flex-col gap-0.5">
            <span className="text-xs font-medium">Year</span>
            <select
              className="select select-bordered select-xs w-full min-h-8 h-8"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex w-full sm:w-1/2 min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium">Project</span>
          <input
            type="search"
            className="input input-bordered input-xs w-full min-h-8 h-8"
            list="period-report-project-names"
            value={projectQuery}
            onChange={(e) => applyProjectQuery(e.target.value)}
            onBlur={() => {
              const trimmed = projectQuery.trim();
              if (!trimmed) {
                setContractId("");
                setProjectQuery("");
                return;
              }
              const id = projectNameToId.get(trimmed);
              if (id) {
                setContractId(id);
                setProjectQuery(trimmed);
              } else if (contractId) {
                const name =
                  contracts.find((c) => c.id === contractId)?.contract_name?.trim() ?? "";
                setProjectQuery(name);
              } else {
                setProjectQuery("");
              }
            }}
            placeholder="Search projects…"
            autoComplete="off"
          />
          <datalist id="period-report-project-names">
            {projectNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      </div>

      {wipLoading ? (
        <div className="flex justify-center py-4">
          <span className="loading loading-spinner loading-sm text-primary" />
        </div>
      ) : (
        <>
          {showSummaryNumbers ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
              <StatCard compact title="Expenses" value={money(totals.expenses)} />
              <StatCard compact title="Billed" value={money(totals.billed)} />
              <StatCard compact title="Collected" value={money(totals.collected)} tone="success" />
              <StatCard compact title="Earned (period)" value={money(totals.earnedPeriod)} />
              <StatCard
                compact
                title="Gross (billed)"
                value={money(totals.grossBilled)}
                tone={totals.grossBilled < 0 ? "error" : "default"}
              />
            </div>
          ) : null}

          {showGraphs ? (
            <ReportBarChart data={chartData} valueLabel="Billed" value2Label="Expenses" />
          ) : null}

          {showHint ? (
            <p className="text-sm opacity-60 py-1">
              Export CSV or PDF for monthly project activity using the filters above.
            </p>
          ) : null}
        </>
      )}
    </ReportPane>
  );
}

export function periodReportCsvRows(
  rows: PeriodReportRow[],
  unspecified: PeriodReportRow | null,
  totals: {
    expenses: number;
    billed: number;
    collected: number;
    earnedPeriod: number;
    earnedYtd: number;
    grossBilled: number;
    grossEarned: number;
    wipExpenses: number;
    wipBilled: number;
  }
) {
  const all = unspecified ? [...rows, unspecified] : rows;
  return [
    ...all.map((row) => ({
      Project: row.contractName,
      Period: row.periodLabel,
      Expenses: row.expenses,
      Billed: row.billed,
      Collected: row.collected,
      "Earned (period)": row.earnedPeriod,
      "Earned (YTD)": row.earnedYtd,
      "Gross (Billed)": row.grossBilled,
      "Gross (Earned)": row.grossEarned,
      "WIP Expenses": row.wipExpenses ?? "",
      "WIP Billed": row.wipBilled ?? "",
    })),
    {
      Project: "TOTALS",
      Period: "",
      Expenses: totals.expenses,
      Billed: totals.billed,
      Collected: totals.collected,
      "Earned (period)": totals.earnedPeriod,
      "Earned (YTD)": totals.earnedYtd,
      "Gross (Billed)": totals.grossBilled,
      "Gross (Earned)": totals.grossEarned,
      "WIP Expenses": totals.wipExpenses,
      "WIP Billed": totals.wipBilled,
    },
  ];
}
