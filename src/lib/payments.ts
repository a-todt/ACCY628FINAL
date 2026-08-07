import type {
  CostApprovalStatus,
  CostEntry,
  Invoice,
  InvoiceApprovalStatus,
  InvoiceStatus,
  Payment,
  PaymentApprovalStatus,
  UserRole,
} from "@/lib/types";

/** Default: invoice/payment amounts at or above this need Admin after Accounting. */
export const DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD = 250_000;
/** Default: cost amounts above this need Admin after Accounting; at/below = Accounting only. */
export const DEFAULT_COST_ADMIN_APPROVAL_THRESHOLD = 50_000;

/** @deprecated Prefer DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD / company settings. */
export const HIGH_VALUE_APPROVAL_THRESHOLD = DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD;

export function requiresAdminHighValueApproval(
  amount: number | null | undefined,
  threshold: number = DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD
): boolean {
  return Number(amount ?? 0) >= Number(threshold);
}

/** Costs strictly above the company threshold need Accounting + Admin / Owner. */
export function requiresCostAdminApproval(
  amount: number | null | undefined,
  threshold: number = DEFAULT_COST_ADMIN_APPROVAL_THRESHOLD
): boolean {
  return Number(amount ?? 0) > Number(threshold);
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

/**
 * Billable invoices only — pending/rejected (and missing status) do not count
 * toward AR, billed totals, or charts. Require an explicit `approved` status.
 */
export function isApprovedInvoice(invoice: Invoice): boolean {
  return invoice.approval_status === "approved";
}

export function isInvoiceAwaitingAccounting(invoice: Invoice): boolean {
  return invoice.approval_status === "pending_accounting";
}

export function isInvoiceAwaitingAdmin(invoice: Invoice): boolean {
  return invoice.approval_status === "pending_admin";
}

export function isInvoicePending(invoice: Invoice): boolean {
  return isInvoiceAwaitingAccounting(invoice) || isInvoiceAwaitingAdmin(invoice);
}

/**
 * Job-cost totals / charts only include approved cost logs.
 * Missing status is excluded so unapproved entries never inflate visuals.
 */
export function isApprovedCost(cost: CostEntry): boolean {
  return cost.approval_status === "approved";
}

/** Convenience filter for charts, KPIs, and financial aggregates. */
export function approvedCostsOnly(costs: CostEntry[]): CostEntry[] {
  return costs.filter(isApprovedCost);
}

export function approvedInvoicesOnly(invoices: Invoice[]): Invoice[] {
  return invoices.filter(isApprovedInvoice);
}

export function isCostAwaitingAccounting(cost: CostEntry): boolean {
  return cost.approval_status === "pending_accounting";
}

export function isCostAwaitingAdmin(cost: CostEntry): boolean {
  return cost.approval_status === "pending_admin";
}

export function isCostPending(cost: CostEntry): boolean {
  return isCostAwaitingAccounting(cost) || isCostAwaitingAdmin(cost);
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

export function costApprovalBadge(status: CostApprovalStatus | undefined): string {
  return invoiceApprovalBadge(status);
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

export function costApprovalLabel(status: CostApprovalStatus | undefined): string {
  return invoiceApprovalLabel(status);
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
export function paymentStatusAfterAccounting(
  amount: number,
  invoiceAdminThreshold: number = DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD
): PaymentApprovalStatus {
  return requiresAdminHighValueApproval(amount, invoiceAdminThreshold)
    ? "pending_admin"
    : "posted";
}

/** Next invoice status after Accounting signs off. */
export function invoiceStatusAfterAccounting(
  amount: number,
  invoiceAdminThreshold: number = DEFAULT_INVOICE_ADMIN_APPROVAL_THRESHOLD
): InvoiceApprovalStatus {
  return requiresAdminHighValueApproval(amount, invoiceAdminThreshold)
    ? "pending_admin"
    : "approved";
}

/** Next cost status after Accounting signs off. */
export function costStatusAfterAccounting(
  amount: number,
  costAdminThreshold: number = DEFAULT_COST_ADMIN_APPROVAL_THRESHOLD
): CostApprovalStatus {
  return requiresCostAdminApproval(amount, costAdminThreshold)
    ? "pending_admin"
    : "approved";
}
