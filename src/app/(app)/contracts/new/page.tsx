"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, FormField, PageHeader, SectionCard } from "@/components/ui";
import { canManageContracts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { ContractType, MilestoneStatus, RevenueRecognitionMethod } from "@/lib/types";

interface MilestoneRow {
  milestone_name: string;
  milestone_value: string;
  due_date: string;
  status: MilestoneStatus;
}

const EMPTY_MILESTONE: MilestoneRow = {
  milestone_name: "",
  milestone_value: "",
  due_date: "",
  status: "pending",
};

const EMPTY_FORM = {
  contract_name: "",
  client_name: "",
  client_email: "",
  client_phone: "",
  project_address: "",
  city: "",
  state: "",
  contract_type: "fixed_price" as ContractType,
  original_value: "",
  retainage_percent: "10",
  revenue_recognition_method: "percentage_of_completion" as RevenueRecognitionMethod,
  estimated_total_cost: "",
  start_date: "",
  end_date: "",
  status: "active" as const,
  scope_description: "",
  special_terms: "",
  client_user_id: "",
};

export default function NewContractPage() {
  const { effectiveRole, user } = useAuth();
  const { userProfiles } = useContractData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([{ ...EMPTY_MILESTONE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clients = useMemo(() => userProfiles.filter((p) => p.role === "client"), [userProfiles]);

  if (!canManageContracts(effectiveRole)) {
    return (
      <div>
        <PageHeader title="Add Contract" />
        <AlertBanner type="error">
          Access denied. Only admins and project managers can create contracts.
        </AlertBanner>
      </div>
    );
  }

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateMilestone = <K extends keyof MilestoneRow>(index: number, key: K, value: MilestoneRow[K]) => {
    setMilestones((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const addMilestone = () => setMilestones((prev) => [...prev, { ...EMPTY_MILESTONE }]);
  const removeMilestone = (index: number) =>
    setMilestones((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setMilestones([{ ...EMPTY_MILESTONE }]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user) {
      setError("You must be signed in to create a contract.");
      return;
    }
    if (!form.contract_name.trim()) {
      setError("Contract name is required.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .insert({
          user_id: user.id,
          contract_name: form.contract_name.trim(),
          client_name: form.client_name.trim() || null,
          client_email: form.client_email.trim() || null,
          client_phone: form.client_phone.trim() || null,
          project_address: form.project_address.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          contract_type: form.contract_type,
          original_value: form.original_value ? Number(form.original_value) : null,
          retainage_percent: form.retainage_percent ? Number(form.retainage_percent) : null,
          revenue_recognition_method: form.revenue_recognition_method,
          estimated_total_cost: form.estimated_total_cost ? Number(form.estimated_total_cost) : null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: form.status,
          scope_description: form.scope_description.trim() || null,
          special_terms: form.special_terms.trim() || null,
          client_user_id: form.client_user_id || null,
        })
        .select("id")
        .single();

      if (contractError) throw contractError;
      if (!contract) throw new Error("Contract could not be created.");

      const milestoneRows = milestones
        .filter((m) => m.milestone_name.trim().length > 0)
        .map((m) => ({
          contract_id: contract.id,
          milestone_name: m.milestone_name.trim(),
          milestone_value: m.milestone_value ? Number(m.milestone_value) : null,
          due_date: m.due_date || null,
          status: m.status,
        }));

      if (milestoneRows.length > 0) {
        const { error: milestoneError } = await supabase.from("milestones").insert(milestoneRows);
        if (milestoneError) throw milestoneError;
      }

      setSuccess(`Contract "${form.contract_name.trim()}" created successfully.`);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contract.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Add Contract"
        subtitle="Create a new project contract and its schedule of values."
        actions={
          <Link href="/contracts" className="btn btn-ghost btn-sm">
            Back to Contracts
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <AlertBanner type="error">{error}</AlertBanner>
        </div>
      ) : null}
      {success ? (
        <div className="mb-4">
          <AlertBanner type="success">{success}</AlertBanner>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        <SectionCard title="Contract Details">
          <div className="space-y-4">
            <FormField label="Contract Name">
              <input
                className="input input-bordered"
                value={form.contract_name}
                onChange={(e) => updateField("contract_name", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Client Name">
              <input
                className="input input-bordered"
                value={form.client_name}
                onChange={(e) => updateField("client_name", e.target.value)}
              />
            </FormField>
            <FormField label="Client Email">
              <input
                type="email"
                className="input input-bordered"
                value={form.client_email}
                onChange={(e) => updateField("client_email", e.target.value)}
              />
            </FormField>
            <FormField label="Client Phone">
              <input
                className="input input-bordered"
                value={form.client_phone}
                onChange={(e) => updateField("client_phone", e.target.value)}
              />
            </FormField>
            <FormField label="Linked Client User" hint="Optional — grants that client login access to this contract.">
              <select
                className="select select-bordered"
                value={form.client_user_id}
                onChange={(e) => updateField("client_user_id", e.target.value)}
              >
                <option value="">None</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.full_name || client.email}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Project Address">
              <input
                className="input input-bordered"
                value={form.project_address}
                onChange={(e) => updateField("project_address", e.target.value)}
              />
            </FormField>
            <FormField label="City / State">
              <div className="flex gap-2">
                <input
                  className="input input-bordered w-full"
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                />
                <input
                  className="input input-bordered w-32"
                  placeholder="State"
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                />
              </div>
            </FormField>
            <FormField label="Contract Type">
              <select
                className="select select-bordered"
                value={form.contract_type}
                onChange={(e) => updateField("contract_type", e.target.value as ContractType)}
              >
                <option value="fixed_price">Fixed Price</option>
                <option value="cost_plus">Cost Plus</option>
                <option value="time_and_materials">Time &amp; Materials</option>
              </select>
            </FormField>
            <FormField label="Original Value">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="grow"
                  value={form.original_value}
                  onChange={(e) => updateField("original_value", e.target.value)}
                />
              </label>
            </FormField>
            <FormField label="Revenue Recognition">
              <select
                className="select select-bordered"
                value={form.revenue_recognition_method}
                onChange={(e) =>
                  updateField(
                    "revenue_recognition_method",
                    e.target.value as RevenueRecognitionMethod
                  )
                }
              >
                <option value="percentage_of_completion">Percentage of Completion (cost-to-cost)</option>
                <option value="completed_contract">Completed Contract</option>
              </select>
            </FormField>
            <FormField
              label="Estimated Total Cost"
              hint={
                form.revenue_recognition_method === "percentage_of_completion"
                  ? "Required for POC earned revenue"
                  : "Optional for completed-contract jobs"
              }
            >
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="grow"
                  value={form.estimated_total_cost}
                  onChange={(e) => updateField("estimated_total_cost", e.target.value)}
                />
              </label>
            </FormField>
            <FormField label="Retainage %">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
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
                onChange={(e) => updateField("status", e.target.value as typeof form.status)}
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </FormField>
            <FormField label="Scope Description">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={form.scope_description}
                onChange={(e) => updateField("scope_description", e.target.value)}
              />
            </FormField>
            <FormField label="Special Terms">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={form.special_terms}
                onChange={(e) => updateField("special_terms", e.target.value)}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          title="Milestones / Schedule of Values"
          actions={
            <button type="button" className="btn btn-ghost btn-sm" onClick={addMilestone}>
              <Plus className="h-4 w-4" /> Add Milestone
            </button>
          }
        >
          <div className="space-y-4">
            {milestones.map((milestone, index) => (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-[1fr_140px_160px_150px_auto] gap-2 items-end border-b border-base-300 pb-4 last:border-none last:pb-0"
              >
                <div>
                  <label className="text-xs opacity-60">Milestone Name</label>
                  <input
                    className="input input-bordered input-sm w-full mt-1"
                    value={milestone.milestone_name}
                    onChange={(e) => updateMilestone(index, "milestone_name", e.target.value)}
                    placeholder="e.g. Foundation complete"
                  />
                </div>
                <div>
                  <label className="text-xs opacity-60">Value</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input input-bordered input-sm w-full mt-1"
                    value={milestone.milestone_value}
                    onChange={(e) => updateMilestone(index, "milestone_value", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs opacity-60">Due Date</label>
                  <input
                    type="date"
                    className="input input-bordered input-sm w-full mt-1"
                    value={milestone.due_date}
                    onChange={(e) => updateMilestone(index, "due_date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs opacity-60">Status</label>
                  <select
                    className="select select-bordered select-sm w-full mt-1"
                    value={milestone.status}
                    onChange={(e) => updateMilestone(index, "status", e.target.value as MilestoneStatus)}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-error"
                  onClick={() => removeMilestone(index)}
                  disabled={milestones.length === 1}
                  aria-label="Remove milestone"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={saving}>
            Clear
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="loading loading-spinner loading-sm" /> : null}
            Save Contract
          </button>
        </div>
      </form>
    </div>
  );
}
