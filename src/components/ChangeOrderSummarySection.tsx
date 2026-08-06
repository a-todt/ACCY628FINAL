"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ReportDetailsModal, ReportPane, StatCard } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { labelize, money } from "@/lib/metrics";
import type { ChangeOrder, Contract } from "@/lib/types";

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
  changeOrders: ChangeOrder[];
};

function statusBadge(status: ChangeOrder["status"]) {
  if (status === "approved") return "badge-success";
  if (status === "rejected") return "badge-error";
  return "badge-warning";
}

function statusTone(status: OverallRow["status"]): "default" | "warning" | "success" | "error" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  if (status === "pending") return "warning";
  return "default";
}

export function ChangeOrderSummarySection({ overall, byContract, changeOrders }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const sorted = useMemo(
    () =>
      [...byContract]
        .map((row) => ({
          ...row,
          activity: row.pending + row.rejected + (row.approved > 0 ? 1 : 0),
          netImpact: row.approved,
        }))
        .sort((a, b) => {
          const byApproved = b.approved - a.approved;
          if (byApproved !== 0) return byApproved;
          const byPending = b.pending - a.pending;
          if (byPending !== 0) return byPending;
          return (a.contract.contract_name ?? "").localeCompare(b.contract.contract_name ?? "");
        }),
    [byContract]
  );

  const activeRows = useMemo(
    () => sorted.filter((row) => row.pending > 0 || row.rejected > 0 || row.approved > 0.005),
    [sorted]
  );

  const displayRows = activeRows.length > 0 ? activeRows : sorted;

  const ordersByContract = useMemo(() => {
    const map = new Map<string, ChangeOrder[]>();
    for (const co of changeOrders) {
      const list = map.get(co.contract_id) ?? [];
      list.push(co);
      map.set(co.contract_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const byStatus = a.status.localeCompare(b.status);
        if (byStatus !== 0) return byStatus;
        return (b.date_submitted ?? "").localeCompare(a.date_submitted ?? "");
      });
    }
    return map;
  }, [changeOrders]);

  const totals = useMemo(() => {
    return {
      pending: displayRows.reduce((s, r) => s + r.pending, 0),
      approved: displayRows.reduce((s, r) => s + r.approved, 0),
      rejected: displayRows.reduce((s, r) => s + r.rejected, 0),
    };
  }, [displayRows]);

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

  const title = "Change Order Summary";
  const subtitle =
    "Pending, approved, and rejected change orders by contract, including approved value impact.";

  return (
    <>
      <ReportPane
        title={title}
        subtitle={subtitle}
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        footerStart={
          byContract.length > 0 ? (
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

        {byContract.length === 0 ? (
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
        {activeRows.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No change orders yet.</p>
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
                  <th className="text-right">Pending</th>
                  <th className="text-right">Approved Value</th>
                  <th className="text-right">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const open = expandedIds.has(row.contract.id);
                  const related = ordersByContract.get(row.contract.id) ?? [];
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
                        <td className="text-right whitespace-nowrap">{row.pending}</td>
                        <td className="text-right whitespace-nowrap">{money(row.approved)}</td>
                        <td className="text-right whitespace-nowrap">{row.rejected}</td>
                      </tr>
                      {open ? (
                        <tr className="bg-base-100">
                          <td />
                          <td colSpan={4} className="py-3">
                            {related.length === 0 ? (
                              <p className="text-sm opacity-60 pl-2">No change orders on this contract.</p>
                            ) : (
                              <div className="pl-2 border-l-2 border-primary/30 space-y-2">
                                {related.map((co) => (
                                  <div
                                    key={co.id}
                                    className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm"
                                  >
                                    <div>
                                      <div className="opacity-60 text-xs">CO #</div>
                                      <div className="font-medium">
                                        {co.change_order_number ?? "—"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="opacity-60 text-xs">Status</div>
                                      <span className={`badge badge-sm ${statusBadge(co.status)}`}>
                                        {labelize(co.status)}
                                      </span>
                                    </div>
                                    <div>
                                      <div className="opacity-60 text-xs">Amount</div>
                                      <div className="font-medium">{money(Number(co.amount ?? 0))}</div>
                                    </div>
                                    <div>
                                      <div className="opacity-60 text-xs">Submitted</div>
                                      <div className="font-medium">{co.date_submitted ?? "—"}</div>
                                    </div>
                                    {co.description ? (
                                      <div className="col-span-2 sm:col-span-4">
                                        <div className="opacity-60 text-xs">Description</div>
                                        <div className="font-medium">{co.description}</div>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
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
                  <td className="text-right whitespace-nowrap">{totals.pending}</td>
                  <td className="text-right whitespace-nowrap">{money(totals.approved)}</td>
                  <td className="text-right whitespace-nowrap">{totals.rejected}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ReportDetailsModal>
    </>
  );
}
