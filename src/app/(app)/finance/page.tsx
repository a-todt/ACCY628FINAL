"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CircleDollarSign, Download, FileDown, Receipt } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { daysPastDue, invoiceRetainageReceivable, labelize, money } from "@/lib/metrics";
import { isApprovedCost, isApprovedInvoice } from "@/lib/payments";
import { canViewCosts, canViewInvoices, statusBadgeClass } from "@/lib/roles";

export default function FinanceOverviewPage() {
  const { effectiveRole } = useAuth();
  const { costEntries, invoices, payments, loading, error } = useContractData();

  const showCosts = canViewCosts(effectiveRole);
  const showInvoices = canViewInvoices(effectiveRole);

  const approvedCosts = useMemo(
    () => (showCosts ? costEntries.filter(isApprovedCost) : []),
    [costEntries, showCosts]
  );

  const billableInvoices = useMemo(
    () => (showInvoices ? invoices.filter(isApprovedInvoice) : []),
    [invoices, showInvoices]
  );

  const invoiceStatuses = useMemo(() => {
    return billableInvoices.map((invoice) => {
      const overdue =
        (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
        daysPastDue(invoice.due_date) > 0;
      return overdue ? "overdue" : invoice.status;
    });
  }, [billableInvoices]);

  const totalCosts = approvedCosts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  const totalBilled = billableInvoices.reduce((sum, i) => sum + Number(i.invoice_amount ?? 0), 0);
  const totalCollected = billableInvoices.reduce((sum, i) => sum + Number(i.amount_paid ?? 0), 0);
  const totalPayments = payments
    .filter((p) => (p.approval_status ?? "posted") === "posted")
    .reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);
  const overdueCount = invoiceStatuses.filter((status) => status === "overdue").length;
  const retainageReceivable = billableInvoices.reduce(
    (sum, i) => sum + invoiceRetainageReceivable(i),
    0
  );

  const activityTypes = useMemo(() => {
    const types: string[] = [];
    if (showInvoices) {
      types.push("invoice", "payment");
    }
    if (showCosts) {
      types.push("cost_entry");
    }
    return types;
  }, [showCosts, showInvoices]);

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  return (
    <div className="space-y-2.5">
      <PageHeader
        compact
        title={effectiveRole === "field_supervisor" ? "Costing" : "Costing and Invoicing"}
        subtitle={
          effectiveRole === "field_supervisor"
            ? "Portfolio snapshot for project costs."
            : "Portfolio snapshot for costs, invoices, and payments."
        }
        actions={
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                downloadCsv("finance-overview.csv", [
                  ...(showCosts
                    ? [{ Metric: "Total Costs", Value: totalCosts, Count: approvedCosts.length }]
                    : []),
                  ...(showInvoices
                    ? [
                        { Metric: "Total Billed", Value: totalBilled, Count: billableInvoices.length },
                        {
                          Metric: "Collected",
                          Value: Math.max(totalCollected, totalPayments),
                          Count: "",
                        },
                        {
                          Metric: "Retainage Receivable",
                          Value: retainageReceivable,
                          Count: "",
                        },
                        { Metric: "Overdue Invoices", Value: overdueCount, Count: "" },
                      ]
                    : []),
                ])
              }
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() =>
                downloadPdfTables("finance-overview.pdf", "General Contract Management — Finance Overview", [
                  {
                    title: "Summary",
                    columns: ["Metric", "Value"],
                    rows: [
                      ...(showCosts ? [["Total Costs", money(totalCosts)]] : []),
                      ...(showInvoices
                        ? [
                            ["Total Billed", money(totalBilled)],
                            ["Collected", money(Math.max(totalCollected, totalPayments))],
                            ["Retainage Receivable", money(retainageReceivable)],
                            ["Overdue Invoices", String(overdueCount)],
                          ]
                        : []),
                    ],
                  },
                ])
              }
            >
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {showCosts ? (
          <StatCard
            compact
            title="Total Costs"
            value={money(totalCosts)}
            hint={`${approvedCosts.length} approved entries`}
            icon={CircleDollarSign}
            href="/costs"
          />
        ) : null}
        {showInvoices ? (
          <StatCard
            compact
            title="Total Billed"
            value={money(totalBilled)}
            hint={`${billableInvoices.length} approved invoices`}
            icon={Receipt}
            href="/invoices"
          />
        ) : null}
        {showInvoices ? (
          <StatCard
            compact
            title="Collected"
            value={money(Math.max(totalCollected, totalPayments))}
            href="/invoices"
          />
        ) : null}
        {showInvoices ? (
          <StatCard
            compact
            title="Retainage Receivable"
            value={money(retainageReceivable)}
            hint="ASC 606 contract asset"
            href="/invoices"
          />
        ) : null}
        {showInvoices ? (
          <StatCard
            compact
            title="Overdue"
            value={String(overdueCount)}
            hint="Invoices past due"
            tone={overdueCount > 0 ? "warning" : "default"}
            href="/invoices?status=overdue"
          />
        ) : (
          <StatCard
            compact
            title="Cost Entries"
            value={String(approvedCosts.length)}
            href="/costs"
          />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-2">
        {showCosts ? (
          <SectionCard compact title="Costs by category">
            <div className="flex flex-wrap gap-1.5">
              {["labor", "materials", "subcontractor", "equipment", "permits", "other"].map((cat) => {
                const total = approvedCosts
                  .filter((c) => (c.category ?? "other") === cat)
                  .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
                if (!total) return null;
                return (
                  <span key={cat} className="badge badge-ghost badge-sm">
                    {labelize(cat)}: {money(total)}
                  </span>
                );
              })}
              {approvedCosts.length === 0 ? <p className="text-sm opacity-60">No costs yet.</p> : null}
            </div>
          </SectionCard>
        ) : (
          <SectionCard compact title="Billing note">
            <p className="text-sm opacity-70">Cost details are hidden for your role.</p>
          </SectionCard>
        )}
        {showInvoices ? (
          <SectionCard compact title="Invoice status mix">
            <div className="flex flex-wrap gap-1.5">
              {["unpaid", "partially_paid", "paid", "overdue"].map((status) => {
                const count = invoiceStatuses.filter((s) => s === status).length;
                if (!count) return null;
                return (
                  <Link
                    key={status}
                    href={`/invoices?status=${status}`}
                    className={`badge badge-sm ${statusBadgeClass(status)} hover:opacity-80 transition-opacity`}
                  >
                    {labelize(status)}: {count}
                  </Link>
                );
              })}
              {invoiceStatuses.length === 0 ? (
                <p className="text-sm opacity-60">No invoices yet.</p>
              ) : null}
            </div>
          </SectionCard>
        ) : (
          <SectionCard compact title="Invoicing">
            <p className="text-sm opacity-70">Invoice details are hidden for your role.</p>
          </SectionCard>
        )}
      </div>

      {activityTypes.length > 0 ? (
        <ActivityLogPanel
          compact
          title="Recent Activity"
          entityTypes={activityTypes}
          emptyTitle="No recent finance activity"
          emptyMessage="Invoice creates, updates, payments, and cost changes will show up here."
          limit={6}
        />
      ) : null}
    </div>
  );
}
