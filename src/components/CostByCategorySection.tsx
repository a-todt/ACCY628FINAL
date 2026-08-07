"use client";

import { useMemo } from "react";
import { ReportPieChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money, percent } from "@/lib/metrics";

type CategoryRow = {
  name: string;
  total: number;
};

type Props = {
  rows: CategoryRow[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

export function CostByCategorySection({
  rows,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows]);
  const topCategories = useMemo(() => rows.slice(0, 3), [rows]);
  const chartData = useMemo(
    () => rows.map((row) => ({ name: row.name, value: row.total })),
    [rows]
  );

  function exportCsv() {
    downloadCsv(
      "costs-by-category.csv",
      rows.map((row) => ({
        Category: row.name,
        Total: row.total,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("costs-by-category.pdf", "General Contract Management — Cost by Category", [
      {
        title: "Cost by Category",
        columns: ["Category", "Total"],
        rows: rows.map((row) => [row.name, money(row.total)]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Cost by Category"
      subtitle="Where spend concentrates across cost categories, with share of total portfolio costs."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {rows.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No cost entries yet.</p>
      ) : (
        <>
          {showSummaryNumbers ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mb-1">
              <StatCard compact title="Total costs" value={money(grandTotal)} />
              {topCategories.map((row) => (
                <StatCard
                  compact
                  key={row.name}
                  title={row.name}
                  value={money(row.total)}
                  hint={percent(grandTotal > 0 ? row.total / grandTotal : 0)}
                />
              ))}
            </div>
          ) : null}

          {showGraphs ? <ReportPieChart data={chartData} /> : null}

          {showHint ? (
            <p className="text-sm opacity-60 py-1">
              Export CSV or PDF for category totals across the portfolio.
            </p>
          ) : null}
        </>
      )}
    </ReportPane>
  );
}
