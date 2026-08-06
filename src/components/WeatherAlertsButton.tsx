"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Cloud } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useDismissedAlerts } from "@/hooks/useDismissedAlerts";
import { buildWeatherAlerts } from "@/lib/alerts";
import { withoutDismissedAlerts } from "@/lib/dismissedAlerts";
import { canViewWeatherAlerts } from "@/lib/roles";

const PREVIEW_LIMIT = 5;

export function WeatherAlertsButton() {
  const { effectiveRole } = useAuth();
  const pathname = usePathname();
  const data = useContractData();
  const { dismissedSet, pruneAgainstLiveIds } = useDismissedAlerts();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const rawAlerts = useMemo(() => {
    if (data.loading || !canViewWeatherAlerts(effectiveRole)) return [];
    return buildWeatherAlerts(data.fieldLogs);
  }, [effectiveRole, data.loading, data.fieldLogs]);

  useEffect(() => {
    if (data.loading || !canViewWeatherAlerts(effectiveRole)) return;
    pruneAgainstLiveIds(rawAlerts.map((alert) => alert.id));
  }, [data.loading, effectiveRole, rawAlerts, pruneAgainstLiveIds]);

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

  if (!canViewWeatherAlerts(effectiveRole)) return null;

  const count = alerts.length;
  const preview = alerts.slice(0, PREVIEW_LIMIT);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-sm h-8 min-h-8 gap-1.5 items-center px-2"
        title={count > 0 ? `${count} weather alert${count === 1 ? "" : "s"}` : "Weather alerts"}
        aria-label={
          count > 0
            ? `Weather alerts, ${count} open`
            : "Weather alerts"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Cloud className="h-4 w-4 shrink-0" aria-hidden />
        {count > 0 ? (
          <span className="badge badge-warning badge-sm min-w-5 h-5 px-1.5 font-semibold tabular-nums leading-none">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-base-300 bg-base-200/60">
            <p className="text-sm font-semibold">Weather alerts</p>
            <span className="badge badge-ghost badge-sm tabular-nums">{count}</span>
          </div>
          {preview.length === 0 ? (
            <p className="px-3 py-6 text-sm opacity-60 text-center">
              No adverse weather on field logs right now.
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
                    <span className="badge badge-xs mt-1 shrink-0 badge-warning">
                      Weather
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
              href="/field-logs"
              className="btn btn-primary btn-sm w-full"
              onClick={() => setOpen(false)}
            >
              View field logs
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
