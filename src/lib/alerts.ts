import { daysPastDue, labelize, money } from "@/lib/metrics";
import { canViewFraudAlerts } from "@/lib/roles";
import { isBadWeather } from "@/lib/weather";
import type {
  ChangeOrder,
  Contract,
  CostEntry,
  FieldLog,
  Invoice,
  Payment,
  UserRole,
} from "@/lib/types";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory = "invoice" | "weather" | "change_order" | "fraud";

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  /** Short next step shown in the inbox / bell. */
  action: string;
  href: string;
  createdAt: string;
}

export interface AlertSourceData {
  invoices: Invoice[];
  fieldLogs: FieldLog[];
  changeOrders: ChangeOrder[];
  payments?: Payment[];
  costEntries?: CostEntry[];
  contracts?: Contract[];
}

function canSeeFinancialAlerts(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value);
}

/** Adverse field-log weather — shown in the PM weather inbox, not the main alerts feed. */
export function buildWeatherAlerts(fieldLogs: FieldLog[]): AlertItem[] {
  const now = new Date().toISOString();
  const alerts: AlertItem[] = [];

  for (const log of fieldLogs) {
    if ((log.status ?? "active") === "canceled") continue;
    if (!isBadWeather(log.weather_conditions)) continue;

    const project = log.contracts?.contract_name?.trim() || "Project";
    const weather = log.weather_conditions ?? "Bad weather";
    const params = new URLSearchParams();
    params.set("q", project);
    params.set("id", log.id);

    alerts.push({
      id: `weather-${log.id}`,
      severity: "warning",
      category: "weather",
      title: `Adverse weather — ${project}`,
      detail: `${weather}${log.log_date ? ` · ${log.log_date}` : ""}`,
      action: "Open field log to review impact and adjust the schedule",
      href: `/field-logs?${params.toString()}`,
      createdAt: log.log_date ?? log.created_at ?? now,
    });
  }

  return alerts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

const LARGE_CO_THRESHOLD = 50_000;
const COST_SPIKE_RATIO = 1.15;

/** Rule-based fraud / control exceptions — owner + admin inbox (no ML scoring). */
function buildFraudAlerts(data: AlertSourceData, now: string): AlertItem[] {
  const alerts: AlertItem[] = [];
  const payments = data.payments ?? [];
  const costs = data.costEntries ?? [];
  const contracts = data.contracts ?? [];
  const invoices = data.invoices;

  // 1) Payments awaiting owner dual-approval
  for (const payment of payments) {
    if ((payment.approval_status ?? "posted") !== "pending_approval") continue;
    const invoice = invoices.find((i) => i.id === payment.invoice_id);
    const number = invoice?.invoice_number?.trim() || "Invoice";
    const project = invoice?.contracts?.contract_name ?? "Project";
    alerts.push({
      id: `fraud-payment-pending-${payment.id}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — payment awaiting approval · ${money(payment.payment_amount)}`,
      detail: `${number} · ${project}${payment.reference_number ? ` · Ref ${payment.reference_number}` : ""}`,
      action: "Open invoice to approve or reject this payment (dual approval)",
      href: `/invoices/${payment.invoice_id}?tab=payments`,
      createdAt: payment.submitted_at ?? payment.created_at ?? now,
    });
  }

  // 2) Overpayment vs net amount due (posted AR)
  for (const invoice of invoices) {
    const net = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
    const paid = Number(invoice.amount_paid ?? 0);
    if (net <= 0 || paid <= net + 0.01) continue;
    const over = paid - net;
    const number = invoice.invoice_number?.trim() || "Invoice";
    alerts.push({
      id: `fraud-overpayment-${invoice.id}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — ${number} overpaid by ${money(over)}`,
      detail: `${invoice.contracts?.contract_name ?? "Project"} · Paid ${money(paid)} vs net due ${money(net)}`,
      action: "Review payment history and correct the overpayment",
      href: `/invoices/${invoice.id}`,
      createdAt: invoice.created_at ?? now,
    });
  }

  // 2b) Zero-dollar or negative payments (should never post)
  for (const payment of payments) {
    const amount = Number(payment.payment_amount ?? 0);
    if (amount > 0.005) continue;
    if ((payment.approval_status ?? "posted") === "rejected") continue;
    const invoice = invoices.find((i) => i.id === payment.invoice_id);
    const number = invoice?.invoice_number?.trim() || "Invoice";
    alerts.push({
      id: `fraud-payment-zero-${payment.id}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — $0 / blank payment on ${number}`,
      detail: `${invoice?.contracts?.contract_name ?? "Project"} · Payment amount ${money(amount)}`,
      action: "Delete or correct this payment — zero-dollar payments are not allowed",
      href: `/invoices/${payment.invoice_id}?tab=payments`,
      createdAt: payment.submitted_at ?? payment.created_at ?? now,
    });
  }

  // 2c) Single payment larger than the invoice net due
  for (const payment of payments) {
    if ((payment.approval_status ?? "posted") === "rejected") continue;
    const amount = Number(payment.payment_amount ?? 0);
    if (amount <= 0.005) continue;
    const invoice = invoices.find((i) => i.id === payment.invoice_id);
    if (!invoice) continue;
    const net = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0);
    if (net <= 0 || amount <= net + 0.01) continue;
    const number = invoice.invoice_number?.trim() || "Invoice";
    alerts.push({
      id: `fraud-payment-oversize-${payment.id}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — payment ${money(amount)} exceeds ${number} net due`,
      detail: `${invoice.contracts?.contract_name ?? "Project"} · Net due ${money(net)}`,
      action: "Reject or reverse this payment — amount exceeds the invoice",
      href: `/invoices/${payment.invoice_id}?tab=payments`,
      createdAt: payment.submitted_at ?? payment.created_at ?? now,
    });
  }

  // 3) Duplicate invoice numbers across contracts
  const byNumber = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    const key = (invoice.invoice_number ?? "").trim().toLowerCase();
    if (!key) continue;
    const list = byNumber.get(key) ?? [];
    list.push(invoice);
    byNumber.set(key, list);
  }
  for (const [key, list] of byNumber) {
    if (list.length < 2) continue;
    const first = list[0];
    alerts.push({
      id: `fraud-dup-invoice-${key}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — duplicate invoice number “${first.invoice_number}”`,
      detail: `${list.length} invoices share this number — possible duplicate billing`,
      action: "Open invoices and verify each billing is unique",
      href: `/invoices`,
      createdAt: first.created_at ?? now,
    });
  }

  // 4) Large pending change orders
  for (const co of data.changeOrders) {
    if (co.status !== "pending") continue;
    const amount = Number(co.amount ?? 0);
    if (amount < LARGE_CO_THRESHOLD) continue;
    const number = co.change_order_number?.trim() || "Change order";
    const q = co.change_order_number?.trim() || co.description?.trim() || "";
    alerts.push({
      id: `fraud-large-co-${co.id}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — large pending CO · ${money(amount)}`,
      detail: `${number} · ${co.contracts?.contract_name ?? "Project"}`,
      action: "Review and approve/reject before work is billed",
      href: q ? `/change-orders?q=${encodeQuery(q)}` : "/change-orders",
      createdAt: co.created_at ?? now,
    });
  }

  // 5) Job costs exceeding billed × spike ratio (or revised value if no billings)
  for (const contract of contracts) {
    const contractCosts = costs
      .filter((c) => c.contract_id === contract.id)
      .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
    if (contractCosts <= 0) continue;
    const billed = invoices
      .filter((i) => i.contract_id === contract.id)
      .reduce((sum, i) => sum + Number(i.invoice_amount ?? 0), 0);
    const baseline = billed > 0 ? billed : Number(contract.original_value ?? 0);
    if (baseline <= 0) continue;
    if (contractCosts <= baseline * COST_SPIKE_RATIO) continue;
    alerts.push({
      id: `fraud-cost-spike-${contract.id}`,
      severity: "critical",
      category: "fraud",
      title: `Potential fraud — cost spike on ${contract.contract_name}`,
      detail: `Costs ${money(contractCosts)} exceed ${billed > 0 ? "billings" : "contract value"} ${money(baseline)} by >15%`,
      action: "Review cost entries and billing status for this job",
      href: `/contracts/${contract.id}`,
      createdAt: contract.created_at ?? now,
    });
  }

  // 6) Posted payment missing reference number
  for (const payment of payments) {
    if ((payment.approval_status ?? "posted") !== "posted") continue;
    if ((payment.reference_number ?? "").trim()) continue;
    const invoice = invoices.find((i) => i.id === payment.invoice_id);
    alerts.push({
      id: `fraud-payment-noref-${payment.id}`,
      severity: "warning",
      category: "fraud",
      title: `Potential fraud — posted payment missing reference #`,
      detail: `${invoice?.invoice_number ?? "Invoice"} · ${money(payment.payment_amount)}`,
      action: "Add a check/ACH reference for audit trail completeness",
      href: `/invoices/${payment.invoice_id}`,
      createdAt: payment.payment_date ?? payment.created_at ?? now,
    });
  }

  return alerts;
}

