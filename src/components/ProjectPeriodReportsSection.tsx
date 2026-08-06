"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AlertBanner, ReportDetailsModal, ReportPane, StatCard } from "@/components/ui";
import { money } from "@/lib/metrics";
import {
  buildPeriodRows,
  type PeriodReportRow,
  type WipBillingLike,
  type WipCostLike,
  type WipProjectLike,
} from "@/lib/periodReports";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { createClient } from "@/lib/supabase/client";
import { WIP_DB, colNum, colStr, type DbRow } from "@/lib/wipSchema";
import type { ChangeOrder, Contract, CostEntry, Invoice, Payment } from "@/lib/types";

type Props = {
  contracts: Contract[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  changeOrders: ChangeOrder[];
};

function moneyCell(n: number | null | undefined) {
  if (n == null) return "—";
  return money(n);
}

type PeriodTotals = PeriodReportRow | (Omit<PeriodReportRow, "contractId" | "contractName" | "periodKey" | "periodLabel"> & {
  hasWipMatch: boolean;
});

function sumPeriodRows(detailRows: PeriodReportRow[]): Omit<
  PeriodReportRow,
  "contractId" | "contractName" | "periodKey" | "periodLabel"
> {
  const hasWipMatch = detailRows.some((r) => r.hasWipMatch);
  let expenses = 0;
  let billed = 0;
  let collected = 0;
  let earnedPeriod = 0;
  let earnedYtd = 0;
  let wipExpenses = 0;
  let wipBilled = 0;
  let anyWipExp = false;
  let anyWipBilled = false;
  for (const r of detailRows) {
    expenses += r.expenses;
    billed += r.billed;
    collected += r.collected;
    earnedPeriod += r.earnedPeriod;
    earnedYtd += r.earnedYtd;
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

function MetricCells({
  row,
  showWip,
}: {
  row: Pick<
    PeriodReportRow,
    | "expenses"
    | "billed"
    | "collected"
    | "earnedPeriod"
    | "earnedYtd"
    | "grossBilled"
    | "grossEarned"
    | "wipExpenses"
    | "wipBilled"
  >;
  showWip: boolean;
}) {
  return (
    <>
      <td className="text-right whitespace-nowrap">{money(row.expenses)}</td>
      <td className="text-right whitespace-nowrap">{money(row.billed)}</td>
      <td className="text-right whitespace-nowrap">{money(row.collected)}</td>
      <td className="text-right whitespace-nowrap">{money(row.earnedPeriod)}</td>
      <td className="text-right whitespace-nowrap">{money(row.earnedYtd)}</td>
      <td className={`text-right whitespace-nowrap ${row.grossBilled < 0 ? "text-error" : ""}`}>
        {money(row.grossBilled)}
      </td>
      <td className={`text-right whitespace-nowrap ${row.grossEarned < 0 ? "text-error" : ""}`}>
        {money(row.grossEarned)}
      </td>
      {showWip ? (
        <>
          <td className="text-right whitespace-nowrap">{moneyCell(row.wipExpenses)}</td>
          <td className="text-right whitespace-nowrap">{moneyCell(row.wipBilled)}</td>
        </>
      ) : null}
    </>
  );
}

function PeriodTable({
  rows,
  totals,
  unspecified,
  showProject,
  groupByMonth,
}: {
  rows: PeriodReportRow[];
  totals: PeriodTotals;
  unspecified: PeriodReportRow | null;
  showProject: boolean;
  groupByMonth: boolean;
}) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedMonths(new Set());
  }, [rows, groupByMonth]);

  const monthGroups = useMemo(() => {
    if (!groupByMonth) return null;
    const byPeriod = new Map<string, PeriodReportRow[]>();
    for (const row of rows) {
      const list = byPeriod.get(row.periodKey) ?? [];
      list.push(row);
      byPeriod.set(row.periodKey, list);
    }
    return Array.from(byPeriod.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, detailRows]) => {
        const sorted = [...detailRows].sort((a, b) => a.contractName.localeCompare(b.contractName));
        return {
          periodKey,
          periodLabel: sorted[0]?.periodLabel ?? periodKey,
          summary: sumPeriodRows(sorted),
          details: sorted,
        };
      });
  }, [groupByMonth, rows]);

  const displayRows = unspecified ? [...rows, unspecified] : rows;
  const showWip =
    (monthGroups
      ? monthGroups.some((g) => g.summary.hasWipMatch)
      : displayRows.some((r) => r.hasWipMatch)) || totals.hasWipMatch;
  const hasRows = groupByMonth
    ? (monthGroups?.length ?? 0) > 0 || Boolean(unspecified)
    : displayRows.length > 0;
  const colSpan =
    (groupByMonth ? 1 : 0) + (showProject || groupByMonth ? 1 : 0) + (showWip ? 9 : 7);

  function toggleMonth(periodKey: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(periodKey)) next.delete(periodKey);
      else next.add(periodKey);
      return next;
    });
  }

  const allExpanded =
    Boolean(monthGroups?.length) &&
    monthGroups!.every((g) => expandedMonths.has(g.periodKey));

  function toggleAllDetails() {
    if (!monthGroups) return;
    if (allExpanded) {
      setExpandedMonths(new Set());
    } else {
      setExpandedMonths(new Set(monthGroups.map((g) => g.periodKey)));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm min-w-[1100px]">
        <thead>
          <tr>
            {groupByMonth ? (
              <th className="w-28">
                {monthGroups && monthGroups.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={toggleAllDetails}
                    aria-expanded={allExpanded}
                  >
                    {allExpanded ? "Hide all" : "Show all"}
                  </button>
                ) : null}
              </th>
            ) : null}
            {showProject || groupByMonth ? <th>Project</th> : null}
            <th>Period</th>
            <th className="text-right">Expenses</th>
            <th className="text-right">Billed</th>
            <th className="text-right">Collected</th>
            <th className="text-right">Earned (period)</th>
            <th className="text-right">Earned (YTD)</th>
            <th className="text-right">Gross (Billed)</th>
            <th className="text-right">Gross (Earned)</th>
            {showWip ? (
              <>
                <th className="text-right">WIP Exp</th>
                <th className="text-right">WIP Billed</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {!hasRows ? (
            <tr>
              <td colSpan={colSpan} className="text-center opacity-60">
                No activity for this selection.
              </td>
            </tr>
          ) : groupByMonth && monthGroups ? (
            <>
              {monthGroups.map((group) => {
                const open = expandedMonths.has(group.periodKey);
                return (
                  <Fragment key={group.periodKey}>
                    <tr className="font-medium bg-base-200/50">
                      <td className="whitespace-nowrap">
                        <button
                          type="button"
                          className={`btn btn-ghost btn-xs ${open ? "btn-active" : ""}`}
                          onClick={() => toggleMonth(group.periodKey)}
                          aria-expanded={open}
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap opacity-70">
                        {group.details.length} project{group.details.length === 1 ? "" : "s"}
                      </td>
                      <td className="whitespace-nowrap">{group.periodLabel}</td>
                      <MetricCells row={group.summary} showWip={showWip} />
                    </tr>
                    {open
                      ? group.details.map((row) => (
                          <tr key={`${row.contractId}-${row.periodKey}`} className="bg-base-100">
                            <td />
                            <td className="font-medium whitespace-nowrap pl-4">{row.contractName}</td>
                            <td className="whitespace-nowrap opacity-60">{row.periodLabel}</td>
                            <MetricCells row={row} showWip={showWip} />
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
              {unspecified ? (
                <tr className="opacity-70">
                  <td />
                  <td className="font-medium whitespace-nowrap">{unspecified.contractName}</td>
                  <td className="whitespace-nowrap">{unspecified.periodLabel}</td>
                  <MetricCells row={unspecified} showWip={showWip} />
                </tr>
              ) : null}
            </>
          ) : (
            displayRows.map((row) => (
              <tr
                key={`${row.contractId}-${row.periodKey}`}
                className={row.periodKey === "unspecified" ? "opacity-70" : undefined}
              >
                {showProject ? <td className="font-medium whitespace-nowrap">{row.contractName}</td> : null}
                <td className="whitespace-nowrap">{row.periodLabel}</td>
                <MetricCells row={row} showWip={showWip} />
              </tr>
            ))
          )}
        </tbody>
        {hasRows ? (
          <tfoot>
            <tr className="font-semibold bg-base-200">
              {groupByMonth ? <td /> : null}
              {showProject || groupByMonth ? <td>TOTALS</td> : null}
              <td>{showProject || groupByMonth ? "" : "TOTALS"}</td>
              <MetricCells row={totals} showWip={showWip} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function ProjectPeriodReportsSection({
  contracts,
  costEntries,
  invoices,
  payments,
  changeOrders,
}: Props) {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [contractId, setContractId] = useState("");
  const [activityOnly, setActivityOnly] = useState(true);
  const [projects, setProjects] = useState<WipProjectLike[]>([]);
  const [projectCosts, setProjectCosts] = useState<WipCostLike[]>([]);
  const [billings, setBillings] = useState<WipBillingLike[]>([]);
  const [wipLoading, setWipLoading] = useState(true);
  const [wipError, setWipError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
      const [projRes, costRes, billRes] = await Promise.all([
        supabase.from(P.table).select("*").eq(P.userId, user.id),
        supabase.from(C.table).select("*").eq(C.userId, user.id),
        supabase.from(B.table).select("*").eq(B.userId, user.id),
      ]);
      if (projRes.error) throw projRes.error;
      if (costRes.error) throw costRes.error;
      if (billRes.error) throw billRes.error;

      setProjects(
        (projRes.data ?? []).map((row) => {
          const r = row as DbRow;
          return {
            id: colStr(r, P.pk),
            project_name: colStr(r, P.name),
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
  }, [user]);

  useEffect(() => {
    void loadWip();
  }, [loadWip]);

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
        activityOnly: contractId ? false : activityOnly,
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
      activityOnly,
    ]
  );

  useEffect(() => {
    if (report.availableYears.length > 0 && !report.availableYears.includes(year)) {
      setYear(report.availableYears[0]);
    }
  }, [report.availableYears, year]);

  const showProject = !contractId;

  function exportCsv() {
    downloadCsv(
      "project-period-reports.csv",
      periodReportCsvRows(report.rows, report.unspecified, {
        expenses: report.totals.expenses,
        billed: report.totals.billed,
        collected: report.totals.collected,
        earnedPeriod: report.totals.earnedPeriod,
        earnedYtd: report.totals.earnedYtd,
        grossBilled: report.totals.grossBilled,
        grossEarned: report.totals.grossEarned,
        wipExpenses: report.totals.wipExpenses ?? 0,
        wipBilled: report.totals.wipBilled ?? 0,
      })
    );
  }

  function exportPdf() {
    const csvRows = periodReportCsvRows(report.rows, report.unspecified, {
      expenses: report.totals.expenses,
      billed: report.totals.billed,
      collected: report.totals.collected,
      earnedPeriod: report.totals.earnedPeriod,
      earnedYtd: report.totals.earnedYtd,
      grossBilled: report.totals.grossBilled,
      grossEarned: report.totals.grossEarned,
      wipExpenses: report.totals.wipExpenses ?? 0,
      wipBilled: report.totals.wipBilled ?? 0,
    });
    downloadPdfTables("project-period-reports.pdf", "GC Contract Manager — Project Period Reports", [
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

  return (
    <>
      <ReportPane
        title="Project Period Reports"
        subtitle="Monthly billed, earned, and cost activity by project. WIP columns appear when a Projects row matches the contract name."
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        footerStart={
          !wipLoading ? (
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => setShowDetails(true)}
            >
              Show details
            </button>
          ) : null
        }
      >
        {wipError ? <AlertBanner type="warning">{wipError}</AlertBanner> : null}

        <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 mb-1">
          <label className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium">Year</span>
            <select
              className="select select-bordered select-xs w-full min-h-8 h-8"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {report.availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium">Project</span>
            <select
              className="select select-bordered select-xs w-full min-h-8 h-8"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              <option value="">All contracts</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contract_name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium">Filters</span>
            <label className="label h-8 min-h-8 cursor-pointer justify-start gap-2 py-0">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={activityOnly}
                disabled={Boolean(contractId)}
                onChange={(e) => setActivityOnly(e.target.checked)}
              />
              <span className="label-text text-xs">Only periods with activity</span>
            </label>
          </div>
        </div>

        {wipLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
            <StatCard compact title="Expenses" value={money(report.totals.expenses)} />
            <StatCard compact title="Billed" value={money(report.totals.billed)} />
            <StatCard compact title="Collected" value={money(report.totals.collected)} tone="success" />
            <StatCard compact title="Earned (period)" value={money(report.totals.earnedPeriod)} />
            <StatCard
              compact
              title="Gross (billed)"
              value={money(report.totals.grossBilled)}
              tone={report.totals.grossBilled < 0 ? "error" : "default"}
            />
          </div>
        )}
      </ReportPane>

      <ReportDetailsModal
        open={showDetails}
        title="Project Period Reports"
        subtitle="Monthly billed, earned, and cost activity by project. WIP columns appear when a Projects row matches the contract name."
        onClose={() => setShowDetails(false)}
      >
        <PeriodTable
          rows={report.rows}
          totals={report.totals}
          unspecified={report.unspecified}
          showProject={showProject}
          groupByMonth={showProject}
        />
      </ReportDetailsModal>
    </>
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
