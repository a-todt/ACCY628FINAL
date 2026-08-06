"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { compareValues } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { StarRating } from "@/components/StarRating";
import { writeAuditLog } from "@/lib/audit";
import { labelize, money } from "@/lib/metrics";
import { canManageSubcontractors, statusBadgeClass } from "@/lib/roles";
import { resolveSubcontractorScopeUserId } from "@/lib/subScope";
import { createClient } from "@/lib/supabase/client";
import type { SubStatus, Subcontractor } from "@/lib/types";

const STATUS_OPTIONS: SubStatus[] = ["active", "complete", "terminated"];

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
  business_notes: "",
  rating: "",
  user_id: "",
};

type SortKey = "company" | "trade" | "contract" | "value" | "paid" | "status";

type EditForm = {
  contract_id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  trade: string;
  subcontract_value: string;
  amount_paid: string;
  status: SubStatus;
  business_notes: string;
  rating: string;
};

function editFormFromSub(sub: Subcontractor): EditForm {
  return {
    contract_id: sub.contract_id,
    company_name: sub.company_name,
    contact_name: sub.contact_name ?? "",
    contact_email: sub.contact_email ?? "",
    contact_phone: sub.contact_phone ?? "",
    trade: sub.trade ?? "",
    subcontract_value: sub.subcontract_value != null ? String(sub.subcontract_value) : "",
    amount_paid: sub.amount_paid != null ? String(sub.amount_paid) : "0",
    status: sub.status,
    business_notes: sub.business_notes ?? "",
    rating: sub.rating != null ? String(Number(sub.rating)) : "",
  };
}

function contactLabel(sub: Subcontractor) {
  return sub.contact_name ?? sub.contact_email ?? "—";
}

