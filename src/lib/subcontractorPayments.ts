import { moneyExact } from "@/lib/metrics";
import { validatePositiveAmount } from "@/lib/invoiceValidation";
import type { Subcontractor, SubcontractorPayment } from "@/lib/types";

const MONEY_EPS = 0.005;

/** Remaining payable = subcontract value − amount already paid. */
export function subcontractorOpenPayable(sub: Subcontractor): number {
  const value = Number(sub.subcontract_value ?? 0);
  const paid = Number(sub.amount_paid ?? 0);
  return Math.max(0, value - paid);
}

export function validateSubcontractorPaymentAmount(
  amount: number,
  sub: Subcontractor
): string | null {
  const positive = validatePositiveAmount(amount, "Payment amount");
  if (positive) return positive;

  const value = Number(sub.subcontract_value ?? 0);
  if (value <= MONEY_EPS) {
    return "This subcontractor has no subcontract value to pay against.";
  }

  const open = subcontractorOpenPayable(sub);
  if (open <= MONEY_EPS) {
    return "This subcontract is already fully paid.";
  }
  if (amount > open + MONEY_EPS) {
    return `Payment cannot exceed the remaining payable (${moneyExact(open)}).`;
  }
  return null;
}

export function sumPostedSubcontractorPayments(payments: SubcontractorPayment[]): number {
  return payments.reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);
}
