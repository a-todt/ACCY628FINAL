"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { FormField } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import { labelize } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/client";
import type { Contract, ContractStatus, ContractType } from "@/lib/types";

const STATUS_OPTIONS: ContractStatus[] = ["active", "on_hold", "completed", "canceled"];

type EditForm = {
  contract_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  project_address: string;
  city: string;
  state: string;
  contract_type: ContractType;
  original_value: string;
  retainage_percent: string;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  scope_description: string;
  special_terms: string;
};

function formFromContract(contract: Contract): EditForm {
  return {
    contract_name: contract.contract_name ?? "",
    client_name: contract.client_name ?? "",
    client_email: contract.client_email ?? "",
    client_phone: contract.client_phone ?? "",
    project_address: contract.project_address ?? "",
    city: contract.city ?? "",
    state: contract.state ?? "",
    contract_type: (contract.contract_type ?? "fixed_price") as ContractType,
    original_value: contract.original_value != null ? String(contract.original_value) : "",
    retainage_percent: contract.retainage_percent != null ? String(contract.retainage_percent) : "",
    start_date: contract.start_date ?? "",
    end_date: contract.end_date ?? "",
    status: contract.status,
    scope_description: contract.scope_description ?? "",
    special_terms: contract.special_terms ?? "",
  };
}

export function ContractEditForm({
  contract,
  showFinancials,
  onSaved,
  onError,
  onSuccess,
}: {
  contract: Contract;
  showFinancials: boolean;
  onSaved: () => Promise<void> | void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [form, setForm] = useState<EditForm>(() => formFromContract(contract));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(formFromContract(contract));
  }, [contract]);

  const updateField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.contract_name.trim()) {
      onError("Contract name is required.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
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
      };
      const { error } = await supabase.from("contracts").update(payload).eq("id", contract.id);
      if (error) throw error;
      await writeAuditLog("contract_updated", "contract", contract.id, {
        contract_name: payload.contract_name,
        from_status: contract.status,
        to_status: payload.status,
      });
      onSuccess("Contract details saved.");
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save contract.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <FormField label="Contract Name">
        <input
          className="input input-bordered w-full"
          value={form.contract_name}
          onChange={(e) => updateField("contract_name", e.target.value)}
          required
        />
      </FormField>
      <FormField label="Client">
        <input
          className="input input-bordered w-full"
          value={form.client_name}
          onChange={(e) => updateField("client_name", e.target.value)}
        />
      </FormField>
      <FormField label="Client Email">
        <input
          type="email"
          className="input input-bordered w-full"
          value={form.client_email}
          onChange={(e) => updateField("client_email", e.target.value)}
        />
      </FormField>
      <FormField label="Client Phone">
        <input
          className="input input-bordered w-full"
          value={form.client_phone}
          onChange={(e) => updateField("client_phone", e.target.value)}
        />
      </FormField>
      <FormField label="Project Address">
        <input
          className="input input-bordered w-full"
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
            className="input input-bordered w-28"
            placeholder="State"
            value={form.state}
            onChange={(e) => updateField("state", e.target.value)}
          />
        </div>
      </FormField>
      <FormField label="Contract Type">
        <select
          className="select select-bordered w-full"
          value={form.contract_type}
          onChange={(e) => updateField("contract_type", e.target.value as ContractType)}
        >
          <option value="fixed_price">Fixed Price</option>
          <option value="cost_plus">Cost Plus</option>
          <option value="time_and_materials">Time & Materials</option>
        </select>
      </FormField>
      {showFinancials ? (
        <>
          <FormField label="Original Value">
            <label className="input input-bordered flex items-center gap-2">
              $
              <MoneyInput
                className="grow"
                value={form.original_value}
                onValueChange={(v) => updateField("original_value", v)}
              />
            </label>
          </FormField>
          <FormField label="Retainage %">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="input input-bordered w-full"
              value={form.retainage_percent}
              onChange={(e) => updateField("retainage_percent", e.target.value)}
            />
          </FormField>
        </>
      ) : null}
      <FormField label="Start Date">
        <input
          type="date"
          className="input input-bordered w-full"
          value={form.start_date}
          onChange={(e) => updateField("start_date", e.target.value)}
        />
      </FormField>
      <FormField label="End Date">
        <input
          type="date"
          className="input input-bordered w-full"
          value={form.end_date}
          onChange={(e) => updateField("end_date", e.target.value)}
        />
      </FormField>
      <FormField label="Status">
        <select
          className="select select-bordered w-full"
          value={form.status}
          onChange={(e) => updateField("status", e.target.value as ContractStatus)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {labelize(status)}
            </option>
          ))}
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
      <FormField label="Special Terms / Internal Notes">
        <textarea
          className="textarea textarea-bordered w-full"
          rows={3}
          value={form.special_terms}
          onChange={(e) => updateField("special_terms", e.target.value)}
        />
      </FormField>
      <FormField label="Created">
        <p className="pt-2.5 text-sm">{new Date(contract.created_at).toLocaleDateString()}</p>
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={saving}
          onClick={() => setForm(formFromContract(contract))}
        >
          Reset
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? <span className="loading loading-spinner loading-xs" /> : <Save className="h-4 w-4" />}
          Save Contract
        </button>
      </div>
    </form>
  );
}
