"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AccessAuditEntry } from "@/lib/types";
import { EmptyState, SectionCard } from "@/components/ui";

export function useActivityLog(entityTypes: string[], enabled = true, limit = 50) {
  const [entries, setEntries] = useState<AccessAuditEntry[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const typesKey = useMemo(() => entityTypes.slice().sort().join("|"), [entityTypes]);

  const load = useCallback(async () => {
    const types = typesKey ? typesKey.split("|") : [];
    if (!enabled || types.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("access_audit_log")
      .select("*")
      .in("entity_type", types)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (queryError) {
      setError(queryError.message);
      setEntries([]);
    } else {
      setEntries((data as AccessAuditEntry[]) ?? []);
    }
    setLoading(false);
  }, [enabled, typesKey, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, loading, error, refresh: load };
}

function formatAction(action: string) {
  return action.replace(/_/g, " ");
}

function detailSummary(details: Record<string, unknown> | null) {
  if (!details) return "—";
  const name =
    (typeof details.invoice_number === "string" && details.invoice_number) ||
    (typeof details.contract_name === "string" && details.contract_name) ||
    (typeof details.work_performed === "string" && details.work_performed) ||
    (typeof details.label === "string" && details.label) ||
    (typeof details.description === "string" && details.description) ||
    null;
  const from = typeof details.from_status === "string" ? details.from_status : null;
  const to = typeof details.to_status === "string" ? details.to_status : null;
  if (name && from && to) return `${name} (${from} → ${to})`;
  if (name) return name;
  if (from && to) return `${from} → ${to}`;
  return JSON.stringify(details);
}

export function ActivityLogPanel({
  title = "Change Log",
  entityTypes,
  enabled = true,
  refreshKey = 0,
  limit = 50,
  compact = false,
  emptyTitle = "No changes logged yet",
  emptyMessage = "Cancel and delete actions will appear here.",
}: {
  title?: string;
  entityTypes: string[];
  enabled?: boolean;
  refreshKey?: number;
  limit?: number;
  compact?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  const { entries, loading, error, refresh } = useActivityLog(entityTypes, enabled, limit);

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  if (!enabled) return null;

  return (
    <SectionCard compact={compact} title={title}>
      {loading ? (
        <div className={`grid place-items-center ${compact ? "py-4" : "py-8"}`}>
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : entries.length === 0 ? (
        compact ? (
          <p className="text-xs opacity-60 py-2">{emptyMessage}</p>
        ) : (
          <EmptyState title={emptyTitle} message={emptyMessage} />
        )
      ) : (
        <table className={`table table-fixed w-full ${compact ? "table-xs text-[11px]" : "table-sm"}`}>
          <thead>
            <tr>
              <th className="w-[22%]">When</th>
              <th className="w-[22%]">Who</th>
              <th className="w-[22%]">Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap text-xs truncate">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="text-sm truncate">{row.actor_email || "—"}</td>
                <td className="truncate">
                  <span className="badge badge-ghost badge-sm capitalize">
                    {formatAction(row.action)}
                  </span>
                </td>
                <td className="text-sm truncate">{detailSummary(row.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
