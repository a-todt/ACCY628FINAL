import type {
  Invoice,
  InvoiceApprovalStatus,
  InvoiceStatus,
  Payment,
  PaymentApprovalStatus,
  UserRole,
} from "@/lib/types";

/** Invoice amount or payment amount at/above this needs Admin / Owner after Accounting. */
export const HIGH_VALUE_APPROVAL_THRESHOLD = 250_000;

export function requiresAdminHighValueApproval(amount: number | null | undefined): boolean {
  return Number(amount ?? 0) >= HIGH_VALUE_APPROVAL_THRESHOLD;
}

export function isPostedPayment(payment: Payment): boolean {
  return (payment.approval_status ?? "posted") === "posted";
}

export function isPaymentAwaitingAccounting(payment: Payment): boolean {
  const status = payment.approval_status ?? "posted";
  return status === "pending_accounting" || status === "pending_approval";
}

export function isPaymentAwaitingAdmin(payment: Payment): boolean {
  return (payment.approval_status ?? "posted") === "pending_admin";
}

export function isPaymentPending(payment: Payment): boolean {
  return isPaymentAwaitingAccounting(payment) || isPaymentAwaitingAdmin(payment);
}

/** Billable invoices only — pending/rejected do not count toward AR/billed. */
export function isApprovedInvoice(invoice: Invoice): boolean {
  const status = invoice.approval_status ?? "approved";
  return status === "approved";
}

export function isInvoiceAwaitingAccounting(invoice: Invoice): boolean {
  return (invoice.approval_status ?? "approved") === "pending_accounting";
}

export function isInvoiceAwaitingAdmin(invoice: Invoice): boolean {
  return (invoice.approval_status ?? "approved") === "pending_admin";
}

export function isInvoicePending(invoice: Invoice): boolean {
  return isInvoiceAwaitingAccounting(invoice) || isInvoiceAwaitingAdmin(invoice);
}

export function nextInvoiceStatus(amountPaid: number, netAmountDue: number): InvoiceStatus {
  // Zero/blank invoices cannot become "paid" via AR math alone.
  if (netAmountDue > 0.005 && amountPaid + 0.005 >= netAmountDue) return "paid";
  if (amountPaid > 0.005) return "partially_paid";
  return "unpaid";
}

export function paymentApprovalBadge(status: PaymentApprovalStatus | undefined): string {
  switch (status ?? "posted") {
    case "pending_approval":
    case "pending_accounting":
    case "pending_admin":
      return "badge-warning";
    case "rejected":
      return "badge-error";
    default:
      return "badge-success";
  }
}

export function invoiceApprovalBadge(status: InvoiceApprovalStatus | undefined): string {
  switch (status ?? "approved") {
    case "pending_accounting":
    case "pending_admin":
      return "badge-warning";
    case "rejected":
      return "badge-error";
    default:
      return "badge-success";
  }
}

export function paymentApprovalLabel(status: PaymentApprovalStatus | undefined): string {
  switch (status ?? "posted") {
    case "pending_approval":
    case "pending_accounting":
      return "Awaiting Accounting";
    case "pending_admin":
      return "Awaiting Admin";
    case "rejected":
      return "Rejected";
    default:
      return "Posted";
  }
}

export function invoiceApprovalLabel(status: InvoiceApprovalStatus | undefined): string {
  switch (status ?? "approved") {
    case "pending_accounting":
      return "Awaiting Accounting";
    case "pending_admin":
      return "Awaiting Admin";
    case "rejected":
      return "Rejected";
    default:
      return "Approved";
  }
}

/** @deprecated All payments now enter the Accounting queue — kept for call-site compatibility. */
export function paymentNeedsOwnerApproval(_role: string): boolean {
  return true;
}

export function invoiceAfterApplyingPayment(
  invoice: Invoice,
  paymentAmount: number
): { amount_paid: number; status: InvoiceStatus } {
  const netAmountDue = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
  const currentPaid = Number(invoice.amount_paid ?? 0);
  const open = Math.max(netAmountDue - currentPaid, 0);
  // Never let AR math create an overpayment if a caller skips validation.
  const applied = Math.min(Math.max(paymentAmount, 0), open);
  const newAmountPaid = currentPaid + applied;
  return {
    amount_paid: newAmountPaid,
    status: nextInvoiceStatus(newAmountPaid, netAmountDue),
  };
}

export function canApproveAccountingStep(role: UserRole): boolean {
  return role === "owner";
}

export function canApproveAdminHighValueStep(role: UserRole): boolean {
  return role === "admin";
}

export function canViewApprovalsQueue(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** Next payment status after Accounting signs off. */
export function paymentStatusAfterAccounting(amount: number): PaymentApprovalStatus {
  return requiresAdminHighValueApproval(amount) ? "pending_admin" : "posted";
}

/** Next invoice status after Accounting signs off. */
export function invoiceStatusAfterAccounting(amount: number): InvoiceApprovalStatus {
  return requiresAdminHighValueApproval(amount) ? "pending_admin" : "approved";
}
