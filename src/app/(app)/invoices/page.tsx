"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Building2, ChevronDown, FileText, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useOpenCreateFromQuery } from "@/hooks/useOpenCreateFromQuery";
import { compareValues } from "@/components/FilterSortBar";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StatusFilterChips } from "@/components/StatusFilterChips";
import { BulkActionBar, StickyToolbar } from "@/components/StickyToolbar";
import { useToast } from "@/components/ToastProvider";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard, TableShell } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import {
  remainingBillableCapacity,
  validateInvoiceBillingAmount,
  validateInvoiceStatusChange,
  validatePaymentAmount,
  validateAmountPaid,
} from "@/lib/invoiceValidation";
import { daysPastDue, labelize, money, moneyExact } from "@/lib/metrics";
import { invoiceAfterApplyingPayment, paymentNeedsOwnerApproval } from "@/lib/payments";
import { canApprovePayments, canCreateInvoices, canRecordPayments, canSelfApprovePayment, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const STATUS_OPTIONS: InvoiceStatus[] = ["unpaid", "partially_paid", "paid", "overdue"];

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
  return (
    (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
    daysPastDue(invoice.due_date) > 0
  );
}

function displayStatus(invoice: Invoice): InvoiceStatus | "overdue" {
  return isOverdue(invoice) ? "overdue" : invoice.status;
}

function invoiceBalance(invoice: Invoice): number {
  const net = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
  return Math.max(net - Number(invoice.amount_paid ?? 0), 0);
}

type SortKey = "number" | "contract" | "date" | "due" | "amount" | "status" | "balance";

export default function InvoicesPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, changeOrders, invoices, payments, loading, error, refresh } =
    useContractData();
  const canManage = canCreateInvoices(effectiveRole);
  const canPay = canRecordPayments(effectiveRole);
  const canApprove = canApprovePayments(effectiveRole);
  const canSelfApprove = canSelfApprovePayment(effectiveRole);
  const canMutate = canManage;

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
  const [numberFilter, setNumberFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [statusChip, setStatusChip] = useState("all");
  const { toast } = useToast();

  const openInvoiceForm = useCallback(() => {
    setShowInvoiceForm(true);
    window.setTimeout(() => {
      document.getElementById("invoice-create-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, []);
  useOpenCreateFromQuery(canManage && !loading, openInvoiceForm);

  const filtered = useMemo(() => {
    const next = invoices.filter((invoice) => {
      if (!matchesColumnFilter(invoice.invoice_number, numberFilter)) return false;
      if (!matchesColumnFilter(invoice.contracts?.contract_name, projectFilter)) return false;
      if (statusChip !== "all" && displayStatus(invoice) !== statusChip) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortKey === "number") return compareValues(a.invoice_number, b.invoice_number, sortDir);
      if (sortKey === "contract") {
        return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      }
      if (sortKey === "date") return compareValues(a.invoice_date, b.invoice_date, sortDir);
      if (sortKey === "due") return compareValues(a.due_date, b.due_date, sortDir);
      if (sortKey === "amount") {
        return compareValues(Number(a.invoice_amount ?? 0), Number(b.invoice_amount ?? 0), sortDir);
      }
      if (sortKey === "status") {
        return compareValues(displayStatus(a), displayStatus(b), sortDir);
      }
      return compareValues(invoiceBalance(a), invoiceBalance(b), sortDir);
    });
  }, [invoices, numberFilter, projectFilter, statusChip, sortKey, sortDir]);

  const numberOptions = useMemo(
    () => uniqueSorted(invoices.map((invoice) => invoice.invoice_number)),
    [invoices]
  );

  const projectOptions = useMemo(
    () => uniqueSorted(invoices.map((invoice) => invoice.contracts?.contract_name)),
    [invoices]
  );

  const selectedRows = useMemo(
    () => filtered.filter((invoice) => selectedIds.has(invoice.id)),
    [filtered, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((invoice) => selectedIds.has(invoice.id));

  const invoiceAmountNum = Number(invoiceForm.invoice_amount || 0);
  const retainagePercentNum = Number(invoiceForm.retainage_percent || 0);
  const computedRetainageAmount = invoiceAmountNum * (retainagePercentNum / 100);
  const computedNetAmountDue = invoiceAmountNum - computedRetainageAmount;

  const selectedInvoice = useMemo(
    () => invoices.find((i) => i.id === paymentForm.invoice_id),
    [invoices, paymentForm.invoice_id]
  );

  const remainingOnSelectedContract = useMemo(() => {
    const contract = contracts.find((c) => c.id === invoiceForm.contract_id);
    if (!contract) return null;
    return remainingBillableCapacity(contract, changeOrders, invoices);
  }, [contracts, changeOrders, invoices, invoiceForm.contract_id]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const invoice of filtered) next.delete(invoice.id);
        return next;
      }
      const next = new Set(prev);
      for (const invoice of filtered) next.add(invoice.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

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
      retainage_percent:
        contract?.retainage_percent != null ? String(contract.retainage_percent) : prev.retainage_percent,
    }));
  };

  const setInvoiceStatus = async (
    invoice: Invoice,
    status: InvoiceStatus,
    { silent = false } = {}
  ) => {
    if (invoice.status === status) return;
    const statusError = validateInvoiceStatusChange(invoice, status);
    if (statusError) {
      if (silent) throw new Error(statusError);
      setActionError(statusError);
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(invoice.id);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", invoice.id);
      if (updateError) throw updateError;
      await writeAuditLog("invoice_status_changed", "invoice", invoice.id, {
        invoice_number: invoice.invoice_number,
        contract_name: invoice.contracts?.contract_name,
        from_status: invoice.status,
        to_status: status,
      });
      if (!silent) {
        setActionSuccess(
          `Updated ${invoice.invoice_number || "invoice"} to ${labelize(status)}.`
        );
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update status.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteInvoice = async (invoice: Invoice, { silent = false } = {}) => {
    if (
      !silent &&
      !window.confirm(
        `Permanently delete invoice "${invoice.invoice_number || invoice.id}"? Related payments may also be affected. This cannot be undone.`
      )
    ) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(invoice.id);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("invoices").delete().eq("id", invoice.id);
      if (deleteError) throw deleteError;
      await writeAuditLog("invoice_deleted", "invoice", invoice.id, {
        invoice_number: invoice.invoice_number,
        contract_name: invoice.contracts?.contract_name,
        from_status: invoice.status,
      });
      if (!silent) {
        setActionSuccess(`Deleted ${invoice.invoice_number || "invoice"}.`);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete invoice.");
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async (action: "delete" | InvoiceStatus) => {
    if (selectedRows.length === 0 || !canMutate) return;

    if (action === "delete") {
      if (
        !window.confirm(
          `Permanently delete ${selectedRows.length} invoice${selectedRows.length === 1 ? "" : "s"}? This cannot be undone.`
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Set status to "${labelize(action)}" for ${selectedRows.length} invoice${selectedRows.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      for (const invoice of selectedRows) {
        if (action === "delete") {
          await deleteInvoice(invoice, { silent: true });
        } else {
          await setInvoiceStatus(invoice, action, { silent: true });
        }
      }
      const label =
        action === "delete" ? "Deleted" : `Updated status to ${labelize(action)} for`;
      setActionSuccess(
        `${label} ${selectedRows.length} invoice${selectedRows.length === 1 ? "" : "s"}.`
      );
      clearSelection();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitInvoice = async (e: FormEvent) => {
    e.preventDefault();
    setInvoiceError(null);
    setInvoiceSuccess(null);

    if (!invoiceForm.contract_id || !invoiceForm.invoice_amount) {
      setInvoiceError("Contract and invoice amount are required.");
      return;
    }

    const contract = contracts.find((c) => c.id === invoiceForm.contract_id);
    const amountError = validateInvoiceBillingAmount({
      amount: invoiceAmountNum,
      contract,
      changeOrders,
      invoices,
    });
    if (amountError) {
      setInvoiceError(amountError);
      return;
    }

    setSavingInvoice(true);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("invoices")
        .insert({
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
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await writeAuditLog("invoice_created", "invoice", data?.id, {
        invoice_number: invoiceForm.invoice_number.trim() || null,
        contract_id: invoiceForm.contract_id,
        status: "unpaid",
      });

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

    if (!paymentForm.invoice_id || paymentForm.payment_amount.trim() === "") {
      setPaymentError("Invoice and payment amount are required.");
      return;
    }
    if (!selectedInvoice) {
      setPaymentError("Selected invoice could not be found.");
      return;
    }

    const paymentAmount = Number(paymentForm.payment_amount);
    const reservedPending = payments
      .filter(
        (p) =>
          p.invoice_id === selectedInvoice.id &&
          (p.approval_status ?? "posted") === "pending_approval"
      )
      .reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);
    const paymentAmountError = validatePaymentAmount(paymentAmount, selectedInvoice, {
      reservedPending,
    });
    if (paymentAmountError) {
      setPaymentError(paymentAmountError);
      return;
    }

    setSavingPayment(true);
    try {
      const supabase = createClient();
      const needsApproval = paymentNeedsOwnerApproval(effectiveRole);
      const nowIso = new Date().toISOString();

      const { data: inserted, error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          invoice_id: paymentForm.invoice_id,
          payment_amount: paymentAmount,
          payment_date: paymentForm.payment_date || null,
          payment_method: paymentForm.payment_method.trim() || null,
          reference_number: paymentForm.reference_number.trim() || null,
          notes: paymentForm.notes.trim() || null,
          approval_status: needsApproval ? "pending_approval" : "posted",
          submitted_by: user?.id ?? null,
          submitted_at: nowIso,
          approved_by: needsApproval ? null : user?.id ?? null,
          approved_at: needsApproval ? null : nowIso,
        })
        .select("id")
        .single();
      if (paymentInsertError) throw paymentInsertError;

      if (needsApproval) {
        await writeAuditLog("payment_submitted_for_approval", "payment", inserted?.id, {
          invoice_id: paymentForm.invoice_id,
          payment_amount: paymentAmount,
        });
        setPaymentSuccess(
          "Payment submitted for approval. AR will update after an owner or admin posts it."
        );
      } else {
        const update = invoiceAfterApplyingPayment(selectedInvoice, paymentAmount);
        const { error: updateError } = await supabase
          .from("invoices")
          .update(update)
          .eq("id", paymentForm.invoice_id);
        if (updateError) throw updateError;
        await writeAuditLog("payment_posted", "payment", inserted?.id, {
          invoice_id: paymentForm.invoice_id,
          payment_amount: paymentAmount,
          dual_approval: "owner_direct",
        });
        setPaymentSuccess("Payment posted to AR.");
      }

      setPaymentForm(EMPTY_PAYMENT_FORM);
      await refresh();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setSavingPayment(false);
    }
  };

  const pendingPayments = useMemo(
    () => payments.filter((p) => (p.approval_status ?? "posted") === "pending_approval"),
    [payments]
  );

  const onApprovePayment = async (paymentId: string, invoiceId: string) => {
    const payment = payments.find((p) => p.id === paymentId);
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!payment || !invoice) return;
    if (
      payment.submitted_by &&
      user?.id &&
      payment.submitted_by === user.id &&
      !canSelfApprove
    ) {
      setPaymentError("You cannot approve a payment you submitted (dual-approval control).");
      return;
    }

    const amount = Number(payment.payment_amount ?? 0);
    const paymentAmountError = validatePaymentAmount(amount, invoice);
    if (paymentAmountError) {
      setPaymentError(paymentAmountError);
      return;
    }

    setSavingPayment(true);
    setPaymentError(null);
    try {
      const supabase = createClient();
      const update = invoiceAfterApplyingPayment(invoice, amount);
      const nowIso = new Date().toISOString();

      const { error: payErr } = await supabase
        .from("payments")
        .update({
          approval_status: "posted",
          approved_by: user?.id ?? null,
          approved_at: nowIso,
          rejection_reason: null,
        })
        .eq("id", paymentId)
        .eq("approval_status", "pending_approval");
      if (payErr) throw payErr;

      const { error: invErr } = await supabase.from("invoices").update(update).eq("id", invoiceId);
      if (invErr) throw invErr;

      await writeAuditLog("payment_approved", "payment", paymentId, {
        invoice_id: invoiceId,
        payment_amount: amount,
      });
      setPaymentSuccess("Payment approved and posted to AR.");
      await refresh();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to approve payment.");
    } finally {
      setSavingPayment(false);
    }
  };

  const onRejectPayment = async (paymentId: string) => {
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    setSavingPayment(true);
    setPaymentError(null);
    try {
      const supabase = createClient();
      const { error: payErr } = await supabase
        .from("payments")
        .update({
          approval_status: "rejected",
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
          rejection_reason: reason.trim() || null,
        })
        .eq("id", paymentId)
        .eq("approval_status", "pending_approval");
      if (payErr) throw payErr;
      await writeAuditLog("payment_rejected", "payment", paymentId, {
        reason: reason.trim() || null,
      });
      setPaymentSuccess("Payment rejected — not applied to AR.");
      await refresh();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to reject payment.");
    } finally {
      setSavingPayment(false);
    }
  };

  if (loading) {
    return <PageSkeleton rows={8} />;
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  const colCount = 9 + (canMutate ? 2 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Billing and payment status across all projects."
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            {canPay || canApprove ? (
              <>
                {canPay ? (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowPaymentForm((v) => !v)}
                  >
                    <Receipt className="h-4 w-4" /> {showPaymentForm ? "Close" : "Record Payment"}
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowInvoiceForm((v) => !v)}
                  >
                    <Plus className="h-4 w-4" /> {showInvoiceForm ? "Close" : "Create Invoice"}
                  </button>
                ) : null}
              </>
            ) : canManage ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowInvoiceForm((v) => !v)}
              >
                <Plus className="h-4 w-4" /> {showInvoiceForm ? "Close" : "Create Invoice"}
              </button>
            ) : null}
          </div>
        }
      />

      {canManage && showInvoiceForm ? (
        <SectionCard title="New Invoice">
          <div id="invoice-create-form">
            {invoiceError ? <AlertBanner type="error">{invoiceError}</AlertBanner> : null}
            {invoiceSuccess ? <AlertBanner type="success">{invoiceSuccess}</AlertBanner> : null}
            <form onSubmit={onSubmitInvoice} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField stacked label="Contract">
                  <select
                    className="select select-bordered w-full"
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
                <FormField stacked label="Invoice Number">
                  <input
                    className="input input-bordered w-full"
                    value={invoiceForm.invoice_number}
                    onChange={(e) => updateInvoiceField("invoice_number", e.target.value)}
                    required
                  />
                </FormField>
                <FormField stacked label="Invoice Date">
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={invoiceForm.invoice_date}
                    onChange={(e) => updateInvoiceField("invoice_date", e.target.value)}
                  />
                </FormField>
                <FormField stacked label="Due Date">
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={invoiceForm.due_date}
                    onChange={(e) => updateInvoiceField("due_date", e.target.value)}
                  />
                </FormField>
                <FormField
                  stacked
                  label="Invoice Amount"
                  hint={
                    remainingOnSelectedContract != null
                      ? `Max remaining on contract: ${moneyExact(remainingOnSelectedContract)}`
                      : undefined
                  }
                >
                  <label className="input input-bordered flex items-center gap-2 w-full">
                    $
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="grow"
                      value={invoiceForm.invoice_amount}
                      onChange={(e) => updateInvoiceField("invoice_amount", e.target.value)}
                      required
                    />
                  </label>
                </FormField>
                <FormField stacked label="Retainage %">
                  <input
                    type="number"
                    step="0.01"
                    className="input input-bordered w-full"
                    value={invoiceForm.retainage_percent}
                    onChange={(e) => updateInvoiceField("retainage_percent", e.target.value)}
                  />
                </FormField>
                <FormField
                  stacked
                  label="Retainage Amount"
                  hint="ASC 606 retainage receivable (contract asset), not current AR."
                >
                  <input
                    className="input input-bordered w-full"
                    value={money(computedRetainageAmount)}
                    disabled
                    readOnly
                  />
                </FormField>
                <FormField
                  stacked
                  label="Net Amount Due"
                  hint="Current AR — invoice amount less retainage receivable."
                >
                  <input
                    className="input input-bordered font-medium w-full"
                    value={money(computedNetAmountDue)}
                    disabled
                    readOnly
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField stacked label="Description">
                    <textarea
                      className="textarea textarea-bordered w-full"
                      rows={2}
                      value={invoiceForm.description}
                      onChange={(e) => updateInvoiceField("description", e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="sm:col-span-2">
                  <FormField stacked label="Notes">
                    <textarea
                      className="textarea textarea-bordered w-full"
                      rows={2}
                      value={invoiceForm.notes}
                      onChange={(e) => updateInvoiceField("notes", e.target.value)}
                    />
                  </FormField>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="submit" className="btn btn-primary" disabled={savingInvoice}>
                  {savingInvoice ? <span className="loading loading-spinner loading-sm" /> : null}
                  Save Invoice
                </button>
              </div>
            </form>
          </div>
        </SectionCard>
      ) : null}

      <StickyToolbar>
        <StatusFilterChips
          options={STATUS_OPTIONS}
          value={statusChip}
          onChange={setStatusChip}
          allLabel="All statuses"
        />
        <p className="text-xs opacity-55 tabular-nums">
          {filtered.length} shown
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </p>
      </StickyToolbar>

      <BulkActionBar count={canMutate ? selectedIds.size : 0} onClear={clearSelection}>
        <div className="dropdown dropdown-top dropdown-end">
          <div tabIndex={0} role="button" className={`btn btn-sm ${busy ? "btn-disabled" : "btn-secondary"}`}>
            Bulk actions
            <ChevronDown className="h-4 w-4" />
          </div>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 rounded-box z-40 w-56 p-2 shadow border border-base-300 mb-2"
          >
            <li className="menu-title px-3 pt-1">
              <span>Change status</span>
            </li>
            {STATUS_OPTIONS.map((status) => (
              <li key={status}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runBulk(status).then(() => toast(`Updated ${selectedIds.size} invoice(s)`, "success"))
                  }
                >
                  Set {labelize(status)}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="text-error"
                disabled={busy}
                onClick={() =>
                  void runBulk("delete").then(() => toast("Deleted selected invoices", "success"))
                }
              >
                <Trash2 className="h-4 w-4" /> Delete selected
              </button>
            </li>
          </ul>
        </div>
      </BulkActionBar>

      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

      {canPay && showPaymentForm ? (
        <SectionCard title="Record Payment">
          <p className="text-sm opacity-70 mb-3">
            {paymentNeedsOwnerApproval(effectiveRole)
              ? "This payment will be submitted for dual-approval before it updates AR."
              : "As an admin or owner/executive, this payment posts to AR immediately."}
          </p>
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
            <FormField
              label="Payment Amount"
              hint={
                selectedInvoice
                  ? `Max open balance: ${moneyExact(
                      Math.max(
                        0,
                        Number(selectedInvoice.net_amount_due ?? selectedInvoice.invoice_amount ?? 0) -
                          Number(selectedInvoice.amount_paid ?? 0) -
                          payments
                            .filter(
                              (p) =>
                                p.invoice_id === selectedInvoice.id &&
                                (p.approval_status ?? "posted") === "pending_approval"
                            )
                            .reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0)
                      )
                    )}`
                  : undefined
              }
            >
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
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
                {paymentNeedsOwnerApproval(effectiveRole) ? "Submit for Approval" : "Post Payment"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {canApprove && pendingPayments.length > 0 ? (
        <SectionCard title={`Payments awaiting your approval (${pendingPayments.length})`}>
          {paymentError ? <AlertBanner type="error">{paymentError}</AlertBanner> : null}
          {paymentSuccess ? <AlertBanner type="success">{paymentSuccess}</AlertBanner> : null}
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th>Reference</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((payment) => {
                  const invoice = invoices.find((i) => i.id === payment.invoice_id);
                  const selfSubmitted =
                    !!payment.submitted_by &&
                    !!user?.id &&
                    payment.submitted_by === user.id &&
                    !canSelfApprove;
                  return (
                    <tr key={payment.id}>
                      <td>
                        <Link
                          href={`/invoices/${payment.invoice_id}`}
                          className="link link-primary font-medium"
                        >
                          {invoice?.invoice_number ?? "Invoice"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{payment.payment_date ?? "—"}</td>
                      <td className="text-right font-medium">{money(payment.payment_amount)}</td>
                      <td>{payment.reference_number ?? "—"}</td>
                      <td className="text-right whitespace-nowrap">
                        {selfSubmitted ? (
                          <span className="text-xs opacity-60">Submitted by you</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn btn-success btn-xs"
                              disabled={savingPayment}
                              onClick={() =>
                                void onApprovePayment(payment.id, payment.invoice_id)
                              }
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-error"
                              disabled={savingPayment}
                              onClick={() => void onRejectPayment(payment.id)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices"
          message="No invoices have been issued yet."
          icon={FileText}
          action={
            canManage ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowInvoiceForm(true)}>
                <Plus className="h-4 w-4" /> Create Invoice
              </button>
            ) : undefined
          }
        />
      ) : (
        <TableShell freezeFirst>
            <table className="table table-xs table-fixed w-full text-[11px]">
              <colgroup>
                {canMutate ? <col className="w-[3%]" /> : null}
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[9%] hidden xl:table-column" />
                <col className="w-[9%]" />
                <col className="w-[8%] hidden xl:table-column" />
                <col className="w-[12%]" />
                {canMutate ? <col className="w-[11%]" /> : null}
              </colgroup>
              <thead>
                <tr className="bg-base-200/80">
                  {canMutate ? (
                    <th className="w-10 align-middle text-center">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all filtered invoices"
                      />
                    </th>
                  ) : null}
                  <ColumnAutocompleteHeader
                    label="Invoice #"
                    listId="invoices-filter-number"
                    value={numberFilter}
                    onChange={setNumberFilter}
                    options={numberOptions}
                    sortActive={sortKey === "number"}
                    sortDir={sortDir}
                    onSort={() => onSort("number")}
                  />
                  <ColumnAutocompleteHeader
                    label="Project"
                    listId="invoices-filter-project"
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={projectOptions}
                    sortActive={sortKey === "contract"}
                    sortDir={sortDir}
                    onSort={() => onSort("contract")}
                  />
                  <ColumnSortHeader
                    label="Date"
                    sortActive={sortKey === "date"}
                    sortDir={sortDir}
                    onSort={() => onSort("date")}
                  />
                  <ColumnSortHeader
                    label="Due"
                    sortActive={sortKey === "due"}
                    sortDir={sortDir}
                    onSort={() => onSort("due")}
                  />
                  <ColumnSortHeader
                    label="Amount"
                    sortActive={sortKey === "amount"}
                    sortDir={sortDir}
                    onSort={() => onSort("amount")}
                  />
                  <ColumnSortHeader label="Retainage" className="hidden xl:table-cell" />
                  <ColumnSortHeader label="Net Due" />
                  <ColumnSortHeader label="Paid" className="hidden xl:table-cell" />
                  <ColumnSortHeader
                    label="Status"
                    sortActive={sortKey === "status"}
                    sortDir={sortDir}
                    onSort={() => onSort("status")}
                  />
                  {canMutate ? <th className="text-center align-middle">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center opacity-60">
                      No invoices match the column filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((invoice) => {
                    const overdue = isOverdue(invoice);
                    const shownStatus = overdue ? "overdue" : invoice.status;
                    return (
                      <tr key={invoice.id} className="hover:bg-base-200/60">
                        {canMutate ? (
                          <td className="px-1 text-center">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={selectedIds.has(invoice.id)}
                              onChange={() => toggleSelect(invoice.id)}
                              aria-label={`Select ${invoice.invoice_number || "invoice"}`}
                            />
                          </td>
                        ) : null}
                        <td className="min-w-0 px-1 text-left">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="link link-primary block truncate font-medium"
                            title={invoice.invoice_number ?? "View invoice"}
                          >
                            {invoice.invoice_number ?? "View invoice"}
                          </Link>
                        </td>
                        <td className="min-w-0 px-1 text-left">
                          <Link
                            href={`/contracts/${invoice.contract_id}`}
                            className="link link-primary block truncate font-medium"
                            title={invoice.contracts?.contract_name ?? "Project details"}
                          >
                            <span className="inline-flex max-w-full items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="truncate">
                                {invoice.contracts?.contract_name ?? "—"}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-1 text-center">
                          {invoice.invoice_date ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-1 text-center">{invoice.due_date ?? "—"}</td>
                        <td
                          className="truncate px-1 text-center"
                          title={`Retainage: ${money(invoice.retainage_amount)} · Paid: ${money(invoice.amount_paid)} · Net: ${money(invoice.net_amount_due)}`}
                        >
                          {money(invoice.invoice_amount)}
                        </td>
                        <td className="truncate px-1 text-center hidden xl:table-cell">
                          {money(invoice.retainage_amount)}
                        </td>
                        <td className="truncate px-1 text-center">{money(invoice.net_amount_due)}</td>
                        <td className="truncate px-1 text-center hidden xl:table-cell">
                          {money(invoice.amount_paid)}
                        </td>
                        <td className="px-1 text-center overflow-visible">
                          <span className={`badge badge-sm ${statusBadgeClass(shownStatus)}`}>
                            {overdue ? "Overdue" : labelize(invoice.status)}
                          </span>
                        </td>
                        {canMutate ? (
                          <td className="px-1 text-center">
                            <div className="inline-flex justify-center gap-0.5">
                              <div className="dropdown dropdown-end">
                                <div
                                  tabIndex={0}
                                  role="button"
                                  className="btn btn-ghost h-6 min-h-6 gap-0 px-1 text-[10px]"
                                  title="Change status"
                                >
                                  Status
                                  <ChevronDown className="h-3 w-3" />
                                </div>
                                <ul
                                  tabIndex={0}
                                  className="dropdown-content menu bg-base-100 rounded-box z-40 w-48 p-2 shadow border border-base-300"
                                >
                                  {STATUS_OPTIONS.map((status) => (
                                    <li key={status}>
                                      <button
                                        type="button"
                                        disabled={
                                          busyId === invoice.id ||
                                          busy ||
                                          invoice.status === status
                                        }
                                        onClick={() =>
                                          void setInvoiceStatus(invoice, status).catch((err) => {
                                            setActionError(
                                              err instanceof Error
                                                ? err.message
                                                : "Failed to update status."
                                            );
                                          })
                                        }
                                      >
                                        {labelize(status)}
                                        {invoice.status === status ? " ✓" : ""}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="dropdown dropdown-end">
                                <div
                                  tabIndex={0}
                                  role="button"
                                  className="btn btn-ghost h-6 min-h-6 gap-0 px-1 text-[10px]"
                                  title="Edit"
                                >
                                  Edit
                                  <ChevronDown className="h-3 w-3" />
                                </div>
                                <ul
                                  tabIndex={0}
                                  className="dropdown-content menu bg-base-100 rounded-box z-40 w-48 p-2 shadow border border-base-300"
                                >
                                  <li>
                                    <Link href={`/invoices/${invoice.id}?edit=1`}>
                                      <Pencil className="h-4 w-4" /> Edit Invoice
                                    </Link>
                                  </li>
                                  <li>
                                    <button
                                      type="button"
                                      className="text-error"
                                      disabled={busyId === invoice.id || busy}
                                      onClick={() =>
                                        void deleteInvoice(invoice).catch((err) => {
                                          setActionError(
                                            err instanceof Error
                                              ? err.message
                                              : "Failed to delete."
                                          );
                                        })
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" /> Delete Invoice
                                    </button>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
        </TableShell>
      )}
    </div>
  );
}