export default function SubcontractorsPage() {
  const { effectiveRole, user, profile } = useAuth();
  const { contracts, subcontractors, userProfiles, loading, error, refresh } = useContractData();
  const canManage = canManageSubcontractors(effectiveRole);
  const canMutate = canManage;
  const isSubcontractor = effectiveRole === "subcontractor";

  const scopeUserId = useMemo(
    () =>
      resolveSubcontractorScopeUserId(
        effectiveRole,
        profile?.role,
        user?.id,
        userProfiles
      ),
    [effectiveRole, profile?.role, user?.id, userProfiles]
  );

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [viewing, setViewing] = useState<Subcontractor | null>(null);

  const subLogins = useMemo(() => userProfiles.filter((p) => p.role === "subcontractor"), [userProfiles]);

  const baseList = useMemo(
    () =>
      isSubcontractor
        ? subcontractors.filter((s) => !scopeUserId || s.user_id === scopeUserId)
        : subcontractors,
    [subcontractors, isSubcontractor, scopeUserId]
  );

  const filtered = useMemo(() => {
    const next = baseList.filter((sub) => {
      if (!matchesColumnFilter(sub.company_name, companyFilter)) return false;
      if (!matchesColumnFilter(sub.contracts?.contract_name, projectFilter)) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortKey === "company") return compareValues(a.company_name, b.company_name, sortDir);
      if (sortKey === "trade") return compareValues(a.trade, b.trade, sortDir);
      if (sortKey === "contract") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "value") return compareValues(Number(a.subcontract_value ?? 0), Number(b.subcontract_value ?? 0), sortDir);
      if (sortKey === "paid") return compareValues(Number(a.amount_paid ?? 0), Number(b.amount_paid ?? 0), sortDir);
      return compareValues(a.status, b.status, sortDir);
    });
  }, [baseList, companyFilter, projectFilter, sortKey, sortDir]);

  const companyOptions = useMemo(
    () => uniqueSorted(baseList.map((sub) => sub.company_name)),
    [baseList]
  );

  const projectOptions = useMemo(
    () => uniqueSorted(baseList.map((sub) => sub.contracts?.contract_name)),
    [baseList]
  );

  const selectedRows = useMemo(
    () => filtered.filter((sub) => selectedIds.has(sub.id)),
    [filtered, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((sub) => selectedIds.has(sub.id));

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const sub of filtered) next.delete(sub.id);
        return next;
      }
      const next = new Set(prev);
      for (const sub of filtered) next.add(sub.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEditField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const openView = (sub: Subcontractor) => setViewing(sub);
  const closeView = () => setViewing(null);

  const openEdit = (sub: Subcontractor) => {
    setViewing(null);
    setEditing(sub);
    setEditForm(editFormFromSub(sub));
    setEditError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
    setEditError(null);
  };

  const setSubStatus = async (sub: Subcontractor, status: SubStatus, { silent = false } = {}) => {
    if (sub.status === status) return;
    setActionError(null);
    setActionSuccess(null);
    setBusyId(sub.id);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("subcontractors")
        .update({ status })
        .eq("id", sub.id);
      if (updateError) throw updateError;
      await writeAuditLog("subcontractor_status_changed", "subcontractor", sub.id, {
        company_name: sub.company_name,
        contract_name: sub.contracts?.contract_name,
        from_status: sub.status,
        to_status: status,
      });
      if (!silent) {
        setActionSuccess(`Updated ${sub.company_name} to ${labelize(status)}.`);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update status.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteSub = async (sub: Subcontractor, { silent = false } = {}) => {
    if (
      !silent &&
      !window.confirm(`Permanently delete subcontractor "${sub.company_name}"? This cannot be undone.`)
    ) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(sub.id);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("subcontractors").delete().eq("id", sub.id);
      if (deleteError) throw deleteError;
      await writeAuditLog("subcontractor_deleted", "subcontractor", sub.id, {
        company_name: sub.company_name,
        contract_name: sub.contracts?.contract_name,
        from_status: sub.status,
      });
      if (!silent) {
        setActionSuccess(`Deleted ${sub.company_name}.`);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete subcontractor.");
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async (action: "delete" | SubStatus) => {
    if (selectedRows.length === 0 || !canMutate) return;

    if (action === "delete") {
      if (
        !window.confirm(
          `Permanently delete ${selectedRows.length} subcontractor${selectedRows.length === 1 ? "" : "s"}? This cannot be undone.`
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Set status to "${labelize(action)}" for ${selectedRows.length} subcontractor${selectedRows.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      for (const sub of selectedRows) {
        if (action === "delete") {
          await deleteSub(sub, { silent: true });
        } else {
          await setSubStatus(sub, action, { silent: true });
        }
      }
      const label =
        action === "delete" ? "Deleted" : `Updated status to ${labelize(action)} for`;
      setActionSuccess(
        `${label} ${selectedRows.length} subcontractor${selectedRows.length === 1 ? "" : "s"}.`
      );
      clearSelection();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBusy(false);
    }
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
      const { data, error: insertError } = await supabase
        .from("subcontractors")
        .insert({
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
          business_notes: form.business_notes.trim() || null,
          rating: form.rating ? Number(form.rating) : null,
          user_id: form.user_id || null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await writeAuditLog("subcontractor_created", "subcontractor", data?.id, {
        company_name: form.company_name.trim(),
        contract_id: form.contract_id,
        status: form.status,
      });

      setSuccess("Subcontractor added successfully.");
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save subcontractor.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setEditError(null);

    if (!editForm.contract_id || !editForm.company_name.trim()) {
      setEditError("Contract and company name are required.");
      return;
    }

    setEditSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("subcontractors")
        .update({
          contract_id: editForm.contract_id,
          company_name: editForm.company_name.trim(),
          contact_name: editForm.contact_name.trim() || null,
          contact_email: editForm.contact_email.trim() || null,
          contact_phone: editForm.contact_phone.trim() || null,
          trade: editForm.trade.trim() || null,
          subcontract_value: editForm.subcontract_value ? Number(editForm.subcontract_value) : null,
          amount_paid: editForm.amount_paid ? Number(editForm.amount_paid) : 0,
          status: editForm.status,
          business_notes: editForm.business_notes.trim() || null,
          rating: editForm.rating ? Number(editForm.rating) : null,
        })
        .eq("id", editing.id);
      if (updateError) throw updateError;

      await writeAuditLog("subcontractor_updated", "subcontractor", editing.id, {
        company_name: editForm.company_name.trim(),
        contract_id: editForm.contract_id,
        from_status: editing.status,
        to_status: editForm.status,
      });

      setActionSuccess(`Updated ${editForm.company_name.trim()}.`);
      closeEdit();
      await refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update subcontractor.");
    } finally {
      setEditSaving(false);
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

  const linkedUserName = (userId: string | null) => {
    if (!userId) return "—";
    const profile = userProfiles.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || "—";
  };

  const colCount = 7 + (canMutate ? 2 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subcontractors"
        subtitle={
          isSubcontractor
            ? "Your subcontract engagements."
            : "Manage subcontractor engagements across all projects."
        }
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            {canMutate && selectedIds.size > 0 ? (
              <div className="dropdown dropdown-end">
                <div
                  tabIndex={0}
                  role="button"
                  className={`btn btn-sm ${busy ? "btn-disabled" : "btn-secondary"}`}
                >
                  Bulk actions ({selectedIds.size})
                  <ChevronDown className="h-4 w-4" />
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-100 rounded-box z-40 w-56 p-2 shadow border border-base-300"
                >
                  <li className="menu-title px-3 pt-1">
                    <span>Change status</span>
                  </li>
                  {STATUS_OPTIONS.map((status) => (
                    <li key={status}>
                      <button type="button" disabled={busy} onClick={() => void runBulk(status)}>
                        Set {labelize(status)}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className="text-error"
                      disabled={busy}
                      onClick={() => void runBulk("delete")}
                    >
                      <Trash2 className="h-4 w-4" /> Delete selected
                    </button>
                  </li>
                </ul>
              </div>
            ) : null}
            {canManage ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Add Subcontractor"}
              </button>
            ) : null}
          </div>
        }
      />

      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

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
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {labelize(status)}
                  </option>
                ))}
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
            <FormField label="Business notes">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                placeholder="e.g. Completes on time, easy to reach, professional crews…"
                value={form.business_notes}
                onChange={(e) => updateField("business_notes", e.target.value)}
              />
            </FormField>
            <FormField label="Star rating">
              <select
                className="select select-bordered"
                value={form.rating}
                onChange={(e) => updateField("rating", e.target.value)}
              >
                <option value="">Not rated</option>
                <option value="5">5.0 ★★★★★</option>
                <option value="4.5">4.5 ★★★★½</option>
                <option value="4">4.0 ★★★★</option>
                <option value="3.5">3.5 ★★★½</option>
                <option value="3">3.0 ★★★</option>
                <option value="2.5">2.5 ★★½</option>
                <option value="2">2.0 ★★</option>
                <option value="1.5">1.5 ★½</option>
                <option value="1">1.0 ★</option>
              </select>
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

      {baseList.length === 0 ? (
        <EmptyState title="No subcontractors" message="No subcontractors have been added yet." />
      ) : (
        <div className="rounded-box border border-base-300 bg-base-100">
          <div className="overflow-x-auto">
            <table className="table table-xs table-fixed w-full text-[11px]">
              <colgroup>
                {canMutate ? <col className="w-[3%]" /> : null}
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[10%]" />
                <col className="w-[14%] hidden xl:table-column" />
                <col className="w-[10%]" />
                <col className="w-[10%] hidden xl:table-column" />
                <col className="w-[10%]" />
                {canMutate ? <col className="w-[11%]" /> : null}
              </colgroup>
              <thead>
                <tr className="bg-base-200/80">
                  {canMutate ? (
                    <th className="w-10 align-middle text-center">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all filtered subcontractors"
                      />
                    </th>
                  ) : null}
                  <ColumnAutocompleteHeader
                    label="Company"
                    listId="subs-filter-company"
                    value={companyFilter}
                    onChange={setCompanyFilter}
                    options={companyOptions}
                    sortActive={sortKey === "company"}
                    sortDir={sortDir}
                    onSort={() => onSort("company")}
                  />
                  <ColumnAutocompleteHeader
                    label="Project"
                    listId="subs-filter-project"
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={projectOptions}
                    sortActive={sortKey === "contract"}
                    sortDir={sortDir}
                    onSort={() => onSort("contract")}
                  />
                  <ColumnSortHeader
                    label="Trade"
                    sortActive={sortKey === "trade"}
                    sortDir={sortDir}
                    onSort={() => onSort("trade")}
                  />
                  <ColumnSortHeader label="Contact" className="hidden xl:table-cell" />
                  <ColumnSortHeader
                    label="Value"
                    sortActive={sortKey === "value"}
                    sortDir={sortDir}
                    onSort={() => onSort("value")}
                  />
                  <ColumnSortHeader
                    label="Paid"
                    sortActive={sortKey === "paid"}
                    sortDir={sortDir}
                    onSort={() => onSort("paid")}
                    className="hidden xl:table-cell"
                  />
                  <ColumnSortHeader
                    label="Status"
                    sortActive={sortKey === "status"}
                    sortDir={sortDir}
                    onSort={() => onSort("status")}
                  />
                  {canMutate ? <th className="text-center align-middle">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center opacity-60">
                      No subcontractors match the column filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((sub) => {
                    const overpaid = Number(sub.amount_paid ?? 0) > Number(sub.subcontract_value ?? 0);
                    return (
                      <tr key={sub.id} className="hover:bg-base-200/60">
                        {canMutate ? (
                          <td className="px-1 text-center">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={selectedIds.has(sub.id)}
                              onChange={() => toggleSelect(sub.id)}
                              aria-label={`Select ${sub.company_name}`}
                            />
                          </td>
                        ) : null}
                        <td className="min-w-0 px-1 text-left">
                          <button
                            type="button"
                            className="link link-primary block truncate font-medium text-left max-w-full"
                            title="View subcontractor details"
                            onClick={() => openView(sub)}
                          >
                            {sub.company_name}
                          </button>
                          <div className="mt-0.5">
                            <StarRating value={sub.rating} size="xs" />
                          </div>
                        </td>
                        <td className="min-w-0 px-1 text-left">
                          <Link
                            href={`/contracts/${sub.contract_id}`}
                            className="link link-primary block truncate font-medium"
                            title={sub.contracts?.contract_name ?? "Project details"}
                          >
                            <span className="inline-flex max-w-full items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{sub.contracts?.contract_name ?? "—"}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="truncate px-1 text-center" title={sub.trade ?? "—"}>
                          {sub.trade ?? "—"}
                        </td>
                        <td
                          className="truncate px-1 text-left hidden xl:table-cell"
                          title={contactLabel(sub)}
                        >
                          {contactLabel(sub)}
                        </td>
                        <td
                          className="truncate px-1 text-center"
                          title={`Paid: ${money(sub.amount_paid)} · Contact: ${contactLabel(sub)}`}
                        >
                          {money(sub.subcontract_value)}
                        </td>
                        <td className="truncate px-1 text-center hidden xl:table-cell">
                          {money(sub.amount_paid)}
                        </td>
                        <td className="px-1 text-center">
                          <div className="inline-flex flex-wrap items-center justify-center gap-1">
                            <span className={`badge badge-sm ${statusBadgeClass(sub.status)}`}>
                              {labelize(sub.status)}
                            </span>
                            {overpaid ? (
                              <span className="badge badge-sm badge-error gap-1">
                                <TriangleAlert className="h-3 w-3" /> Overpaid
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {canMutate ? (
                          <td className="px-1 text-center">
                            <div className="inline-flex justify-center gap-0.5">
                              <div className="dropdown dropdown-end">
                                <div
                                  tabIndex={0}
                                  role="button"
                                  className="btn btn-ghost h-6 min-h-6 gap-0 px-1 text-[10px]"
                                  title="Change status"
                                >
                                  Status
                                  <ChevronDown className="h-3 w-3" />
                                </div>
                                <ul
                                  tabIndex={0}
                                  className="dropdown-content menu bg-base-100 rounded-box z-40 w-44 p-2 shadow border border-base-300"
                                >
                                  {STATUS_OPTIONS.map((status) => (
                                    <li key={status}>
                                      <button
                                        type="button"
                                        disabled={busyId === sub.id || busy || sub.status === status}
                                        onClick={() =>
                                          void setSubStatus(sub, status).catch((err) => {
                                            setActionError(
                                              err instanceof Error
                                                ? err.message
                                                : "Failed to update status."
                                            );
                                          })
                                        }
                                      >
                                        {labelize(status)}
                                        {sub.status === status ? " ✓" : ""}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="dropdown dropdown-end">
                                <div
                                  tabIndex={0}
                                  role="button"
                                  className="btn btn-ghost h-6 min-h-6 gap-0 px-1 text-[10px]"
                                  title="Edit"
                                >
                                  Edit
                                  <ChevronDown className="h-3 w-3" />
                                </div>
                                <ul
                                  tabIndex={0}
                                  className="dropdown-content menu bg-base-100 rounded-box z-40 w-52 p-2 shadow border border-base-300"
                                >
                                  <li>
                                    <button type="button" onClick={() => openEdit(sub)}>
                                      <Pencil className="h-4 w-4" /> Edit Subcontractor
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      type="button"
                                      className="text-error"
                                      disabled={busyId === sub.id || busy}
                                      onClick={() =>
                                        void deleteSub(sub).catch((err) => {
                                          setActionError(
                                            err instanceof Error ? err.message : "Failed to delete."
                                          );
                                        })
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" /> Delete Subcontractor
                                    </button>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs opacity-60 border-t border-base-300">
            Showing {filtered.length} of {baseList.length} subcontractors
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
          </div>
        </div>
      )}

      {viewing ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-lg">{viewing.company_name}</h3>
                <p className="text-sm opacity-60">Full subcontractor details</p>
              </div>
              <span className={`badge ${statusBadgeClass(viewing.status)}`}>
                {labelize(viewing.status)}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <DetailField label="Company">{viewing.company_name}</DetailField>
              <DetailField label="Project">
                <Link href={`/contracts/${viewing.contract_id}`} className="link link-primary">
                  {viewing.contracts?.contract_name ?? "—"}
                </Link>
              </DetailField>
              <DetailField label="Trade">{viewing.trade ?? "—"}</DetailField>
              <DetailField label="Status">{labelize(viewing.status)}</DetailField>
              <DetailField label="Contact Name">{viewing.contact_name ?? "—"}</DetailField>
              <DetailField label="Contact Email">{viewing.contact_email ?? "—"}</DetailField>
              <DetailField label="Contact Phone">{viewing.contact_phone ?? "—"}</DetailField>
              <DetailField label="Linked User">{linkedUserName(viewing.user_id)}</DetailField>
              <DetailField label="Subcontract Value">{money(viewing.subcontract_value)}</DetailField>
              <DetailField label="Amount Paid">{money(viewing.amount_paid)}</DetailField>
              <DetailField label="Retainage">
                {viewing.retainage_percent != null ? `${Number(viewing.retainage_percent)}%` : "—"}
              </DetailField>
              <DetailField label="Start Date">{viewing.start_date ?? "—"}</DetailField>
              <DetailField label="End Date">{viewing.end_date ?? "—"}</DetailField>
              <DetailField label="License #">{viewing.license_number ?? "—"}</DetailField>
              <DetailField label="License State">{viewing.license_state ?? "—"}</DetailField>
              <DetailField label="License Expiration">{viewing.license_expiration ?? "—"}</DetailField>
              <div className="sm:col-span-2">
                <DetailField label="Scope of Work">{viewing.scope_of_work ?? "—"}</DetailField>
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Business notes">{viewing.business_notes ?? "—"}</DetailField>
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Star rating">
                  <StarRating value={viewing.rating} size="md" />
                </DetailField>
              </div>
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeView}>
                Close
              </button>
              {canMutate ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit(viewing)}>
                  <Pencil className="h-4 w-4" /> Edit Subcontractor
                </button>
              ) : null}
            </div>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={closeView} />
        </div>
      ) : null}

      {editing && editForm ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl">
            <h3 className="font-semibold text-lg">Edit Subcontractor</h3>
            <p className="text-sm opacity-60 mb-4">Update fields shown in the Subcontractors table.</p>
            {editError ? <AlertBanner type="error">{editError}</AlertBanner> : null}
            <form onSubmit={onSaveEdit} className="space-y-3 mt-2">
              <FormField label="Company">
                <input
                  className="input input-bordered input-sm w-full"
                  value={editForm.company_name}
                  onChange={(e) => updateEditField("company_name", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Project">
                <select
                  className="select select-bordered select-sm w-full"
                  value={editForm.contract_id}
                  onChange={(e) => updateEditField("contract_id", e.target.value)}
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
              <FormField label="Trade">
                <input
                  className="input input-bordered input-sm w-full"
                  value={editForm.trade}
                  onChange={(e) => updateEditField("trade", e.target.value)}
                />
              </FormField>
              <FormField label="Contact Name">
                <input
                  className="input input-bordered input-sm w-full"
                  value={editForm.contact_name}
                  onChange={(e) => updateEditField("contact_name", e.target.value)}
                />
              </FormField>
              <FormField label="Contact Email">
                <input
                  type="email"
                  className="input input-bordered input-sm w-full"
                  value={editForm.contact_email}
                  onChange={(e) => updateEditField("contact_email", e.target.value)}
                />
              </FormField>
              <FormField label="Contact Phone">
                <input
                  className="input input-bordered input-sm w-full"
                  value={editForm.contact_phone}
                  onChange={(e) => updateEditField("contact_phone", e.target.value)}
                />
              </FormField>
              <FormField label="Value">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  $
                  <input
                    type="number"
                    step="0.01"
                    className="grow"
                    value={editForm.subcontract_value}
                    onChange={(e) => updateEditField("subcontract_value", e.target.value)}
                  />
                </label>
              </FormField>
              <FormField label="Paid">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  $
                  <input
                    type="number"
                    step="0.01"
                    className="grow"
                    value={editForm.amount_paid}
                    onChange={(e) => updateEditField("amount_paid", e.target.value)}
                  />
                </label>
              </FormField>
              <FormField label="Status">
                <select
                  className="select select-bordered select-sm w-full"
                  value={editForm.status}
                  onChange={(e) => updateEditField("status", e.target.value as SubStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Business notes">
                <textarea
                  className="textarea textarea-bordered textarea-sm w-full"
                  rows={3}
                  placeholder="On-time? Easy to reach? Professional?"
                  value={editForm.business_notes}
                  onChange={(e) => updateEditField("business_notes", e.target.value)}
                />
              </FormField>
              <FormField label="Star rating">
                <select
                  className="select select-bordered select-sm w-full"
                  value={editForm.rating}
                  onChange={(e) => updateEditField("rating", e.target.value)}
                >
                  <option value="">Not rated</option>
                  <option value="5">5.0</option>
                  <option value="4.5">4.5</option>
                  <option value="4">4.0</option>
                  <option value="3.5">3.5</option>
                  <option value="3">3.0</option>
                  <option value="2.5">2.5</option>
                  <option value="2">2.0</option>
                  <option value="1.5">1.5</option>
                  <option value="1">1.0</option>
                </select>
              </FormField>
              <div className="modal-action">
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeEdit} disabled={editSaving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={editSaving}>
                  {editSaving ? <span className="loading loading-spinner loading-sm" /> : null}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={closeEdit} />
        </div>
      ) : null}
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs opacity-60 mb-0.5">{label}</p>
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}
