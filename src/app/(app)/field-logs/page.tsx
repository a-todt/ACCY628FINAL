"use client";

import { useMemo, useState, type FormEvent, Fragment } from "react";
import { Ban, Paperclip, Plus, Trash2 } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { AttachmentPanel } from "@/components/AttachmentPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { WeatherBadge } from "@/components/WeatherBadge";
import { writeAuditLog } from "@/lib/audit";
import { canCreateFieldLogs, canManageFieldLogEntries, statusBadgeClass } from "@/lib/roles";
import { labelize } from "@/lib/metrics";
import { WEATHER_OPTIONS, isBadWeather } from "@/lib/weather";
import { createClient } from "@/lib/supabase/client";
import type { FieldLog } from "@/lib/types";

const EMPTY_FORM = {
  contract_id: "",
  log_date: "",
  work_performed: "",
  hours_worked: "",
  workers_on_site: "",
  weather_conditions: "",
  equipment_used: "",
  materials_used: "",
  issues_or_delays: "",
  notes: "",
};

type SortKey = "date" | "contract" | "hours" | "workers" | "status";

export default function FieldLogsPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, fieldLogs, userProfiles, loading, error, refresh } =
    useContractData();
  const canCreate = canCreateFieldLogs(effectiveRole);
  const canManage = canManageFieldLogEntries(effectiveRole);
  const showActivityLog =
    canManage || effectiveRole === "admin" || effectiveRole === "owner";

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = fieldLogs.filter((log) => {
      const status = log.status ?? "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [log.work_performed, log.contracts?.contract_name, log.weather_conditions]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "date") return compareValues(a.log_date, b.log_date, sortDir);
      if (sortKey === "contract")
        return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "hours")
        return compareValues(Number(a.hours_worked ?? 0), Number(b.hours_worked ?? 0), sortDir);
      if (sortKey === "status")
        return compareValues(a.status ?? "active", b.status ?? "active", sortDir);
      return compareValues(Number(a.workers_on_site ?? 0), Number(b.workers_on_site ?? 0), sortDir);
    });
  }, [fieldLogs, search, statusFilter, sortKey, sortDir]);

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canActOnLog = (log: FieldLog) => {
    if (!canManage || !user) return false;
    if (effectiveRole === "admin" || effectiveRole === "owner" || effectiveRole === "project_manager") {
      return true;
    }
    return log.user_id === user.id;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!form.contract_id) {
      setFormError("Please select a project.");
      return;
    }
    if (!user) {
      setFormError("You must be signed in to submit a field log.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        contract_id: form.contract_id,
        user_id: user.id,
        log_date: form.log_date || null,
        work_performed: form.work_performed.trim() || null,
        hours_worked: form.hours_worked ? Number(form.hours_worked) : null,
        workers_on_site: form.workers_on_site ? Number(form.workers_on_site) : null,
        weather_conditions: form.weather_conditions.trim() || null,
        equipment_used: form.equipment_used.trim() || null,
        materials_used: form.materials_used.trim() || null,
        issues_or_delays: form.issues_or_delays.trim() || null,
        notes: form.notes.trim() || null,
      };
      const { data, error: insertError } = await supabase
        .from("field_logs")
        .insert(payload)
        .select("id")
        .single();
      if (insertError) throw insertError;

      await writeAuditLog("field_log_created", "field_log", data?.id, {
        contract_id: form.contract_id,
        work_performed: payload.work_performed,
        log_date: payload.log_date,
      });

      setSuccess("Field log submitted successfully. You can attach files below.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      if (data?.id) setExpandedLogId(data.id);
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save field log.");
    } finally {
      setSaving(false);
    }
  };

  const cancelLog = async (log: FieldLog) => {
    if ((log.status ?? "active") === "canceled") return;
    if (!window.confirm("Cancel this field log entry? It will stay in the list as canceled.")) {
      return;
    }
    setFormError(null);
    setSuccess(null);
    setBusyId(log.id);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("field_logs")
        .update({ status: "canceled" })
        .eq("id", log.id);
      if (updateError) throw updateError;
      await writeAuditLog("field_log_canceled", "field_log", log.id, {
        contract_id: log.contract_id,
        contract_name: log.contracts?.contract_name,
        work_performed: log.work_performed,
        log_date: log.log_date,
        from_status: log.status ?? "active",
        to_status: "canceled",
      });
      setSuccess("Field log canceled.");
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to cancel field log.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteLog = async (log: FieldLog) => {
    if (
      !window.confirm(
        "Permanently delete this field log? A record of the deletion will be kept in the change log."
      )
    ) {
      return;
    }
    setFormError(null);
    setSuccess(null);
    setBusyId(log.id);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("field_logs").delete().eq("id", log.id);
      if (deleteError) throw deleteError;
      await writeAuditLog("field_log_deleted", "field_log", log.id, {
        contract_id: log.contract_id,
        contract_name: log.contracts?.contract_name,
        work_performed: log.work_performed,
        log_date: log.log_date,
        hours_worked: log.hours_worked,
        weather_conditions: log.weather_conditions,
        from_status: log.status ?? "active",
      });
      setSuccess("Field log deleted.");
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to delete field log.");
    } finally {
      setBusyId(null);
    }
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Logs"
        subtitle="Daily site activity across your projects."
        actions={
          canCreate ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Add Field Log"}
            </button>
          ) : undefined
        }
      />

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search work performed, project, weather…"
        sortOptions={[
          { value: "date", label: "Date" },
          { value: "contract", label: "Project" },
          { value: "hours", label: "Estimated Hours" },
          { value: "workers", label: "Workers" },
          { value: "status", label: "Status" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={filtered.length}
        filters={
          <label className="form-control w-full lg:w-40">
            <span className="label py-1">
              <span className="label-text text-xs opacity-70">Status</span>
            </span>
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
        }
      />

      {canCreate && showForm ? (
        <SectionCard title="New Field Log">
          {formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}
          {success ? <AlertBanner type="success">{success}</AlertBanner> : null}
          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            <FormField label="Project">
              <select
                className="select select-bordered"
                value={form.contract_id}
                onChange={(e) => updateField("contract_id", e.target.value)}
                required
              >
                <option value="">Select a project…</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contract_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Log Date">
              <input
                type="date"
                className="input input-bordered"
                value={form.log_date}
                onChange={(e) => updateField("log_date", e.target.value)}
              />
            </FormField>
            <FormField label="Work Performed">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={form.work_performed}
                onChange={(e) => updateField("work_performed", e.target.value)}
              />
            </FormField>
            <FormField label="Hours Worked">
              <input
                type="number"
                step="0.25"
                className="input input-bordered"
                value={form.hours_worked}
                onChange={(e) => updateField("hours_worked", e.target.value)}
              />
            </FormField>
            <FormField label="Workers on Site">
              <input
                type="number"
                step="1"
                className="input input-bordered"
                value={form.workers_on_site}
                onChange={(e) => updateField("workers_on_site", e.target.value)}
              />
            </FormField>
            <FormField
              label="Weather Conditions"
              hint="Bad weather (rain, snow, wind, storm, extreme heat) shows in red."
            >
              <select
                className="select select-bordered"
                value={form.weather_conditions}
                onChange={(e) => updateField("weather_conditions", e.target.value)}
              >
                <option value="">Select weather…</option>
                {WEATHER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                    {isBadWeather(opt) ? " (adverse)" : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Equipment Used">
              <input
                className="input input-bordered"
                value={form.equipment_used}
                onChange={(e) => updateField("equipment_used", e.target.value)}
              />
            </FormField>
            <FormField label="Materials Used">
              <input
                className="input input-bordered"
                value={form.materials_used}
                onChange={(e) => updateField("materials_used", e.target.value)}
              />
            </FormField>
            <FormField label="Issues / Delays">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={form.issues_or_delays}
                onChange={(e) => updateField("issues_or_delays", e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                Save Field Log
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {!showForm && formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}
      {!showForm && success ? <AlertBanner type="success">{success}</AlertBanner> : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No field logs"
          message={
            fieldLogs.length === 0
              ? "No field logs have been submitted yet."
              : "Try adjusting your search or filters."
          }
        />
      ) : (
        <SectionCard title={`All Field Logs (${filtered.length})`}>
          <div className="overflow-x-auto rounded-box border border-base-300 -mx-1">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th className="hidden xl:table-cell">Submitted By</th>
                  <th>Work Performed</th>
                  <th className="text-right">Estimated Hours</th>
                  <th className="text-right hidden xl:table-cell">Workers</th>
                  <th className="hidden xl:table-cell">Weather</th>
                  <th>Status</th>
                  <th className="hidden xl:table-cell">Issues</th>
                  <th className="text-right">Files</th>
                  {canManage ? <th className="text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const status = log.status ?? "active";
                  const expanded = expandedLogId === log.id;
                  return (
                    <Fragment key={log.id}>
                    <tr className={status === "canceled" ? "opacity-60" : undefined}>
                      <td className="whitespace-nowrap">{log.log_date ?? "—"}</td>
                      <td>{log.contracts?.contract_name ?? "—"}</td>
                      <td className="hidden xl:table-cell">
                        {userProfiles.find((p) => p.id === log.user_id)?.full_name ??
                          userProfiles.find((p) => p.id === log.user_id)?.email ??
                          "—"}
                      </td>
                      <td
                        className="max-w-xs truncate"
                        title={[
                          log.work_performed ?? "—",
                          log.workers_on_site != null ? `Workers: ${log.workers_on_site}` : null,
                          log.weather_conditions ? `Weather: ${log.weather_conditions}` : null,
                          log.issues_or_delays ? `Issues: ${log.issues_or_delays}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        {log.work_performed ?? "—"}
                      </td>
                      <td className="text-right">{log.hours_worked ?? "—"}</td>
                      <td className="text-right hidden xl:table-cell">{log.workers_on_site ?? "—"}</td>
                      <td className="hidden xl:table-cell">
                        <WeatherBadge weather={log.weather_conditions} />
                      </td>
                      <td>
                        <span className={`badge badge-sm ${statusBadgeClass(status)}`}>
                          {labelize(status)}
                        </span>
                      </td>
                      <td className="max-w-xs truncate hidden xl:table-cell">
                        {log.issues_or_delays ?? "—"}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className={`btn btn-ghost btn-xs ${expanded ? "btn-active" : ""}`}
                          title="Attachments"
                          onClick={() => setExpandedLogId(expanded ? null : log.id)}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      {canManage ? (
                        <td className="text-right">
                          {canActOnLog(log) ? (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                title="Cancel entry"
                                disabled={busyId === log.id || status === "canceled"}
                                onClick={() => void cancelLog(log)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-error"
                                title="Delete entry"
                                disabled={busyId === log.id}
                                onClick={() => void deleteLog(log)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 10} className="bg-base-200/40">
                          <div className="p-3 max-w-2xl">
                            <AttachmentPanel entityType="field_log" entityId={log.id} />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <ActivityLogPanel
        title="Field Log Change Log"
        entityTypes={["field_log"]}
        enabled={showActivityLog}
        refreshKey={logRefreshKey}
      />
    </div>
  );
}
