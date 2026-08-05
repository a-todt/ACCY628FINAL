"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
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
import { writeAuditLog } from "@/lib/audit";
import { labelize, money } from "@/lib/metrics";
import { canCreateChangeOrders, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { ChangeOrder, ChangeOrderStatus } from "@/lib/types";

const STATUS_OPTIONS: ChangeOrderStatus[] = ["pending", "approved", "rejected"];

const EMPTY_FORM = {
  contract_id: "",
  change_order_number: "",
  description: "",
  reason: "",
  amount: "",
  status: "pending" as ChangeOrderStatus,
  date_submitted: "",
  date_resolved: "",
  notes: "",
};

type SortKey = "project" | "number" | "amount" | "status" | "submitted";

type EditForm = {
  contract_id: string;
  change_order_number: string;
  description: string;
  reason: string;
  amount: string;
  status: ChangeOrderStatus;
  date_submitted: string;
  date_resolved: string;
  notes: string;
};

function editFormFromChangeOrder(co: ChangeOrder): EditForm {
  return {
    contract_id: co.contract_id,
    change_order_number: co.change_order_number ?? "",
    description: co.description ?? "",
    reason: co.reason ?? "",
    amount: co.amount != null ? String(co.amount) : "",
    status: co.status,
    date_submitted: co.date_submitted ?? "",
    date_resolved: co.date_resolved ?? "",
    notes: co.notes ?? "",
  };
}

export default function ChangeOrdersPage() {
  const { effectiveRole } = useAuth();
  const { contracts, changeOrders, loading, error, refresh } = useContractData();
  const canCreate = canCreateChangeOrders(effectiveRole);
  const canMutate = canCreate;

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [numberFilter, setNumberFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChangeOrder | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [viewing, setViewing] = useState<ChangeOrder | null>(null);

  const isClient = effectiveRole === "client";

  const baseList = useMemo(
    () => (isClient ? changeOrders.filter((co) => co.status === "approved") : changeOrders),
    [changeOrders, isClient]
  );

  const filtered = useMemo(() => {
    const next = baseList.filter((co) => {
      if (!matchesColumnFilter(co.contracts?.contract_name, projectFilter)) return false;
      if (!matchesColumnFilter(co.change_order_number, numberFilter)) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortKey === "project") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "number") return compareValues(a.change_order_number, b.change_order_number, sortDir);
      if (sortKey === "amount") return compareValues(Number(a.amount ?? 0), Number(b.amount ?? 0), sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      return compareValues(a.date_submitted, b.date_submitted, sortDir);
    });
  }, [baseList, projectFilter, numberFilter, sortKey, sortDir]);

  const projectOptions = useMemo(
    () => uniqueSorted(baseList.map((co) => co.contracts?.contract_name)),
    [baseList]
  );

  const numberOptions = useMemo(
    () => uniqueSorted(baseList.map((co) => co.change_order_number)),
    [baseList]
  );

  const selectedRows = useMemo(
    () => filtered.filter((co) => selectedIds.has(co.id)),
    [filtered, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((co) => selectedIds.has(co.id));

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
        for (const co of filtered) next.delete(co.id);
        return next;
      }
      const next = new Set(prev);
      for (const co of filtered) next.add(co.id);
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

  const openEdit = (co: ChangeOrder) => {
    setViewing(null);
    setEditing(co);
    setEditForm(editFormFromChangeOrder(co));
    setEditError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
    setEditError(null);
  };

  const openView = (co: ChangeOrder) => {
    setViewing(co);
  };

  const closeView = () => {
    setViewing(null);
  };

  const setChangeOrderStatus = async (
    co: ChangeOrder,
    status: ChangeOrderStatus,
    { silent = false } = {}
  ) => {
    if (co.status === status) return;
    setActionError(null);
    setActionSuccess(null);
    setBusyId(co.id);
    try {
      const supabase = createClient();
      const payload: { status: ChangeOrderStatus; date_resolved?: string | null } = { status };
      if (status !== "pending" && !co.date_resolved) {
        payload.date_resolved = new Date().toISOString().slice(0, 10);
      }
      const { error: updateError } = await supabase
        .from("change_orders")
        .update(payload)
        .eq("id", co.id);
      if (updateError) throw updateError;
      await writeAuditLog("change_order_status_changed", "change_order", co.id, {
        change_order_number: co.change_order_number,
        contract_name: co.contracts?.contract_name,
        from_status: co.status,
        to_status: status,
      });
      if (!silent) {
        setActionSuccess(
          `Updated ${co.change_order_number || "change order"} to ${labelize(status)}.`
        );
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update status.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteChangeOrder = async (co: ChangeOrder, { silent = false } = {}) => {
    if (
      !silent &&
      !window.confirm(
        `Permanently delete change order "${co.change_order_number || co.description || co.id}"? This cannot be undone.`
      )
    ) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(co.id);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("change_orders").delete().eq("id", co.id);
      if (deleteError) throw deleteError;
      await writeAuditLog("change_order_deleted", "change_order", co.id, {
        change_order_number: co.change_order_number,
        contract_name: co.contracts?.contract_name,
        from_status: co.status,
      });
      if (!silent) {
        setActionSuccess(`Deleted ${co.change_order_number || "change order"}.`);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete change order.");
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async (action: "delete" | ChangeOrderStatus) => {
    if (selectedRows.length === 0 || !canMutate) return;

    if (action === "delete") {
      if (
        !window.confirm(
          `Permanently delete ${selectedRows.length} change order${selectedRows.length === 1 ? "" : "s"}? This cannot be undone.`
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Set status to "${labelize(action)}" for ${selectedRows.length} change order${selectedRows.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      for (const co of selectedRows) {
        if (action === "delete") {
          await deleteChangeOrder(co, { silent: true });
        } else {
          await setChangeOrderStatus(co, action, { silent: true });
        }
      }
      const label =
        action === "delete" ? "Deleted" : `Updated status to ${labelize(action)} for`;
      setActionSuccess(
        `${label} ${selectedRows.length} change order${selectedRows.length === 1 ? "" : "s"}.`
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

    if (!form.contract_id) {
      setFormError("Please select a contract.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("change_orders")
        .insert({
          contract_id: form.contract_id,
          change_order_number: form.change_order_number.trim() || null,
          description: form.description.trim() || null,
          reason: form.reason.trim() || null,
          amount: form.amount ? Number(form.amount) : null,
          status: form.status,
          date_submitted: form.date_submitted || null,
          date_resolved: form.date_resolved || null,
          notes: form.notes.trim() || null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await writeAuditLog("change_order_created", "change_order", data?.id, {
        change_order_number: form.change_order_number.trim() || null,
        contract_id: form.contract_id,
        status: form.status,
      });

      setSuccess("Change order added successfully.");
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save change order.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setEditError(null);

    if (!editForm.contract_id) {
      setEditError("Please select a contract.");
      return;
    }

    setEditSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("change_orders")
        .update({
          contract_id: editForm.contract_id,
          change_order_number: editForm.change_order_number.trim() || null,
          description: editForm.description.trim() || null,
          reason: editForm.reason.trim() || null,
          amount: editForm.amount ? Number(editForm.amount) : null,
          status: editForm.status,
          date_submitted: editForm.date_submitted || null,
          date_resolved: editForm.date_resolved || null,
          notes: editForm.notes.trim() || null,
        })
        .eq("id", editing.id);
      if (updateError) throw updateError;

      await writeAuditLog("change_order_updated", "change_order", editing.id, {
        change_order_number: editForm.change_order_number.trim() || null,
        contract_id: editForm.contract_id,
        from_status: editing.status,
        to_status: editForm.status,
      });

      setActionSuccess(`Updated ${editForm.change_order_number || "change order"}.`);
      closeEdit();
      await refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update change order.");
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

  const colCount = (isClient ? 8 : 9) + (canMutate ? 2 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change Orders"
        subtitle={
          isClient
            ? "Approved change orders affecting your project scope and value."
            : "Track scope and value changes across all your projects."
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
            {canCreate ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Add Change Order"}
              </button>
            ) : null}
          </div>
        }
      />

      {isClient ? (
        <AlertBanner type="info">You are viewing approved change orders only.</AlertBanner>
      ) : null}
      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

      {canCreate && showForm ? (
        <SectionCard title="New Change Order">
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
            <FormField label="CO Number">
              <input
                className="input input-bordered"
                value={form.change_order_number}
                onChange={(e) => updateField("change_order_number", e.target.value)}
                placeholder="e.g. CO-004"
              />
            </FormField>
            <FormField label="Description">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </FormField>
            <FormField label="Reason">
              <input
                className="input input-bordered"
                value={form.reason}
                onChange={(e) => updateField("reason", e.target.value)}
              />
            </FormField>
            <FormField label="Amount">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  className="grow"
                  value={form.amount}
                  onChange={(e) => updateField("amount", e.target.value)}
                />
              </label>
            </FormField>
            <FormField label="Status">
              <select
                className="select select-bordered"
                value={form.status}
                onChange={(e) => updateField("status", e.target.value as ChangeOrderStatus)}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {labelize(status)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Date Submitted">
              <input
                type="date"
                className="input input-bordered"
                value={form.date_submitted}
                onChange={(e) => updateField("date_submitted", e.target.value)}
              />
            </FormField>
            <FormField label="Date Resolved">
              <input
                type="date"
                className="input input-bordered"
                value={form.date_resolved}
                onChange={(e) => updateField("date_resolved", e.target.value)}
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
                Save Change Order
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {baseList.length === 0 ? (
        <EmptyState
          title="No change orders"
          message={
            isClient
              ? "No approved change orders yet."
              : "No change orders yet. Add one once scope changes on a project."
          }
        />
      ) : (
        <div className="rounded-box border border-base-300 bg-base-100">
          <div className="overflow-x-auto">
            <table className="table table-xs table-fixed w-full text-[11px]">
              <colgroup>
                {canMutate ? <col className="w-[3%]" /> : null}
                <col className="w-[13%]" />
                <col className="w-[7%]" />
                <col className="w-[15%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                {!isClient ? <col className="w-[10%]" /> : null}
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
                        aria-label="Select all filtered change orders"
                      />
                    </th>
                  ) : null}
                  <ColumnAutocompleteHeader
                    label="Project"
                    listId="change-orders-filter-project"
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={projectOptions}
                    sortActive={sortKey === "project"}
                    sortDir={sortDir}
                    onSort={() => onSort("project")}
                  />
                  <ColumnAutocompleteHeader
                    label="CO #"
                    listId="change-orders-filter-number"
                    value={numberFilter}
                    onChange={setNumberFilter}
                    options={numberOptions}
                    sortActive={sortKey === "number"}
                    sortDir={sortDir}
                    onSort={() => onSort("number")}
                  />
                  <ColumnSortHeader label="Description" />
                  <ColumnSortHeader label="Reason" />
                  <ColumnSortHeader
                    label="Amount"
                    sortActive={sortKey === "amount"}
                    sortDir={sortDir}
                    onSort={() => onSort("amount")}
                  />
                  <ColumnSortHeader
                    label="Status"
                    sortActive={sortKey === "status"}
                    sortDir={sortDir}
                    onSort={() => onSort("status")}
                  />
                  <ColumnSortHeader
                    label="Submitted"
                    sortActive={sortKey === "submitted"}
                    sortDir={sortDir}
                    onSort={() => onSort("submitted")}
                  />
                  <ColumnSortHeader label="Resolved" />
                  {!isClient ? <ColumnSortHeader label="Notes" /> : null}
                  {canMutate ? <th className="text-center align-middle">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center opacity-60">
                      No change orders match the column filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((co) => (
                    <tr key={co.id} className="hover:bg-base-200/60">
                      {canMutate ? (
                        <td className="px-1 text-center">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={selectedIds.has(co.id)}
                            onChange={() => toggleSelect(co.id)}
                            aria-label={`Select ${co.change_order_number || "change order"}`}
                          />
                        </td>
                      ) : null}
                      <td className="min-w-0 px-1 text-left">
                        <Link
                          href={`/contracts/${co.contract_id}`}
                          className="link link-primary block truncate font-medium"
                          title={co.contracts?.contract_name ?? "Project details"}
                        >
                          <span className="inline-flex max-w-full items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                            <span className="truncate">{co.contracts?.contract_name ?? "—"}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="truncate px-1 text-center">
                        <button
                          type="button"
                          className="link link-primary font-medium truncate max-w-full"
                          title="View change order details"
                          onClick={() => openView(co)}
                        >
                          {co.change_order_number ?? "View"}
                        </button>
                      </td>
                      <td className="truncate px-1 text-left" title={co.description ?? "—"}>
                        {co.description ?? "—"}
                      </td>
                      <td className="truncate px-1 text-left" title={co.reason ?? "—"}>
                        {co.reason ?? "—"}
                      </td>
                      <td className="truncate px-1 text-center">{money(co.amount)}</td>
                      <td className="px-1 text-center">
                        <span className={`badge badge-sm ${statusBadgeClass(co.status)}`}>
                          {labelize(co.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-1 text-center">{co.date_submitted ?? "—"}</td>
                      <td className="whitespace-nowrap px-1 text-center">{co.date_resolved ?? "—"}</td>
                      {!isClient ? (
                        <td className="truncate px-1 text-center" title={co.notes ?? "—"}>
                          {co.notes ?? "—"}
                        </td>
                      ) : null}
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
                                      disabled={busyId === co.id || busy || co.status === status}
                                      onClick={() =>
                                        void setChangeOrderStatus(co, status).catch((err) => {
                                          setActionError(
                                            err instanceof Error
                                              ? err.message
                                              : "Failed to update status."
                                          );
                                        })
                                      }
                                    >
                                      {labelize(status)}
                                      {co.status === status ? " ✓" : ""}
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
                                className="dropdown-content menu bg-base-100 rounded-box z-40 w-48 p-2 shadow border border-base-300"
                              >
                                <li>
                                  <button type="button" onClick={() => openEdit(co)}>
                                    <Pencil className="h-4 w-4" /> Edit CO
                                  </button>
                                </li>
                                <li>
                                  <button
                                    type="button"
                                    className="text-error"
                                    disabled={busyId === co.id || busy}
                                    onClick={() =>
                                      void deleteChangeOrder(co).catch((err) => {
                                        setActionError(
                                          err instanceof Error ? err.message : "Failed to delete."
                                        );
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete CO
                                  </button>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs opacity-60 border-t border-base-300">
            Showing {filtered.length} of {baseList.length} change orders
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
          </div>
        </div>
      )}

      {viewing ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-lg">
                  {viewing.change_order_number || "Change Order"}
                </h3>
                <p className="text-sm opacity-60">Full change order details</p>
              </div>
              <span className={`badge ${statusBadgeClass(viewing.status)}`}>
                {labelize(viewing.status)}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <DetailField label="Project">
                <Link href={`/contracts/${viewing.contract_id}`} className="link link-primary">
                  {viewing.contracts?.contract_name ?? "—"}
                </Link>
              </DetailField>
              <DetailField label="CO #">{viewing.change_order_number ?? "—"}</DetailField>
              <DetailField label="Amount">{money(viewing.amount)}</DetailField>
              <DetailField label="Status">{labelize(viewing.status)}</DetailField>
              <DetailField label="Submitted">{viewing.date_submitted ?? "—"}</DetailField>
              <DetailField label="Resolved">{viewing.date_resolved ?? "—"}</DetailField>
              <div className="sm:col-span-2">
                <DetailField label="Description">{viewing.description ?? "—"}</DetailField>
              </div>
              <div className="sm:col-span-2">
                <DetailField label="Reason">{viewing.reason ?? "—"}</DetailField>
              </div>
              {!isClient ? (
                <div className="sm:col-span-2">
                  <DetailField label="Notes">{viewing.notes ?? "—"}</DetailField>
                </div>
              ) : null}
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeView}>
                Close
              </button>
              {canMutate ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit(viewing)}>
                  <Pencil className="h-4 w-4" /> Edit CO
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
            <h3 className="font-semibold text-lg">Edit Change Order</h3>
            <p className="text-sm opacity-60 mb-4">
              Update fields shown in the Change Orders table.
            </p>
            {editError ? <AlertBanner type="error">{editError}</AlertBanner> : null}
            <form onSubmit={onSaveEdit} className="space-y-3 mt-2">
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
              <FormField label="CO #">
                <input
                  className="input input-bordered input-sm w-full"
                  value={editForm.change_order_number}
                  onChange={(e) => updateEditField("change_order_number", e.target.value)}
                />
              </FormField>
              <FormField label="Description">
                <textarea
                  className="textarea textarea-bordered textarea-sm w-full"
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => updateEditField("description", e.target.value)}
                />
              </FormField>
              <FormField label="Reason">
                <input
                  className="input input-bordered input-sm w-full"
                  value={editForm.reason}
                  onChange={(e) => updateEditField("reason", e.target.value)}
                />
              </FormField>
              <FormField label="Amount">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  $
                  <input
                    type="number"
                    step="0.01"
                    className="grow"
                    value={editForm.amount}
                    onChange={(e) => updateEditField("amount", e.target.value)}
                  />
                </label>
              </FormField>
              <FormField label="Status">
                <select
                  className="select select-bordered select-sm w-full"
                  value={editForm.status}
                  onChange={(e) => updateEditField("status", e.target.value as ChangeOrderStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Submitted">
                  <input
                    type="date"
                    className="input input-bordered input-sm w-full"
                    value={editForm.date_submitted}
                    onChange={(e) => updateEditField("date_submitted", e.target.value)}
                  />
                </FormField>
                <FormField label="Resolved">
                  <input
                    type="date"
                    className="input input-bordered input-sm w-full"
                    value={editForm.date_resolved}
                    onChange={(e) => updateEditField("date_resolved", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label="Notes">
                <textarea
                  className="textarea textarea-bordered textarea-sm w-full"
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => updateEditField("notes", e.target.value)}
                />
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
