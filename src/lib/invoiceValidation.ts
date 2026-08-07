import { invoiceOpenAr, moneyExact } from "@/lib/metrics";
import { nextInvoiceStatus } from "@/lib/payments";
import type { ChangeOrder, Contract, Invoice, InvoiceStatus } from "@/lib/types";

const MONEY_EPS = 0.005;

function contractRevisedValue(contract: Contract, changeOrders: ChangeOrder[]): number {
  const approvedCos = changeOrders
    .filter((c) => c.contract_id === contract.id && c.status === "approved")
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  return Number(contract.original_value ?? 0) + approvedCos;
}

/** Pending + approved reserve capacity; rejected invoices do not. */
function countsTowardBillableCapacity(invoice: Invoice): boolean {
  return invoice.approval_status !== "rejected";
}

/** Remaining contract value that can still be billed (revised − already billed). */
export function remainingBillableCapacity(
  contract: Contract,
  changeOrders: ChangeOrder[],
  invoices: Invoice[],
  options?: { excludeInvoiceId?: string | null }
): number {
  const revisedValue = contractRevisedValue(contract, changeOrders);
  const excludeId = options?.excludeInvoiceId ?? null;
  const billedOthers = invoices
    .filter(
      (i) =>
        i.contract_id === contract.id &&
        i.id !== excludeId &&
        countsTowardBillableCapacity(i)
    )
    .reduce((sum, i) => sum + Number(i.invoice_amount ?? 0), 0);
  return Math.max(0, revisedValue - billedOthers);
}

export function validatePositiveAmount(
  amount: number,
  label = "Amount"
): string | null {
  if (!Number.isFinite(amount)) return `${label} must be a valid number.`;
  if (amount <= MONEY_EPS) return `${label} must be greater than $0.`;
  return null;
}

/**
 * Invoice billing amount must be > $0 and not exceed remaining contract value
 * (original + approved COs − other invoices).
 */
export function validateInvoiceBillingAmount(args: {
  amount: number;
  contract: Contract | null | undefined;
  changeOrders: ChangeOrder[];
  invoices: Invoice[];
  excludeInvoiceId?: string | null;
}): string | null {
  const positive = validatePositiveAmount(args.amount, "Invoice amount");
  if (positive) return positive;
  if (!args.contract) return "Select a contract.";

  const remaining = remainingBillableCapacity(
    args.contract,
    args.changeOrders,
    args.invoices,
    { excludeInvoiceId: args.excludeInvoiceId }
  );

  if (args.amount > remaining + MONEY_EPS) {
    const revised = contractRevisedValue(args.contract, args.changeOrders);
    return `Invoice amount cannot exceed remaining billable on this contract (${moneyExact(remaining)} left of ${moneyExact(revised)} revised value).`;
  }
  return null;
}

export function validatePaymentAmount(
  amount: number,
  invoice: Invoice,
  options?: { reservedPending?: number }
): string | null {
  const positive = validatePositiveAmount(amount, "Payment amount");
  if (positive) return positive;
  const reserved = Math.max(0, Number(options?.reservedPending ?? 0));
  const open = Math.max(0, invoiceOpenAr(invoice) - reserved);
  if (open <= MONEY_EPS) {
    return "This invoice has no open balance to pay.";
  }
  if (amount > open + MONEY_EPS) {
    return `Payment cannot exceed the open balance (${moneyExact(open)}).`;
  }
  return null;
}

/** Manual amount_paid edits cannot exceed net due (no silent overpay). */
export function validateAmountPaid(
  amountPaid: number,
  netAmountDue: number
): string | null {
  if (!Number.isFinite(amountPaid)) return "Amount paid must be a valid number.";
  if (amountPaid < -MONEY_EPS) return "Amount paid cannot be negative.";
  if (amountPaid > netAmountDue + MONEY_EPS) {
    return `Amount paid cannot exceed net due (${moneyExact(netAmountDue)}).`;
  }
  return null;
}

/** True when posted AR covers net due (and net due is actually positive). */
export function invoiceIsFullyPaid(invoice: Invoice): boolean {
  const net = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  return net > MONEY_EPS && paid + MONEY_EPS >= net;
}

export function validateInvoiceStatusChange(
  invoice: Invoice,
  nextStatus: InvoiceStatus,
  amountPaidOverride?: number
): string | null {
  if (nextStatus !== "paid") return null;
  const paid =
    amountPaidOverride != null ? amountPaidOverride : Number(invoice.amount_paid ?? 0);
  const net = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
  if (net <= MONEY_EPS) {
    return "Cannot mark paid: invoice net due must be greater than $0.";
  }
  if (paid + MONEY_EPS < net) {
    return `Cannot mark paid until payments cover the net due (${moneyExact(paid)} of ${moneyExact(net)}).`;
  }
  return null;
}

/** Derive status from amounts — never trust a manual "paid" without coverage. */
export function coerceInvoiceStatus(
  amountPaid: number,
  netAmountDue: number,
  requested?: InvoiceStatus | null
): InvoiceStatus {
  const derived = nextInvoiceStatus(amountPaid, netAmountDue);
  if (!requested || requested === "overdue") return derived;
  if (requested === "paid" && derived !== "paid") return derived;
  if (requested === "partially_paid" && amountPaid <= MONEY_EPS) return "unpaid";
  return requested === "unpaid" && amountPaid > MONEY_EPS ? derived : requested;
}
