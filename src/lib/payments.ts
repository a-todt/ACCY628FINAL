import type { Invoice, InvoiceStatus, Payment, PaymentApprovalStatus } from "@/lib/types";

export function isPostedPayment(payment: Payment): boolean {
  return (payment.approval_status ?? "posted") === "posted";
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
      return "badge-warning";
    case "rejected":
      return "badge-error";
    default:
      return "badge-success";
  }
}

/** Whether this role's payment should wait for owner/admin approval before updating AR. */
export function paymentNeedsOwnerApproval(role: string): boolean {
  return role !== "owner" && role !== "admin";
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
