"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AlertBanner, FormField, SectionCard, StatCard } from "@/components/ui";
import { money } from "@/lib/metrics";
import {
  buildPeriodRows,
  type PeriodMode,
  type PeriodReportRow,
  type WipBillingLike,
  type WipCostLike,
  type WipProjectLike,
} from "@/lib/periodReports";
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

function PeriodTable({
  rows,
  totals,
  unspecified,
  showProject,
}: {
  rows: PeriodReportRow[];
  totals: PeriodReportRow | (Omit<PeriodReportRow, "contractId" | "contractName" | "periodKey" | "periodLabel"> & {
    hasWipMatch: boolean;
  });
  unspecified: PeriodReportRow | null;
  showProject: boolean;
}) {
  const displayRows = unspecified ? [...rows, unspecified] : rows;
  const showWip = displayRows.some((r) => r.hasWipMatch) || totals.hasWipMatch;

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm min-w-[1100px]">
        <thead>
          <tr>
            {showProject ? <th>Project</th> : null}
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
          {displayRows.length === 0 ? (
            <tr>
              <td colSpan={showProject ? (showWip ? 11 : 9) : showWip ? 10 : 8} className="text-center opacity-60">
                No activity for this selection.
              </td>
            </tr>
          ) : (
            displayRows.map((row) => (
              <tr
                key={`${row.contractId}-${row.periodKey}`}
                className={row.periodKey === "unspecified" ? "opacity-70" : undefined}
              >
                {showProject ? <td className="font-medium whitespace-nowrap">{row.contractName}</td> : null}
                <td className="whitespace-nowrap">{row.periodLabel}</td>
                <td className="text-right whitespace-nowrap">{money(row.expenses)}</td>
                <td className="text-right whitespace-nowrap">{money(row.billed)}</td>
                <td className="text-right whitespace-nowrap">{money(row.collected)}</td>
                <td className="text-right whitespace-nowrap">{money(row.earnedPeriod)}</td>
                <td className="text-right whitespace-nowrap">{money(row.earnedYtd)}</td>
                <td
                  className={`text-right whitespace-nowrap ${row.grossBilled < 0 ? "text-error" : ""}`}
                >
                  {money(row.grossBilled)}
                </td>
                <td
                  className={`text-right whitespace-nowrap ${row.grossEarned < 0 ? "text-error" : ""}`}
                >
                  {money(row.grossEarned)}
                </td>
                {showWip ? (
                  <>
                    <td className="text-right whitespace-nowrap">{moneyCell(row.wipExpenses)}</td>
                    <td className="text-right whitespace-nowrap">{moneyCell(row.wipBilled)}</td>
                  </>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
        {displayRows.length > 0 ? (
          <tfoot>
            <tr className="font-semibold bg-base-200">
              {showProject ? <td>TOTALS</td> : null}
              <td>{showProject ? "" : "TOTALS"}</td>
              <td className="text-right whitespace-nowrap">{money(totals.expenses)}</td>
              <td className="text-right whitespace-nowrap">{money(totals.billed)}</td>
              <td className="text-right whitespace-nowrap">{money(totals.collected)}</td>
              <td className="text-right whitespace-nowrap">{money(totals.earnedPeriod)}</td>
              <td className="text-right whitespace-nowrap">{money(totals.earnedYtd)}</td>
              <td
                className={`text-right whitespace-nowrap ${totals.grossBilled < 0 ? "text-error" : ""}`}
              >
                {money(totals.grossBilled)}
              </td>
              <td
                className={`text-right whitespace-nowrap ${totals.grossEarned < 0 ? "text-error" : ""}`}
              >
                {money(totals.grossEarned)}
              </td>
              {showWip ? (
                <>
                  <td className="text-right whitespace-nowrap">{money(totals.wipExpenses)}</td>
                  <td className="text-right whitespace-nowrap">{money(totals.wipBilled)}</td>
                </>
              ) : null}
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
  onReportChange,
}: Props & {
  onReportChange?: (payload: {
    rows: PeriodReportRow[];
    unspecified: PeriodReportRow | null;
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
    };
  }) => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<PeriodMode>("month");
  const [year, setYear] = useState(new Date().getFullYear());
  const [contractId, setContractId] = useState("");
  const [activityOnly, setActivityOnly] = useState(true);
  const [projects, setProjects] = useState<WipProjectLike[]>([]);
  const [projectCosts, setProjectCosts] = useState<WipCostLike[]>([]);
  const [billings, setBillings] = useState<WipBillingLike[]>([]);
  const [wipLoading, setWipLoading] = useState(true);
  const [wipError, setWipError] = useState<string | null>(null);

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
        mode,
        year,
        contractId: contractId || null,
        activityOnly: contractId && mode === "month" ? false : activityOnly,
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
      mode,
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

  useEffect(() => {
    onReportChange?.({
      rows: report.rows,
      unspecified: report.unspecified,
      totals: {
        expenses: report.totals.expenses,
        billed: report.totals.billed,
        collected: report.totals.collected,
        earnedPeriod: report.totals.earnedPeriod,
        earnedYtd: report.totals.earnedYtd,
        grossBilled: report.totals.grossBilled,
        grossEarned: report.totals.grossEarned,
        wipExpenses: report.totals.wipExpenses ?? 0,
        wipBilled: report.totals.wipBilled ?? 0,
      },
    });
  }, [report, onReportChange]);

  const showProject = !contractId;

  return (
    <SectionCard title="Project Period Reports">
      <p className="text-sm opacity-70 mb-4">
        Billed comes from invoices; earned is cost-to-cost. WIP columns appear only when a Projects
        row matches the contract name.
      </p>

      {wipError ? <AlertBanner type="warning">{wipError}</AlertBanner> : null}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <FormField label="Year">
          <select
            className="select select-bordered select-sm w-full"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {report.availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="View">
          <div className="join w-full">
            <button
              type="button"
              className={`btn btn-sm join-item flex-1 ${mode === "month" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode("month")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`btn btn-sm join-item flex-1 ${mode === "year" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode("year")}
            >
              Yearly
            </button>
          </div>
        </FormField>
        <FormField label="Project">
          <select
            className="select select-bordered select-sm w-full"
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
        </FormField>
        <FormField label="Filters">
          <label className="label cursor-pointer justify-start gap-2 py-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={activityOnly}
              disabled={Boolean(contractId) && mode === "month"}
              onChange={(e) => setActivityOnly(e.target.checked)}
            />
            <span className="label-text text-sm">Only periods with activity</span>
          </label>
        </FormField>
      </div>

      {wipLoading ? (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <StatCard title="Expenses" value={money(report.totals.expenses)} />
            <StatCard title="Billed" value={money(report.totals.billed)} />
            <StatCard title="Collected" value={money(report.totals.collected)} tone="success" />
            <StatCard title="Earned (period)" value={money(report.totals.earnedPeriod)} />
            <StatCard
              title="Gross (billed)"
              value={money(report.totals.grossBilled)}
              tone={report.totals.grossBilled < 0 ? "error" : "default"}
            />
          </div>

          <PeriodTable
            rows={report.rows}
            totals={report.totals}
            unspecified={report.unspecified}
            showProject={showProject}
          />
        </>
      )}
    </SectionCard>
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
