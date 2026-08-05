"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { canCreateFieldLogs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

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

type SortKey = "date" | "contract" | "hours" | "workers";

export default function FieldLogsPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, fieldLogs, userProfiles, loading, error, refresh } =
    useContractData();
  const canCreate = canCreateFieldLogs(effectiveRole);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = fieldLogs.filter((log) => {
      if (!q) return true;
      const haystack = [log.work_performed, log.contracts?.contract_name, log.weather_conditions]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "date") return compareValues(a.log_date, b.log_date, sortDir);
      if (sortKey === "contract") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "hours") return compareValues(Number(a.hours_worked ?? 0), Number(b.hours_worked ?? 0), sortDir);
      return compareValues(Number(a.workers_on_site ?? 0), Number(b.workers_on_site ?? 0), sortDir);
    });
  }, [fieldLogs, search, sortKey, sortDir]);

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      const { error: insertError } = await supabase.from("field_logs").insert({
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
      });
      if (insertError) throw insertError;

      setSuccess("Field log submitted successfully.");
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save field log.");
    } finally {
      setSaving(false);
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
          { value: "hours", label: "Hours" },
          { value: "workers", label: "Workers" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={filtered.length}
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
            <FormField label="Weather Conditions">
              <input
                className="input input-bordered"
                value={form.weather_conditions}
                onChange={(e) => updateField("weather_conditions", e.target.value)}
                placeholder="e.g. Sunny, 75°F"
              />
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
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Submitted By</th>
                  <th>Work Performed</th>
                  <th className="text-right">Hours</th>
                  <th className="text-right">Workers</th>
                  <th>Weather</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap">{log.log_date ?? "—"}</td>
                    <td>{log.contracts?.contract_name ?? "—"}</td>
                    <td>
                      {userProfiles.find((p) => p.id === log.user_id)?.full_name ??
                        userProfiles.find((p) => p.id === log.user_id)?.email ??
                        "—"}
                    </td>
                    <td className="max-w-xs truncate">{log.work_performed ?? "—"}</td>
                    <td className="text-right">{log.hours_worked ?? "—"}</td>
                    <td className="text-right">{log.workers_on_site ?? "—"}</td>
                    <td>{log.weather_conditions ?? "—"}</td>
                    <td className="max-w-xs truncate">{log.issues_or_delays ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
