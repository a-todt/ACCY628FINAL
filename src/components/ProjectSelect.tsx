"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { WIP_DB, colStr, selectList, type DbRow } from "@/lib/wipSchema";

const P = WIP_DB.projects;

type ProjectSelectProps = {
  value: string;
  onChange: (projectId: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  emptyLabel?: string;
  /** Bump after creating a project so options reload. */
  refreshKey?: number | string;
};

/**
 * Loads options from public.projects for the signed-in user.
 * Displays projects.project_name; option value is projects.id.
 */
export function ProjectSelect({
  value,
  onChange,
  required = false,
  className = "select select-bordered",
  id,
  disabled = false,
  emptyLabel = "Select project…",
  refreshKey = 0,
}: ProjectSelectProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data, error: loadError } = await supabase
        .from(P.table)
        .select(selectList(P.pk, P.name, P.status))
        .eq(P.userId, user.id)
        .order(P.name, { ascending: true });

      if (loadError) throw loadError;
      setRows((data ?? []) as unknown as DbRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-1">
      <select
        id={id}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled || loading || !user}
      >
        <option value="">{loading ? "Loading projects…" : emptyLabel}</option>
        {rows.map((row) => {
          const projectId = colStr(row, P.pk);
          const name = colStr(row, P.name, "Untitled project");
          return (
            <option key={projectId} value={projectId}>
              {name}
            </option>
          );
        })}
      </select>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="text-xs opacity-60">No projects found for your account.</p>
      ) : null}
    </div>
  );
}
