"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageSkeleton } from "@/components/PageSkeleton";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { labelize, moneyExact } from "@/lib/metrics";
import { canViewFraudAlerts } from "@/lib/roles";
import type { CostEntry, Invoice, Payment } from "@/lib/types";

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <SectionCard
      title={invoice.invoice_number?.trim() || "Invoice"}
      actions={
        <Link href={`/invoices/${invoice.id}`} className="btn btn-ghost btn-xs gap-1">
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="opacity-60">Project</dt>
        <dd className="font-medium text-right">{invoice.contracts?.contract_name ?? "—"}</dd>
        <dt className="opacity-60">Amount</dt>
        <dd className="font-medium text-right tabular-nums">{moneyExact(invoice.invoice_amount)}</dd>
        <dt className="opacity-60">Net due</dt>
        <dd className="text-right tabular-nums">
          {moneyExact(invoice.net_amount_due ?? invoice.invoice_amount)}
        </dd>
        <dt className="opacity-60">Amount paid</dt>
        <dd className="text-right tabular-nums">{moneyExact(invoice.amount_paid)}</dd>
        <dt className="opacity-60">Status</dt>
        <dd className="text-right">{labelize(invoice.status)}</dd>
        <dt className="opacity-60">Invoice date</dt>
        <dd className="text-right">{invoice.invoice_date ?? "—"}</dd>
        <dt className="opacity-60">Due date</dt>
        <dd className="text-right">{invoice.due_date ?? "—"}</dd>
        <dt className="opacity-60">Description</dt>
        <dd className="text-right col-span-1">{invoice.description?.trim() || "—"}</dd>
      </dl>
    </SectionCard>
  );
}

function PaymentCard({
  payment,
  invoice,
}: {
  payment: Payment;
  invoice: Invoice | undefined;
}) {
  return (
    <SectionCard
      title={`Payment · ${moneyExact(payment.payment_amount)}`}
      actions={
        <Link
          href={`/invoices/${payment.invoice_id}?tab=payments`}
          className="btn btn-ghost btn-xs gap-1"
        >
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="opacity-60">Invoice</dt>
        <dd className="font-medium text-right">
          {invoice?.invoice_number?.trim() || payment.invoices?.invoice_number || "—"}
        </dd>
        <dt className="opacity-60">Project</dt>
        <dd className="text-right">{invoice?.contracts?.contract_name ?? "—"}</dd>
        <dt className="opacity-60">Amount</dt>
        <dd className="font-medium text-right tabular-nums">{moneyExact(payment.payment_amount)}</dd>
        <dt className="opacity-60">Date</dt>
        <dd className="text-right">{payment.payment_date ?? "—"}</dd>
        <dt className="opacity-60">Method</dt>
        <dd className="text-right">{payment.payment_method?.trim() || "—"}</dd>
        <dt className="opacity-60">Reference</dt>
        <dd className="text-right">{payment.reference_number?.trim() || "—"}</dd>
        <dt className="opacity-60">Approval</dt>
        <dd className="text-right">{labelize(payment.approval_status ?? "posted")}</dd>
        <dt className="opacity-60">Notes</dt>
        <dd className="text-right">{payment.notes?.trim() || "—"}</dd>
      </dl>
    </SectionCard>
  );
}

function CostCard({ cost }: { cost: CostEntry }) {
  return (
    <SectionCard
      title={`${labelize(cost.category)} · ${moneyExact(cost.amount)}`}
      actions={
        <Link href={`/costs?q=${encodeURIComponent(cost.description ?? "")}`} className="btn btn-ghost btn-xs gap-1">
          Costs <ExternalLink className="h-3 w-3" />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="opacity-60">Project</dt>
        <dd className="font-medium text-right">{cost.contracts?.contract_name ?? "—"}</dd>
        <dt className="opacity-60">Amount</dt>
        <dd className="font-medium text-right tabular-nums">{moneyExact(cost.amount)}</dd>
        <dt className="opacity-60">Date</dt>
        <dd className="text-right">{cost.date_incurred ?? "—"}</dd>
        <dt className="opacity-60">Entered by</dt>
        <dd className="text-right">
          {cost.user_profiles?.full_name?.trim() || cost.user_profiles?.email || "—"}
        </dd>
        <dt className="opacity-60">Description</dt>
        <dd className="text-right">{cost.description?.trim() || "—"}</dd>
        <dt className="opacity-60">Notes</dt>
        <dd className="text-right">{cost.notes?.trim() || "—"}</dd>
      </dl>
    </SectionCard>
  );
}

function CompareBody() {
  const searchParams = useSearchParams();
  const { effectiveRole } = useAuth();
  const { invoices, payments, costEntries, loading, error } = useContractData();

  const invoiceIds = useMemo(
    () => parseIds(searchParams.get("invoices")),
    [searchParams]
  );
  const paymentIds = useMemo(
    () => parseIds(searchParams.get("payments")),
    [searchParams]
  );
  const costIds = useMemo(() => parseIds(searchParams.get("costs")), [searchParams]);

  const selectedInvoices = useMemo(
    () => invoiceIds.map((id) => invoices.find((i) => i.id === id)).filter(Boolean) as Invoice[],
    [invoiceIds, invoices]
  );
  const selectedPayments = useMemo(
    () => paymentIds.map((id) => payments.find((p) => p.id === id)).filter(Boolean) as Payment[],
    [paymentIds, payments]
  );
  const selectedCosts = useMemo(
    () =>
      costIds.map((id) => costEntries.find((c) => c.id === id)).filter(Boolean) as CostEntry[],
    [costIds, costEntries]
  );

  if (!canViewFraudAlerts(effectiveRole)) {
    return (
      <EmptyState
        title="Compare not available"
        message="Only owners and admins can open fraud comparison views."
        action={
          <Link href="/alerts" className="btn btn-primary btn-sm mt-2">
            Back to alerts
          </Link>
        }
      />
    );
  }

  if (loading) return <PageSkeleton />;
  if (error) return <AlertBanner type="error">{error}</AlertBanner>;

  const total =
    selectedInvoices.length + selectedPayments.length + selectedCosts.length;

  if (total === 0) {
    return (
      <EmptyState
        title="Nothing to compare"
        message="This alert no longer has matching invoices, payments, or cost entries."
        action={
          <Link href="/alerts" className="btn btn-primary btn-sm mt-2">
            Back to alerts
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Alerts", href: "/alerts" },
          { label: "Compare" },
        ]}
      />
      <PageHeader
        title="Side-by-side review"
        subtitle="Compare flagged invoices, payments, or charges next to each other."
        actions={
          <Link href="/alerts" className="btn btn-ghost btn-sm gap-1">
            <ArrowLeft className="h-4 w-4" /> Alerts
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {selectedInvoices.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} />
        ))}
        {selectedPayments.map((payment) => (
          <PaymentCard
            key={payment.id}
            payment={payment}
            invoice={invoices.find((i) => i.id === payment.invoice_id)}
          />
        ))}
        {selectedCosts.map((cost) => (
          <CostCard key={cost.id} cost={cost} />
        ))}
      </div>
    </div>
  );
}

export default function AlertComparePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CompareBody />
    </Suspense>
  );
}
