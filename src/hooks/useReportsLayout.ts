"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  defaultReportsLayout,
  normalizeReportsLayout,
  type ReportsLayoutPrefs,
} from "@/lib/reportsLayout";
import type { ReportsTimeFilter } from "@/lib/reportsTimeFilter";

const STORAGE_PREFIX = "gc_reports_layout_v1_";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readLayout(userId: string): ReportsLayoutPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return defaultReportsLayout();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as ReportsLayoutPrefs).panes)) {
      return defaultReportsLayout();
    }
    return normalizeReportsLayout(parsed as ReportsLayoutPrefs);
  } catch {
    return defaultReportsLayout();
  }
}

function writeLayout(userId: string, prefs: ReportsLayoutPrefs) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
}

function clearPaneField(
  paneDisplay: ReportsLayoutPrefs["paneDisplay"],
  field: "numbers" | "graphs"
): ReportsLayoutPrefs["paneDisplay"] {
  const next: ReportsLayoutPrefs["paneDisplay"] = {};
  for (const [id, value] of Object.entries(paneDisplay)) {
    const entry = { ...value };
    delete entry[field];
    if (entry.numbers !== undefined || entry.graphs !== undefined) next[id] = entry;
  }
  return next;
}

export function useReportsLayout() {
  const { user } = useAuth();
  const [layout, setLayoutState] = useState<ReportsLayoutPrefs>(() => defaultReportsLayout());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setLayoutState(defaultReportsLayout());
      setReady(true);
      return;
    }
    setLayoutState(readLayout(user.id));
    setReady(true);
  }, [user]);

  const persist = useCallback(
    (next: ReportsLayoutPrefs) => {
      setLayoutState(next);
      if (user) writeLayout(user.id, next);
    },
    [user]
  );

  const setLayout = useCallback(
    (next: ReportsLayoutPrefs | { panes: string[] }) => {
      setLayoutState((prev) => {
        const normalized = normalizeReportsLayout({
          ...prev,
          panes: next.panes,
          showSummaryNumbers:
            "showSummaryNumbers" in next && typeof next.showSummaryNumbers === "boolean"
              ? next.showSummaryNumbers
              : prev.showSummaryNumbers,
          showGraphs:
            "showGraphs" in next && typeof next.showGraphs === "boolean"
              ? next.showGraphs
              : prev.showGraphs,
          timeFilter:
            "timeFilter" in next && next.timeFilter ? next.timeFilter : prev.timeFilter,
          paneDisplay:
            "paneDisplay" in next && next.paneDisplay ? next.paneDisplay : prev.paneDisplay,
        });
        if (user) writeLayout(user.id, normalized);
        return normalized;
      });
    },
    [user]
  );

  const resetLayout = useCallback(() => {
    persist(defaultReportsLayout());
  }, [persist]);

  const setShowSummaryNumbers = useCallback(
    (showSummaryNumbers: boolean) => {
      setLayoutState((prev) => {
        const next = normalizeReportsLayout({
          ...prev,
          showSummaryNumbers,
          paneDisplay: clearPaneField(prev.paneDisplay, "numbers"),
        });
        if (user) writeLayout(user.id, next);
        return next;
      });
    },
    [user]
  );

  const setShowGraphs = useCallback(
    (showGraphs: boolean) => {
      setLayoutState((prev) => {
        const next = normalizeReportsLayout({
          ...prev,
          showGraphs,
          paneDisplay: clearPaneField(prev.paneDisplay, "graphs"),
        });
        if (user) writeLayout(user.id, next);
        return next;
      });
    },
    [user]
  );

  const setPaneNumbers = useCallback(
    (paneId: string, numbers: boolean) => {
      setLayoutState((prev) => {
        const next = normalizeReportsLayout({
          ...prev,
          paneDisplay: {
            ...prev.paneDisplay,
            [paneId]: { ...prev.paneDisplay[paneId], numbers },
          },
        });
        if (user) writeLayout(user.id, next);
        return next;
      });
    },
    [user]
  );

  const setPaneGraphs = useCallback(
    (paneId: string, graphs: boolean) => {
      setLayoutState((prev) => {
        const next = normalizeReportsLayout({
          ...prev,
          paneDisplay: {
            ...prev.paneDisplay,
            [paneId]: { ...prev.paneDisplay[paneId], graphs },
          },
        });
        if (user) writeLayout(user.id, next);
        return next;
      });
    },
    [user]
  );

  const setTimeFilter = useCallback(
    (timeFilter: ReportsTimeFilter | ((prev: ReportsTimeFilter) => ReportsTimeFilter)) => {
      setLayoutState((prev) => {
        const resolved =
          typeof timeFilter === "function" ? timeFilter(prev.timeFilter) : timeFilter;
        const next = normalizeReportsLayout({ ...prev, timeFilter: resolved });
        if (user) writeLayout(user.id, next);
        return next;
      });
    },
    [user]
  );

  const enabledSet = useMemo(() => new Set(layout.panes), [layout.panes]);

  return {
    ready,
    layout,
    setLayout,
    resetLayout,
    setShowSummaryNumbers,
    setShowGraphs,
    setPaneNumbers,
    setPaneGraphs,
    setTimeFilter,
    isEnabled: (id: string) => enabledSet.has(id),
  };
}
