"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode, Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, ClipboardList, ExternalLink, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { AttachmentPanel } from "@/components/AttachmentPanel";
import {
  ColumnAutocompleteHeader,
  ColumnCheckboxFilterHeader,
  ColumnSortHeader,
  matchesCheckboxFilter,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useOpenCreateFromQuery } from "@/hooks/useOpenCreateFromQuery";
import { compareValues } from "@/components/FilterSortBar";
import { PageSkeleton } from "@/components/PageSkeleton";
import { StickyToolbar } from "@/components/StickyToolbar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { WeatherBadge } from "@/components/WeatherBadge";
import { writeAuditLog } from "@/lib/audit";
import {
  ROLE_LABELS,
  canCreateFieldLogs,
  canManageCompany,
  canManageFieldLogEntries,
  roleBadgeClass,
} from "@/lib/roles";
import { WEATHER_OPTIONS, isBadWeather } from "@/lib/weather";
import { createClient } from "@/lib/supabase/client";
import type { FieldLog, UserProfile } from "@/lib/types";

const WEATHER_NONE = "(none)";

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

type SortKey = "date" | "contract" | "submitter" | "hours" | "workers";

function submitterProfile(log: FieldLog, userProfiles: UserProfile[]): UserProfile | undefined {
  return userProfiles.find((p) => p.id === log.user_id);
}

function submitterLabel(log: FieldLog, userProfiles: UserProfile[]): string {
  const profile = submitterProfile(log, userProfiles);
  return profile?.full_name || profile?.email || "";
}

function StaffDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide opacity-50">{label}</p>
      <div className="text-sm font-medium truncate">{children}</div>
    </div>
  );
}

function weatherKey(log: FieldLog): string {
  const value = (log.weather_conditions ?? "").trim();
  return value || WEATHER_NONE;
}

