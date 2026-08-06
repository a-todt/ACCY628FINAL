"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ReportDetailsModal, ReportPane, StatCard } from "@/components/ui";
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
};

function bucketTone(bucket: ArAgingBucket, amount: number): "default" | "warning" | "error" {
  if (amount <= 0) return "default";
  if (bucket === "90+ Days") return "error";
  if (bucket !== "Current") return "warning";
  return "default";
}

function bucketBadge(bucket: ArAgingBucket) {
  if (bucket === "Current") return "badge-success";
  if (bucket === "90+ Days") return "badge-error";
  if (bucket === "61-90 Days") return "badge-warning";
  return "badge-ghost";
}

export function ArAgingSection({ rows, totals }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(() => new Set());

  const totalOutstanding = useMemo(
    () => AR_AGING_BUCKETS.reduce((sum, bucket) => sum + (totals[bucket] ?? 0), 0),
    [totals]
  );

  const groups = useMemo(() => {
    return AR_AGING_BUCKETS.map((bucket) => {
      const invoices = rows
        .filter((row) => row.bucket === bucket)
        .sort((a, b) => b.days - a.days || b.outstanding - a.outstanding);
      return {
        bucket,
        invoices,
        count: invoices.length,
        outstanding: totals[bucket] ?? 0,
      };
    }).filter((group) => group.count > 0 || group.outstanding > 0);
  }, [rows, totals]);

  const allExpanded =
    groups.length > 0 && groups.every((group) => expandedBuckets.has(group.bucket));

  function toggleBucket(bucket: string) {
    setExpandedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) setExpandedBuckets(new Set());
    else setExpandedBuckets(new Set(groups.map((g) => g.bucket)));
  }

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
    downloadPdfTables("ar-aging.pdf", "GC Contract Manager — AR Aging", [
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

  const title = "AR Aging";
  const subtitle =
    "Outstanding invoice balances grouped by days past due, from current through 90+ days.";

  return (
    <>
      <ReportPane
        title={title}
        subtitle={subtitle}
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        footerStart={
          rows.length > 0 ? (
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

        {rows.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No outstanding invoice balances.</p>
        ) : null}
      </ReportPane>

      <ReportDetailsModal
        open={showDetails}
        title={title}
        subtitle={subtitle}
        onClose={() => {
          setShowDetails(false);
          setExpandedBuckets(new Set());
        }}
      >
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-28">
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={toggleAll}
                    aria-expanded={allExpanded}
                  >
                    {allExpanded ? "Hide all" : "Show all"}
                  </button>
                </th>
                <th>Bucket</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const open = expandedBuckets.has(group.bucket);
                return (
                  <Fragment key={group.bucket}>
                    <tr className="font-medium bg-base-200/50">
                      <td className="whitespace-nowrap">
                        <button
                          type="button"
                          className={`btn btn-ghost btn-xs ${open ? "btn-active" : ""}`}
                          onClick={() => toggleBucket(group.bucket)}
                          aria-expanded={open}
                          disabled={group.count === 0}
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={`badge badge-sm ${bucketBadge(group.bucket)}`}>
                          {group.bucket}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">{group.count}</td>
                      <td
                        className={`text-right whitespace-nowrap ${group.bucket !== "Current" && group.outstanding > 0 ? "text-warning" : ""}`}
                      >
                        {money(group.outstanding)}
                      </td>
                    </tr>
                    {open
                      ? group.invoices.map(({ invoice, outstanding, days }) => (
                          <tr key={invoice.id} className="bg-base-100">
                            <td />
                            <td colSpan={3} className="py-3">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm pl-2 border-l-2 border-primary/30">
                                <div>
                                  <div className="opacity-60 text-xs">Invoice #</div>
                                  <Link
                                    href={`/invoices/${invoice.id}`}
                                    className="link link-primary font-medium"
                                  >
                                    {invoice.invoice_number ?? "View"}
                                  </Link>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Project</div>
                                  <div className="font-medium">
                                    {invoice.contracts?.contract_name ?? "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Due date</div>
                                  <div className="font-medium">{invoice.due_date ?? "—"}</div>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Outstanding</div>
                                  <div className="font-medium">{money(outstanding)}</div>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Days past due</div>
                                  <div className="font-medium">{Math.max(0, days)}</div>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Status</div>
                                  <div className="font-medium capitalize">
                                    {invoice.status?.replaceAll("_", " ") ?? "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Invoice amount</div>
                                  <div className="font-medium">
                                    {money(Number(invoice.invoice_amount ?? 0))}
                                  </div>
                                </div>
                                <div>
                                  <div className="opacity-60 text-xs">Amount paid</div>
                                  <div className="font-medium">
                                    {money(Number(invoice.amount_paid ?? 0))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-base-200">
                <td />
                <td>TOTALS</td>
                <td className="text-right whitespace-nowrap">{rows.length}</td>
                <td className="text-right whitespace-nowrap">{money(totalOutstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportDetailsModal>
    </>
  );
}
