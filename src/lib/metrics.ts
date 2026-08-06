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
  const totalCollectedFromPayments = relatedPayments.reduce(
    (sum, p) => sum + Number(p.payment_amount ?? 0),
    0
  );
  const totalCollected = Math.max(totalCollectedFromInvoices, totalCollectedFromPayments);
  const retainageHeld = relatedInvoices.reduce(
    (sum, i) => sum + Number(i.retainage_amount ?? 0),
    0
  );
  const totalCosts = relatedCosts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  const grossProfit = totalBilled - totalCosts;
  const grossMargin = totalBilled > 0 ? grossProfit / totalBilled : 0;

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
    outstanding: totalBilled - totalCollected,
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

/**
 * Compare planned calendar progress (start→end) with actual completion %.
 * Used on the client dashboard so owners can see if a job is on schedule.
 */
export function computeScheduleStatus(
  contract: Contract,
  actualCompletionPercent: number
): ScheduleStatus {
  const actualPercent = Math.max(0, Math.min(1, Number(actualCompletionPercent) || 0));

  if (contract.status === "completed" || actualPercent >= 0.999) {
    return {
      health: "completed",
      label: "Complete",
      daysBehind: 0,
      daysAhead: 0,
      plannedPercent: 1,
      actualPercent,
      detail: "Project is complete.",
    };
  }

  const start = parseDateOnly(contract.start_date);
  const end = parseDateOnly(contract.end_date);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return {
      health: "no_dates",
      label: "Schedule TBD",
      daysBehind: 0,
      daysAhead: 0,
      plannedPercent: 0,
      actualPercent,
      detail: "Add project start and end dates to track schedule.",
    };
  }

  const today = startOfDay(new Date());
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
  const elapsedDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (elapsedDays < 0) {
    return {
      health: "not_started",
      label: "Not started",
      daysBehind: 0,
      daysAhead: 0,
      plannedPercent: 0,
      actualPercent,
      detail: `Scheduled to start ${start.toLocaleDateString()}.`,
    };
  }

  const plannedPercent = Math.max(0, Math.min(1, elapsedDays / totalDays));
  const gapFraction = plannedPercent - actualPercent;
  const gapDays = Math.round(Math.abs(gapFraction) * totalDays);

  // Past planned end date and not complete → days past end is a clear behind signal
  if (today.getTime() > end.getTime() && actualPercent < 0.999) {
    const daysPastEnd = Math.round(
      (today.getTime() - end.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysBehind = Math.max(daysPastEnd, gapDays);
    return {
      health: "behind",
      label: "Behind schedule",
      daysBehind,
      daysAhead: 0,
      plannedPercent: 1,
      actualPercent,
      detail: `${daysBehind} day${daysBehind === 1 ? "" : "s"} past the planned end date.`,
    };
  }

  // Small buffer (~3% of schedule or 2 days) counts as on schedule
  const bufferDays = Math.max(2, Math.round(totalDays * 0.03));
  if (gapFraction > bufferDays / totalDays) {
    return {
      health: "behind",
      label: "Behind schedule",
      daysBehind: gapDays,
      daysAhead: 0,
      plannedPercent,
      actualPercent,
      detail: `About ${gapDays} day${gapDays === 1 ? "" : "s"} behind the planned pace.`,
    };
  }

  if (gapFraction < -(bufferDays / totalDays)) {
    return {
      health: "ahead",
      label: "Ahead of schedule",
      daysBehind: 0,
      daysAhead: gapDays,
      plannedPercent,
      actualPercent,
      detail: `About ${gapDays} day${gapDays === 1 ? "" : "s"} ahead of the planned pace.`,
    };
  }

  return {
    health: "on_schedule",
    label: "On schedule",
    daysBehind: 0,
    daysAhead: 0,
    plannedPercent,
    actualPercent,
    detail: "Progress matches the planned timeline.",
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

