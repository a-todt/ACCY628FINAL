import type { ChangeOrder, Contract, CostEntry, Invoice, Payment } from "@/lib/types";

export type PeriodMode = "month" | "year";

export interface WipProjectLike {
  id: string;
  project_name: string;
  /** Linked GC contract when set; preferred over name matching. */
  contract_id?: string | null;
  estimated_total_cost?: number | null;
  revised_contract_value?: number | null;
}

export interface WipCostLike {
  project_id: string;
  amount: number | null;
  cost_date: string | null;
}

export interface WipBillingLike {
  project_id: string;
  amount_billed: number | null;
  billing_date: string | null;
}

export interface PeriodReportRow {
  contractId: string;
  contractName: string;
  /** YYYY for year mode; YYYY-MM for month mode; "unspecified" for undated activity */
  periodKey: string;
  periodLabel: string;
  expenses: number;
  billed: number;
  collected: number;
  earnedPeriod: number;
  earnedYtd: number;
  grossBilled: number;
  grossEarned: number;
  wipExpenses: number | null;
  wipBilled: number | null;
  hasWipMatch: boolean;
}

export interface PeriodReportResult {
  rows: PeriodReportRow[];
  totals: Omit<
    PeriodReportRow,
    "contractId" | "contractName" | "periodKey" | "periodLabel" | "hasWipMatch"
  > & {
    hasWipMatch: boolean;
  };
  unspecified: PeriodReportRow | null;
  availableYears: number[];
}

