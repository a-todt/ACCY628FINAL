import { daysPastDue, money } from "@/lib/metrics";
import { isBadWeather } from "@/lib/weather";
import type { ChangeOrder, FieldLog, Invoice, UserRole } from "@/lib/types";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory = "invoice" | "weather" | "change_order";

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

function encodeQuery(value: string): string {
  return encodeURIComponent(value);
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

  if (canSeeWeatherAlerts(role)) {
    for (const log of data.fieldLogs) {
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

  return alerts.sort((a, b) => {
    const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const bySeverity = severityRank[a.severity] - severityRank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}
