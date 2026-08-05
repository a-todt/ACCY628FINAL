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