export function alertBadgeLabel(alert: AlertItem): string {
  if (alert.category === "fraud") return "Potential fraud";
  if (alert.category === "invoice" && alert.severity === "critical") return "Overdue";
  return labelize(alert.severity);
}

/** High-contrast fraud styling that stays readable on light backgrounds. */
export function alertBadgeClass(alert: AlertItem, size: "xs" | "sm" = "sm"): string {
  const sizeClass = size === "xs" ? "badge-xs" : "badge-sm";
  if (alert.category === "fraud") {
    return `${sizeClass} border border-red-900 bg-red-700 text-white font-semibold`;
  }
  if (alert.severity === "critical") return `${sizeClass} badge-error`;
  if (alert.severity === "warning") return `${sizeClass} badge-warning`;
  return `${sizeClass} badge-info`;
}

export function alertRowClass(alert: AlertItem): string {
  if (alert.category === "fraud") {
    return "rounded-md bg-red-50 border border-red-200 border-l-[6px] border-l-red-700 my-1 px-1.5";
  }
  return "";
}

export function alertTitleClass(alert: AlertItem): string {
  if (alert.category === "fraud") return "text-red-950 font-semibold";
  return "";
}

export function alertDetailClass(alert: AlertItem): string {
  if (alert.category === "fraud") return "text-red-900";
  return "opacity-70";
}

