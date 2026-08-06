"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/export";
import { labelize } from "@/lib/metrics";
import { ROLE_LABELS } from "@/lib/roles";
import type { AccessAuditEntry, UserProfile, UserRole } from "@/lib/types";
import { AlertBanner, EmptyState, SectionCard } from "@/components/ui";

type SortKey =
  | "date"
  | "time"
  | "user"
  | "role"
  | "action"
  | "entityType"
  | "related"
  | "change";

type SortDir = "asc" | "desc";

interface AuditRow {
  id: string;
  date: string;
  time: string;
  timestamp: number;
  user: string;
  role: string;
  roleRaw: string;
  action: string;
  entityType: string;
  related: string;
  change: string;
  entityId: string;
}

function formatAction(action: string) {
  return action.replace(/_/g, " ");
}

function relatedName(entry: AccessAuditEntry): string {
  const d = entry.details;
  if (!d) return "—";
  const candidates = [
    d.contract_name,
    d.invoice_number,
    d.company_name,
    d.work_performed,
    d.label,
    d.full_name,
    d.email,
    d.client_name,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof d.contract_id === "string" && d.contract_id) {
    return `Contract ${d.contract_id.slice(0, 8)}…`;
  }
  return "—";
}

function changeSummary(entry: AccessAuditEntry): string {
  const d = entry.details;
  if (!d) return formatAction(entry.action);
  const from = typeof d.from_status === "string" ? d.from_status : null;
  const to = typeof d.to_status === "string" ? d.to_status : null;
  if (from && to) return `${labelize(from)} → ${labelize(to)}`;

  const parts: string[] = [];
  if (typeof d.description === "string" && d.description) parts.push(d.description);
  if (typeof d.work_performed === "string" && d.work_performed) parts.push(d.work_performed);
  if (typeof d.role === "string" && d.role) parts.push(`Role: ${labelize(d.role)}`);
  if (typeof d.client_email === "string" && d.client_email) parts.push(d.client_email);
  if (parts.length > 0) return parts.join(" · ");
  return formatAction(entry.action);
}

