"use client";

import { useMemo } from "react";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money } from "@/lib/metrics";
import type { Invoice } from "@/lib/types";

export const AR_AGING_BUCKETS = [
  "Current",
  "1-30 Days",
  "31-60 Days",
  "61-90 Days",
  "90+ Days",
] as const;

export type ArAgingBucket = (typeof AR_AGING_BUCKETS)[number];

export type ArAgingRow = {
  invoice: Invoice;
  outstanding: number;
  days: number;
  bucket: ArAgingBucket;
};

type Props = {
  rows: ArAgingRow[];
  totals: Record<string, number>;
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

function bucketTone(bucket: ArAgingBucket, amount: number): "default" | "warning" | "error" {
  if (amount <= 0) return "default";
  if (bucket === "90+ Days") return "error";
  if (bucket !== "Current") return "warning";
  return "default";
}

export function ArAgingSection({
  rows,
  totals,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const chartData = useMemo(
    () =>
      AR_AGING_BUCKETS.map((bucket) => ({
        name: bucket,
        value: totals[bucket] ?? 0,
      })),
    [totals]
  );

  function exportCsv() {
    downloadCsv(
      "ar-aging.csv",
      rows.map(({ invoice, outstanding, bucket }) => ({
        "Invoice #": invoice.invoice_number,
        Project: invoice.contracts?.contract_name,
        "Due Date": invoice.due_date,
        Bucket: bucket,
        Outstanding: outstanding,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("ar-aging.pdf", "General Contract Management — AR Aging", [
      {
        title: "AR Aging",
        columns: ["Invoice #", "Project", "Due Date", "Bucket", "Outstanding"],
        rows: rows.map(({ invoice, outstanding, bucket }) => [
          invoice.invoice_number ?? "",
          invoice.contracts?.contract_name ?? "",
          invoice.due_date ?? "",
          bucket,
          money(outstanding),
        ]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="AR Aging"
      subtitle="Outstanding invoice balances grouped by days past due, from current through 90+ days."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {showSummaryNumbers ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
          {AR_AGING_BUCKETS.map((bucket) => (
            <StatCard
              compact
              key={bucket}
              title={bucket}
              value={money(totals[bucket] ?? 0)}
              tone={bucketTone(bucket, totals[bucket] ?? 0)}
            />
          ))}
        </div>
      ) : null}

      {showGraphs ? <ReportBarChart data={chartData} valueLabel="Outstanding" /> : null}

      {rows.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No outstanding invoice balances.</p>
      ) : showHint ? (
        <p className="text-sm opacity-60 py-1">
          Export CSV or PDF for invoice-level aging detail by bucket.
        </p>
      ) : null}
    </ReportPane>
  );
}
