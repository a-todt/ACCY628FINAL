"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AccessAuditEntry } from "@/lib/types";
import { EmptyState, SectionCard } from "@/components/ui";

export function useActivityLog(entityTypes: string[], enabled = true) {
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
      .limit(50);

    if (queryError) {
      setError(queryError.message);
      setEntries([]);
    } else {
      setEntries((data as AccessAuditEntry[]) ?? []);
    }
    setLoading(false);
  }, [enabled, typesKey]);

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
    (typeof details.contract_name === "string" && details.contract_name) ||
    (typeof details.work_performed === "string" && details.work_performed) ||
    (typeof details.label === "string" && details.label) ||
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
}: {
  title?: string;
  entityTypes: string[];
  enabled?: boolean;
  refreshKey?: number;
}) {
  const { entries, loading, error, refresh } = useActivityLog(entityTypes, enabled);

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  if (!enabled) return null;

  return (
    <SectionCard title={title}>
      {loading ? (
        <div className="grid place-items-center py-8">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No changes logged yet"
          message="Cancel and delete actions will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-xs">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="text-sm">{row.actor_email || "—"}</td>
                  <td>
                    <span className="badge badge-ghost badge-sm capitalize">
                      {formatAction(row.action)}
                    </span>
                    <span className="ml-2 text-xs opacity-50">{row.entity_type}</span>
                  </td>
                  <td className="text-sm max-w-md truncate">{detailSummary(row.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
