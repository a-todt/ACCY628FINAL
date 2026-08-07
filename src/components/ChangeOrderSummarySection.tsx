"use client";

import { useMemo } from "react";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { labelize, money } from "@/lib/metrics";
import type { Contract } from "@/lib/types";

type OverallRow = {
  status: "pending" | "approved" | "rejected";
  count: number;
  total: number;
};

type ContractRow = {
  contract: Contract;
  pending: number;
  approved: number;
  rejected: number;
};

type Props = {
  overall: OverallRow[];
  byContract: ContractRow[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

function statusTone(status: OverallRow["status"]): "default" | "warning" | "success" | "error" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  if (status === "pending") return "warning";
  return "default";
}

export function ChangeOrderSummarySection({
  overall,
  byContract,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const chartData = useMemo(
    () =>
      overall.map((row) => ({
        name: labelize(row.status),
        value: row.total,
      })),
    [overall]
  );

  function exportCsv() {
    downloadCsv(
      "change-order-summary.csv",
      byContract.map((row) => ({
        Contract: row.contract.contract_name,
        Pending: row.pending,
        "Approved Value": row.approved,
        Rejected: row.rejected,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("change-order-summary.pdf", "General Contract Management — Change Order Summary", [
      {
        title: "Change Order Summary",
        columns: ["Contract", "Pending", "Approved Value", "Rejected"],
        rows: byContract.map((row) => [
          row.contract.contract_name ?? "",
          row.pending,
          money(row.approved),
          row.rejected,
        ]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Change Order Summary"
      subtitle="Pending, approved, and rejected change orders by contract, including approved value impact."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {showSummaryNumbers ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mb-1">
          {overall.map((row) => (
            <StatCard
              compact
              key={row.status}
              title={labelize(row.status)}
              value={String(row.count)}
              hint={money(row.total)}
              tone={statusTone(row.status)}
            />
          ))}
        </div>
      ) : null}

      {showGraphs ? <ReportBarChart data={chartData} valueLabel="Amount" /> : null}

      {byContract.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No contracts to report.</p>
      ) : showHint ? (
        <p className="text-sm opacity-60 py-1">
          Export CSV or PDF for pending, approved, and rejected change orders by contract.
        </p>
      ) : null}
    </ReportPane>
  );
}
