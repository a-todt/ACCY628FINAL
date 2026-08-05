"use client";

import { useMemo, useState, type FormEvent, Fragment } from "react";
import { Paperclip, Plus } from "lucide-react";
import { AttachmentPanel } from "@/components/AttachmentPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { labelize, money } from "@/lib/metrics";
import { canCreateChangeOrders, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { ChangeOrderStatus } from "@/lib/types";

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

export default function ChangeOrdersPage() {
  const { effectiveRole } = useAuth();
  const { contracts, changeOrders, loading, error, refresh } = useContractData();
  const canCreate = canCreateChangeOrders(effectiveRole);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("submitted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isClient = effectiveRole === "client";

  const baseList = useMemo(
    () => (isClient ? changeOrders.filter((co) => co.status === "approved") : changeOrders),
    [changeOrders, isClient]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = baseList.filter((co) => {
      if (statusFilter !== "all" && co.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [co.description, co.change_order_number, co.contracts?.contract_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "project") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      if (sortKey === "number") return compareValues(a.change_order_number, b.change_order_number, sortDir);
      if (sortKey === "amount") return compareValues(Number(a.amount ?? 0), Number(b.amount ?? 0), sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      return compareValues(a.date_submitted, b.date_submitted, sortDir);
    });
  }, [baseList, search, statusFilter, sortKey, sortDir]);

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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

      setSuccess("Change order added successfully. You can attach files below.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      if (data?.id) setExpandedId(data.id);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save change order.");
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
        title="Change Orders"
        subtitle={
          isClient
            ? "Approved change orders affecting your project scope and value."
            : "Track scope and value changes across all your projects."
        }
        actions={
          canCreate ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Add Change Order"}
            </button>
          ) : undefined
        }
      />

      {isClient ? (
        <AlertBanner type="info">You are viewing approved change orders only.</AlertBanner>
      ) : null}

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search description, CO #, project…"
        sortOptions={[
          { value: "project", label: "Project" },
          { value: "number", label: "CO #" },
          { value: "amount", label: "Amount" },
          { value: "status", label: "Status" },
          { value: "submitted", label: "Submitted" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={filtered.length}
        filters={
          !isClient ? (
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
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          ) : undefined
        }
      />

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
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
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

      {filtered.length === 0 ? (
        <EmptyState
          title="No change orders"
          message={
            baseList.length === 0
              ? isClient
                ? "No approved change orders yet."
                : "No change orders yet. Add one once scope changes on a project."
              : "Try adjusting your search or filters."
          }
        />
      ) : (
        <SectionCard title={`All Change Orders (${filtered.length})`}>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>CO #</th>
                  <th>Description</th>
                  <th>Reason</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Resolved</th>
                  {!isClient ? <th>Notes</th> : null}
                  <th className="text-right">Files</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((co) => {
                  const expanded = expandedId === co.id;
                  const colSpan = isClient ? 9 : 10;
                  return (
                    <Fragment key={co.id}>
                      <tr>
                        <td>{co.contracts?.contract_name ?? "—"}</td>
                        <td>{co.change_order_number ?? "—"}</td>
                        <td className="max-w-xs truncate">{co.description ?? "—"}</td>
                        <td className="max-w-xs truncate">{co.reason ?? "—"}</td>
                        <td className="text-right">{money(co.amount)}</td>
                        <td>
                          <span className={`badge badge-sm ${statusBadgeClass(co.status)}`}>
                            {labelize(co.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">{co.date_submitted ?? "—"}</td>
                        <td className="whitespace-nowrap">{co.date_resolved ?? "—"}</td>
                        {!isClient ? <td className="max-w-xs truncate">{co.notes ?? "—"}</td> : null}
                        <td className="text-right">
                          <button
                            type="button"
                            className={`btn btn-ghost btn-xs ${expanded ? "btn-active" : ""}`}
                            title="Attachments"
                            onClick={() => setExpandedId(expanded ? null : co.id)}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={colSpan} className="bg-base-200/40">
                            <div className="p-3 max-w-2xl">
                              <AttachmentPanel entityType="change_order" entityId={co.id} />
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
    </div>
  );
}
