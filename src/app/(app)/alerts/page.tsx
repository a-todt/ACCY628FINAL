"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useDismissedAlerts } from "@/hooks/useDismissedAlerts";
import { BulkActionBar } from "@/components/StickyToolbar";
import { useToast } from "@/components/ToastProvider";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import {
  buildAlertsForRole,
  alertBadgeClass,
  alertBadgeLabel,
  alertRowClass,
  alertTitleClass,
  alertDetailClass,
  alertMetaClass,
  type AlertCategory,
  type AlertSeverity,
} from "@/lib/alerts";
import { withoutDismissedAlerts } from "@/lib/dismissedAlerts";
import { labelize } from "@/lib/metrics";
import { canViewAlerts } from "@/lib/roles";

export default function AlertsPage() {
  const { effectiveRole } = useAuth();
  const data = useContractData();
  const { toast } = useToast();
  const {
    dismissedSet,
    dismissAlert,
    dismissAlerts,
    pruneAgainstLiveIds,
  } = useDismissedAlerts();
  const [severity, setSeverity] = useState<AlertSeverity | "all">("all");
  const [category, setCategory] = useState<AlertCategory | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const rawAlerts = useMemo(() => {
    if (data.loading) return [];
    return buildAlertsForRole(effectiveRole, {
      invoices: data.invoices,
      fieldLogs: data.fieldLogs,
      changeOrders: data.changeOrders,
      payments: data.payments,
      costEntries: data.costEntries,
      contracts: data.contracts,
      assignments: data.assignments,
      userProfiles: data.userProfiles,
    });
  }, [
    effectiveRole,
    data.loading,
    data.invoices,
    data.fieldLogs,
    data.changeOrders,
    data.payments,
    data.costEntries,
    data.contracts,
    data.assignments,
    data.userProfiles,
  ]);

  useEffect(() => {
    if (data.loading) return;
    pruneAgainstLiveIds(rawAlerts.map((alert) => alert.id));
  }, [data.loading, rawAlerts, pruneAgainstLiveIds]);

  const alerts = useMemo(
    () => withoutDismissedAlerts(rawAlerts, dismissedSet),
    [rawAlerts, dismissedSet]
  );

  const filtered = useMemo(
    () =>
      alerts.filter((alert) => {
        if (severity !== "all" && alert.severity !== severity) return false;
        if (category !== "all" && alert.category !== category) return false;
        return true;
      }),
    [alerts, severity, category]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((alert) => selectedIds.has(alert.id));

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      clearSelection();
      return;
    }
    setSelectedIds(new Set(filtered.map((alert) => alert.id)));
  };

  const clearOne = (id: string, title: string) => {
    dismissAlert(id);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast(`Cleared “${title}”`, "success");
  };

  const clearSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    dismissAlerts(ids);
    clearSelection();
    toast(`Cleared ${ids.length} alert${ids.length === 1 ? "" : "s"}`, "success");
  };

  if (data.loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!canViewAlerts(effectiveRole)) {
    return (
      <EmptyState
        title="Alerts not available"
        message="Your role does not use the alerts inbox. Field weather is tracked on field logs."
      />
    );
  }

  if (data.error) {
    return <AlertBanner type="error">{data.error}</AlertBanner>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        subtitle="Actionable warnings for overdue invoices, pending change orders, and control exceptions."
        actions={
          <span
            className={`badge badge-lg gap-1.5 font-medium tabular-nums ${
              alerts.length > 0 ? "badge-error" : "badge-ghost"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            {alerts.length} open
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-box border border-base-300 bg-base-100 shadow-sm">
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
          <option value="change_order">Change orders</option>
          <option value="fraud">Potential fraud</option>
        </select>
        {filtered.length > 0 ? (
          <label className="label cursor-pointer gap-2 py-0 ml-auto">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={allFilteredSelected}
              onChange={toggleSelectAllFiltered}
              aria-label="Select all visible alerts"
            />
            <span className="label-text text-sm">Select all</span>
          </label>
        ) : null}
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
        <SectionCard
          title={`Inbox (${filtered.length}${
            selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""
          })`}
        >
          <ul className="divide-y divide-base-300">
            {filtered.map((alert) => (
              <li
                key={alert.id}
                className={`flex items-start gap-2 py-3 px-1 ${alertRowClass(alert)}`}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm mt-1 shrink-0"
                  checked={selectedIds.has(alert.id)}
                  onChange={() => toggleSelected(alert.id)}
                  aria-label={`Select ${alert.title}`}
                />
                <Link
                  href={alert.href}
                  className="flex items-start gap-3 min-w-0 flex-1 hover:bg-base-200/60 rounded-lg transition-colors px-1 -mx-1 py-0.5"
                >
                  <span className={`badge mt-0.5 ${alertBadgeClass(alert, "sm")}`}>
                    {alertBadgeLabel(alert)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium leading-tight ${alertTitleClass(alert)}`}>
                      {alert.title}
                    </p>
                    <p className={`text-sm mt-0.5 ${alertDetailClass(alert)}`}>{alert.detail}</p>
                    <p className="text-sm text-primary mt-1">{alert.action}</p>
                    <p className={`text-xs mt-1 ${alertMetaClass(alert)}`}>
                      {alert.category === "fraud" ? "Potential fraud" : labelize(alert.category)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-40 shrink-0 mt-1" />
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square mt-0.5 shrink-0 opacity-60 hover:opacity-100 hover:text-error"
                  title="Clear alert"
                  aria-label={`Clear ${alert.title}`}
                  onClick={() => clearOne(alert.id, alert.title)}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <BulkActionBar count={selectedIds.size} onClear={clearSelection}>
        <button type="button" className="btn btn-error btn-sm gap-1.5" onClick={clearSelected}>
          <Trash2 className="h-3.5 w-3.5" />
          Clear selected
        </button>
      </BulkActionBar>
    </div>
  );
}
