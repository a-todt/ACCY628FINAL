"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useAdminData } from "@/hooks/useAdminData";
import { MoneyInput } from "@/components/MoneyInput";
import { AlertBanner, FormField, PageHeader, SectionCard } from "@/components/ui";
import { canManageContracts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { linkCustomerToContract } from "@/lib/clientProspect";
import type { ContractType, MilestoneStatus } from "@/lib/types";

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
  start_date: "",
  end_date: "",
  status: "active" as const,
  scope_description: "",
  special_terms: "",
  client_user_id: "",
  customer_id: "",
};

export default function NewContractRoute() {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-24">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      }
    >
      <NewContractPage />
    </Suspense>
  );
}

function NewContractPage() {
  const searchParams = useSearchParams();
  const { effectiveRole, user } = useAuth();
  const { userProfiles } = useContractData();
  const admin = useAdminData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([{ ...EMPTY_MILESTONE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clients = useMemo(() => userProfiles.filter((p) => p.role === "client"), [userProfiles]);
  const linkableCustomers = useMemo(() => {
    const rows = admin.customers.filter((c) => Boolean(c.user_id));
    return rows;
  }, [admin.customers]);
  const prospectCustomers = useMemo(
    () => linkableCustomers.filter((c) => !c.contract_id),
    [linkableCustomers]
  );

  useEffect(() => {
    const fromQuery = searchParams.get("customer");
    if (!fromQuery || form.customer_id) return;
    const match = linkableCustomers.find((c) => c.id === fromQuery);
    if (!match) return;
    setForm((prev) => ({
      ...prev,
      customer_id: match.id,
      client_name: match.company_name || match.contact_name || prev.client_name,
      client_email: match.contact_email || prev.client_email,
      client_phone: match.contact_phone || prev.client_phone,
      client_user_id: match.user_id || prev.client_user_id,
      contract_name: prev.contract_name || `${match.company_name || "Client"} — Project`,
    }));
  }, [searchParams, linkableCustomers, form.customer_id]);

  if (!canManageContracts(effectiveRole)) {
    return (
      <div>
        <PageHeader compact title="Add Contract" />
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

      if (form.customer_id) {
        await linkCustomerToContract(form.customer_id, contract.id);
      }

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

  const fieldClass = "input input-bordered input-sm w-full";
  const selectClass = "select select-bordered select-sm w-full";

  return (
    <div className="space-y-3">
      <PageHeader
        compact
        title="Add Contract"
        actions={
          <Link href="/contracts" className="btn btn-ghost btn-sm">
            Back to Contracts
          </Link>
        }
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {success ? <AlertBanner type="success">{success}</AlertBanner> : null}

      <form onSubmit={onSubmit} className="space-y-3 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <SectionCard compact title="Project & Terms">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <FormField stacked label="Contract Name">
                  <input
                    className={fieldClass}
                    value={form.contract_name}
                    onChange={(e) => updateField("contract_name", e.target.value)}
                    required
                  />
                </FormField>
              </div>
              <FormField stacked label="Client Name">
                <input
                  className={fieldClass}
                  value={form.client_name}
                  onChange={(e) => updateField("client_name", e.target.value)}
                />
              </FormField>
              <FormField stacked label="Client Phone">
                <input
                  className={fieldClass}
                  value={form.client_phone}
                  onChange={(e) => updateField("client_phone", e.target.value)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField stacked label="Client Email">
                  <input
                    type="email"
                    className={fieldClass}
                    value={form.client_email}
                    onChange={(e) => updateField("client_email", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField stacked label="Link prospect / client record">
                <select
                  className={selectClass}
                  title="Self-serve inquiries and existing client rows. Links login access after create."
                  value={form.customer_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const match = linkableCustomers.find((c) => c.id === id);
                    setForm((prev) => ({
                      ...prev,
                      customer_id: id,
                      client_name: match?.company_name || match?.contact_name || prev.client_name,
                      client_email: match?.contact_email || prev.client_email,
                      client_phone: match?.contact_phone || prev.client_phone,
                      client_user_id: match?.user_id || prev.client_user_id,
                    }));
                  }}
                >
                  <option value="">None</option>
                  {prospectCustomers.length > 0 ? (
                    <optgroup label="Open prospects">
                      {prospectCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company_name}
                          {c.contact_name ? ` · ${c.contact_name}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {linkableCustomers
                    .filter((c) => c.contract_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} (already on a project)
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField stacked label="Linked Client User">
                <select
                  className={selectClass}
                  title="Optional — grants that client login access to this contract."
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
              <FormField stacked label="Contract Type">
                <select
                  className={selectClass}
                  value={form.contract_type}
                  onChange={(e) => updateField("contract_type", e.target.value as ContractType)}
                >
                  <option value="fixed_price">Fixed Price</option>
                  <option value="cost_plus">Cost Plus</option>
                  <option value="time_and_materials">Time &amp; Materials</option>
                </select>
              </FormField>
              <FormField stacked label="Status">
                <select
                  className={selectClass}
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value as typeof form.status)}
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </FormField>
              <FormField stacked label="Original Value">
                <label className="input input-bordered input-sm flex items-center gap-2 w-full">
                  $
                  <MoneyInput
                    className="grow"
                    min="0"
                    value={form.original_value}
                    onValueChange={(v) => updateField("original_value", v)}
                  />
                </label>
              </FormField>
              <FormField stacked label="Retainage %">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className={fieldClass}
                  value={form.retainage_percent}
                  onChange={(e) => updateField("retainage_percent", e.target.value)}
                />
              </FormField>
              <FormField stacked label="Start Date">
                <input
                  type="date"
                  className={fieldClass}
                  value={form.start_date}
                  onChange={(e) => updateField("start_date", e.target.value)}
                />
              </FormField>
              <FormField stacked label="End Date">
                <input
                  type="date"
                  className={fieldClass}
                  value={form.end_date}
                  onChange={(e) => updateField("end_date", e.target.value)}
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard compact title="Location & Scope">
            <div className="grid grid-cols-1 gap-2">
              <FormField stacked label="Project Address">
                <input
                  className={fieldClass}
                  value={form.project_address}
                  onChange={(e) => updateField("project_address", e.target.value)}
                />
              </FormField>
              <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <FormField stacked label="City">
                  <input
                    className={fieldClass}
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                  />
                </FormField>
                <FormField stacked label="State">
                  <input
                    className={fieldClass}
                    value={form.state}
                    onChange={(e) => updateField("state", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField stacked label="Scope Description">
                <textarea
                  className="textarea textarea-bordered textarea-sm w-full leading-snug"
                  rows={4}
                  value={form.scope_description}
                  onChange={(e) => updateField("scope_description", e.target.value)}
                />
              </FormField>
              <FormField stacked label="Special Terms">
                <textarea
                  className="textarea textarea-bordered textarea-sm w-full leading-snug"
                  rows={3}
                  value={form.special_terms}
                  onChange={(e) => updateField("special_terms", e.target.value)}
                />
              </FormField>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          compact
          title="Milestones / Schedule of Values"
          actions={
            <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={addMilestone}>
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          }
        >
          <div className="space-y-1.5">
            {milestones.map((milestone, index) => (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-[1fr_100px_130px_120px_auto] gap-1.5 items-end"
              >
                <div>
                  <label className="text-[10px] opacity-60">Milestone Name</label>
                  <input
                    className={`${fieldClass} mt-0.5`}
                    value={milestone.milestone_name}
                    onChange={(e) => updateMilestone(index, "milestone_name", e.target.value)}
                    placeholder="e.g. Foundation complete"
                  />
                </div>
                <div>
                  <label className="text-[10px] opacity-60">Value</label>
                  <MoneyInput
                    className={`${fieldClass} mt-0.5`}
                    value={milestone.milestone_value}
                    onValueChange={(v) => updateMilestone(index, "milestone_value", v)}
                  />
                </div>
                <div>
                  <label className="text-[10px] opacity-60">Due Date</label>
                  <input
                    type="date"
                    className={`${fieldClass} mt-0.5`}
                    value={milestone.due_date}
                    onChange={(e) => updateMilestone(index, "due_date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] opacity-60">Status</label>
                  <select
                    className={`${selectClass} mt-0.5`}
                    value={milestone.status}
                    onChange={(e) =>
                      updateMilestone(index, "status", e.target.value as MilestoneStatus)
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-error"
                  onClick={() => removeMilestone(index)}
                  disabled={milestones.length === 1}
                  aria-label="Remove milestone"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="sticky bottom-0 z-20 -mx-1 px-1 pt-2 pb-2 bg-base-100/90 backdrop-blur-sm border-t border-base-300">
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm} disabled={saving}>
              Clear
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? <span className="loading loading-spinner loading-sm" /> : null}
              Save Contract
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
