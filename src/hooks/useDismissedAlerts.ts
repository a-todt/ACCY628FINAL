"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { pruneDismissedAlertIds } from "@/lib/dismissedAlerts";

const STORAGE_PREFIX = "gc_dismissed_alerts_";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readDismissed(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writeDismissed(userId: string, ids: string[]) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
}

export function useDismissedAlerts() {
  const { user } = useAuth();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setDismissedIds([]);
      setReady(true);
      return;
    }
    setDismissedIds(readDismissed(user.id));
    setReady(true);
  }, [user]);

  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds]);

  const dismissAlert = useCallback(
    (id: string) => {
      if (!user || !id) return;
      setDismissedIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        writeDismissed(user.id, next);
        return next;
      });
    },
    [user]
  );

  const dismissAlerts = useCallback(
    (ids: readonly string[]) => {
      if (!user || ids.length === 0) return;
      setDismissedIds((prev) => {
        const next = Array.from(new Set([...prev, ...ids]));
        if (next.length === prev.length) return prev;
        writeDismissed(user.id, next);
        return next;
      });
    },
    [user]
  );

  const isDismissed = useCallback(
    (id: string) => dismissedSet.has(id),
    [dismissedSet]
  );

  /** Drop stored dismissals for alerts that no longer exist. */
  const pruneAgainstLiveIds = useCallback(
    (liveAlertIds: readonly string[]) => {
      if (!user) return;
      setDismissedIds((prev) => {
        const next = pruneDismissedAlertIds(prev, liveAlertIds);
        if (next.length === prev.length) return prev;
        writeDismissed(user.id, next);
        return next;
      });
    },
    [user]
  );

  return {
    ready,
    dismissedIds,
    dismissedSet,
    isDismissed,
    dismissAlert,
    dismissAlerts,
    pruneAgainstLiveIds,
  };
}
