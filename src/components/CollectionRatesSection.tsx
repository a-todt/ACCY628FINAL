"use client";

import { useMemo } from "react";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money, percent } from "@/lib/metrics";
import type { Contract, ContractMetrics } from "@/lib/types";

export type CollectionRateRow = {
  contract: Contract;
  metrics: ContractMetrics;
  collectionRate: number;
};

type Props = {
  rows: CollectionRateRow[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

function rateTone(rate: number, billed: number): "default" | "warning" | "error" | "success" {
  if (billed <= 0) return "default";
  if (rate < 0.5) return "error";
  if (rate < 0.8) return "warning";
  return "success";
}

export function CollectionRatesSection({
  rows,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const byRate = a.collectionRate - b.collectionRate;
        if (byRate !== 0) return byRate;
        return (a.contract.contract_name ?? "").localeCompare(b.contract.contract_name ?? "");
      }),
    [rows]
  );

  const billedRows = useMemo(
    () => sorted.filter((r) => r.metrics.totalBilled > 0.005),
    [sorted]
  );

  const totals = useMemo(() => {
    const totalBilled = sorted.reduce((s, r) => s + r.metrics.totalBilled, 0);
    const totalCollected = sorted.reduce((s, r) => s + r.metrics.totalCollected, 0);
    const outstanding = sorted.reduce((s, r) => s + r.metrics.outstanding, 0);
    const portfolioRate = totalBilled > 0 ? totalCollected / totalBilled : 0;
    const lowest = billedRows[0] ?? null;
    return { totalBilled, totalCollected, outstanding, portfolioRate, lowest };
  }, [sorted, billedRows]);

  const chartData = useMemo(
    () =>
      billedRows.slice(0, 8).map(({ contract, metrics }) => ({
        name: contract.contract_name ?? "Contract",
        value: metrics.totalCollected,
        value2: metrics.outstanding,
      })),
    [billedRows]
  );

  function exportCsv() {
    downloadCsv(
      "collection-rates.csv",
      rows.map(({ contract, metrics, collectionRate }) => ({
        Contract: contract.contract_name,
        Billed: metrics.totalBilled,
        Collected: metrics.totalCollected,
        Outstanding: metrics.outstanding,
        "Collection Rate": collectionRate,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("collection-rates.pdf", "General Contract Management — Collection Rates", [
      {
        title: "Billed vs Collected",
        columns: ["Contract", "Billed", "Collected", "Outstanding", "Rate"],
        rows: rows.map(({ contract, metrics, collectionRate }) => [
          contract.contract_name ?? "",
          money(metrics.totalBilled),
          money(metrics.totalCollected),
          money(metrics.outstanding),
          percent(collectionRate),
        ]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Collection Rates"
      subtitle="Billed versus collected by contract—lowest collection rates first for cash follow-up."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {showSummaryNumbers ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
          <StatCard compact title="Billed" value={money(totals.totalBilled)} />
          <StatCard
            compact
            title="Collected"
            value={money(totals.totalCollected)}
            tone="success"
          />
          <StatCard
            compact
            title="Outstanding AR"
            value={money(totals.outstanding)}
            tone={totals.outstanding > 0 ? "warning" : "default"}
          />
          <StatCard
            compact
            title="Portfolio rate"
            value={percent(totals.portfolioRate)}
            tone={rateTone(totals.portfolioRate, totals.totalBilled)}
          />
          {totals.lowest ? (
            <StatCard
              compact
              title="Lowest rate"
              value={percent(totals.lowest.collectionRate)}
              hint={totals.lowest.contract.contract_name ?? undefined}
              tone={rateTone(totals.lowest.collectionRate, totals.lowest.metrics.totalBilled)}
            />
          ) : null}
        </div>
      ) : null}

      {showGraphs ? (
        <ReportBarChart data={chartData} valueLabel="Collected" value2Label="Outstanding" />
      ) : null}

      {billedRows.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No billing activity to report.</p>
      ) : showHint ? (
        <p className="text-sm opacity-60 py-1">
          Export CSV or PDF for billed, collected, outstanding, and collection rate by contract.
        </p>
      ) : null}
    </ReportPane>
  );
}
