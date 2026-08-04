"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { labelize, money } from "@/lib/metrics";
import { canEnterCosts, canViewCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { CostCategory } from "@/lib/types";

const CATEGORIES: CostCategory[] = ["labor", "materials", "subcontractor", "equipment", "permits", "other"];

const EMPTY_FORM = {
  contract_id: "",
  category: "labor" as CostCategory,
  description: "",
  amount: "",
  date_incurred: "",
  notes: "",
};

export default function CostsPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, costEntries, userProfiles, loading, error, refresh } =
    useContractData();

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canEnter = canEnterCosts(effectiveRole);

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cost of costEntries) {
      const key = cost.category ?? "other";
      totals.set(key, (totals.get(key) ?? 0) + Number(cost.amount ?? 0));
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [costEntries]);

  const byContract = useMemo(() => {
    const totals = new Map<string, { name: string; total: number }>();
    for (const cost of costEntries) {
      const key = cost.contract_id;
      const name = cost.contracts?.contract_name ?? "Unknown";
      const existing = totals.get(key);
      if (existing) existing.total += Number(cost.amount ?? 0);
      else totals.set(key, { name, total: Number(cost.amount ?? 0) });
    }
    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
  }, [costEntries]);

  const grandTotal = costEntries.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!form.contract_id || !form.amount) {
      setFormError("Contract and amount are required.");
      return;
    }
    if (!user) {
      setFormError("You must be signed in to log a cost.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("cost_entries").insert({
        contract_id: form.contract_id,
        user_id: user.id,
        category: form.category,
        description: form.description.trim() || null,
        amount: Number(form.amount),
        date_incurred: form.date_incurred || null,
        notes: form.notes.trim() || null,
      });
      if (insertError) throw insertError;

      setSuccess("Cost entry recorded successfully.");
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save cost entry.");
    } finally {
      setSaving(false);
    }
  };

  if (!canViewCosts(effectiveRole)) {
    return (
      <div>
        <PageHeader title="Cost Tracker" />
        <AlertBanner type="error">Access denied. Cost data is not available for the client role.</AlertBanner>
      </div>
    );
  }

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
        title="Cost Tracker"
        subtitle="Internal job costs across all projects."
        actions={
          canEnter ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Log Cost"}
            </button>
          ) : undefined
        }
      />

      {canEnter && showForm ? (
        <SectionCard title="New Cost Entry">
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
            <FormField label="Category">
              <select
                className="select select-bordered"
                value={form.category}
                onChange={(e) => updateField("category", e.target.value as CostCategory)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelize(category)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Description">
              <input
                className="input input-bordered"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
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
                  required
                />
              </label>
            </FormField>
            <FormField label="Date Incurred">
              <input
                type="date"
                className="input input-bordered"
                value={form.date_incurred}
                onChange={(e) => updateField("date_incurred", e.target.value)}
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
                Save Cost Entry
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Costs by Category">
          {byCategory.length === 0 ? (
            <p className="text-sm opacity-60 py-6 text-center">No cost entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map(([category, total]) => (
                    <tr key={category}>
                      <td>{labelize(category)}</td>
                      <td className="text-right">{money(total)}</td>
                      <td className="text-right">{grandTotal > 0 ? `${((total / grandTotal) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td className="text-right">{money(grandTotal)}</td>
                    <td className="text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Costs by Contract">
          {byContract.length === 0 ? (
            <p className="text-sm opacity-60 py-6 text-center">No cost entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byContract.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="text-right">{money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {costEntries.length === 0 ? (
        <EmptyState title="No cost entries" message="Log your first cost entry to start tracking job costs." />
      ) : (
        <SectionCard title={`All Cost Entries (${costEntries.length})`}>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Submitted By</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {costEntries.map((cost) => (
                  <tr key={cost.id}>
                    <td className="whitespace-nowrap">{cost.date_incurred ?? "—"}</td>
                    <td>{cost.contracts?.contract_name ?? "—"}</td>
                    <td>{labelize(cost.category)}</td>
                    <td className="max-w-xs truncate">{cost.description ?? "—"}</td>
                    <td>
                      {userProfiles.find((p) => p.id === cost.user_id)?.full_name ??
                        userProfiles.find((p) => p.id === cost.user_id)?.email ??
                        "—"}
                    </td>
                    <td className="text-right">{money(cost.amount)}</td>
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
