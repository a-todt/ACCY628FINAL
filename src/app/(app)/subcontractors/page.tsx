"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { labelize, money } from "@/lib/metrics";
import { canManageSubcontractors, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { SubStatus } from "@/lib/types";

const EMPTY_FORM = {
  contract_id: "",
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  trade: "",
  subcontract_value: "",
  amount_paid: "0",
  retainage_percent: "10",
  start_date: "",
  end_date: "",
  status: "active" as SubStatus,
  scope_of_work: "",
  user_id: "",
};

type SortKey = "company" | "trade" | "contract" | "value" | "paid" | "status";

export default function SubcontractorsPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, subcontractors, userProfiles, loading, error, refresh } = useContractData();
  const canManage = canManageSubcontractors(effectiveRole);
  const isSubcontractor = effectiveRole === "subcontractor";

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const subLogins = useMemo(() => userProfiles.filter((p) => p.role === "subcontractor"), [userProfiles]);

  const baseList = useMemo(
    () => (isSubcontractor ? subcontractors.filter((s) => s.user_id === user?.id) : subcontractors),
    [subcontractors, isSubcontractor, user?.id]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = baseList.filter((sub) => {
      if (statusFilter !== "all" && sub.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [sub.company_name, sub.contact_name, sub.trade, sub.contracts?.contract_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "company") return compareValues(a.company_name, b.company_name, sortDir);
      if (sortKey === "trade") return compareValues(a.trade, b.trade, sortDir);
      if (sortKey === "contract") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "value") return compareValues(Number(a.subcontract_value ?? 0), Number(b.subcontract_value ?? 0), sortDir);
      if (sortKey === "paid") return compareValues(Number(a.amount_paid ?? 0), Number(b.amount_paid ?? 0), sortDir);
      return compareValues(a.status, b.status, sortDir);
    });
  }, [baseList, search, statusFilter, sortKey, sortDir]);

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!form.contract_id || !form.company_name.trim()) {
      setFormError("Contract and company name are required.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("subcontractors").insert({
        contract_id: form.contract_id,
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        trade: form.trade.trim() || null,
        subcontract_value: form.subcontract_value ? Number(form.subcontract_value) : null,
        amount_paid: form.amount_paid ? Number(form.amount_paid) : 0,
        retainage_percent: form.retainage_percent ? Number(form.retainage_percent) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        scope_of_work: form.scope_of_work.trim() || null,
        user_id: form.user_id || null,
      });
      if (insertError) throw insertError;

      setSuccess("Subcontractor added successfully.");
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save subcontractor.");
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
        title="Subcontractors"
        subtitle={isSubcontractor ? "Your subcontract engagements." : "Manage subcontractor engagements across all projects."}
        actions={
          canManage ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Add Subcontractor"}
            </button>
          ) : undefined
        }
      />

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search company, contact, trade, project…"
        sortOptions={[
          { value: "company", label: "Company" },
          { value: "trade", label: "Trade" },
          { value: "contract", label: "Project" },
          { value: "value", label: "Value" },
          { value: "paid", label: "Paid" },
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
              <option value="complete">Complete</option>
              <option value="terminated">Terminated</option>
            </select>
          </label>
        }
      />

      {canManage && showForm ? (
        <SectionCard title="New Subcontractor">
          {formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}
          {success ? <AlertBanner type="success">{success}</AlertBanner> : null}
          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            <FormField label="Contract">
              <select
                className="select select-bordered"
                value={form.contract_id}
                onChange={(e) => updateField("contract_id", e.target.value)}
                required
              >
                <option value="">Select a contract…</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contract_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Company Name">
              <input
                className="input input-bordered"
                value={form.company_name}
                onChange={(e) => updateField("company_name", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Trade">
              <input
                className="input input-bordered"
                value={form.trade}
                onChange={(e) => updateField("trade", e.target.value)}
                placeholder="e.g. Electrical"
              />
            </FormField>
            <FormField label="Contact Name">
              <input
                className="input input-bordered"
                value={form.contact_name}
                onChange={(e) => updateField("contact_name", e.target.value)}
              />
            </FormField>
            <FormField label="Contact Email">
              <input
                type="email"
                className="input input-bordered"
                value={form.contact_email}
                onChange={(e) => updateField("contact_email", e.target.value)}
              />
            </FormField>
            <FormField label="Contact Phone">
              <input
                className="input input-bordered"
                value={form.contact_phone}
                onChange={(e) => updateField("contact_phone", e.target.value)}
              />
            </FormField>
            <FormField label="Linked Subcontractor User" hint="Optional — grants that login visibility into this record.">
              <select
                className="select select-bordered"
                value={form.user_id}
                onChange={(e) => updateField("user_id", e.target.value)}
              >
                <option value="">None</option>
                {subLogins.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.full_name || sub.email}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Subcontract Value">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  className="grow"
                  value={form.subcontract_value}
                  onChange={(e) => updateField("subcontract_value", e.target.value)}
                />
              </label>
            </FormField>
            <FormField label="Amount Paid">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  className="grow"
                  value={form.amount_paid}
                  onChange={(e) => updateField("amount_paid", e.target.value)}
                />
              </label>
            </FormField>
            <FormField label="Retainage %">
              <input
                type="number"
                step="0.1"
                className="input input-bordered"
                value={form.retainage_percent}
                onChange={(e) => updateField("retainage_percent", e.target.value)}
              />
            </FormField>
            <FormField label="Start Date">
              <input
                type="date"
                className="input input-bordered"
                value={form.start_date}
                onChange={(e) => updateField("start_date", e.target.value)}
              />
            </FormField>
            <FormField label="End Date">
              <input
                type="date"
                className="input input-bordered"
                value={form.end_date}
                onChange={(e) => updateField("end_date", e.target.value)}
              />
            </FormField>
            <FormField label="Status">
              <select
                className="select select-bordered"
                value={form.status}
                onChange={(e) => updateField("status", e.target.value as SubStatus)}
              >
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="terminated">Terminated</option>
              </select>
            </FormField>
            <FormField label="Scope of Work">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={form.scope_of_work}
                onChange={(e) => updateField("scope_of_work", e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                Save Subcontractor
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No subcontractors"
          message={
            baseList.length === 0
              ? "No subcontractors have been added yet."
              : "Try adjusting your search or filters."
          }
        />
      ) : (
        <SectionCard title={`Subcontractors (${filtered.length})`}>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Project</th>
                  <th>Trade</th>
                  <th>Contact</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => {
                  const overpaid = Number(sub.amount_paid ?? 0) > Number(sub.subcontract_value ?? 0);
                  return (
                    <tr key={sub.id}>
                      <td>{sub.company_name}</td>
                      <td>{sub.contracts?.contract_name ?? "—"}</td>
                      <td>{sub.trade ?? "—"}</td>
                      <td>{sub.contact_name ?? sub.contact_email ?? "—"}</td>
                      <td className="text-right">{money(sub.subcontract_value)}</td>
                      <td className="text-right">{money(sub.amount_paid)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className={`badge badge-sm ${statusBadgeClass(sub.status)}`}>{labelize(sub.status)}</span>
                          {overpaid ? (
                            <span className="badge badge-sm badge-error gap-1">
                              <TriangleAlert className="h-3 w-3" /> Overpaid
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
