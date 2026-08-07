"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { PageSkeleton } from "@/components/PageSkeleton";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import { notifyPmInvoiceDecision } from "@/lib/invoiceNotifications";
import { money } from "@/lib/metrics";
import {
  HIGH_VALUE_APPROVAL_THRESHOLD,
  invoiceAfterApplyingPayment,
  invoiceApprovalBadge,
  invoiceApprovalLabel,
  invoiceStatusAfterAccounting,
  isApprovedInvoice,
  isInvoiceAwaitingAccounting,
  isInvoiceAwaitingAdmin,
  isPaymentAwaitingAccounting,
  isPaymentAwaitingAdmin,
  paymentApprovalBadge,
  paymentApprovalLabel,
  paymentStatusAfterAccounting,
  requiresAdminHighValueApproval,
} from "@/lib/payments";
import {
  canApproveHighValue,
  canApprovePayments,
  canViewApprovals,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, Payment, UserRole } from "@/lib/types";

type QueueTab = "accounting" | "admin";

export default function ApprovalsPage() {
  const { effectiveRole, user } = useAuth();
  const { invoices, payments, loading, error, refresh } = useContractData();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const canAccounting = canApprovePayments(effectiveRole);
  const canAdmin = canApproveHighValue(effectiveRole);
  const [tab, setTab] = useState<QueueTab>(canAccounting ? "accounting" : "admin");

  const invoiceById = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const invoice of invoices) map.set(invoice.id, invoice);
    return map;
  }, [invoices]);

  const accountingInvoices = useMemo(
    () => invoices.filter(isInvoiceAwaitingAccounting),
    [invoices]
  );
  const adminInvoices = useMemo(() => invoices.filter(isInvoiceAwaitingAdmin), [invoices]);
  const accountingPayments = useMemo(
    () => payments.filter(isPaymentAwaitingAccounting),
    [payments]
  );
  const adminPayments = useMemo(() => payments.filter(isPaymentAwaitingAdmin), [payments]);

  if (!canViewApprovals(effectiveRole)) {
    return (
      <EmptyState
        title="Approvals not available"
        message="Only Accounting and Admin / Owner can open the approvals queue."
      />
    );
  }

  if (loading) return <PageSkeleton rows={8} />;
  if (error) return <AlertBanner type="error">{error}</AlertBanner>;

  const denySelf = (submittedBy: string | null | undefined) => {
    if (submittedBy && user?.id && submittedBy === user.id) {
      setActionError("You cannot approve an item you submitted (segregation of duties).");
      return true;
    }
    return false;
  };

  const onApproveInvoice = async (invoice: Invoice, step: QueueTab) => {
    if (step === "accounting" && !canAccounting) return;
    if (step === "admin" && !canAdmin) return;
    if (denySelf(invoice.submitted_by)) return;

    setBusyId(invoice.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      const amount = Number(invoice.invoice_amount ?? invoice.net_amount_due ?? 0);

      if (step === "accounting") {
        const next = invoiceStatusAfterAccounting(amount);
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            approval_status: next,
            accounting_approved_by: user?.id ?? null,
            accounting_approved_at: nowIso,
            rejection_reason: null,
          })
          .eq("id", invoice.id)
          .eq("approval_status", "pending_accounting");
        if (updateError) throw updateError;
        await writeAuditLog("invoice_accounting_approved", "invoice", invoice.id, {
          next_status: next,
          invoice_amount: amount,
        });
        if (next === "approved" && user?.id) {
          await notifyPmInvoiceDecision({
            invoice,
            decision: "approved",
            actorId: user.id,
            actorRole: effectiveRole as UserRole,
          });
        }
        setActionSuccess(
          next === "pending_admin"
            ? "Invoice cleared by Accounting — awaiting Admin / Owner (≥ $250k)."
            : "Invoice approved and now billable. Project manager notified."
        );
      } else {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            approval_status: "approved",
            admin_approved_by: user?.id ?? null,
            admin_approved_at: nowIso,
            rejection_reason: null,
          })
          .eq("id", invoice.id)
          .eq("approval_status", "pending_admin");
        if (updateError) throw updateError;
        await writeAuditLog("invoice_admin_approved", "invoice", invoice.id, {
          invoice_amount: amount,
        });
        if (user?.id) {
          await notifyPmInvoiceDecision({
            invoice,
            decision: "approved",
            actorId: user.id,
            actorRole: effectiveRole as UserRole,
          });
        }
        setActionSuccess("High-value invoice approved by Admin / Owner. Project manager notified.");
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve invoice.");
    } finally {
      setBusyId(null);
    }
  };

  const onRejectInvoice = async (invoice: Invoice, step: QueueTab) => {
    if (step === "accounting" && !canAccounting) return;
    if (step === "admin" && !canAdmin) return;
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    setBusyId(invoice.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const supabase = createClient();
      const expected = step === "accounting" ? "pending_accounting" : "pending_admin";
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          approval_status: "rejected",
          rejection_reason: reason.trim() || null,
          accounting_approved_by:
            step === "accounting" ? user?.id ?? null : invoice.accounting_approved_by ?? null,
          accounting_approved_at:
            step === "accounting"
              ? new Date().toISOString()
              : invoice.accounting_approved_at ?? null,
          admin_approved_by: step === "admin" ? user?.id ?? null : null,
          admin_approved_at: step === "admin" ? new Date().toISOString() : null,
        })
        .eq("id", invoice.id)
        .eq("approval_status", expected);
      if (updateError) throw updateError;
      await writeAuditLog("invoice_rejected", "invoice", invoice.id, {
        step,
        reason: reason.trim() || null,
      });
      if (user?.id) {
        await notifyPmInvoiceDecision({
          invoice,
          decision: "rejected",
          actorId: user.id,
          actorRole: effectiveRole as UserRole,
          reason: reason.trim() || null,
        });
      }
      setActionSuccess("Invoice rejected — not billable. Project manager notified.");
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject invoice.");
    } finally {
      setBusyId(null);
    }
  };

  const onApprovePayment = async (payment: Payment, step: QueueTab) => {
    if (step === "accounting" && !canAccounting) return;
    if (step === "admin" && !canAdmin) return;
    if (denySelf(payment.submitted_by)) return;

    const invoice = invoiceById.get(payment.invoice_id);
    if (!invoice) {
      setActionError("Invoice for this payment could not be found.");
      return;
    }
    if (!isApprovedInvoice(invoice) && step === "admin") {
      // Prefer approving payments only after the invoice is approved.
    }

    setBusyId(payment.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      const amount = Number(payment.payment_amount ?? 0);

      if (step === "accounting") {
        const next = paymentStatusAfterAccounting(amount);
        const { error: payErr } = await supabase
          .from("payments")
          .update({
            approval_status: next,
            accounting_approved_by: user?.id ?? null,
            accounting_approved_at: nowIso,
            approved_by: next === "posted" ? user?.id ?? null : null,
            approved_at: next === "posted" ? nowIso : null,
            rejection_reason: null,
          })
          .eq("id", payment.id)
          .in("approval_status", ["pending_accounting", "pending_approval"]);
        if (payErr) throw payErr;

        if (next === "posted") {
          const update = invoiceAfterApplyingPayment(invoice, amount);
          const { error: invErr } = await supabase
            .from("invoices")
            .update(update)
            .eq("id", payment.invoice_id);
          if (invErr) throw invErr;
        }

        await writeAuditLog("payment_accounting_approved", "payment", payment.id, {
          next_status: next,
          payment_amount: amount,
        });
        setActionSuccess(
          next === "pending_admin"
            ? "Payment cleared by Accounting — awaiting Admin / Owner (≥ $250k)."
            : "Payment approved and posted to AR."
        );
      } else {
        const { error: payErr } = await supabase
          .from("payments")
          .update({
            approval_status: "posted",
            admin_approved_by: user?.id ?? null,
            admin_approved_at: nowIso,
            approved_by: user?.id ?? null,
            approved_at: nowIso,
            rejection_reason: null,
          })
          .eq("id", payment.id)
          .eq("approval_status", "pending_admin");
        if (payErr) throw payErr;

        const update = invoiceAfterApplyingPayment(invoice, amount);
        const { error: invErr } = await supabase
          .from("invoices")
          .update(update)
          .eq("id", payment.invoice_id);
        if (invErr) throw invErr;

        await writeAuditLog("payment_admin_approved", "payment", payment.id, {
          payment_amount: amount,
        });
        setActionSuccess("High-value payment approved by Admin / Owner and posted to AR.");
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve payment.");
    } finally {
      setBusyId(null);
    }
  };

  const onRejectPayment = async (payment: Payment, step: QueueTab) => {
    if (step === "accounting" && !canAccounting) return;
    if (step === "admin" && !canAdmin) return;
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    setBusyId(payment.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const supabase = createClient();
      const expected =
        step === "accounting"
          ? ["pending_accounting", "pending_approval"]
          : ["pending_admin"];
      const { error: payErr } = await supabase
        .from("payments")
        .update({
          approval_status: "rejected",
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
          rejection_reason: reason.trim() || null,
        })
        .eq("id", payment.id)
        .in("approval_status", expected);
      if (payErr) throw payErr;
      await writeAuditLog("payment_rejected", "payment", payment.id, {
        step,
        reason: reason.trim() || null,
      });
      setActionSuccess("Payment rejected — not applied to AR.");
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject payment.");
    } finally {
      setBusyId(null);
    }
  };

  const showAccounting = canAccounting;
  const showAdmin = canAdmin;
  const activeTab: QueueTab =
    tab === "admin" && showAdmin ? "admin" : showAccounting ? "accounting" : "admin";

  const queueInvoices = activeTab === "accounting" ? accountingInvoices : adminInvoices;
  const queuePayments = activeTab === "accounting" ? accountingPayments : adminPayments;
  const canAct = activeTab === "accounting" ? canAccounting : canAdmin;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        subtitle={`Accounting clears all invoices and payments. Amounts ≥ ${money(
          HIGH_VALUE_APPROVAL_THRESHOLD
        )} also need Admin / Owner.`}
      />

      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

      <div className="flex flex-wrap gap-2">
        {showAccounting ? (
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "accounting" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab("accounting")}
          >
            Accounting queue ({accountingInvoices.length + accountingPayments.length})
          </button>
        ) : null}
        {showAdmin ? (
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "admin" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab("admin")}
          >
            Admin high-value ({adminInvoices.length + adminPayments.length})
          </button>
        ) : null}
      </div>

      <SectionCard title="Invoices awaiting approval">
        {queueInvoices.length === 0 ? (
          <EmptyState title="No invoices in this queue" message="Nothing waiting for this step." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Project</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueInvoices.map((invoice) => {
                  const amount = Number(invoice.invoice_amount ?? 0);
                  const high = requiresAdminHighValueApproval(amount);
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/invoices/${invoice.id}`} className="link link-hover font-medium">
                          {invoice.invoice_number || invoice.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>{invoice.contracts?.contract_name ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        {money(amount)}
                        {high ? (
                          <span className="badge badge-xs badge-warning ml-2">≥250k</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge badge-sm ${invoiceApprovalBadge(invoice.approval_status)}`}>
                          {invoiceApprovalLabel(invoice.approval_status)}
                        </span>
                      </td>
                      <td className="text-right">
                        {canAct ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn btn-success btn-xs gap-1"
                              disabled={busyId === invoice.id}
                              onClick={() => void onApproveInvoice(invoice, activeTab)}
                            >
                              <Check className="h-3 w-3" /> Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-error btn-xs gap-1"
                              disabled={busyId === invoice.id}
                              onClick={() => void onRejectInvoice(invoice, activeTab)}
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs opacity-60">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Payments awaiting approval">
        {queuePayments.length === 0 ? (
          <EmptyState title="No payments in this queue" message="Nothing waiting for this step." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Invoice</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queuePayments.map((payment) => {
                  const invoice = invoiceById.get(payment.invoice_id);
                  const amount = Number(payment.payment_amount ?? 0);
                  const high = requiresAdminHighValueApproval(amount);
                  return (
                    <tr key={payment.id}>
                      <td className="font-mono text-xs">{payment.id.slice(0, 8)}</td>
                      <td>
                        {invoice ? (
                          <Link href={`/invoices/${invoice.id}`} className="link link-hover">
                            {invoice.invoice_number || invoice.id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {money(amount)}
                        {high ? (
                          <span className="badge badge-xs badge-warning ml-2">≥250k</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge badge-sm ${paymentApprovalBadge(payment.approval_status)}`}>
                          {paymentApprovalLabel(payment.approval_status)}
                        </span>
                      </td>
                      <td className="text-right">
                        {canAct ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn btn-success btn-xs gap-1"
                              disabled={busyId === payment.id}
                              onClick={() => void onApprovePayment(payment, activeTab)}
                            >
                              <Check className="h-3 w-3" /> Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-error btn-xs gap-1"
                              disabled={busyId === payment.id}
                              onClick={() => void onRejectPayment(payment, activeTab)}
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs opacity-60">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
