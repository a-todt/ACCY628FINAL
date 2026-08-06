"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import {
  buildAlertsForRole,
  type AlertCategory,
  type AlertSeverity,
} from "@/lib/alerts";
import { labelize } from "@/lib/metrics";

export default function AlertsPage() {
  const { effectiveRole } = useAuth();
  const data = useContractData();
  const insurance = useInsuranceData();
  const [severity, setSeverity] = useState<AlertSeverity | "all">("all");
  const [category, setCategory] = useState<AlertCategory | "all">("all");

  const alerts = useMemo(() => {
    if (data.loading || insurance.loading) return [];
    return buildAlertsForRole(effectiveRole, {
      invoices: data.invoices,
      fieldLogs: data.fieldLogs,
      changeOrders: data.changeOrders,
      insurancePolicies: insurance.policies,
      insuranceRequirements: insurance.requirements,
      subcontractors: data.subcontractors,
    });
  }, [
    effectiveRole,
    data.loading,
    data.invoices,
    data.fieldLogs,
    data.changeOrders,
    data.subcontractors,
    insurance.loading,
    insurance.policies,
    insurance.requirements,
  ]);

  const filtered = useMemo(
    () =>
      alerts.filter((alert) => {
        if (severity !== "all" && alert.severity !== severity) return false;
        if (category !== "all" && alert.category !== category) return false;
        return true;
      }),
    [alerts, severity, category]
  );

  if (data.loading || insurance.loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (data.error) {
    return <AlertBanner type="error">{data.error}</AlertBanner>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        subtitle="Role-aware warnings for invoices, insurance, weather, and change orders."
        actions={
          <span className={`badge badge-lg gap-1.5 font-medium tabular-nums ${alerts.length > 0 ? "badge-error" : "badge-ghost"}`}>
            <Bell className="h-3.5 w-3.5" />
            {alerts.length} open
          </span>
        }
      />

      <div className="flex flex-wrap gap-2 p-3 rounded-box border border-base-300 bg-base-100 shadow-sm">
        <select
          className="select select-bordered select-sm"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as AlertSeverity | "all")}
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          className="select select-bordered select-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value as AlertCategory | "all")}
        >
          <option value="all">All categories</option>
          <option value="invoice">Invoices</option>
          <option value="insurance">Insurance</option>
          <option value="weather">Weather</option>
          <option value="change_order">Change orders</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No alerts"
          message={
            alerts.length === 0
              ? "Nothing needs attention for your role right now."
              : "Try adjusting the severity or category filters."
          }
        />
      ) : (
        <SectionCard title={`Inbox (${filtered.length})`}>
          <ul className="divide-y divide-base-300">
            {filtered.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  className="flex items-start gap-3 py-3 hover:bg-base-200/60 px-1 rounded-lg transition-colors"
                >
                  <span
                    className={`badge badge-sm mt-0.5 ${
                      alert.severity === "critical"
                        ? "badge-error"
                        : alert.severity === "warning"
                          ? "badge-warning"
                          : "badge-info"
                    }`}
                  >
                    {alert.category === "invoice" && alert.severity === "critical"
                      ? "Overdue"
                      : labelize(alert.severity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{alert.title}</p>
                    <p className="text-sm opacity-70 mt-0.5">{alert.detail}</p>
                    <p className="text-xs opacity-50 mt-1">{labelize(alert.category)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-40 shrink-0 mt-1" />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
