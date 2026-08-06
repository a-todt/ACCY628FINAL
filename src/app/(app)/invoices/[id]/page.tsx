"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, Pencil } from "lucide-react";
import { AttachmentPanel } from "@/components/AttachmentPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageSkeleton } from "@/components/PageSkeleton";
import { writeAuditLog } from "@/lib/audit";
import { daysPastDue, labelize, money } from "@/lib/metrics";
import { canCreateInvoices, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const STATUS_OPTIONS: InvoiceStatus[] = ["unpaid", "partially_paid", "paid", "overdue"];

function isOverdue(invoice: Invoice): boolean {
  return (
    (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
    daysPastDue(invoice.due_date) > 0
  );
}

type EditForm = {
  contract_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  description: string;
  invoice_amount: string;
  retainage_percent: string;
  amount_paid: string;
  status: InvoiceStatus;
  notes: string;
};

function formFromInvoice(invoice: Invoice): EditForm {
  return {
    contract_id: invoice.contract_id,
    invoice_number: invoice.invoice_number ?? "",
    invoice_date: invoice.invoice_date ?? "",
    due_date: invoice.due_date ?? "",
    description: invoice.description ?? "",
    invoice_amount: invoice.invoice_amount != null ? String(invoice.invoice_amount) : "",
    retainage_percent: invoice.retainage_percent != null ? String(invoice.retainage_percent) : "0",
    amount_paid: invoice.amount_paid != null ? String(invoice.amount_paid) : "0",
    status: invoice.status,
    notes: invoice.notes ?? "",
  };
}

export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <InvoiceDetailContent />
    </Suspense>
  );
}

function InvoiceDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceId = params.id;
  const { effectiveRole } = useAuth();
  const { contracts, invoices, payments, loading, error, refresh } = useContractData();
  const canEdit = canCreateInvoices(effectiveRole);
  const wantsEdit = searchParams.get("edit") === "1";
  const isEditing = canEdit && wantsEdit;

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [formSourceId, setFormSourceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const invoice = invoices.find((i) => i.id === invoiceId);

  if (isEditing && invoice && formSourceId !== invoice.id) {
    setFormSourceId(invoice.id);
    setForm(formFromInvoice(invoice));
  }
  if (!isEditing && formSourceId !== null) {
    setFormSourceId(null);
    setForm(null);
  }

  const enterEditMode = () => {
    if (!canEdit || !invoice) return;
    setFormSourceId(invoice.id);
    setForm(formFromInvoice(invoice));
    router.replace(`/invoices/${invoiceId}?edit=1`);
  };

  const exitEditMode = () => {
    setFormSourceId(null);
    setForm(null);
    router.replace(`/invoices/${invoiceId}`);
  };

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
    .sort((a, b) =>
      String(b.payment_date ?? b.created_at).localeCompare(String(a.payment_date ?? a.created_at))
    );
  const paymentsTotal = invoicePayments.reduce(
    (sum, p) => sum + Number(p.payment_amount ?? 0),
    0
  );

  const updateField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const invoiceAmountNum = Number(form?.invoice_amount || 0);
  const retainagePercentNum = Number(form?.retainage_percent || 0);
  const computedRetainageAmount = invoiceAmountNum * (retainagePercentNum / 100);
  const computedNetAmountDue = invoiceAmountNum - computedRetainageAmount;

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setActionError(null);
    setActionSuccess(null);

    if (!form.contract_id || !form.invoice_amount) {
      setActionError("Contract and invoice amount are required.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          contract_id: form.contract_id,
          invoice_number: form.invoice_number.trim() || null,
          invoice_date: form.invoice_date || null,
          due_date: form.due_date || null,
          description: form.description.trim() || null,
          invoice_amount: invoiceAmountNum,
          retainage_percent: retainagePercentNum,
          retainage_amount: computedRetainageAmount,
          net_amount_due: computedNetAmountDue,
          amount_paid: form.amount_paid ? Number(form.amount_paid) : 0,
          status: form.status,
          notes: form.notes.trim() || null,
        })
        .eq("id", invoice.id);
      if (updateError) throw updateError;

      await writeAuditLog("invoice_updated", "invoice", invoice.id, {
        invoice_number: form.invoice_number.trim() || null,
        contract_id: form.contract_id,
        from_status: invoice.status,
        to_status: form.status,
      });

      setActionSuccess("Invoice updated successfully.");
      await refresh();
      exitEditMode();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Invoices", href: "/invoices" },
          ...(invoice.contracts?.contract_name
            ? [{ label: invoice.contracts.contract_name, href: `/contracts/${invoice.contract_id}` }]
            : []),
          { label: invoice.invoice_number ?? "Invoice" },
        ]}
      />
      <PageHeader
        title={invoice.invoice_number ?? "Invoice"}
        subtitle={invoice.contracts?.contract_name ?? "Invoice details"}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            {canEdit ? (
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
                  Edit
                  <ChevronDown className="h-4 w-4" />
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-100 rounded-box z-40 w-52 p-2 shadow border border-base-300"
                >
                  <li>
                    {isEditing ? (
                      <button type="button" onClick={exitEditMode}>
                        <Pencil className="h-4 w-4" /> Exit Edit Mode
                      </button>
                    ) : (
                      <button type="button" onClick={enterEditMode}>
                        <Pencil className="h-4 w-4" /> Edit Invoice
                      </button>
                    )}
                  </li>
                </ul>
              </div>
            ) : null}
            <Link href="/invoices" className="btn btn-ghost btn-sm">
              <ArrowLeft className="h-4 w-4" /> Back to Invoices
            </Link>
          </div>
        }
      />

      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

      <SectionCard
        title="Invoice Details"
        actions={
          <span className={`badge ${statusBadgeClass(displayStatus)}`}>
            {overdue ? "Overdue" : labelize(invoice.status)}
          </span>
        }
      >
        {isEditing && form ? (
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <FormField label="Invoice #">
                <input
                  className="input input-bordered input-sm w-full"
                  value={form.invoice_number}
                  onChange={(e) => updateField("invoice_number", e.target.value)}
                />
              </FormField>
              <FormField label="Project">
                <select
                  className="select select-bordered select-sm w-full"
                  value={form.contract_id}
                  onChange={(e) => updateField("contract_id", e.target.value)}
                  required
                >
                  <option value="">Select a contract…</option>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.contract_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Invoice Date">
                <input
                  type="date"
                  className="input input-bordered input-sm w-full"
                  value={form.invoice_date}
                  onChange={(e) => updateField("invoice_date", e.target.value)}
                />
              </FormField>
              <FormField label="Due Date">
                <input
                  type="date"
                  className="input input-bordered input-sm w-full"
                  value={form.due_date}
                  onChange={(e) => updateField("due_date", e.target.value)}
                />
              </FormField>
              <FormField label="Invoice Amount">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  $
                  <input
                    type="number"
                    step="0.01"
                    className="grow"
                    value={form.invoice_amount}
                    onChange={(e) => updateField("invoice_amount", e.target.value)}
                    required
                  />
                </label>
              </FormField>
              <FormField label="Retainage %">
                <input
                  type="number"
                  step="0.1"
                  className="input input-bordered input-sm w-full"
                  value={form.retainage_percent}
                  onChange={(e) => updateField("retainage_percent", e.target.value)}
                />
              </FormField>
              <FormField label="Retainage Amount">
                <input
                  className="input input-bordered input-sm w-full"
                  value={money(computedRetainageAmount)}
                  disabled
                  readOnly
                />
              </FormField>
              <FormField label="Net Amount Due">
                <input
                  className="input input-bordered input-sm w-full font-medium"
                  value={money(computedNetAmountDue)}
                  disabled
                  readOnly
                />
              </FormField>
              <FormField label="Amount Paid">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  $
                  <input
                    type="number"
                    step="0.01"
                    className="grow"
                    value={form.amount_paid}
                    onChange={(e) => updateField("amount_paid", e.target.value)}
                  />
                </label>
              </FormField>
              <FormField label="Status">
                <select
                  className="select select-bordered select-sm w-full"
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value as InvoiceStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label="Description">
              <textarea
                className="textarea textarea-bordered textarea-sm w-full"
                rows={2}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                className="textarea textarea-bordered textarea-sm w-full"
                rows={2}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={exitEditMode} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <>
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
              <InfoField
                label="Retainage %"
                value={invoice.retainage_percent != null ? `${invoice.retainage_percent}%` : null}
              />
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
          </>
        )}
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

      <SectionCard title="Attachments">
        <AttachmentPanel entityType="invoice" entityId={invoice.id} />
      </SectionCard>

      <SectionCard title={`Payment History (${invoicePayments.length})`}>
        {invoicePayments.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">
            No payments recorded for this invoice yet.
          </p>
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
