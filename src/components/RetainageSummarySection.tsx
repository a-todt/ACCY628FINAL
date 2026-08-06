"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ReportDetailsModal, ReportPane, StatCard } from "@/components/ui";
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
};

export function RetainageSummarySection({ rows }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

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

  const displayRows = activeRows.length > 0 ? activeRows : sorted;
  const allExpanded =
    displayRows.length > 0 && displayRows.every((r) => expandedIds.has(r.contract.id));

  function toggleRow(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) setExpandedIds(new Set());
    else setExpandedIds(new Set(displayRows.map((r) => r.contract.id)));
  }

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

  const title = "Retainage (ASC 606)";
  const subtitle =
    "Owner retainage receivable is a contract asset; sub retainage withheld is a liability — not combined.";

  return (
    <>
      <ReportPane
        title={title}
        subtitle={subtitle}
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        footerStart={
          sorted.length > 0 ? (
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

        {sorted.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No contracts to report.</p>
        ) : null}
      </ReportPane>

      <ReportDetailsModal
        open={showDetails}
        title={title}
        subtitle={subtitle}
        onClose={() => {
          setShowDetails(false);
          setExpandedIds(new Set());
        }}
      >
        {displayRows.every((r) => r.invoiceRetainage <= 0.005 && r.subRetainage <= 0.005) ? (
          <p className="text-sm opacity-60 py-4 text-center">No retainage recorded yet.</p>
        ) : (
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
                  <th>Contract</th>
                  <th className="text-right">Receivable (Asset)</th>
                  <th className="text-right">Payable Est (Liability)</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const open = expandedIds.has(row.contract.id);
                  return (
                    <Fragment key={row.contract.id}>
                      <tr className="font-medium bg-base-200/50">
                        <td className="whitespace-nowrap">
                          <button
                            type="button"
                            className={`btn btn-ghost btn-xs ${open ? "btn-active" : ""}`}
                            onClick={() => toggleRow(row.contract.id)}
                            aria-expanded={open}
                          >
                            {open ? "Hide" : "Details"}
                          </button>
                        </td>
                        <td className="whitespace-nowrap">
                          <Link
                            href={`/contracts/${row.contract.id}`}
                            className="link link-primary font-medium"
                          >
                            {row.contract.contract_name}
                          </Link>
                        </td>
                        <td className="text-right whitespace-nowrap">{money(row.invoiceRetainage)}</td>
                        <td className="text-right whitespace-nowrap">{money(row.subRetainage)}</td>
                      </tr>
                      {open ? (
                        <tr className="bg-base-100">
                          <td />
                          <td colSpan={3} className="py-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm pl-2 border-l-2 border-primary/30">
                              <div>
                                <div className="opacity-60 text-xs">ASC 606 classification</div>
                                <div className="font-medium">
                                  Owner withholdings → contract asset; sub withholdings → liability
                                </div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Not netted</div>
                                <div className="font-medium">
                                  Receivable and payable are presented separately under GAAP
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-base-200">
                  <td />
                  <td>TOTALS</td>
                  <td className="text-right whitespace-nowrap">{money(totals.invoiceRetainage)}</td>
                  <td className="text-right whitespace-nowrap">{money(totals.subRetainage)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ReportDetailsModal>
    </>
  );
}
