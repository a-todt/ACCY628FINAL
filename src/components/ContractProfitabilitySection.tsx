"use client";

import { useMemo } from "react";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money, percent } from "@/lib/metrics";
import type { Contract, ContractMetrics } from "@/lib/types";

type ProfitRow = {
  contract: Contract;
  metrics: ContractMetrics;
};

type Props = {
  rows: ProfitRow[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

function marginTone(margin: number, profit: number): "error" | "warning" | "success" | "default" {
  if (profit < 0 || margin < 0) return "error";
  if (margin < 0.08) return "warning";
  if (margin >= 0.15) return "success";
  return "default";
}

export function ContractProfitabilitySection({
  rows,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const byProfit = a.metrics.grossProfit - b.metrics.grossProfit;
        if (byProfit !== 0) return byProfit;
        return (a.contract.contract_name ?? "").localeCompare(b.contract.contract_name ?? "");
      }),
    [rows]
  );

  const totals = useMemo(() => {
    const revisedValue = sorted.reduce((s, r) => s + r.metrics.revisedValue, 0);
    const totalBilled = sorted.reduce((s, r) => s + r.metrics.totalBilled, 0);
    const totalCosts = sorted.reduce((s, r) => s + r.metrics.totalCosts, 0);
    const grossProfit = totalBilled - totalCosts;
    const grossMargin = totalBilled > 0 ? grossProfit / totalBilled : 0;
    return { revisedValue, totalBilled, totalCosts, grossProfit, grossMargin };
  }, [sorted]);

  const chartData = useMemo(
    () =>
      [...sorted]
        .sort((a, b) => b.metrics.grossProfit - a.metrics.grossProfit)
        .slice(0, 8)
        .map(({ contract, metrics }) => ({
          name: contract.contract_name ?? "Contract",
          value: metrics.grossProfit,
          value2: metrics.totalCosts,
        })),
    [sorted]
  );

  function exportCsv() {
    downloadCsv(
      "contract-profitability.csv",
      rows.map(({ contract, metrics }) => ({
        Contract: contract.contract_name,
        "Revised Value": metrics.revisedValue,
        Billed: metrics.totalBilled,
        Collected: metrics.totalCollected,
        Costs: metrics.totalCosts,
        "Gross Profit": metrics.grossProfit,
        Margin: metrics.grossMargin,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("contract-profitability.pdf", "General Contract Management — Contract Profitability", [
      {
        title: "Contract Profitability",
        columns: ["Contract", "Revised", "Billed", "Collected", "Costs", "Profit", "Margin"],
        rows: rows.map(({ contract, metrics }) => [
          contract.contract_name ?? "",
          money(metrics.revisedValue),
          money(metrics.totalBilled),
          money(metrics.totalCollected),
          money(metrics.totalCosts),
          money(metrics.grossProfit),
          percent(metrics.grossMargin),
        ]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Contract Profitability"
      subtitle="Portfolio margin by contract—revised value, billed, costs, and gross profit at a glance."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {showSummaryNumbers ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
          <StatCard compact title="Revised value" value={money(totals.revisedValue)} />
          <StatCard compact title="Billed" value={money(totals.totalBilled)} />
          <StatCard compact title="Costs" value={money(totals.totalCosts)} />
          <StatCard
            compact
            title="Gross profit"
            value={money(totals.grossProfit)}
            tone={totals.grossProfit < 0 ? "error" : "default"}
          />
          <StatCard
            compact
            title="Margin"
            value={percent(totals.grossMargin)}
            tone={marginTone(totals.grossMargin, totals.grossProfit)}
          />
        </div>
      ) : null}

      {showGraphs ? (
        <ReportBarChart data={chartData} valueLabel="Gross profit" value2Label="Costs" />
      ) : null}

      {showHint ? (
        <p className="text-sm opacity-60 py-1">
          Export CSV or PDF for per-contract revised value, billed, costs, and margin.
        </p>
      ) : null}
    </ReportPane>
  );
}
