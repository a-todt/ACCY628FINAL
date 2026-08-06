"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ReportPane, StatCard } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money } from "@/lib/metrics";
import type { Contract } from "@/lib/types";

export type RetainageRow = {
  contract: Contract;
  invoiceRetainage: number;
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
      [...rows]
        .map((row) => ({
          ...row,
          total: row.invoiceRetainage + row.subRetainage,
        }))
        .sort((a, b) => {
          const byTotal = b.total - a.total;
          if (byTotal !== 0) return byTotal;
          return (a.contract.contract_name ?? "").localeCompare(b.contract.contract_name ?? "");
        }),
    [rows]
  );

  const activeRows = useMemo(() => sorted.filter((row) => row.total > 0.005), [sorted]);

  const totals = useMemo(() => {
    const invoiceRetainage = sorted.reduce((s, r) => s + r.invoiceRetainage, 0);
    const subRetainage = sorted.reduce((s, r) => s + r.subRetainage, 0);
    return {
      invoiceRetainage,
      subRetainage,
      combined: invoiceRetainage + subRetainage,
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
        "Invoice Retainage": row.invoiceRetainage,
        "Sub Retainage Est": row.subRetainage,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("retainage-summary.pdf", "GC Contract Manager — Retainage Summary", [
      {
        title: "Retainage Summary",
        columns: ["Contract", "Invoice Retainage", "Sub Retainage Est"],
        rows: rows.map((row) => [
          row.contract.contract_name ?? "",
          money(row.invoiceRetainage),
          money(row.subRetainage),
        ]),
      },
    ]);
  }

  return (
    <ReportPane
      title="Retainage Summary"
      subtitle="Invoice retainage held and estimated subcontractor retainage by contract."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      footerStart={
        sorted.length > 0 ? (
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              setShowDetails((open) => {
                if (open) setExpandedIds(new Set());
                return !open;
              });
            }}
            aria-expanded={showDetails}
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mb-1">
        <StatCard compact title="Invoice retainage" value={money(totals.invoiceRetainage)} />
        <StatCard compact title="Sub retainage est." value={money(totals.subRetainage)} />
        <StatCard compact title="Combined" value={money(totals.combined)} />
        <StatCard compact title="Contracts with retainage" value={String(totals.contractsWithRetainage)} />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No contracts to report.</p>
      ) : showDetails ? (
            displayRows.every((r) => r.total <= 0.005) ? (
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
                      <th className="text-right">Combined</th>
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
                            <td className="text-right whitespace-nowrap">{money(row.total)}</td>
                          </tr>
                          {open ? (
                            <tr className="bg-base-100">
                              <td />
                              <td colSpan={2} className="py-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm pl-2 border-l-2 border-primary/30">
                                  <div>
                                    <div className="opacity-60 text-xs">Invoice retainage</div>
                                    <div className="font-medium">{money(row.invoiceRetainage)}</div>
                                  </div>
                                  <div>
                                    <div className="opacity-60 text-xs">Sub retainage est.</div>
                                    <div className="font-medium">{money(row.subRetainage)}</div>
                                  </div>
                                  <div>
                                    <div className="opacity-60 text-xs">Share of portfolio</div>
                                    <div className="font-medium">
                                      {totals.combined > 0
                                        ? `${((row.total / totals.combined) * 100).toFixed(1)}%`
                                        : "—"}
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
                      <td className="text-right whitespace-nowrap">{money(totals.combined)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : null}
    </ReportPane>
  );
}
