"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useContractData } from "@/hooks/useContractData";
import { PageSkeleton } from "@/components/PageSkeleton";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import { notifyPmInvoiceDecision } from "@/lib/invoiceNotifications";
import { labelize, money } from "@/lib/metrics";
import {
  costApprovalBadge,
  costApprovalLabel,
  costStatusAfterAccounting,
  invoiceAfterApplyingPayment,
  invoiceApprovalBadge,
  invoiceApprovalLabel,
  invoiceStatusAfterAccounting,
  isApprovedInvoice,
  isCostAwaitingAccounting,
  isCostAwaitingAdmin,
  isInvoiceAwaitingAccounting,
  isInvoiceAwaitingAdmin,
  isPaymentAwaitingAccounting,
  isPaymentAwaitingAdmin,
  paymentApprovalBadge,
  paymentApprovalLabel,
  paymentStatusAfterAccounting,
  requiresAdminHighValueApproval,
  requiresCostAdminApproval,
} from "@/lib/payments";
import {
  canApproveHighValue,
  canApprovePayments,
  canOverrideSegregationOfDuties,
  canViewApprovals,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { CostEntry, Invoice, Payment, UserRole } from "@/lib/types";

type QueueTab = "accounting" | "admin";

export default function ApprovalsPage() {
  const { effectiveRole, user } = useAuth();
  const { invoices, payments, costEntries, loading, error, refresh } = useContractData();
  const { invoiceAdminThreshold, costAdminThreshold, allowOwnerSodOverride } =
    useCompanySettings();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const canAccounting = canApprovePayments(effectiveRole);
  const canAdmin = canApproveHighValue(effectiveRole);
  const ownerSodOverride = canOverrideSegregationOfDuties(
    effectiveRole,
    allowOwnerSodOverride
  );
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
  const accountingCosts = useMemo(
    () => costEntries.filter(isCostAwaitingAccounting),
    [costEntries]
  );
  const adminCosts = useMemo(() => costEntries.filter(isCostAwaitingAdmin), [costEntries]);

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

  const isSelfSubmitted = (submittedBy: string | null | undefined) =>
    Boolean(submittedBy && user?.id && submittedBy === user.id);

  const denySelf = (submittedBy: string | null | undefined) => {
    if (!isSelfSubmitted(submittedBy)) return false;
    if (ownerSodOverride) {
      const ok = window.confirm(
        "Demo SoD override: approve an item you submitted? This bypasses segregation of duties for Accounting (owner)."
      );
      if (!ok) {
        setActionError("Approval cancelled — segregation of duties still applies.");
        return true;
      }
      return false;
    }
    setActionError("You cannot approve an item you submitted (segregation of duties).");
    return true;
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
        const next = invoiceStatusAfterAccounting(amount, invoiceAdminThreshold);
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
          sod_override: isSelfSubmitted(invoice.submitted_by) || undefined,
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
            ? `Invoice cleared by Accounting — awaiting Admin / Owner (≥ ${money(invoiceAdminThreshold)}).`
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
          sod_override: isSelfSubmitted(invoice.submitted_by) || undefined,
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

  const onApproveCost = async (cost: CostEntry, step: QueueTab) => {
    if (step === "accounting" && !canAccounting) return;
    if (step === "admin" && !canAdmin) return;
    if (denySelf(cost.submitted_by ?? cost.user_id)) return;

    setBusyId(cost.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      const amount = Number(cost.amount ?? 0);

      if (step === "accounting") {
        const next = costStatusAfterAccounting(amount, costAdminThreshold);
        const { error: updateError } = await supabase
          .from("cost_entries")
          .update({
            approval_status: next,
            accounting_approved_by: user?.id ?? null,
            accounting_approved_at: nowIso,
            rejection_reason: null,
          })
          .eq("id", cost.id)
          .eq("approval_status", "pending_accounting");
        if (updateError) throw updateError;
        await writeAuditLog("cost_accounting_approved", "cost_entry", cost.id, {
          next_status: next,
          amount,
          sod_override:
            isSelfSubmitted(cost.submitted_by ?? cost.user_id) || undefined,
        });
        setActionSuccess(
          next === "pending_admin"
            ? `Cost cleared by Accounting — awaiting Admin / Owner (over ${money(costAdminThreshold)}).`
            : "Cost approved and counted in job costs."
        );
      } else {
        const { error: updateError } = await supabase
          .from("cost_entries")
          .update({
            approval_status: "approved",
            admin_approved_by: user?.id ?? null,
            admin_approved_at: nowIso,
            rejection_reason: null,
          })
          .eq("id", cost.id)
          .eq("approval_status", "pending_admin");
        if (updateError) throw updateError;
        await writeAuditLog("cost_admin_approved", "cost_entry", cost.id, {
          amount,
          sod_override:
            isSelfSubmitted(cost.submitted_by ?? cost.user_id) || undefined,
        });
        setActionSuccess("High-value cost approved by Admin / Owner.");
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve cost.");
    } finally {
      setBusyId(null);
    }
  };

  const onRejectCost = async (cost: CostEntry, step: QueueTab) => {
    if (step === "accounting" && !canAccounting) return;
    if (step === "admin" && !canAdmin) return;
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    setBusyId(cost.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const supabase = createClient();
      const expected = step === "accounting" ? "pending_accounting" : "pending_admin";
      const { error: updateError } = await supabase
        .from("cost_entries")
        .update({
          approval_status: "rejected",
          rejection_reason: reason.trim() || null,
          accounting_approved_by:
            step === "accounting" ? user?.id ?? null : cost.accounting_approved_by ?? null,
          accounting_approved_at:
            step === "accounting"
              ? new Date().toISOString()
              : cost.accounting_approved_at ?? null,
          admin_approved_by: step === "admin" ? user?.id ?? null : null,
          admin_approved_at: step === "admin" ? new Date().toISOString() : null,
        })
        .eq("id", cost.id)
        .eq("approval_status", expected);
      if (updateError) throw updateError;
      await writeAuditLog("cost_rejected", "cost_entry", cost.id, {
        step,
        reason: reason.trim() || null,
      });
      setActionSuccess("Cost rejected — not counted in job costs.");
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject cost.");
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
        const next = paymentStatusAfterAccounting(amount, invoiceAdminThreshold);
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
          sod_override: isSelfSubmitted(payment.submitted_by) || undefined,
        });
        setActionSuccess(
          next === "pending_admin"
            ? `Payment cleared by Accounting — awaiting Admin / Owner (≥ ${money(invoiceAdminThreshold)}).`
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
          sod_override: isSelfSubmitted(payment.submitted_by) || undefined,
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
  const queueCosts = activeTab === "accounting" ? accountingCosts : adminCosts;
  const canAct = activeTab === "accounting" ? canAccounting : canAdmin;
  const accountingCount =
    accountingInvoices.length + accountingPayments.length + accountingCosts.length;
  const adminCount = adminInvoices.length + adminPayments.length + adminCosts.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        subtitle={`Accounting clears invoices, payments, and cost logs. Invoices/payments ≥ ${money(
          invoiceAdminThreshold
        )} and costs over ${money(costAdminThreshold)} also need Admin / Owner. Thresholds are set in Company Settings.`}
      />

      {allowOwnerSodOverride ? (
        <AlertBanner type="info">
          <span className="badge badge-warning badge-sm mr-2">Demo</span>
          Owner SoD override is on — Accounting may approve items they submitted.
          Turn off in Management → Company Settings to enforce segregation of duties for everyone.
        </AlertBanner>
      ) : null}

      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

      <div className="flex flex-wrap gap-2">
        {showAccounting ? (
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "accounting" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab("accounting")}
          >
            Accounting queue ({accountingCount})
          </button>
        ) : null}
        {showAdmin ? (
          <button
            type="button"
            className={`btn btn-sm ${activeTab === "admin" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab("admin")}
          >
            Admin high-value ({adminCount})
          </button>
        ) : null}
      </div>

      <SectionCard title="Cost logs awaiting approval">
        {queueCosts.length === 0 ? (
          <EmptyState title="No cost logs in this queue" message="Nothing waiting for this step." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueCosts.map((cost) => {
                  const amount = Number(cost.amount ?? 0);
                  const high = requiresCostAdminApproval(amount, costAdminThreshold);
                  const selfRow = isSelfSubmitted(cost.submitted_by ?? cost.user_id);
                  return (
                    <tr key={cost.id}>
                      <td>{cost.date_incurred ?? "—"}</td>
                      <td>
                        <Link
                          href={`/contracts/${cost.contract_id}`}
                          className="link link-hover font-medium"
                        >
                          {cost.contracts?.contract_name ?? "—"}
                        </Link>
                        {cost.description ? (
                          <div className="text-xs opacity-60 truncate max-w-[14rem]">
                            {cost.description}
                          </div>
                        ) : null}
                      </td>
                      <td>{labelize(cost.category)}</td>
                      <td className="text-right tabular-nums">
                        {money(amount)}
                        {high ? (
                          <span className="badge badge-xs badge-warning ml-2">
                            &gt;{money(costAdminThreshold)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge badge-sm ${costApprovalBadge(cost.approval_status)}`}>
                          {costApprovalLabel(cost.approval_status)}
                        </span>
                        {selfRow && ownerSodOverride ? (
                          <span className="badge badge-xs badge-warning ml-1">Demo SoD override</span>
                        ) : selfRow ? (
                          <span className="badge badge-xs ml-1">Your submission</span>
                        ) : null}
                      </td>
                      <td className="text-right">
                        {canAct && !(selfRow && !ownerSodOverride) ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn btn-success btn-xs gap-1"
                              disabled={busyId === cost.id}
                              onClick={() => void onApproveCost(cost, activeTab)}
                            >
                              <Check className="h-3 w-3" /> Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-error btn-xs gap-1"
                              disabled={busyId === cost.id}
                              onClick={() => void onRejectCost(cost, activeTab)}
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        ) : selfRow && !ownerSodOverride ? (
                          <span className="text-xs opacity-60">SoD blocked</span>
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
                  const high = requiresAdminHighValueApproval(amount, invoiceAdminThreshold);
                  const selfRow = isSelfSubmitted(invoice.submitted_by);
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
                          <span className="badge badge-xs badge-warning ml-2">
                            ≥{money(invoiceAdminThreshold)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge badge-sm ${invoiceApprovalBadge(invoice.approval_status)}`}>
                          {invoiceApprovalLabel(invoice.approval_status)}
                        </span>
                        {selfRow && ownerSodOverride ? (
                          <span className="badge badge-xs badge-warning ml-1">Demo SoD override</span>
                        ) : selfRow ? (
                          <span className="badge badge-xs ml-1">Your submission</span>
                        ) : null}
                      </td>
                      <td className="text-right">
                        {canAct && !(selfRow && !ownerSodOverride) ? (
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
                        ) : selfRow && !ownerSodOverride ? (
                          <span className="text-xs opacity-60">SoD blocked</span>
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
                  const high = requiresAdminHighValueApproval(amount, invoiceAdminThreshold);
                  const selfRow = isSelfSubmitted(payment.submitted_by);
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
                          <span className="badge badge-xs badge-warning ml-2">
                            ≥{money(invoiceAdminThreshold)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge badge-sm ${paymentApprovalBadge(payment.approval_status)}`}>
                          {paymentApprovalLabel(payment.approval_status)}
                        </span>
                        {selfRow && ownerSodOverride ? (
                          <span className="badge badge-xs badge-warning ml-1">Demo SoD override</span>
                        ) : selfRow ? (
                          <span className="badge badge-xs ml-1">Your submission</span>
                        ) : null}
                      </td>
                      <td className="text-right">
                        {canAct && !(selfRow && !ownerSodOverride) ? (
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
                        ) : selfRow && !ownerSodOverride ? (
                          <span className="text-xs opacity-60">SoD blocked</span>
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
