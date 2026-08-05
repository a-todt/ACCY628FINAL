"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { daysPastDue, labelize, money } from "@/lib/metrics";
import { canCreateInvoices, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const EMPTY_INVOICE_FORM = {
  contract_id: "",
  invoice_number: "",
  invoice_date: "",
  due_date: "",
  description: "",
  invoice_amount: "",
  retainage_percent: "10",
  notes: "",
};

const EMPTY_PAYMENT_FORM = {
  invoice_id: "",
  payment_amount: "",
  payment_date: "",
  payment_method: "",
  reference_number: "",
  notes: "",
};

function isOverdue(invoice: Invoice): boolean {
  return (invoice.status === "unpaid" || invoice.status === "partially_paid") && daysPastDue(invoice.due_date) > 0;
}

function nextInvoiceStatus(amountPaid: number, netAmountDue: number): InvoiceStatus {
  if (netAmountDue > 0 && amountPaid >= netAmountDue) return "paid";
  if (amountPaid > 0) return "partially_paid";
  return "unpaid";
}

function invoiceBalance(invoice: Invoice): number {
  return Number(invoice.invoice_amount ?? 0) - Number(invoice.amount_paid ?? 0);
}

type SortKey = "number" | "contract" | "date" | "due" | "amount" | "status" | "balance";

export default function InvoicesPage() {
  const router = useRouter();
  const { effectiveRole } = useAuth();
  const { contracts, invoices, loading, error, refresh } = useContractData();
  const canManage = canCreateInvoices(effectiveRole);

  const [invoiceForm, setInvoiceForm] = useState(EMPTY_INVOICE_FORM);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = invoices.filter((invoice) => {
      const overdue = isOverdue(invoice);
      if (statusFilter === "overdue") {
        if (!overdue) return false;
      } else if (statusFilter !== "all" && invoice.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        invoice.invoice_number,
        invoice.contracts?.contract_name,
        invoice.contracts?.client_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "number") return compareValues(a.invoice_number, b.invoice_number, sortDir);
      if (sortKey === "contract") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "date") return compareValues(a.invoice_date, b.invoice_date, sortDir);
      if (sortKey === "due") return compareValues(a.due_date, b.due_date, sortDir);
      if (sortKey === "amount") return compareValues(Number(a.invoice_amount ?? 0), Number(b.invoice_amount ?? 0), sortDir);
      if (sortKey === "status") {
        const aStatus = isOverdue(a) ? "overdue" : a.status;
        const bStatus = isOverdue(b) ? "overdue" : b.status;
        return compareValues(aStatus, bStatus, sortDir);
      }
      return compareValues(invoiceBalance(a), invoiceBalance(b), sortDir);
    });
  }, [invoices, search, statusFilter, sortKey, sortDir]);

  const invoiceAmountNum = Number(invoiceForm.invoice_amount || 0);
  const retainagePercentNum = Number(invoiceForm.retainage_percent || 0);
  const computedRetainageAmount = invoiceAmountNum * (retainagePercentNum / 100);
  const computedNetAmountDue = invoiceAmountNum - computedRetainageAmount;

  const selectedInvoice = useMemo(
    () => invoices.find((i) => i.id === paymentForm.invoice_id),
    [invoices, paymentForm.invoice_id]
  );

  const updateInvoiceField = <K extends keyof typeof EMPTY_INVOICE_FORM>(
    key: K,
    value: (typeof EMPTY_INVOICE_FORM)[K]
  ) => {
    setInvoiceForm((prev) => ({ ...prev, [key]: value }));
  };

  const updatePaymentField = <K extends keyof typeof EMPTY_PAYMENT_FORM>(
    key: K,
    value: (typeof EMPTY_PAYMENT_FORM)[K]
  ) => {
    setPaymentForm((prev) => ({ ...prev, [key]: value }));
  };

  const onContractChange = (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    setInvoiceForm((prev) => ({
      ...prev,
      contract_id: contractId,
      retainage_percent: contract?.retainage_percent != null ? String(contract.retainage_percent) : prev.retainage_percent,
    }));
  };

  const onSubmitInvoice = async (e: FormEvent) => {
    e.preventDefault();
    setInvoiceError(null);
    setInvoiceSuccess(null);

    if (!invoiceForm.contract_id || !invoiceForm.invoice_amount) {
      setInvoiceError("Contract and invoice amount are required.");
      return;
    }

    setSavingInvoice(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("invoices").insert({
        contract_id: invoiceForm.contract_id,
        invoice_number: invoiceForm.invoice_number.trim() || null,
        invoice_date: invoiceForm.invoice_date || null,
        due_date: invoiceForm.due_date || null,
        description: invoiceForm.description.trim() || null,
        invoice_amount: invoiceAmountNum,
        retainage_percent: retainagePercentNum,
        retainage_amount: computedRetainageAmount,
        net_amount_due: computedNetAmountDue,
        amount_paid: 0,
        status: "unpaid",
        notes: invoiceForm.notes.trim() || null,
      });
      if (insertError) throw insertError;

      setInvoiceSuccess("Invoice created successfully.");
      setInvoiceForm(EMPTY_INVOICE_FORM);
      await refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Failed to create invoice.");
    } finally {
      setSavingInvoice(false);
    }
  };

  const onSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    setPaymentSuccess(null);

    if (!paymentForm.invoice_id || !paymentForm.payment_amount) {
      setPaymentError("Invoice and payment amount are required.");
      return;
    }
    if (!selectedInvoice) {
      setPaymentError("Selected invoice could not be found.");
      return;
    }

    setSavingPayment(true);
    try {
      const supabase = createClient();
      const paymentAmount = Number(paymentForm.payment_amount);

      const { error: paymentInsertError } = await supabase.from("payments").insert({
        invoice_id: paymentForm.invoice_id,
        payment_amount: paymentAmount,
        payment_date: paymentForm.payment_date || null,
        payment_method: paymentForm.payment_method.trim() || null,
        reference_number: paymentForm.reference_number.trim() || null,
        notes: paymentForm.notes.trim() || null,
      });
      if (paymentInsertError) throw paymentInsertError;

      const newAmountPaid = Number(selectedInvoice.amount_paid ?? 0) + paymentAmount;
      const netAmountDue = Number(selectedInvoice.net_amount_due ?? selectedInvoice.invoice_amount ?? 0);
      const newStatus = nextInvoiceStatus(newAmountPaid, netAmountDue);

      const { error: updateError } = await supabase
        .from("invoices")
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq("id", paymentForm.invoice_id);
      if (updateError) throw updateError;

      setPaymentSuccess("Payment recorded successfully.");
      setPaymentForm(EMPTY_PAYMENT_FORM);
      await refresh();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setSavingPayment(false);
    }
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Billing and payment status across all projects."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowPaymentForm((v) => !v)}
              >
                <Receipt className="h-4 w-4" /> {showPaymentForm ? "Close" : "Record Payment"}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowInvoiceForm((v) => !v)}>
                <Plus className="h-4 w-4" /> {showInvoiceForm ? "Close" : "Create Invoice"}
              </button>
            </div>
          ) : undefined
        }
      />

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search invoice #, project, client…"
        sortOptions={[
          { value: "number", label: "Invoice #" },
          { value: "contract", label: "Project" },
          { value: "date", label: "Date" },
          { value: "due", label: "Due date" },
          { value: "amount", label: "Amount" },
          { value: "status", label: "Status" },
          { value: "balance", label: "Balance" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={filtered.length}
        filters={
          <label className="form-control w-full lg:w-44">
            <span className="label py-1">
              <span className="label-text text-xs opacity-70">Status</span>
            </span>
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
        }
      />

      {canManage && showInvoiceForm ? (
        <SectionCard title="New Invoice">
          {invoiceError ? <AlertBanner type="error">{invoiceError}</AlertBanner> : null}
          {invoiceSuccess ? <AlertBanner type="success">{invoiceSuccess}</AlertBanner> : null}
          <form onSubmit={onSubmitInvoice} className="space-y-4 mt-4">
            <FormField label="Contract">
              <select
                className="select select-bordered"
                value={invoiceForm.contract_id}
                onChange={(e) => onContractChange(e.target.value)}
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
            <FormField label="Invoice Number">
              <input
                className="input input-bordered"
                value={invoiceForm.invoice_number}
                onChange={(e) => updateInvoiceField("invoice_number", e.target.value)}
                placeholder="e.g. INV-1007"
              />
            </FormField>
            <FormField label="Invoice Date">
              <input
                type="date"
                className="input input-bordered"
                value={invoiceForm.invoice_date}
                onChange={(e) => updateInvoiceField("invoice_date", e.target.value)}
              />
            </FormField>
            <FormField label="Due Date">
              <input
                type="date"
                className="input input-bordered"
                value={invoiceForm.due_date}
                onChange={(e) => updateInvoiceField("due_date", e.target.value)}
              />
            </FormField>
            <FormField label="Description">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={invoiceForm.description}
                onChange={(e) => updateInvoiceField("description", e.target.value)}
              />
            </FormField>
            <FormField label="Invoice Amount">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  className="grow"
                  value={invoiceForm.invoice_amount}
                  onChange={(e) => updateInvoiceField("invoice_amount", e.target.value)}
                  required
                />
              </label>
            </FormField>
            <FormField label="Retainage %">
              <input
                type="number"
                step="0.1"
                className="input input-bordered"
                value={invoiceForm.retainage_percent}
                onChange={(e) => updateInvoiceField("retainage_percent", e.target.value)}
              />
            </FormField>
            <FormField label="Retainage Amount" hint="Calculated automatically from invoice amount × retainage %.">
              <input className="input input-bordered" value={money(computedRetainageAmount)} disabled readOnly />
            </FormField>
            <FormField label="Net Amount Due" hint="Invoice amount less retainage withheld.">
              <input className="input input-bordered font-medium" value={money(computedNetAmountDue)} disabled readOnly />
            </FormField>
            <FormField label="Notes">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={invoiceForm.notes}
                onChange={(e) => updateInvoiceField("notes", e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="submit" className="btn btn-primary" disabled={savingInvoice}>
                {savingInvoice ? <span className="loading loading-spinner loading-sm" /> : null}
                Save Invoice
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {canManage && showPaymentForm ? (
        <SectionCard title="Record Payment">
          {paymentError ? <AlertBanner type="error">{paymentError}</AlertBanner> : null}
          {paymentSuccess ? <AlertBanner type="success">{paymentSuccess}</AlertBanner> : null}
          <form onSubmit={onSubmitPayment} className="space-y-4 mt-4">
            <FormField label="Invoice">
              <select
                className="select select-bordered"
                value={paymentForm.invoice_id}
                onChange={(e) => updatePaymentField("invoice_id", e.target.value)}
                required
              >
                <option value="">Select an invoice…</option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number ?? "Invoice"} — {invoice.contracts?.contract_name ?? "—"} (
                    {money(invoice.net_amount_due)} due)
                  </option>
                ))}
              </select>
            </FormField>
            {selectedInvoice ? (
              <FormField label="Balance Remaining">
                <input
                  className="input input-bordered"
                  disabled
                  readOnly
                  value={money(
                    Number(selectedInvoice.net_amount_due ?? selectedInvoice.invoice_amount ?? 0) -
                      Number(selectedInvoice.amount_paid ?? 0)
                  )}
                />
              </FormField>
            ) : null}
            <FormField label="Payment Amount">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  className="grow"
                  value={paymentForm.payment_amount}
                  onChange={(e) => updatePaymentField("payment_amount", e.target.value)}
                  required
                />
              </label>
            </FormField>
            <FormField label="Payment Date">
              <input
                type="date"
                className="input input-bordered"
                value={paymentForm.payment_date}
                onChange={(e) => updatePaymentField("payment_date", e.target.value)}
              />
            </FormField>
            <FormField label="Payment Method">
              <input
                className="input input-bordered"
                value={paymentForm.payment_method}
                onChange={(e) => updatePaymentField("payment_method", e.target.value)}
                placeholder="e.g. ACH, Check, Wire"
              />
            </FormField>
            <FormField label="Reference #">
              <input
                className="input input-bordered"
                value={paymentForm.reference_number}
                onChange={(e) => updatePaymentField("reference_number", e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={paymentForm.notes}
                onChange={(e) => updatePaymentField("notes", e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="submit" className="btn btn-primary" disabled={savingPayment}>
                {savingPayment ? <span className="loading loading-spinner loading-sm" /> : null}
                Save Payment
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No invoices"
          message={
            invoices.length === 0
              ? "No invoices have been issued yet."
              : "Try adjusting your search or filters."
          }
        />
      ) : (
        <SectionCard title={`All Invoices (${filtered.length})`}>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Project</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Retainage</th>
                  <th className="text-right">Net Due</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => {
                  const overdue = isOverdue(invoice);
                  return (
                    <tr
                      key={invoice.id}
                      className="hover cursor-pointer"
                      onClick={() => router.push(`/invoices/${invoice.id}`)}
                    >
                      <td>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="link link-primary font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {invoice.invoice_number ?? "View invoice"}
                        </Link>
                      </td>
                      <td>{invoice.contracts?.contract_name ?? "—"}</td>
                      <td className="whitespace-nowrap">{invoice.invoice_date ?? "—"}</td>
                      <td className="whitespace-nowrap">{invoice.due_date ?? "—"}</td>
                      <td className="text-right">{money(invoice.invoice_amount)}</td>
                      <td className="text-right">{money(invoice.retainage_amount)}</td>
                      <td className="text-right">{money(invoice.net_amount_due)}</td>
                      <td className="text-right">{money(invoice.amount_paid)}</td>
                      <td>
                        <span className={`badge badge-sm ${statusBadgeClass(overdue ? "overdue" : invoice.status)}`}>
                          {overdue ? "Overdue" : labelize(invoice.status)}
                        </span>
                      </td>
                      <td className="text-right">
                        <ChevronRight className="h-4 w-4 opacity-40 inline-block" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