function num(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Parse ISO date / date-only string to UTC date parts. Returns null if invalid/empty. */
export function parseDateParts(
  value: string | null | undefined
): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function monthKey(value: string | null | undefined): string | null {
  const p = parseDateParts(value);
  if (!p) return null;
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

export function yearKey(value: string | null | undefined): number | null {
  const p = parseDateParts(value);
  return p ? p.y : null;
}

export function matchWipProject(
  contract: Pick<Contract, "contract_name">,
  projects: WipProjectLike[]
): WipProjectLike | null {
  const target = normalizeName(contract.contract_name);
  if (!target) return null;
  return projects.find((p) => normalizeName(p.project_name) === target) ?? null;
}

/** Prefer projects.contract_id; fall back to name match for unlinked rows. */
export function resolveWipProject(
  contract: Pick<Contract, "id" | "contract_name">,
  projects: WipProjectLike[]
): WipProjectLike | null {
  const byId = projects.find((p) => p.contract_id && p.contract_id === contract.id);
  if (byId) return byId;
  return matchWipProject(contract, projects);
}

export function revisedContractValue(
  contract: Pick<Contract, "id" | "original_value">,
  changeOrders: Array<Pick<ChangeOrder, "contract_id" | "status" | "amount">>
): number {
  const approved = changeOrders
    .filter((c) => c.contract_id === contract.id && c.status === "approved")
    .reduce((sum, c) => sum + num(c.amount), 0);
  return num(contract.original_value) + approved;
}

export function estimateTotalCost(params: {
  revisedValue: number;
  costsToDate: number;
  wipProject: WipProjectLike | null;
}): number {
  if (params.wipProject) {
    const fromProject = num(params.wipProject.estimated_total_cost);
    if (fromProject > 0) return fromProject;
  }
  return Math.max(params.costsToDate, params.revisedValue * 0.85);
}

export function earnedContractValue(params: {
  revisedValue: number;
  wipProject: WipProjectLike | null;
}): number {
  if (params.wipProject) {
    const fromProject = num(params.wipProject.revised_contract_value);
    if (fromProject > 0) return fromProject;
  }
  return params.revisedValue;
}

/** Cost-to-cost earned revenue (pure; mirrors computeWIP revenueEarned). */
export function costToCostEarned(
  estimatedTotalCost: number,
  revisedContractValue: number,
  actualCostsToDate: number
): number {
  const estimate = num(estimatedTotalCost);
  const value = num(revisedContractValue);
  const costs = num(actualCostsToDate);
  const completionRatio = estimate > 0 ? Math.min(costs / estimate, 1) : 0;
  return completionRatio * value;
}

/** Cumulative cost-to-cost earned through an inclusive YYYY-MM-DD end date. */
export function cumulativeEarned(params: {
  costs: Array<{ amount: number | null; date_incurred: string | null }>;
  revisedValue: number;
  wipProject: WipProjectLike | null;
  throughDate: string | null;
}): number {
  const costsToDate = params.costs
    .filter((c) => {
      if (!params.throughDate) return Boolean(c.date_incurred);
      if (!c.date_incurred) return false;
      return c.date_incurred.slice(0, 10) <= params.throughDate;
    })
    .reduce((sum, c) => sum + num(c.amount), 0);

  const estimated = estimateTotalCost({
    revisedValue: params.revisedValue,
    costsToDate,
    wipProject: params.wipProject,
  });
  const contractValue = earnedContractValue({
    revisedValue: params.revisedValue,
    wipProject: params.wipProject,
  });

  return costToCostEarned(estimated, contractValue, costsToDate);
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function priorMonthEnd(year: number, month: number): string {
  if (month === 1) return lastDayOfMonth(year - 1, 12);
  return lastDayOfMonth(year, month - 1);
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function emptyMoneyTotals() {
  return {
    expenses: 0,
    billed: 0,
    collected: 0,
    earnedPeriod: 0,
    earnedYtd: 0,
    grossBilled: 0,
    grossEarned: 0,
    wipExpenses: 0,
    wipBilled: 0,
    hasWipMatch: false,
  };
}

function sumRows(rows: PeriodReportRow[]) {
  const totals = emptyMoneyTotals();
  for (const row of rows) {
    totals.expenses += row.expenses;
    totals.billed += row.billed;
    totals.collected += row.collected;
    totals.earnedPeriod += row.earnedPeriod;
    totals.earnedYtd += row.earnedYtd;
    totals.grossBilled += row.grossBilled;
    totals.grossEarned += row.grossEarned;
    if (row.wipExpenses != null) totals.wipExpenses += row.wipExpenses;
    if (row.wipBilled != null) totals.wipBilled += row.wipBilled;
    if (row.hasWipMatch) totals.hasWipMatch = true;
  }
  return totals;
}

export function collectAvailableYears(params: {
  costEntries: Array<{ date_incurred: string | null }>;
  invoices: Array<{ invoice_date: string | null }>;
  payments: Array<{ payment_date: string | null }>;
  projectCosts: Array<{ cost_date: string | null }>;
  billings: Array<{ billing_date: string | null }>;
}): number[] {
  const years = new Set<number>();
  const add = (date: string | null | undefined) => {
    const y = yearKey(date);
    if (y) years.add(y);
  };
  for (const c of params.costEntries) add(c.date_incurred);
  for (const i of params.invoices) add(i.invoice_date);
  for (const p of params.payments) add(p.payment_date);
  for (const c of params.projectCosts) add(c.cost_date);
  for (const b of params.billings) add(b.billing_date);
  years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

export interface BuildPeriodRowsInput {
  contracts: Contract[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  changeOrders: ChangeOrder[];
  projects: WipProjectLike[];
  projectCosts: WipCostLike[];
  billings: WipBillingLike[];
  mode: PeriodMode;
  year: number;
  contractId?: string | null;
  activityOnly?: boolean;
}

export function buildPeriodRows(input: BuildPeriodRowsInput): PeriodReportResult {
  const {
    contracts,
    costEntries,
    invoices,
    payments,
    changeOrders,
    projects,
    projectCosts,
    billings,
    mode,
    year,
  } = input;

  const contractId = input.contractId || null;
  const scopedContracts = contractId
    ? contracts.filter((c) => c.id === contractId)
    : contracts;

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  const availableYears = collectAvailableYears({
    costEntries,
    invoices,
    payments,
    projectCosts,
    billings,
  });

  const rows: PeriodReportRow[] = [];
  let unspecifiedExpenses = 0;
  let unspecifiedBilled = 0;
  let unspecifiedCollected = 0;
  let unspecifiedWipExp = 0;
  let unspecifiedWipBilled = 0;
  let unspecifiedHasWip = false;

  for (const contract of scopedContracts) {
    const wip = resolveWipProject(contract, projects);
    const revised = revisedContractValue(contract, changeOrders);
    const relatedCosts = costEntries.filter((c) => c.contract_id === contract.id);
    const relatedInvoices = invoices.filter((i) => i.contract_id === contract.id);
    const invoiceIds = new Set(relatedInvoices.map((i) => i.id));
    const relatedPayments = payments.filter((p) => {
      if (invoiceIds.has(p.invoice_id)) return true;
      const inv = invoiceById.get(p.invoice_id);
      return inv?.contract_id === contract.id;
    });
    const relatedWipCosts = wip
      ? projectCosts.filter((c) => c.project_id === wip.id)
      : [];
    const relatedWipBillings = wip
      ? billings.filter((b) => b.project_id === wip.id)
      : [];

    for (const c of relatedCosts) {
      if (!monthKey(c.date_incurred)) unspecifiedExpenses += num(c.amount);
    }
    for (const i of relatedInvoices) {
      if (!monthKey(i.invoice_date)) unspecifiedBilled += num(i.invoice_amount);
    }
    for (const p of relatedPayments) {
      if (!monthKey(p.payment_date)) unspecifiedCollected += num(p.payment_amount);
    }
    for (const c of relatedWipCosts) {
      if (!monthKey(c.cost_date)) {
        unspecifiedWipExp += num(c.amount);
        unspecifiedHasWip = true;
      }
    }
    for (const b of relatedWipBillings) {
      if (!monthKey(b.billing_date)) {
        unspecifiedWipBilled += num(b.amount_billed);
        unspecifiedHasWip = true;
      }
    }

    const fillAllMonths = Boolean(contractId) && mode === "month";
    const activityOnly = input.activityOnly ?? !fillAllMonths;

    if (mode === "year") {
      const periodEnd = `${year}-12-31`;
      const priorEnd = `${year - 1}-12-31`;
      const expenses = relatedCosts
        .filter((c) => yearKey(c.date_incurred) === year)
        .reduce((s, c) => s + num(c.amount), 0);
      const billed = relatedInvoices
        .filter((i) => yearKey(i.invoice_date) === year)
        .reduce((s, i) => s + num(i.invoice_amount), 0);
      const collected = relatedPayments
        .filter((p) => yearKey(p.payment_date) === year)
        .reduce((s, p) => s + num(p.payment_amount), 0);
      const earnedYtd = cumulativeEarned({
        costs: relatedCosts,
        revisedValue: revised,
        wipProject: wip,
        throughDate: periodEnd,
      });
      const earnedPrior = cumulativeEarned({
        costs: relatedCosts,
        revisedValue: revised,
        wipProject: wip,
        throughDate: priorEnd,
      });
      const earnedPeriod = earnedYtd - earnedPrior;
      const wipExpenses = wip
        ? relatedWipCosts
            .filter((c) => yearKey(c.cost_date) === year)
            .reduce((s, c) => s + num(c.amount), 0)
        : null;
      const wipBilledAmt = wip
        ? relatedWipBillings
            .filter((b) => yearKey(b.billing_date) === year)
            .reduce((s, b) => s + num(b.amount_billed), 0)
        : null;

      const hasActivity =
        expenses !== 0 ||
        billed !== 0 ||
        collected !== 0 ||
        earnedPeriod !== 0 ||
        (wipExpenses ?? 0) !== 0 ||
        (wipBilledAmt ?? 0) !== 0;

      if (!activityOnly || hasActivity) {
        rows.push({
          contractId: contract.id,
          contractName: contract.contract_name,
          periodKey: String(year),
          periodLabel: String(year),
          expenses,
          billed,
          collected,
          earnedPeriod,
          earnedYtd,
          grossBilled: billed - expenses,
          grossEarned: earnedPeriod - expenses,
          wipExpenses,
          wipBilled: wipBilledAmt,
          hasWipMatch: Boolean(wip),
        });
      }
      continue;
    }

    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const periodEnd = lastDayOfMonth(year, month);
      const priorEnd = priorMonthEnd(year, month);

      const expenses = relatedCosts
        .filter((c) => monthKey(c.date_incurred) === key)
        .reduce((s, c) => s + num(c.amount), 0);
      const billed = relatedInvoices
        .filter((i) => monthKey(i.invoice_date) === key)
        .reduce((s, i) => s + num(i.invoice_amount), 0);
      const collected = relatedPayments
        .filter((p) => monthKey(p.payment_date) === key)
        .reduce((s, p) => s + num(p.payment_amount), 0);

      const earnedCum = cumulativeEarned({
        costs: relatedCosts,
        revisedValue: revised,
        wipProject: wip,
        throughDate: periodEnd,
      });
      const earnedPrior = cumulativeEarned({
        costs: relatedCosts,
        revisedValue: revised,
        wipProject: wip,
        throughDate: priorEnd,
      });
      const earnedPeriod = earnedCum - earnedPrior;

      const wipExpenses = wip
        ? relatedWipCosts
            .filter((c) => monthKey(c.cost_date) === key)
            .reduce((s, c) => s + num(c.amount), 0)
        : null;
      const wipBilledAmt = wip
        ? relatedWipBillings
            .filter((b) => monthKey(b.billing_date) === key)
            .reduce((s, b) => s + num(b.amount_billed), 0)
        : null;

      const hasActivity =
        expenses !== 0 ||
        billed !== 0 ||
        collected !== 0 ||
        earnedPeriod !== 0 ||
        (wipExpenses ?? 0) !== 0 ||
        (wipBilledAmt ?? 0) !== 0;

      if (fillAllMonths || !activityOnly || hasActivity) {
        rows.push({
          contractId: contract.id,
          contractName: contract.contract_name,
          periodKey: key,
          periodLabel: monthLabel(year, month),
          expenses,
          billed,
          collected,
          earnedPeriod,
          earnedYtd: earnedCum,
          grossBilled: billed - expenses,
          grossEarned: earnedPeriod - expenses,
          wipExpenses,
          wipBilled: wipBilledAmt,
          hasWipMatch: Boolean(wip),
        });
      }
    }
  }

  rows.sort((a, b) => {
    const byName = a.contractName.localeCompare(b.contractName);
    if (byName !== 0) return byName;
    return a.periodKey.localeCompare(b.periodKey);
  });

  const totals = sumRows(rows);
  if (contractId && mode === "month" && rows.length > 0) {
    totals.earnedYtd = rows[rows.length - 1]?.earnedYtd ?? 0;
  }

  const unspecifiedTotal =
    unspecifiedExpenses +
    unspecifiedBilled +
    unspecifiedCollected +
    unspecifiedWipExp +
    unspecifiedWipBilled;

  const unspecified: PeriodReportRow | null =
    unspecifiedTotal > 0.005
      ? {
          contractId: contractId ?? "all",
          contractName: contractId
            ? (scopedContracts[0]?.contract_name ?? "Unspecified")
            : "All projects",
          periodKey: "unspecified",
          periodLabel: "Unspecified date",
          expenses: unspecifiedExpenses,
          billed: unspecifiedBilled,
          collected: unspecifiedCollected,
          earnedPeriod: 0,
          earnedYtd: 0,
          grossBilled: unspecifiedBilled - unspecifiedExpenses,
          grossEarned: -unspecifiedExpenses,
          wipExpenses: unspecifiedHasWip ? unspecifiedWipExp : null,
          wipBilled: unspecifiedHasWip ? unspecifiedWipBilled : null,
          hasWipMatch: unspecifiedHasWip,
        }
      : null;

  return { rows, totals, unspecified, availableYears };
}