export default function FieldLogsPage() {
  const { effectiveRole, user } = useAuth();
  const searchParams = useSearchParams();
  const { contracts, fieldLogs, userProfiles, loading, error, refresh } =
    useContractData();
  const canCreate = canCreateFieldLogs(effectiveRole);
  const canManage = canManageFieldLogEntries(effectiveRole);
  const canOpenTeam = canManageCompany(effectiveRole);
  const showActivityLog =
    canManage || effectiveRole === "admin" || effectiveRole === "owner";

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [weatherSelected, setWeatherSelected] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("desc");
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [viewingStaff, setViewingStaff] = useState<UserProfile | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  const openCreateForm = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }, []);
  useOpenCreateFromQuery(canCreate, openCreateForm);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setProjectFilter(q);
    const id = searchParams.get("id");
    if (id) setExpandedLogId(id);
  }, [searchParams]);

  useEffect(() => {
    setShowAllRows(false);
  }, [projectFilter, submitterFilter, weatherSelected]);

  const filtered = useMemo(() => {
    const next = fieldLogs.filter((log) => {
      if (!matchesCheckboxFilter(weatherKey(log), weatherSelected)) return false;
      if (!matchesColumnFilter(log.contracts?.contract_name, projectFilter)) return false;
      if (!matchesColumnFilter(submitterLabel(log, userProfiles), submitterFilter)) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortKey === "date") return compareValues(a.log_date, b.log_date, sortDir);
      if (sortKey === "contract") {
        return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      }
      if (sortKey === "submitter") {
        return compareValues(
          submitterLabel(a, userProfiles),
          submitterLabel(b, userProfiles),
          sortDir
        );
      }
      if (sortKey === "hours") {
        return compareValues(Number(a.hours_worked ?? 0), Number(b.hours_worked ?? 0), sortDir);
      }
      return compareValues(Number(a.workers_on_site ?? 0), Number(b.workers_on_site ?? 0), sortDir);
    });
  }, [
    fieldLogs,
    userProfiles,
    projectFilter,
    submitterFilter,
    weatherSelected,
    sortKey,
    sortDir,
  ]);

  const projectOptions = useMemo(
    () => uniqueSorted(fieldLogs.map((log) => log.contracts?.contract_name)),
    [fieldLogs]
  );

  const submitterOptions = useMemo(
    () => uniqueSorted(fieldLogs.map((log) => submitterLabel(log, userProfiles))),
    [fieldLogs, userProfiles]
  );

  const weatherFilterOptions = useMemo(() => {
    const fromData = uniqueSorted(fieldLogs.map((log) => weatherKey(log)));
    const merged = uniqueSorted([...WEATHER_OPTIONS, ...fromData]);
    return merged.map((value) => ({
      value,
      label: value === WEATHER_NONE ? "None" : value,
    }));
  }, [fieldLogs]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canActOnLog = (log: FieldLog) => {
    if (!canManage || !user) return false;
    if (effectiveRole === "admin") return true;
    return log.user_id === user.id;
  };

  const startEdit = (log: FieldLog) => {
    setFormError(null);
    setSuccess(null);
    setEditingId(log.id);
    setForm({
      contract_id: log.contract_id ?? "",
      log_date: log.log_date ?? "",
      work_performed: log.work_performed ?? "",
      hours_worked: log.hours_worked != null ? String(log.hours_worked) : "",
      workers_on_site: log.workers_on_site != null ? String(log.workers_on_site) : "",
      weather_conditions: log.weather_conditions ?? "",
      equipment_used: log.equipment_used ?? "",
      materials_used: log.materials_used ?? "",
      issues_or_delays: log.issues_or_delays ?? "",
      notes: log.notes ?? "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
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

      if (editingId) {
        const { error: updateError } = await supabase
          .from("field_logs")
          .update(payload)
          .eq("id", editingId);
        if (updateError) throw updateError;

        await writeAuditLog("field_log_updated", "field_log", editingId, {
          contract_id: form.contract_id,
          work_performed: payload.work_performed,
          log_date: payload.log_date,
        });

        setSuccess("Field log updated.");
        setExpandedLogId(editingId);
      } else {
        const { data, error: insertError } = await supabase
          .from("field_logs")
          .insert({ ...payload, user_id: user.id })
          .select("id")
          .single();
        if (insertError) throw insertError;

        await writeAuditLog("field_log_created", "field_log", data?.id, {
          contract_id: form.contract_id,
          work_performed: payload.work_performed,
          log_date: payload.log_date,
        });

        setSuccess("Field log submitted successfully. You can attach files below.");
        if (data?.id) setExpandedLogId(data.id);
      }

      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save field log.");
    } finally {
      setSaving(false);
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
    return <PageSkeleton rows={8} />;
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  /** Viewport ≈ tall filter header + 10 body rows; remaining rows scroll inside. */
  const tableScrollClass = showAllRows
    ? "overflow-visible table-sticky-head table-freeze-first"
    : "overflow-auto max-h-[calc(4.5rem+10*1.85rem)] table-sticky-head table-freeze-first";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Field Logs"
        compact
        actions={
          canCreate ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (showForm) {
                  cancelForm();
                } else {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                  setShowForm(true);
                }
              }}
            >
              <Plus className="h-4 w-4" /> {showForm ? "Close" : "Add Field Log"}
            </button>
          ) : undefined
        }
      />

      <StickyToolbar>
        <p className="text-xs opacity-55 tabular-nums">{filtered.length} shown</p>
      </StickyToolbar>

      {canCreate && showForm ? (
        <SectionCard title={editingId ? "Edit Field Log" : "New Field Log"}>
          {formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}
          {success ? <AlertBanner type="success">{success}</AlertBanner> : null}
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField stacked label="Project">
                <select
                  className="select select-bordered w-full"
                  value={form.contract_id}
                  onChange={(e) => updateField("contract_id", e.target.value)}
                  required
                  disabled={Boolean(editingId)}
                >
                  <option value="">Select a project…</option>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.contract_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField stacked label="Log Date">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={form.log_date}
                  onChange={(e) => updateField("log_date", e.target.value)}
                />
              </FormField>
              <FormField stacked label="Hours Worked">
                <input
                  type="number"
                  step="0.25"
                  className="input input-bordered w-full"
                  value={form.hours_worked}
                  onChange={(e) => updateField("hours_worked", e.target.value)}
                />
              </FormField>
              <FormField stacked label="Workers on Site">
                <input
                  type="number"
                  step="1"
                  className="input input-bordered w-full"
                  value={form.workers_on_site}
                  onChange={(e) => updateField("workers_on_site", e.target.value)}
                />
              </FormField>
              <FormField
                stacked
                label="Weather Conditions"
                hint="Bad weather (rain, snow, wind, storm, extreme heat) shows in red."
              >
                <select
                  className="select select-bordered w-full"
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
              <FormField stacked label="Equipment Used">
                <input
                  className="input input-bordered w-full"
                  value={form.equipment_used}
                  onChange={(e) => updateField("equipment_used", e.target.value)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField stacked label="Materials Used">
                  <input
                    className="input input-bordered w-full"
                    value={form.materials_used}
                    onChange={(e) => updateField("materials_used", e.target.value)}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField stacked label="Work Performed">
                  <textarea
                    className="textarea textarea-bordered w-full"
                    rows={3}
                    value={form.work_performed}
                    onChange={(e) => updateField("work_performed", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField stacked label="Issues / Delays">
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  value={form.issues_or_delays}
                  onChange={(e) => updateField("issues_or_delays", e.target.value)}
                />
              </FormField>
              <FormField stacked label="Notes">
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={cancelForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                {editingId ? "Save Changes" : "Save Field Log"}
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
              : "Try adjusting your column filters."
          }
          icon={ClipboardList}
          action={
            canCreate && fieldLogs.length === 0 ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Add Field Log
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
        <div className={`rounded-box border border-base-300 bg-base-100 ${tableScrollClass}`}>
            <table className="table table-xs table-fixed w-full text-[11px]">
              <colgroup>
                <col className="w-[7rem]" />
                <col className="w-[14%]" />
                <col className="w-[11%]" />
                <col />
                <col className="w-[5.5rem]" />
                <col className="w-[5rem] hidden xl:table-column" />
                <col className="w-[7rem] hidden xl:table-column" />
                <col className="w-[12%] hidden xl:table-column" />
                <col className="w-[3.5rem]" />
                {canManage ? <col className="w-[5rem]" /> : null}
              </colgroup>
              <thead>
                <tr className="bg-base-200/80">
                  <ColumnSortHeader
                    label="Date"
                    sortActive={sortKey === "date"}
                    sortDir={sortDir}
                    onSort={() => onSort("date")}
                  />
                  <ColumnAutocompleteHeader
                    label="Project"
                    listId="field-logs-filter-project"
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={projectOptions}
                    sortActive={sortKey === "contract"}
                    sortDir={sortDir}
                    onSort={() => onSort("contract")}
                  />
                  <ColumnAutocompleteHeader
                    label="Submitted By"
                    listId="field-logs-filter-submitter"
                    value={submitterFilter}
                    onChange={setSubmitterFilter}
                    options={submitterOptions}
                    sortActive={sortKey === "submitter"}
                    sortDir={sortDir}
                    onSort={() => onSort("submitter")}
                  />
                  <th className="align-middle px-1 text-center">Work Performed</th>
                  <ColumnSortHeader
                    label="Hours"
                    sortActive={sortKey === "hours"}
                    sortDir={sortDir}
                    onSort={() => onSort("hours")}
                  />
                  <ColumnSortHeader
                    label="Workers"
                    sortActive={sortKey === "workers"}
                    sortDir={sortDir}
                    onSort={() => onSort("workers")}
                    className="hidden xl:table-cell"
                  />
                  <ColumnCheckboxFilterHeader
                    label="Weather"
                    options={weatherFilterOptions}
                    selected={weatherSelected}
                    onChange={setWeatherSelected}
                    className="hidden xl:table-cell"
                  />
                  <th className="align-middle px-1 text-center hidden xl:table-cell">Issues</th>
                  <th className="align-middle px-1 text-center">Files</th>
                  {canManage ? <th className="align-middle px-1 text-center">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const expanded = expandedLogId === log.id;
                  const profile = submitterProfile(log, userProfiles);
                  const submitter =
                    profile?.full_name || profile?.email || "—";
                  return (
                    <Fragment key={log.id}>
                    <tr className="hover:bg-base-200/60">
                      <td className="whitespace-nowrap truncate px-1 text-center">
                        {log.log_date ?? "—"}
                      </td>
                      <td className="min-w-0 px-1 text-left">
                        {log.contract_id ? (
                          <Link
                            href={`/contracts/${log.contract_id}`}
                            className="link link-primary block truncate font-medium"
                            title={log.contracts?.contract_name ?? "Project details"}
                          >
                            <span className="inline-flex max-w-full items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{log.contracts?.contract_name ?? "—"}</span>
                            </span>
                          </Link>
                        ) : (
                          <span className="truncate">{log.contracts?.contract_name ?? "—"}</span>
                        )}
                      </td>
                      <td
                        className="truncate px-1 text-center"
                        title={submitter}
                      >
                        {profile ? (
                          <button
                            type="button"
                            className="link link-primary truncate max-w-full font-medium"
                            onClick={() => setViewingStaff(profile)}
                          >
                            {submitter}
                          </button>
                        ) : (
                          submitter
                        )}
                      </td>
                      <td
                        className="truncate px-1 text-left"
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
                      <td className="truncate px-1 text-center">{log.hours_worked ?? "—"}</td>
                      <td className="truncate px-1 text-center hidden xl:table-cell">
                        {log.workers_on_site ?? "—"}
                      </td>
                      <td className="px-1 text-center hidden xl:table-cell">
                        <WeatherBadge weather={log.weather_conditions} />
                      </td>
                      <td
                        className="truncate px-1 text-center hidden xl:table-cell"
                        title={log.issues_or_delays ?? "—"}
                      >
                        {log.issues_or_delays ?? "—"}
                      </td>
                      <td className="px-1 text-center">
                        <button
                          type="button"
                          className={`btn btn-ghost h-6 min-h-6 gap-0 px-1 ${expanded ? "btn-active" : ""}`}
                          title="Attachments"
                          onClick={() => setExpandedLogId(expanded ? null : log.id)}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      {canManage ? (
                        <td className="px-1 text-center">
                          {canActOnLog(log) ? (
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                className="btn btn-ghost h-6 min-h-6 gap-0 px-1"
                                title="Edit entry"
                                disabled={busyId === log.id}
                                onClick={() => startEdit(log)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost h-6 min-h-6 gap-0 px-1 text-error"
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
                        <td colSpan={canManage ? 10 : 9} className="bg-base-200/40">
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
        {filtered.length > 10 ? (
          <div className="flex justify-center pt-2 pb-1">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowAllRows((v) => !v)}
            >
              {showAllRows ? "Show less" : `Show all (${filtered.length})`}
            </button>
          </div>
        ) : null}
        </>
      )}

      <ActivityLogPanel
        title="Field Log Change Log"
        entityTypes={["field_log"]}
        enabled={showActivityLog}
        refreshKey={logRefreshKey}
      />

      {viewingStaff ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-lg truncate">
                  {viewingStaff.full_name || viewingStaff.email || "Staff member"}
                </h3>
                <p className="text-sm opacity-60">Team directory details</p>
              </div>
              <span className={`badge badge-sm shrink-0 ${roleBadgeClass(viewingStaff.role)}`}>
                {ROLE_LABELS[viewingStaff.role]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StaffDetail label="Full Name">
                {viewingStaff.full_name || "—"}
              </StaffDetail>
              <StaffDetail label="Email">{viewingStaff.email || "—"}</StaffDetail>
              <StaffDetail label="Employee ID">
                {viewingStaff.employee_id || "—"}
              </StaffDetail>
              <StaffDetail label="Title">{viewingStaff.title || "—"}</StaffDetail>
              <StaffDetail label="Phone">{viewingStaff.phone || "—"}</StaffDetail>
              <StaffDetail label="Status">
                <span
                  className={`badge badge-sm ${
                    viewingStaff.is_active === false ? "badge-ghost" : "badge-success"
                  }`}
                >
                  {viewingStaff.is_active === false ? "Inactive" : "Active"}
                </span>
              </StaffDetail>
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewingStaff(null)}>
                Close
              </button>
              {canOpenTeam ? (
                <Link
                  href={`/management?tab=team&staff=${viewingStaff.id}`}
                  className="btn btn-primary btn-sm"
                  onClick={() => setViewingStaff(null)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Team
                </Link>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Close"
            onClick={() => setViewingStaff(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