function compareText(a: string, b: string, dir: SortDir) {
  const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AccessAuditEntry[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [filterDate, setFilterDate] = useState("");
  const [filterTime, setFilterTime] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterRelated, setFilterRelated] = useState("");
  const [filterChange, setFilterChange] = useState("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = createClient();
      const [auditRes, profilesRes] = await Promise.all([
        supabase
          .from("access_audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("user_profiles").select("*"),
      ]);

      if (cancelled) return;

      if (auditRes.error) {
        setError(auditRes.error.message);
        setEntries([]);
      } else {
        setEntries((auditRes.data as AccessAuditEntry[]) ?? []);
      }

      if (!profilesRes.error) {
        setProfiles((profilesRes.data as UserProfile[]) ?? []);
      }

      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const profileById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  const rows = useMemo<AuditRow[]>(() => {
    return entries.map((entry) => {
      const created = new Date(entry.created_at);
      const profile = entry.actor_user_id ? profileById.get(entry.actor_user_id) : undefined;
      const roleRaw = profile?.role ?? "";
      const roleLabel = roleRaw
        ? ROLE_LABELS[roleRaw as UserRole] ?? labelize(roleRaw)
        : "—";
      const userName =
        profile?.full_name ||
        profile?.email ||
        entry.actor_email ||
        (entry.actor_user_id ? entry.actor_user_id.slice(0, 8) : "—");

      return {
        id: entry.id,
        date: created.toLocaleDateString(),
        time: created.toLocaleTimeString(),
        timestamp: created.getTime(),
        user: userName,
        role: roleLabel,
        roleRaw,
        action: formatAction(entry.action),
        entityType: entry.entity_type ? labelize(entry.entity_type) : "—",
        related: relatedName(entry),
        change: changeSummary(entry),
        entityId: entry.entity_id ?? "",
      };
    });
  }, [entries, profileById]);

  const entityTypes = useMemo(() => {
    const set = new Set(rows.map((r) => r.entityType).filter((v) => v !== "—"));
    return Array.from(set).sort();
  }, [rows]);

  const rolesInLog = useMemo(() => {
    const set = new Set(rows.map((r) => r.roleRaw).filter(Boolean));
    return Array.from(set).sort() as UserRole[];
  }, [rows]);

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (filterDate && !row.date.toLowerCase().includes(filterDate.toLowerCase())) return false;
      if (filterTime && !row.time.toLowerCase().includes(filterTime.toLowerCase())) return false;
      if (filterUser && !row.user.toLowerCase().includes(filterUser.toLowerCase())) return false;
      if (filterRole !== "all" && row.roleRaw !== filterRole) return false;
      if (filterAction && !row.action.toLowerCase().includes(filterAction.toLowerCase())) return false;
      if (filterEntity !== "all" && row.entityType !== filterEntity) return false;
      if (filterRelated && !row.related.toLowerCase().includes(filterRelated.toLowerCase())) return false;
      if (filterChange && !row.change.toLowerCase().includes(filterChange.toLowerCase())) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortKey === "date" || sortKey === "time") {
        const cmp = a.timestamp - b.timestamp;
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "user") return compareText(a.user, b.user, sortDir);
      if (sortKey === "role") return compareText(a.role, b.role, sortDir);
      if (sortKey === "action") return compareText(a.action, b.action, sortDir);
      if (sortKey === "entityType") return compareText(a.entityType, b.entityType, sortDir);
      if (sortKey === "related") return compareText(a.related, b.related, sortDir);
      return compareText(a.change, b.change, sortDir);
    });
  }, [
    rows,
    filterDate,
    filterTime,
    filterUser,
    filterRole,
    filterAction,
    filterEntity,
    filterRelated,
    filterChange,
    sortKey,
    sortDir,
  ]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" || key === "time" ? "desc" : "asc");
    }
  };

  const onExport = () => {
    const exportRows = filtered.map((row) => ({
      Date: row.date,
      Time: row.time,
      User: row.user,
      "Permission Level": row.role,
      Action: row.action,
      "Entity Type": row.entityType,
      "Related Record": row.related,
      Change: row.change,
      "Entity ID": row.entityId || "",
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`audit-log-${stamp}.csv`, exportRows);
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-semibold hover:text-primary"
      onClick={() => onSort(key)}
    >
      {label}
      <SortIcon active={sortKey === key} dir={sortDir} />
    </button>
  );

  return (
    <SectionCard
      title="Audit Log"
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={onExport}>
          <Download className="h-4 w-4" />
          Export .csv
        </button>
      }
    >
      <p className="text-sm opacity-70 -mt-1 mb-4">
        Complete record of system edits with user, permission level, and related records.
      </p>

      {filtered.length === 0 && rows.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          message="Edits across contracts, field logs, management, and access actions will appear here."
          action={
            <div className="flex items-center gap-2 text-sm opacity-60">
              <ScrollText className="h-4 w-4" /> Waiting for activity
            </div>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <div className="xl:hidden flex flex-wrap gap-2 p-3 border-b border-base-300 bg-base-100">
            <select
              className="select select-bordered select-xs min-w-[8rem]"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              aria-label="Filter permission level"
            >
              <option value="all">All roles</option>
              {rolesInLog.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <input
              className="input input-bordered input-xs min-w-[8rem] flex-1"
              placeholder="Filter related record"
              value={filterRelated}
              onChange={(e) => setFilterRelated(e.target.value)}
            />
            <input
              className="input input-bordered input-xs min-w-[8rem] flex-1"
              placeholder="Filter what changed"
              value={filterChange}
              onChange={(e) => setFilterChange(e.target.value)}
            />
          </div>
          <table className="table table-sm">
            <thead>
              <tr className="bg-base-200">
                <th>{headerBtn("date", "Date")}</th>
                <th>{headerBtn("time", "Time")}</th>
                <th>{headerBtn("user", "User")}</th>
                <th className="hidden xl:table-cell">{headerBtn("role", "Permission Level")}</th>
                <th>{headerBtn("action", "Action")}</th>
                <th>{headerBtn("entityType", "Entity Type")}</th>
                <th className="hidden xl:table-cell">{headerBtn("related", "Related Record")}</th>
                <th className="hidden xl:table-cell">{headerBtn("change", "What Changed")}</th>
              </tr>
              <tr className="bg-base-100">
                <th className="font-normal">
                  <input
                    className="input input-bordered input-xs w-full min-w-[6rem]"
                    placeholder="Filter date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  />
                </th>
                <th className="font-normal">
                  <input
                    className="input input-bordered input-xs w-full min-w-[6rem]"
                    placeholder="Filter time"
                    value={filterTime}
                    onChange={(e) => setFilterTime(e.target.value)}
                  />
                </th>
                <th className="font-normal">
                  <input
                    className="input input-bordered input-xs w-full min-w-[8rem]"
                    placeholder="Filter user"
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                  />
                </th>
                <th className="font-normal hidden xl:table-cell">
                  <select
                    className="select select-bordered select-xs w-full min-w-[8rem]"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                  >
                    <option value="all">All roles</option>
                    {rolesInLog.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="font-normal">
                  <input
                    className="input input-bordered input-xs w-full min-w-[8rem]"
                    placeholder="Filter action"
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                  />
                </th>
                <th className="font-normal">
                  <select
                    className="select select-bordered select-xs w-full min-w-[8rem]"
                    value={filterEntity}
                    onChange={(e) => setFilterEntity(e.target.value)}
                  >
                    <option value="all">All types</option>
                    {entityTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="font-normal hidden xl:table-cell">
                  <input
                    className="input input-bordered input-xs w-full min-w-[8rem]"
                    placeholder="Filter record"
                    value={filterRelated}
                    onChange={(e) => setFilterRelated(e.target.value)}
                  />
                </th>
                <th className="font-normal hidden xl:table-cell">
                  <input
                    className="input input-bordered input-xs w-full min-w-[8rem]"
                    placeholder="Filter change"
                    value={filterChange}
                    onChange={(e) => setFilterChange(e.target.value)}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center opacity-60 py-8">
                    No rows match the current header filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-base-200/50">
                    <td className="whitespace-nowrap">{row.date}</td>
                    <td className="whitespace-nowrap">{row.time}</td>
                    <td>{row.user}</td>
                    <td className="hidden xl:table-cell">
                      <span className="badge badge-ghost badge-sm">{row.role}</span>
                    </td>
                    <td
                      className="capitalize"
                      title={[row.role, row.related, row.change].filter(Boolean).join(" · ")}
                    >
                      {row.action}
                    </td>
                    <td>{row.entityType}</td>
                    <td className="max-w-[180px] truncate hidden xl:table-cell" title={row.related}>
                      {row.related}
                    </td>
                    <td className="max-w-[260px] truncate hidden xl:table-cell" title={row.change}>
                      {row.change}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs opacity-60 border-t border-base-300">
            Showing {filtered.length} of {rows.length} events
          </div>
        </div>
      )}
    </SectionCard>
  );
}
