"use client";

import { useMemo } from "react";
import { ReportBarChart } from "@/components/ReportMiniChart";
import { ReportPane, StatCard, type ReportPaneDisplayControls } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { labelize, money } from "@/lib/metrics";
import type { Contract, Payment } from "@/lib/types";

export type CashCollectionRow = {
  payment: Payment;
  invoiceNumber: string;
  contractName: string;
  amount: number;
  status: string;
};

type Props = {
  rows: CashCollectionRow[];
  showSummaryNumbers?: boolean;
  showGraphs?: boolean;
  displayControls?: ReportPaneDisplayControls;
};

export function buildCashCollectionRows(
  payments: Payment[],
  contracts: Contract[],
  invoiceLookup: Map<string, { invoice_number: string | null; contract_id: string }>
): CashCollectionRow[] {
  const contractNameById = new Map(contracts.map((c) => [c.id, c.contract_name ?? ""]));

  return [...payments]
    .map((payment) => {
      const linked = payment.invoices ?? invoiceLookup.get(payment.invoice_id) ?? null;
      const contractId = linked?.contract_id ?? "";
      return {
        payment,
        invoiceNumber: linked?.invoice_number ?? "—",
        contractName: contractNameById.get(contractId) ?? "—",
        amount: Number(payment.payment_amount ?? 0),
        status: payment.approval_status ?? "posted",
      };
    })
    .sort((a, b) => {
      const byDate = (b.payment.payment_date ?? "").localeCompare(a.payment.payment_date ?? "");
      if (byDate !== 0) return byDate;
      return b.amount - a.amount;
    });
}

export function CashCollectionsSection({
  rows,
  showSummaryNumbers = true,
  showGraphs = false,
  displayControls,
}: Props) {
  const totals = useMemo(() => {
    const posted = rows.filter((r) => r.status === "posted");
    const pending = rows.filter((r) => r.status === "pending_approval");
    return {
      postedAmount: posted.reduce((s, r) => s + r.amount, 0),
      postedCount: posted.length,
      pendingAmount: pending.reduce((s, r) => s + r.amount, 0),
      pendingCount: pending.length,
      totalCount: rows.length,
    };
  }, [rows]);

  const chartData = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const row of rows) {
      const key = labelize(row.status);
      byStatus.set(key, (byStatus.get(key) ?? 0) + row.amount);
    }
    return Array.from(byStatus.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      "cash-collections.csv",
      rows.map(({ payment, invoiceNumber, contractName, amount, status }) => ({
        Date: payment.payment_date,
        Contract: contractName,
        "Invoice #": invoiceNumber,
        Amount: amount,
        Method: payment.payment_method,
        Reference: payment.reference_number,
        Status: labelize(status),
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("cash-collections.pdf", "General Contract Management — Cash Collections", [
      {
        title: "Payment Register",
        columns: ["Date", "Contract", "Invoice #", "Amount", "Method", "Status"],
        rows: rows.map(({ payment, invoiceNumber, contractName, amount, status }) => [
          payment.payment_date ?? "",
          contractName,
          invoiceNumber,
          money(amount),
          payment.payment_method ?? "",
          labelize(status),
        ]),
      },
    ]);
  }

  const showHint = !showSummaryNumbers && !showGraphs;

  return (
    <ReportPane
      title="Cash Collections"
      subtitle="Payment register by date—posted cash, pending approvals, and rejected receipts."
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
      displayControls={displayControls}
    >
      {showSummaryNumbers ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-1">
          <StatCard
            compact
            title="Posted collections"
            value={money(totals.postedAmount)}
            hint={`${totals.postedCount} payment${totals.postedCount === 1 ? "" : "s"}`}
            tone="success"
          />
          <StatCard
            compact
            title="Pending approval"
            value={money(totals.pendingAmount)}
            hint={`${totals.pendingCount} payment${totals.pendingCount === 1 ? "" : "s"}`}
            tone={totals.pendingCount > 0 ? "warning" : "default"}
          />
          <StatCard compact title="Payments logged" value={String(totals.totalCount)} />
        </div>
      ) : null}

      {showGraphs ? <ReportBarChart data={chartData} valueLabel="Amount" /> : null}

      {rows.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No payments to report.</p>
      ) : showHint ? (
        <p className="text-sm opacity-60 py-1">
          Export CSV or PDF for the payment register by date, invoice, and approval status.
        </p>
      ) : null}
    </ReportPane>
  );
}
