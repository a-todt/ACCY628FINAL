"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { HardHat, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import { labelize } from "@/lib/metrics";
import {
  canCreateSafetyIncidents,
  canViewSafetyIncidents,
  statusBadgeClass,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type {
  SafetyIncident,
  SafetyIncidentSeverity,
  SafetyIncidentStatus,
  SafetyIncidentType,
} from "@/lib/types";

const INCIDENT_TYPES: SafetyIncidentType[] = ["injury", "near_miss", "property_damage", "other"];
const SEVERITIES: SafetyIncidentSeverity[] = ["low", "medium", "high"];

const EMPTY_FORM = {
  contract_id: "",
  incident_date: new Date().toISOString().slice(0, 10),
  incident_type: "injury" as SafetyIncidentType,
  severity: "low" as SafetyIncidentSeverity,
  injured_party: "",
  description: "",
  corrective_action: "",
  notes: "",
};

function severityBadgeClass(severity: SafetyIncidentSeverity): string {
  if (severity === "high") return "badge-error";
  if (severity === "medium") return "badge-warning";
  return "badge-ghost";
}

export default function SafetyIncidentsPage() {
  const { effectiveRole, user, profile } = useAuth();
  const { contracts, loading: contractsLoading } = useContractData();
  const canView = canViewSafetyIncidents(effectiveRole);
  const canCreate = canCreateSafetyIncidents(effectiveRole);

  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | SafetyIncidentStatus>("all");

  const load = useCallback(async () => {
    if (!canView) {
      setIncidents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("safety_incidents")
      .select("*, contracts(contract_name), user_profiles(full_name, email)")
      .order("incident_date", { ascending: false });
    if (loadError) setError(loadError.message);
    else setIncidents((data as SafetyIncident[]) ?? []);
    setLoading(false);
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? incidents
        : incidents.filter((i) => i.status === statusFilter),
    [incidents, statusFilter]
  );

  const openCount = incidents.filter((i) => i.status === "open").length;
  const injuryCount = incidents.filter((i) => i.incident_type === "injury").length;
  const highCount = incidents.filter((i) => i.severity === "high" && i.status === "open").length;

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreate || !user) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!form.contract_id) throw new Error("Select a project.");
      if (!form.description.trim()) throw new Error("Description is required.");
      if (!form.incident_date) throw new Error("Incident date is required.");

      const supabase = createClient();
      const payload = {
        contract_id: form.contract_id,
        reported_by: user.id,
        incident_date: form.incident_date,
        incident_type: form.incident_type,
        severity: form.severity,
        status: "open" as const,
        injured_party: form.injured_party.trim() || null,
        description: form.description.trim(),
        corrective_action: form.corrective_action.trim() || null,
        notes: form.notes.trim() || null,
      };
      const { data, error: insertError } = await supabase
        .from("safety_incidents")
        .insert(payload)
        .select("id")
        .single();
      if (insertError) throw insertError;

      await writeAuditLog("safety_incident_created", "safety_incidents", data.id, {
        contract_id: payload.contract_id,
        incident_type: payload.incident_type,
        severity: payload.severity,
      });
      setMessage("Incident logged.");
      setShowForm(false);
      setForm({
        ...EMPTY_FORM,
        incident_date: new Date().toISOString().slice(0, 10),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log incident.");
    } finally {
      setBusy(false);
    }
  };

  const onSetStatus = async (id: string, status: SafetyIncidentStatus) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("safety_incidents")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
      await writeAuditLog("safety_incident_status", "safety_incidents", id, { status });
      setMessage(`Incident marked ${labelize(status)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update incident.");
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <EmptyState
        title="Safety log unavailable"
        message="Your role does not have access to safety and injury incidents."
      />
    );
  }

  if (loading || contractsLoading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Safety / Incidents"
        subtitle={
          effectiveRole === "owner" || effectiveRole === "admin"
            ? "Company-wide injury, near-miss, and site damage reports from project managers and field."
            : "Log injuries and near misses on your projects so ownership can review them."
        }
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="h-4 w-4" />
              {showForm ? "Close form" : "Log incident"}
            </button>
          ) : null
        }
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total reports" value={String(incidents.length)} icon={HardHat} />
        <StatCard
          title="Open"
          value={String(openCount)}
          tone={openCount > 0 ? "warning" : "default"}
        />
        <StatCard title="Injuries" value={String(injuryCount)} />
        <StatCard
          title="Open high severity"
          value={String(highCount)}
          tone={highCount > 0 ? "error" : "default"}
        />
      </div>

      {canCreate && showForm ? (
        <SectionCard title="Log a safety incident">
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
            <FormField label="Project">
              <select
                className="select select-bordered"
                value={form.contract_id}
                onChange={(e) => setForm((p) => ({ ...p, contract_id: e.target.value }))}
                required
              >
                <option value="">Select project…</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Incident date">
              <input
                type="date"
                className="input input-bordered"
                value={form.incident_date}
                onChange={(e) => setForm((p) => ({ ...p, incident_date: e.target.value }))}
                required
              />
            </FormField>
            <FormField label="Type">
              <select
                className="select select-bordered"
                value={form.incident_type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    incident_type: e.target.value as SafetyIncidentType,
                  }))
                }
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Severity">
              <select
                className="select select-bordered"
                value={form.severity}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    severity: e.target.value as SafetyIncidentSeverity,
                  }))
                }
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Injured / involved party (optional)">
              <input
                className="input input-bordered"
                value={form.injured_party}
                onChange={(e) => setForm((p) => ({ ...p, injured_party: e.target.value }))}
                placeholder="e.g. Sub laborer, field crew member"
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="What happened">
                <textarea
                  className="textarea textarea-bordered min-h-24"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  required
                />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Corrective action">
                <textarea
                  className="textarea textarea-bordered"
                  value={form.corrective_action}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, corrective_action: e.target.value }))
                  }
                  placeholder="What was done to prevent this from happening again?"
                />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Notes">
                <textarea
                  className="textarea textarea-bordered"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <HardHat className="h-4 w-4" />
                Save incident
              </button>
              <p className="text-xs opacity-60 mt-2">
                Reporting as {profile?.full_name || user?.email || "current user"}.
              </p>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={`Incident log (${filtered.length})`}
        actions={
          <div className="join">
            {(["all", "open", "closed"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`btn btn-xs join-item ${statusFilter === value ? "btn-active" : ""}`}
                onClick={() => setStatusFilter(value)}
              >
                {labelize(value)}
              </button>
            ))}
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No incidents"
            message={
              canCreate
                ? "No safety incidents match this filter. Log one if something happened on site."
                : "No safety incidents have been reported yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Reported by</th>
                  <th>Summary</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((incident) => (
                  <tr key={incident.id} className="align-top">
                    <td className="whitespace-nowrap">{incident.incident_date}</td>
                    <td>
                      <Link
                        href={`/contracts/${incident.contract_id}`}
                        className="link link-hover font-medium"
                      >
                        {incident.contracts?.contract_name ?? "Project"}
                      </Link>
                    </td>
                    <td>{labelize(incident.incident_type)}</td>
                    <td>
                      <span className={`badge badge-sm ${severityBadgeClass(incident.severity)}`}>
                        {labelize(incident.severity)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(incident.status)}`}>
                        {labelize(incident.status)}
                      </span>
                    </td>
                    <td className="text-xs">
                      {incident.user_profiles?.full_name ||
                        incident.user_profiles?.email ||
                        "—"}
                    </td>
                    <td className="max-w-sm">
                      <p className="text-sm">{incident.description}</p>
                      {incident.injured_party ? (
                        <p className="text-xs opacity-60 mt-0.5">
                          Party: {incident.injured_party}
                        </p>
                      ) : null}
                      {incident.corrective_action ? (
                        <p className="text-xs opacity-60 mt-0.5">
                          Fix: {incident.corrective_action}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {incident.status === "open" &&
                      (effectiveRole === "admin" ||
                        effectiveRole === "owner" ||
                        effectiveRole === "project_manager") ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          disabled={busy}
                          onClick={() => onSetStatus(incident.id, "closed")}
                        >
                          Close
                        </button>
                      ) : null}
                      {incident.status === "closed" &&
                      (effectiveRole === "admin" || effectiveRole === "owner") ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          disabled={busy}
                          onClick={() => onSetStatus(incident.id, "open")}
                        >
                          Reopen
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
