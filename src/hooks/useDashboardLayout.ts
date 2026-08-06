"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  dashboardRoleKey,
  defaultLayoutForRole,
  normalizeLayout,
  type DashboardLayoutPrefs,
} from "@/lib/dashboardLayout";
import type { UserRole } from "@/lib/types";

const STORAGE_PREFIX = "gc_dashboard_layout_v2_";

function storageKey(userId: string, role: UserRole) {
  return `${STORAGE_PREFIX}${userId}_${dashboardRoleKey(role)}`;
}

function readLayout(userId: string, role: UserRole): DashboardLayoutPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(userId, role));
    if (!raw) return defaultLayoutForRole(role);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as DashboardLayoutPrefs).panes)) {
      return defaultLayoutForRole(role);
    }
    return normalizeLayout(role, parsed as DashboardLayoutPrefs);
  } catch {
    return defaultLayoutForRole(role);
  }
}

function writeLayout(userId: string, role: UserRole, prefs: DashboardLayoutPrefs) {
  window.localStorage.setItem(storageKey(userId, role), JSON.stringify(prefs));
}

export function useDashboardLayout(role: UserRole) {
  const { user } = useAuth();
  const [layout, setLayoutState] = useState<DashboardLayoutPrefs>(() =>
    defaultLayoutForRole(role)
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setLayoutState(defaultLayoutForRole(role));
      setReady(true);
      return;
    }
    setLayoutState(readLayout(user.id, role));
    setReady(true);
  }, [user, role]);

  const setLayout = useCallback(
    (next: DashboardLayoutPrefs) => {
      const normalized = normalizeLayout(role, next);
      setLayoutState(normalized);
      if (user) writeLayout(user.id, role, normalized);
    },
    [user, role]
  );

  const resetLayout = useCallback(() => {
    const defaults = defaultLayoutForRole(role);
    setLayoutState(defaults);
    if (user) writeLayout(user.id, role, defaults);
  }, [user, role]);

  const enabledSet = useMemo(() => new Set(layout.panes), [layout.panes]);

  return {
    ready,
    layout,
    setLayout,
    resetLayout,
    isEnabled: (id: string) => enabledSet.has(id),
  };
}
