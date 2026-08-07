import { isPostedPayment } from "@/lib/payments";
import {
  computeContractMetrics,
  computeScheduleStatus,
  daysPastDue,
  invoiceOpenAr,
} from "@/lib/metrics";
import { colNum, type DbRow, WIP_DB } from "@/lib/wipSchema";
import type {
  ChangeOrder,
  Contract,
  CostEntry,
  Invoice,
  Milestone,
  Payment,
  SafetyIncident,
} from "@/lib/types";

export type SchedulePulseKpis = {
  avgCompletion: number;
  jobsBehind: number;
  jobsOnTrack: number;
  overdueMilestones: number;
};

export type CashControlsKpis = {
  pendingApprovals: number;
  postedThisMonth: number;
  collectionRate: number;
  overdueAr: number;
};

export type WipPulseKpis = {
  netOverUnder: number;
  jobsUnderbilled: number;
  jobsOverbilled: number;
  avgCostPercentComplete: number;
};

export type CompliancePulseKpis = {
  openIncidents: number;
  highSeverityOpen: number;
};

export function computeSchedulePulseKpis(
  contracts: Contract[],
  changeOrders: ChangeOrder[],
  invoices: Invoice[],
  costs: CostEntry[],
  milestones: Milestone[],
  payments: Payment[] = []
): SchedulePulseKpis {
  const activeOrAll =
    contracts.filter((c) => c.status === "active").length > 0
      ? contracts.filter((c) => c.status === "active")
      : contracts;

  let completionSum = 0;
  let jobsBehind = 0;
  let jobsOnTrack = 0;

  for (const contract of activeOrAll) {
    const metrics = computeContractMetrics(
      contract,
      changeOrders,
      invoices,
      costs,
      milestones,
      payments
    );
    completionSum += metrics.completionPercent;
    const schedule = computeScheduleStatus(contract, milestones);
    if (schedule.health === "behind") jobsBehind += 1;
    else if (schedule.health === "on_schedule" || schedule.health === "ahead") jobsOnTrack += 1;
  }

  const overdueMilestones = milestones.filter((m) => {
    if (m.status === "completed" || !m.due_date) return false;
    return daysPastDue(m.due_date) > 0;
  }).length;

  return {
    avgCompletion: activeOrAll.length > 0 ? completionSum / activeOrAll.length : 0,
    jobsBehind,
    jobsOnTrack,
    overdueMilestones,
  };
}

export function computeCashControlsKpis(
  payments: Payment[],
  invoices: Invoice[],
  totalBilled: number,
  totalCollected: number
): CashControlsKpis {
  const pendingApprovals = payments.filter(
    (p) => (p.approval_status ?? "posted") === "pending_approval"
  ).length;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const postedThisMonth = payments
    .filter((p) => {
      if (!isPostedPayment(p) || !p.payment_date) return false;
      const d = new Date(`${p.payment_date}T00:00:00`);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);

  const overdueAr = invoices
    .filter(
      (i) =>
        (i.status === "unpaid" || i.status === "partially_paid") && daysPastDue(i.due_date) > 0
    )
    .reduce((sum, i) => sum + invoiceOpenAr(i), 0);

  return {
    pendingApprovals,
    postedThisMonth,
    collectionRate: totalBilled > 0 ? totalCollected / totalBilled : 0,
    overdueAr,
  };
}

function projectWipSlice(row: DbRow): {
  id: string;
  estimatedTotalCost: number;
  revisedContractValue: number;
} {
  return {
    id: String(row[WIP_DB.projects.pk] ?? ""),
    estimatedTotalCost: colNum(row, WIP_DB.projects.estimatedCost),
    revisedContractValue: colNum(row, WIP_DB.projects.contractValue),
  };
}

/**
 * Portfolio WIP KPIs from raw projects + cost/billing rows (RLS-scoped).
 */
export function computeWipPulseKpis(
  projectRows: DbRow[],
  costRows: DbRow[],
  billingRows: DbRow[]
): WipPulseKpis {
  const costsByProject = new Map<string, number>();
  for (const row of costRows) {
    const id = String(row[WIP_DB.projectCosts.fk] ?? "");
    if (!id) continue;
    costsByProject.set(id, (costsByProject.get(id) ?? 0) + colNum(row, WIP_DB.projectCosts.amount));
  }

  const billedByProject = new Map<string, number>();
  for (const row of billingRows) {
    const id = String(row[WIP_DB.billings.fk] ?? "");
    if (!id) continue;
    billedByProject.set(
      id,
      (billedByProject.get(id) ?? 0) + colNum(row, WIP_DB.billings.amountBilled)
    );
  }

  let netOverUnder = 0;
  let jobsUnderbilled = 0;
  let jobsOverbilled = 0;
  let completionSum = 0;
  let counted = 0;

  for (const row of projectRows) {
    const project = projectWipSlice(row);
    if (!project.id) continue;
    const costs = costsByProject.get(project.id) ?? 0;
    const billed = billedByProject.get(project.id) ?? 0;
    const ratio =
      project.estimatedTotalCost > 0
        ? Math.min(costs / project.estimatedTotalCost, 1)
        : 0;
    const earned = ratio * project.revisedContractValue;
    const overbilling = billed > earned ? billed - earned : 0;
    const underbilling = earned > billed ? earned - billed : 0;
    netOverUnder += overbilling - underbilling;
    if (underbilling > 0) jobsUnderbilled += 1;
    if (overbilling > 0) jobsOverbilled += 1;
    completionSum += ratio;
    counted += 1;
  }

  return {
    netOverUnder,
    jobsUnderbilled,
    jobsOverbilled,
    avgCostPercentComplete: counted > 0 ? completionSum / counted : 0,
  };
}

export function computeCompliancePulseKpis(incidents: SafetyIncident[]): CompliancePulseKpis {
  const openIncidents = incidents.filter((i) => i.status === "open");
  return {
    openIncidents: openIncidents.length,
    highSeverityOpen: openIncidents.filter((i) => i.severity === "high").length,
  };
}
