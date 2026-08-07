"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  defaultReportsTimeFilter,
  type ReportsTimeFilter,
  type ReportsTimeGrain,
} from "@/lib/reportsTimeFilter";

const STORAGE_PREFIX = "gc_dashboard_time_v1_";
const GRAINS = new Set<ReportsTimeGrain>(["all", "year", "quarter", "month"]);

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function normalizeTimeFilter(raw: unknown): ReportsTimeFilter {
  const defaults = defaultReportsTimeFilter();
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Partial<ReportsTimeFilter>;
  const grain =
    typeof obj.grain === "string" && GRAINS.has(obj.grain as ReportsTimeGrain)
      ? (obj.grain as ReportsTimeGrain)
      : defaults.grain;
  const year =
    typeof obj.year === "number" && Number.isFinite(obj.year) ? Math.trunc(obj.year) : defaults.year;
  const quarterRaw = typeof obj.quarter === "number" ? Math.trunc(obj.quarter) : defaults.quarter;
  const quarter = ([1, 2, 3, 4].includes(quarterRaw) ? quarterRaw : defaults.quarter) as
    | 1
    | 2
    | 3
    | 4;
  const monthRaw = typeof obj.month === "number" ? Math.trunc(obj.month) : defaults.month;
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : defaults.month;
  return { grain, year, quarter, month };
}

function readFilter(userId: string): ReportsTimeFilter {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return defaultReportsTimeFilter();
    return normalizeTimeFilter(JSON.parse(raw) as unknown);
  } catch {
    return defaultReportsTimeFilter();
  }
}

export function useDashboardTimeFilter() {
  const { user } = useAuth();
  const [timeFilter, setTimeFilterState] = useState<ReportsTimeFilter>(() =>
    defaultReportsTimeFilter()
  );

  useEffect(() => {
    if (!user) {
      setTimeFilterState(defaultReportsTimeFilter());
      return;
    }
    setTimeFilterState(readFilter(user.id));
  }, [user]);

  const setTimeFilter = useCallback(
    (next: ReportsTimeFilter | ((prev: ReportsTimeFilter) => ReportsTimeFilter)) => {
      setTimeFilterState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const normalized = normalizeTimeFilter(resolved);
        if (user) {
          window.localStorage.setItem(storageKey(user.id), JSON.stringify(normalized));
        }
        return normalized;
      });
    },
    [user]
  );

  return { timeFilter, setTimeFilter };
}
