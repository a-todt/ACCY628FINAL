import type { UserRole } from "@/lib/types";
import { canApproveChangeOrders } from "@/lib/roles";
import { money } from "@/lib/metrics";

/**
 * Separation of duties — change order approval thresholds.
 *
 * At or under $250,000: Project Manager or Accounting (Admin) may approve.
 * Over $250,000: Accounting (Admin) or Owner only (PM cannot approve).
 *
 * Pending COs are excluded from revised contract value / billing basis until approved.
 *
 * In this app, the Admin role acts as Accounting.
 */
export const CHANGE_ORDER_HIGH_VALUE_THRESHOLD = 250_000;

/** @deprecated Use CHANGE_ORDER_HIGH_VALUE_THRESHOLD */
export const CHANGE_ORDER_OWNER_APPROVAL_THRESHOLD = CHANGE_ORDER_HIGH_VALUE_THRESHOLD;

export function changeOrderApprovalAmount(amount: number | null | undefined): number {
  return Math.abs(Number(amount ?? 0));
}

export function isHighValueChangeOrder(amount: number | null | undefined): boolean {
  return changeOrderApprovalAmount(amount) > CHANGE_ORDER_HIGH_VALUE_THRESHOLD;
}

/** Accounting = Admin (Internal) in the current role model. */
export function isAccountingApprover(role: UserRole): boolean {
  return role === "admin";
}

export function isOwnerApprover(role: UserRole): boolean {
  return role === "owner";
}

/**
 * Whether this role may set a change order to approved for the given amount.
 */
export function canApproveChangeOrderForAmount(
  role: UserRole,
  amount: number | null | undefined
): boolean {
  if (!canApproveChangeOrders(role)) return false;

  // Accounting can approve at any amount.
  if (isAccountingApprover(role)) return true;

  if (isHighValueChangeOrder(amount)) {
    // Over $250k: Owner (and Accounting above) only — not PM.
    return isOwnerApprover(role);
  }

  // At or under $250k: PM (and Accounting) — Owner may also approve as oversight.
  return role === "project_manager" || isOwnerApprover(role);
}

export function changeOrderApprovalBlockedReason(
  role: UserRole,
  amount: number | null | undefined
): string | null {
  if (canApproveChangeOrderForAmount(role, amount)) return null;
  if (!canApproveChangeOrders(role)) {
    return "You do not have permission to approve change orders.";
  }
  if (isHighValueChangeOrder(amount)) {
    return (
      `Change orders over ${money(CHANGE_ORDER_HIGH_VALUE_THRESHOLD)} require ` +
      `Accounting or Owner approval (this CO is ${money(changeOrderApprovalAmount(amount))}).`
    );
  }
  return (
    `Change orders up to ${money(CHANGE_ORDER_HIGH_VALUE_THRESHOLD)} may be approved by ` +
    `a Project Manager or Accounting.`
  );
}

export const CHANGE_ORDER_APPROVAL_POLICY =
  `Up to ${money(CHANGE_ORDER_HIGH_VALUE_THRESHOLD)}: Project Manager or Accounting may approve. ` +
  `Over ${money(CHANGE_ORDER_HIGH_VALUE_THRESHOLD)}: Accounting or Owner only. ` +
  `Pending change orders do not affect invoices or revised contract value until approved.`;

export const CHANGE_ORDER_PENDING_BILLING_NOTE =
  "Pending change orders are not included in revised contract value or invoice billing basis until approved.";
