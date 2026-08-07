"use client";

import { useMemo } from "react";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money } from "@/lib/metrics";
import type { Contract } from "@/lib/types";

export type RetainageRow = {
  contract: Contract;
  /** ASC 606 retainage receivable (contract asset) from owner billings. */
  invoiceRetainage: number;
  /** Estimated retainage payable withheld from subcontractors (liability). */
  subRetainage: number;
};

type Props = {
  rows: RetainageRow[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

export function RetainageSummarySection({
  rows,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const byAsset = b.invoiceRetainage - a.invoiceRetainage;
        if (byAsset !== 0) return byAsset;
        return (a.contract.contract_name ?? "").localeCompare(b.contract.contract_name ?? "");
      }),
    [rows]
  );

  const activeRows = useMemo(
    () => sorted.filter((row) => row.invoiceRetainage > 0.005 || row.subRetainage > 0.005),
    [sorted]
  );

  const totals = useMemo(() => {
    const invoiceRetainage = sorted.reduce((s, r) => s + r.invoiceRetainage, 0);
    const subRetainage = sorted.reduce((s, r) => s + r.subRetainage, 0);
    return {
      invoiceRetainage,
      subRetainage,
      contractsWithRetainage: activeRows.length,
    };
  }, [sorted, activeRows]);

  const chartData = useMemo(
    () =>
      activeRows.slice(0, 8).map((row) => ({
        name: row.contract.contract_name ?? "Contract",
        value: row.invoiceRetainage,
        value2: row.subRetainage,
      })),
    [activeRows]
  );

  function exportCsv() {
    downloadCsv(
      "retainage-summary.csv",
      rows.map((row) => ({
        Contract: row.contract.contract_name,
        "Retainage Receivable (Asset)": row.invoiceRetainage,
        "Retainage Payable Est (Liability)": row.subRetainage,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("retainage-summary.pdf", "General Contract Management — Retainage (ASC 606)", [
      {
        title: "Retainage — GAAP Classification",
        columns: ["Contract", "Receivable (Asset)", "Payable Est (Liability)"],
        rows: rows.map((row) => [
          row.contract.contract_name ?? "",
          money(row.invoiceRetainage),
          money(row.subRetainage),
        ]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Retainage (ASC 606)"
      subtitle="Owner retainage receivable is a contract asset; sub retainage withheld is a liability — not combined."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {showSummaryNumbers ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
          <StatCard
            compact
            title="Retainage receivable"
            value={money(totals.invoiceRetainage)}
            hint="Contract asset"
          />
          <StatCard
            compact
            title="Retainage payable est."
            value={money(totals.subRetainage)}
            hint="Liability to subs"
          />
          <StatCard
            compact
            title="Contracts with retainage"
            value={String(totals.contractsWithRetainage)}
          />
        </div>
      ) : null}

      {showGraphs ? (
        <ReportBarChart data={chartData} valueLabel="Receivable" value2Label="Payable est." />
      ) : null}

      {sorted.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No contracts to report.</p>
      ) : showHint ? (
        <p className="text-sm opacity-60 py-1">
          Export CSV or PDF for per-contract retainage receivable and payable estimates.
        </p>
      ) : null}
    </ReportPane>
  );
}
