import type {
  ChangeOrder,
  Contract,
  ContractMetrics,
  CostEntry,
  Invoice,
  Milestone,
  Payment,
  RevenueRecognitionMethod,
} from "./types";

export function money(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function moneyExact(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
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

export function recognitionMethodLabel(
  method: RevenueRecognitionMethod | null | undefined
): string {
  if (method === "completed_contract") return "Completed Contract";
  return "Percentage of Completion";
}

export function recognitionMethodShort(
  method: RevenueRecognitionMethod | null | undefined
): string {
  if (method === "completed_contract") return "Completed";
  return "POC";
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

  const revenueRecognitionMethod: RevenueRecognitionMethod =
    contract.revenue_recognition_method === "completed_contract"
      ? "completed_contract"
      : "percentage_of_completion";

  const estimatedTotalCost = Number(contract.estimated_total_cost ?? 0);
  const missingCostEstimate =
    revenueRecognitionMethod === "percentage_of_completion" && estimatedTotalCost <= 0;

  let completionPercent = 0;
  let earnedRevenue = 0;

  if (revenueRecognitionMethod === "completed_contract") {
    if (contract.status === "completed") {
      completionPercent = 1;
      earnedRevenue = revisedValue;
    } else {
      completionPercent = 0;
      earnedRevenue = 0;
    }
  } else if (estimatedTotalCost > 0) {
    completionPercent = Math.min(totalCosts / estimatedTotalCost, 1);
    earnedRevenue = revisedValue * completionPercent;
  }

  const recognizedGrossProfit = earnedRevenue - totalCosts;
  const recognizedGrossMargin = earnedRevenue > 0 ? recognizedGrossProfit / earnedRevenue : 0;
  const billingsInExcess = Math.max(0, totalBilled - earnedRevenue);
  const unbilledRevenue = Math.max(0, earnedRevenue - totalBilled);

  // milestones kept for schedule UI; intentionally unused for recognition %
  void milestones;

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
    revenueRecognitionMethod,
    earnedRevenue,
    recognizedGrossProfit,
    recognizedGrossMargin,
    billingsInExcess,
    unbilledRevenue,
    missingCostEstimate,
  };
}

export function daysPastDue(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  const diff = today.getTime() - due.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