export function alertMetaClass(alert: AlertItem): string {
  if (alert.category === "fraud") return "text-red-800 font-medium";
  return "opacity-50";
}

export function buildAlertsForRole(role: UserRole, data: AlertSourceData): AlertItem[] {
  const alerts: AlertItem[] = [];
  const now = new Date().toISOString();
  const isClient = role === "client";

  if (isClient || canSeeFinancialAlerts(role)) {
    for (const invoice of data.invoices) {
      const outstanding =
        Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0) -
        Number(invoice.amount_paid ?? 0);
      const overdue =
        (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
        daysPastDue(invoice.due_date) > 0;
      if (!overdue || outstanding <= 0.01) continue;

      const days = daysPastDue(invoice.due_date);
      const project = invoice.contracts?.contract_name ?? "Project";
      const number = invoice.invoice_number?.trim() || "Invoice";

      alerts.push({
        id: `invoice-overdue-${invoice.id}`,
        severity: "critical",
        category: "invoice",
        title: `${number} is ${days} day${days === 1 ? "" : "s"} overdue`,
        detail: `${project} · ${money(outstanding)} outstanding`,
        action: isClient
          ? "Open invoice to review balance and arrange payment"
          : "Open invoice to record a payment or follow up with the client",
        href: `/invoices/${invoice.id}`,
        createdAt: invoice.due_date ?? invoice.created_at ?? now,
      });
    }
  }

  if (canSeeFinancialAlerts(role)) {
    for (const co of data.changeOrders) {
      if (co.status !== "pending") continue;

      const number = co.change_order_number?.trim() || "Change order";
      const project = co.contracts?.contract_name ?? "Project";
      const q = co.change_order_number?.trim() || co.description?.trim() || "";
      const href = q ? `/change-orders?q=${encodeQuery(q)}` : "/change-orders";

      alerts.push({
        id: `co-pending-${co.id}`,
        severity: "info",
        category: "change_order",
        title: `${number} awaiting decision`,
        detail: `${project}${co.description ? ` · ${co.description}` : ""}`,
        action: "Open change order to approve or reject",
        href,
        createdAt: co.created_at ?? now,
      });
    }
  }

  if (canViewFraudAlerts(role)) {
    alerts.push(...buildFraudAlerts(data, now));
  }

  // Fraud first, then severity, then newest.
  return alerts.sort((a, b) => {
    const fraudRank = (alert: AlertItem) => (alert.category === "fraud" ? 0 : 1);
    const byFraud = fraudRank(a) - fraudRank(b);
    if (byFraud !== 0) return byFraud;
    const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const bySeverity = severityRank[a.severity] - severityRank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}
