import type {
  ChangeOrder,
  Contract,
  ContractMetrics,
  CostEntry,
  Invoice,
  Milestone,
  Payment,
} from "./types";

export function money(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function moneyExact(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function percent(n: number | null | undefined): string {
  return `${(Number(n ?? 0) * 100).toFixed(1)}%`;
}

export function labelize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * ASC 606 retainage receivable (contract asset): billed amount withheld until
 * contractual conditions are met (e.g. substantial completion). Not current AR.
 */
export function invoiceRetainageReceivable(invoice: Invoice): number {
  const retainage = Number(invoice.retainage_amount ?? 0);
  const remainingOnInvoice = Math.max(
    Number(invoice.invoice_amount ?? 0) - Number(invoice.amount_paid ?? 0),
    0
  );
  return Math.max(0, Math.min(retainage, remainingOnInvoice));
}

/** Current amount due on an invoice (net of retainage). */
export function invoiceOpenAr(invoice: Invoice): number {
  const net = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
  return Math.max(net - Number(invoice.amount_paid ?? 0), 0);
}

export function computeContractMetrics(
  contract: Contract,
  changeOrders: ChangeOrder[],
  invoices: Invoice[],
  costs: CostEntry[],
  milestones: Milestone[] = [],
  payments: Payment[] = []
): ContractMetrics {
  const relatedCOs = changeOrders.filter((c) => c.contract_id === contract.id);
  const relatedInvoices = invoices.filter((i) => i.contract_id === contract.id);
  const relatedCosts = costs.filter((c) => c.contract_id === contract.id);
  const relatedMilestones = milestones.filter((m) => m.contract_id === contract.id);
  const invoiceIds = new Set(relatedInvoices.map((i) => i.id));
  const relatedPayments = payments.filter((p) => invoiceIds.has(p.invoice_id));

  const approvedChangeOrders = relatedCOs
    .filter((c) => c.status === "approved")
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  const pendingChangeOrders = relatedCOs.filter((c) => c.status === "pending").length;
  const revisedValue = Number(contract.original_value ?? 0) + approvedChangeOrders;
  const totalBilled = relatedInvoices.reduce(
    (sum, i) => sum + Number(i.invoice_amount ?? 0),
    0
  );
  const totalCollectedFromInvoices = relatedInvoices.reduce(
    (sum, i) => sum + Number(i.amount_paid ?? 0),
    0
  );
  const totalCollectedFromPayments = relatedPayments
    .filter((p) => (p.approval_status ?? "posted") === "posted")
    .reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);
  const totalCollected = Math.max(totalCollectedFromInvoices, totalCollectedFromPayments);
  // GAAP: retainage receivable (contract asset), separate from current AR.
  const retainageHeld = relatedInvoices.reduce(
    (sum, i) => sum + invoiceRetainageReceivable(i),
    0
  );
  const totalCosts = relatedCosts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  const grossProfit = totalBilled - totalCosts;
  const grossMargin = totalBilled > 0 ? grossProfit / totalBilled : 0;
  // Current AR = unpaid net due only (excludes retainage receivable).
  const outstanding = relatedInvoices.reduce((sum, i) => sum + invoiceOpenAr(i), 0);

  let completionPercent = 0;
  if (relatedMilestones.length > 0) {
    const done = relatedMilestones.filter((m) => m.status === "completed").length;
    completionPercent = done / relatedMilestones.length;
  } else if (revisedValue > 0) {
    completionPercent = Math.min(totalBilled / revisedValue, 1);
  }

  return {
    approvedChangeOrders,
    revisedValue,
    totalBilled,
    totalCollected,
    outstanding,
    retainageHeld,
    totalCosts,
    grossProfit,
    grossMargin,
    completionPercent,
    pendingChangeOrders,
  };
}

export function daysPastDue(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  const diff = today.getTime() - due.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export type ScheduleHealth =
  | "on_schedule"
  | "ahead"
  | "behind"
  | "completed"
  | "not_started"
  | "no_dates";

export interface ScheduleStatus {
  health: ScheduleHealth;
  label: string;
  /** Positive when the project is behind; 0 when on track or ahead. */
  daysBehind: number;
  /** Positive when the project is ahead of plan. */
  daysAhead: number;
  plannedPercent: number;
  actualPercent: number;
  detail: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Schedule health from milestone due dates.
 * Behind only when a milestone's expected (due) date has passed and it is not completed.
 */
export function computeScheduleStatus(
  contract: Contract,
  milestones: Milestone[]
): ScheduleStatus {
  const related = milestones.filter((m) => m.contract_id === contract.id);
  const withDue = related.filter((m) => Boolean(parseDateOnly(m.due_date)));
  const completedCount = related.filter((m) => m.status === "completed").length;
  const actualPercent = related.length > 0 ? completedCount / related.length : 0;

  const today = startOfDay(new Date());
  const dueByToday = withDue.filter((m) => {
    const due = parseDateOnly(m.due_date);
    return due != null && due.getTime() <= today.getTime();
  });
  const plannedPercent = withDue.length > 0 ? dueByToday.length / withDue.length : 0;

  if (
    contract.status === "completed" ||
    (related.length > 0 && completedCount === related.length)
  ) {
    return {
      health: "completed",
      label: "Complete",
      daysBehind: 0,
      daysAhead: 0,
      plannedPercent: 1,
      actualPercent: related.length > 0 ? 1 : actualPercent,
      detail: related.length > 0 ? "All milestones are complete." : "Project is complete.",
    };
  }

  if (related.length === 0) {
    return {
      health: "no_dates",
      label: "No milestones",
      daysBehind: 0,
      daysAhead: 0,
      plannedPercent: 0,
      actualPercent: 0,
      detail: "Add milestones with due dates to track schedule.",
    };
  }

  const overdue = related.filter((m) => {
    if (m.status === "completed") return false;
    const due = parseDateOnly(m.due_date);
    if (!due) return false;
    // Expected date has passed (due date strictly before today).
    return due.getTime() < today.getTime();
  });

  if (overdue.length > 0) {
    const daysBehind = Math.max(
      ...overdue.map((m) => {
        const due = parseDateOnly(m.due_date)!;
        return daysBetween(due, today);
      })
    );
    const names = overdue
      .map((m) => m.milestone_name?.trim() || "Untitled milestone")
      .slice(0, 2)
      .join(", ");
    const more = overdue.length > 2 ? ` (+${overdue.length - 2} more)` : "";
    return {
      health: "behind",
      label: "Behind schedule",
      daysBehind,
      daysAhead: 0,
      plannedPercent,
      actualPercent,
      detail:
        overdue.length === 1
          ? `${names} was due ${overdue[0].due_date} (${daysBehind} day${
              daysBehind === 1 ? "" : "s"
            } overdue).`
          : `${overdue.length} milestones overdue: ${names}${more}.`,
    };
  }

  const upcoming = [...related]
    .filter((m) => m.status !== "completed" && parseDateOnly(m.due_date))
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];

  return {
    health: "on_schedule",
    label: "On schedule",
    daysBehind: 0,
    daysAhead: 0,
    plannedPercent,
    actualPercent,
    detail: upcoming
      ? `Next: ${upcoming.milestone_name?.trim() || "Milestone"} due ${upcoming.due_date}.`
      : "Milestones are on track.",
  };
}

export function scheduleBadgeClass(health: ScheduleHealth): string {
  switch (health) {
    case "behind":
      return "badge-error";
    case "ahead":
      return "badge-success";
    case "on_schedule":
      return "badge-success";
    case "completed":
      return "badge-info";
    case "not_started":
      return "badge-ghost";
    default:
      return "badge-warning";
  }
}
