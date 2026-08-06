"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useDismissedAlerts } from "@/hooks/useDismissedAlerts";
import { buildAlertsForRole } from "@/lib/alerts";
import { withoutDismissedAlerts } from "@/lib/dismissedAlerts";
import { labelize } from "@/lib/metrics";

const PREVIEW_LIMIT = 5;

export function AlertsBell() {
  const { effectiveRole } = useAuth();
  const pathname = usePathname();
  const data = useContractData();
  const { dismissedSet, pruneAgainstLiveIds } = useDismissedAlerts();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const rawAlerts = useMemo(() => {
    if (data.loading) return [];
    return buildAlertsForRole(effectiveRole, {
      invoices: data.invoices,
      fieldLogs: data.fieldLogs,
      changeOrders: data.changeOrders,
    });
  }, [
    effectiveRole,
    data.loading,
    data.invoices,
    data.fieldLogs,
    data.changeOrders,
  ]);

  useEffect(() => {
    if (data.loading) return;
    pruneAgainstLiveIds(rawAlerts.map((alert) => alert.id));
  }, [data.loading, rawAlerts, pruneAgainstLiveIds]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const alerts = useMemo(
    () => withoutDismissedAlerts(rawAlerts, dismissedSet),
    [rawAlerts, dismissedSet]
  );

  const count = alerts.length;
  const preview = alerts.slice(0, PREVIEW_LIMIT);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-sm h-8 min-h-8 gap-1.5 items-center px-2"
        title={count > 0 ? `${count} open alerts` : "Alerts"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-4 w-4 shrink-0" aria-hidden />
        {count > 0 ? (
          <span className="badge badge-error badge-sm min-w-5 h-5 px-1.5 font-semibold tabular-nums leading-none">
            {count > 99 ? "99+" : count}
          </span>
        ) : (
          <span className="hidden sm:inline text-sm leading-none">Alerts</span>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-base-300 bg-base-200/60">
            <p className="text-sm font-semibold">Notifications</p>
            <span className="badge badge-ghost badge-sm tabular-nums">{count}</span>
          </div>
          {preview.length === 0 ? (
            <p className="px-3 py-6 text-sm opacity-60 text-center">
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-base-300">
              {preview.map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={alert.href}
                    className="flex items-start gap-2 px-3 py-2.5 hover:bg-base-200/70 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <span
                      className={`badge badge-xs mt-1 shrink-0 ${
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
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-tight line-clamp-1">
                        {alert.title}
                      </span>
                      <span className="block text-xs opacity-60 mt-0.5 line-clamp-1">
                        {alert.detail}
                      </span>
                      <span className="block text-xs text-primary mt-0.5 line-clamp-1">
                        {alert.action}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-40 shrink-0 mt-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-base-300 p-2 bg-base-100">
            <Link
              href="/alerts"
              className="btn btn-primary btn-sm w-full"
              onClick={() => setOpen(false)}
            >
              View all alerts
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
