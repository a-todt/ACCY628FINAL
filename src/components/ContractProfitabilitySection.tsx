"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ReportDetailsModal, ReportPane, StatCard } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money, percent } from "@/lib/metrics";
import type { Contract, ContractMetrics } from "@/lib/types";

type ProfitRow = {
  contract: Contract;
  metrics: ContractMetrics;
};

type Props = {
  rows: ProfitRow[];
};

function marginTone(margin: number, profit: number): "error" | "warning" | "success" | "default" {
  if (profit < 0 || margin < 0) return "error";
  if (margin < 0.08) return "warning";
  if (margin >= 0.15) return "success";
  return "default";
}

function marginBadge(margin: number, profit: number) {
  if (profit < 0 || margin < 0) return { label: "Loss", className: "badge-error" };
  if (margin < 0.08) return { label: "Thin", className: "badge-warning" };
  return { label: "Healthy", className: "badge-success" };
}

export function ContractProfitabilitySection({ rows }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

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
    const totalCollected = sorted.reduce((s, r) => s + r.metrics.totalCollected, 0);
    const totalCosts = sorted.reduce((s, r) => s + r.metrics.totalCosts, 0);
    const grossProfit = totalBilled - totalCosts;
    const grossMargin = totalBilled > 0 ? grossProfit / totalBilled : 0;
    const outstanding = sorted.reduce((s, r) => s + r.metrics.outstanding, 0);
    const retainageHeld = sorted.reduce((s, r) => s + r.metrics.retainageHeld, 0);
    return {
      revisedValue,
      totalBilled,
      totalCollected,
      totalCosts,
      grossProfit,
      grossMargin,
      outstanding,
      retainageHeld,
    };
  }, [sorted]);

  const allExpanded = sorted.length > 0 && sorted.every((r) => expandedIds.has(r.contract.id));

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
    else setExpandedIds(new Set(sorted.map((r) => r.contract.id)));
  }

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

  const title = "Contract Profitability";
  const subtitle =
    "Portfolio margin by contract—revised value, billed, costs, and gross profit at a glance.";

  return (
    <>
      <ReportPane
        title={title}
        subtitle={subtitle}
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        footerStart={
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => setShowDetails(true)}
          >
            Show details
          </button>
        }
      >
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
        {sorted.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No contracts to report.</p>
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
                  <th className="text-right">Revised Value</th>
                  <th className="text-right">Gross Profit</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ contract, metrics }) => {
                  const open = expandedIds.has(contract.id);
                  const badge = marginBadge(metrics.grossMargin, metrics.grossProfit);
                  return (
                    <Fragment key={contract.id}>
                      <tr className="font-medium bg-base-200/50">
                        <td className="whitespace-nowrap">
                          <button
                            type="button"
                            className={`btn btn-ghost btn-xs ${open ? "btn-active" : ""}`}
                            onClick={() => toggleRow(contract.id)}
                            aria-expanded={open}
                          >
                            {open ? "Hide" : "Details"}
                          </button>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/contracts/${contract.id}`}
                              className="link link-primary font-medium"
                            >
                              {contract.contract_name}
                            </Link>
                            <span className={`badge badge-sm ${badge.className}`}>{badge.label}</span>
                          </div>
                        </td>
                        <td className="text-right whitespace-nowrap">{money(metrics.revisedValue)}</td>
                        <td
                          className={`text-right whitespace-nowrap ${metrics.grossProfit < 0 ? "text-error" : ""}`}
                        >
                          {money(metrics.grossProfit)}
                        </td>
                        <td
                          className={`text-right whitespace-nowrap ${metrics.grossMargin < 0 ? "text-error" : ""}`}
                        >
                          {percent(metrics.grossMargin)}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-base-100">
                          <td />
                          <td colSpan={4} className="py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm pl-2 border-l-2 border-primary/30">
                              <div>
                                <div className="opacity-60 text-xs">Billed</div>
                                <div className="font-medium">{money(metrics.totalBilled)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Collected</div>
                                <div className="font-medium">{money(metrics.totalCollected)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Costs</div>
                                <div className="font-medium">{money(metrics.totalCosts)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Outstanding AR</div>
                                <div className="font-medium">{money(metrics.outstanding)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Retainage receivable</div>
                                <div className="font-medium">{money(metrics.retainageHeld)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Completion</div>
                                <div className="font-medium">{percent(metrics.completionPercent)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Approved COs</div>
                                <div className="font-medium">{money(metrics.approvedChangeOrders)}</div>
                              </div>
                              <div>
                                <div className="opacity-60 text-xs">Pending COs</div>
                                <div className="font-medium">{metrics.pendingChangeOrders}</div>
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
                  <td className="text-right whitespace-nowrap">{money(totals.revisedValue)}</td>
                  <td
                    className={`text-right whitespace-nowrap ${totals.grossProfit < 0 ? "text-error" : ""}`}
                  >
                    {money(totals.grossProfit)}
                  </td>
                  <td
                    className={`text-right whitespace-nowrap ${totals.grossMargin < 0 ? "text-error" : ""}`}
                  >
                    {percent(totals.grossMargin)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ReportDetailsModal>
    </>
  );
}
