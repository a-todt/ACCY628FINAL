"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { daysPastDue, labelize, money } from "@/lib/metrics";
import { statusBadgeClass } from "@/lib/roles";
import type { Invoice } from "@/lib/types";

function isOverdue(invoice: Invoice): boolean {
  return (invoice.status === "unpaid" || invoice.status === "partially_paid") && daysPastDue(invoice.due_date) > 0;
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const { invoices, payments, loading, error } = useContractData();

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

  const invoice = invoices.find((i) => i.id === invoiceId);

  if (!invoice) {
    return (
      <EmptyState
        title="Invoice not found"
        message="This invoice doesn't exist or you don't have access to it."
        action={
          <Link href="/invoices" className="btn btn-primary btn-sm mt-2">
            Back to Invoices
          </Link>
        }
      />
    );
  }

  const overdue = isOverdue(invoice);
  const displayStatus = overdue ? "overdue" : invoice.status;
  const netDue = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const balanceRemaining = Math.max(netDue - amountPaid, 0);
  const invoicePayments = payments
    .filter((p) => p.invoice_id === invoice.id)
    .sort((a, b) => String(b.payment_date ?? b.created_at).localeCompare(String(a.payment_date ?? a.created_at)));
  const paymentsTotal = invoicePayments.reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.invoice_number ?? "Invoice"}
        subtitle={invoice.contracts?.contract_name ?? "Invoice details"}
        actions={
          <Link href="/invoices" className="btn btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" /> Back to Invoices
          </Link>
        }
      />

      <SectionCard
        title="Invoice Details"
        actions={
          <span className={`badge ${statusBadgeClass(displayStatus)}`}>
            {overdue ? "Overdue" : labelize(invoice.status)}
          </span>
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <InfoField label="Invoice #" value={invoice.invoice_number} />
          <InfoField
            label="Project"
            value={invoice.contracts?.contract_name}
            href={invoice.contract_id ? `/contracts/${invoice.contract_id}` : undefined}
          />
          <InfoField label="Client" value={invoice.contracts?.client_name} />
          <InfoField label="Invoice Date" value={invoice.invoice_date} />
          <InfoField
            label="Due Date"
            value={
              invoice.due_date
                ? overdue
                  ? `${invoice.due_date} (${daysPastDue(invoice.due_date)} days past due)`
                  : invoice.due_date
                : null
            }
          />
          <InfoField label="Status" value={overdue ? "Overdue" : labelize(invoice.status)} />
          <InfoField label="Retainage %" value={invoice.retainage_percent != null ? `${invoice.retainage_percent}%` : null} />
          <InfoField label="Created" value={new Date(invoice.created_at).toLocaleDateString()} />
        </div>

        {invoice.description ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Description</p>
            <p className="text-sm whitespace-pre-wrap">{invoice.description}</p>
          </div>
        ) : null}

        {invoice.notes ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Invoice Amount" value={money(invoice.invoice_amount)} />
        <StatCard title="Retainage Held" value={money(invoice.retainage_amount)} />
        <StatCard title="Net Amount Due" value={money(netDue)} />
        <StatCard title="Amount Paid" value={money(amountPaid)} tone="success" />
        <StatCard
          title="Balance Remaining"
          value={money(balanceRemaining)}
          tone={balanceRemaining > 0 ? (overdue ? "error" : "warning") : "success"}
        />
      </div>

      <SectionCard title={`Payment History (${invoicePayments.length})`}>
        {invoicePayments.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No payments recorded for this invoice yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th>Method</th>
                    <th>Reference #</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicePayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="whitespace-nowrap">{payment.payment_date ?? "—"}</td>
                      <td className="text-right font-medium">{money(payment.payment_amount)}</td>
                      <td>{payment.payment_method ?? "—"}</td>
                      <td>{payment.reference_number ?? "—"}</td>
                      <td className="max-w-xs truncate">{payment.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end text-sm">
              <p>
                <span className="opacity-60">Payments total: </span>
                <span className="font-semibold">{money(paymentsTotal)}</span>
              </p>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

function InfoField({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      {href && value ? (
        <Link href={href} className="link link-primary font-medium">
          {value}
        </Link>
      ) : (
        <p className="font-medium">{value || "—"}</p>
      )}
    </div>
  );
}
