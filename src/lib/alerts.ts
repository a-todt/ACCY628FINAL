import { buildInsuranceWarnings } from "@/lib/insurance";
import { daysPastDue } from "@/lib/metrics";
import { isBadWeather } from "@/lib/weather";
import type {
  ChangeOrder,
  ContractInsuranceRequirement,
  FieldLog,
  InsurancePolicy,
  Invoice,
  Subcontractor,
  UserRole,
} from "@/lib/types";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory = "invoice" | "insurance" | "weather" | "change_order";

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
}

export interface AlertSourceData {
  invoices: Invoice[];
  fieldLogs: FieldLog[];
  changeOrders: ChangeOrder[];
  insurancePolicies: InsurancePolicy[];
  insuranceRequirements: ContractInsuranceRequirement[];
  subcontractors: Subcontractor[];
}

function canSeeFinancialAlerts(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

function canSeeWeatherAlerts(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

function canSeeInsuranceAlerts(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function buildAlertsForRole(role: UserRole, data: AlertSourceData): AlertItem[] {
  const alerts: AlertItem[] = [];
  const now = new Date().toISOString();

  if (role === "client" || canSeeFinancialAlerts(role)) {
    for (const invoice of data.invoices) {
      const outstanding =
        Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0) -
        Number(invoice.amount_paid ?? 0);
      const overdue =
        (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
        daysPastDue(invoice.due_date) > 0;
      if (!overdue || outstanding <= 0.01) continue;
      alerts.push({
        id: `invoice-overdue-${invoice.id}`,
        severity: "critical",
        category: "invoice",
        title: `Overdue invoice ${invoice.invoice_number ?? ""}`.trim(),
        detail: `${invoice.contracts?.contract_name ?? "Project"} · ${daysPastDue(invoice.due_date)} days past due`,
        href: `/invoices/${invoice.id}`,
        createdAt: invoice.due_date ?? invoice.created_at ?? now,
      });
    }
  }

  if (canSeeInsuranceAlerts(role)) {
    const warnings = buildInsuranceWarnings(
      data.insurancePolicies,
      data.insuranceRequirements,
      data.subcontractors
    );
    warnings.forEach((warning, index) => {
      const critical = /expired/i.test(warning);
      alerts.push({
        id: `insurance-${index}-${warning.slice(0, 24)}`,
        severity: critical ? "critical" : "warning",
        category: "insurance",
        title: critical ? "Insurance expired" : "Insurance attention needed",
        detail: warning,
        href: "/contracts/overview",
        createdAt: now,
      });
    });
  }

  if (canSeeWeatherAlerts(role)) {
    for (const log of data.fieldLogs) {
      if ((log.status ?? "active") === "canceled") continue;
      if (!isBadWeather(log.weather_conditions)) continue;
      alerts.push({
        id: `weather-${log.id}`,
        severity: "warning",
        category: "weather",
        title: "Adverse weather on field log",
        detail: `${log.contracts?.contract_name ?? "Project"} · ${log.weather_conditions ?? "Bad weather"} · ${log.log_date ?? ""}`,
        href: "/field-logs",
        createdAt: log.log_date ?? log.created_at ?? now,
      });
    }
  }

  if (canSeeFinancialAlerts(role)) {
    for (const co of data.changeOrders) {
      if (co.status !== "pending") continue;
      alerts.push({
        id: `co-pending-${co.id}`,
        severity: "info",
        category: "change_order",
        title: `Pending change order ${co.change_order_number ?? ""}`.trim(),
        detail: `${co.contracts?.contract_name ?? "Project"} · ${co.description ?? "Awaiting decision"}`,
        href: "/change-orders",
        createdAt: co.created_at ?? now,
      });
    }
  }

  return alerts.sort((a, b) => {
    const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const bySeverity = severityRank[a.severity] - severityRank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}
