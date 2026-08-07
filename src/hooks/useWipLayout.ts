"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  defaultWipLayout,
  normalizeWipLayout,
  type WipLayoutPrefs,
} from "@/lib/wipLayout";

const STORAGE_PREFIX = "gc_wip_layout_v1_";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readLayout(userId: string): WipLayoutPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return defaultWipLayout();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as WipLayoutPrefs).panes)) {
      return defaultWipLayout();
    }
    return normalizeWipLayout(parsed as WipLayoutPrefs);
  } catch {
    return defaultWipLayout();
  }
}

function writeLayout(userId: string, prefs: WipLayoutPrefs) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
}

export function useWipLayout() {
  const { user } = useAuth();
  const [layout, setLayoutState] = useState<WipLayoutPrefs>(() => defaultWipLayout());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setLayoutState(defaultWipLayout());
      setReady(true);
      return;
    }
    setLayoutState(readLayout(user.id));
    setReady(true);
  }, [user]);

  const setLayout = useCallback(
    (next: WipLayoutPrefs) => {
      const normalized = normalizeWipLayout(next);
      setLayoutState(normalized);
      if (user) writeLayout(user.id, normalized);
    },
    [user]
  );

  const resetLayout = useCallback(() => {
    const defaults = defaultWipLayout();
    setLayoutState(defaults);
    if (user) writeLayout(user.id, defaults);
  }, [user]);

  const enabledSet = useMemo(() => new Set(layout.panes), [layout.panes]);

  return {
    ready,
    layout,
    setLayout,
    resetLayout,
    isEnabled: (id: string) => enabledSet.has(id),
  };
}
