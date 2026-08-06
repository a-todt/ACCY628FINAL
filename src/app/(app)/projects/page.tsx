"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectSelect } from "@/components/ProjectSelect";
import { AlertBanner, FormField, PageHeader, SectionCard } from "@/components/ui";
import { moneyExact, labelize } from "@/lib/metrics";
import { canEnterCosts, canViewCosts, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { WIP_DB, colNum, colStr, selectList, type DbRow } from "@/lib/wipSchema";

const P = WIP_DB.projects;
const C = WIP_DB.projectCosts;
const B = WIP_DB.billings;
const CO = WIP_DB.projectChangeOrders;

const EMPTY_PROJECT = {
  project_name: "",
  client_name: "",
  original_contract_value: "",
  revised_contract_value: "",
  estimated_total_cost: "",
  start_date: "",
  end_date: "",
  status: "active",
};

const EMPTY_COST = {
  project_id: "",
  cost_date: "",
  cost_category: "labor",
  description: "",
  amount: "",
};

const EMPTY_BILLING = {
  project_id: "",
  billing_number: "",
  billing_date: "",
  amount_billed: "",
  retainage_held: "",
  status: "submitted",
};

const EMPTY_CHANGE_ORDER = {
  project_id: "",
  change_order_number: "",
  description: "",
  amount: "",
  status: "pending",
  approved_date: "",
};

function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export default function ProjectsPage() {
  const { user, effectiveRole } = useAuth();
  const canView = canViewCosts(effectiveRole);
  const canEdit = canEnterCosts(effectiveRole);

  const [projects, setProjects] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectRefreshKey, setSelectRefreshKey] = useState(0);

  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT);
  const [costForm, setCostForm] = useState(EMPTY_COST);
  const [billingForm, setBillingForm] = useState(EMPTY_BILLING);
  const [changeOrderForm, setChangeOrderForm] = useState(EMPTY_CHANGE_ORDER);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [changeOrderError, setChangeOrderError] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [savingCost, setSavingCost] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [savingChangeOrder, setSavingChangeOrder] = useState(false);

  const load = useCallback(async () => {
    if (!user || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data, error: loadError } = await supabase
        .from(P.table)
        .select(
          selectList(P.pk, P.name, P.contractValue, P.estimatedCost, P.status),
        )
        .eq(P.userId, user.id)
        .order(P.name, { ascending: true });
      if (loadError) throw loadError;
      setProjects((data ?? []) as unknown as DbRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    setProjectError(null);
    setSuccess(null);

    if (!user) {
      setProjectError("You must be signed in.");
      return;
    }
    if (!projectForm.project_name.trim()) {
      setProjectError("Project name is required.");
      return;
    }

    const original = parseMoney(projectForm.original_contract_value);
    const revised = parseMoney(projectForm.revised_contract_value);
    const estimate = parseMoney(projectForm.estimated_total_cost);

    if (projectForm.original_contract_value && Number.isNaN(original)) {
      setProjectError("Original contract value must be a valid number.");
      return;
    }
    if (projectForm.revised_contract_value && Number.isNaN(revised)) {
      setProjectError("Revised contract value must be a valid number.");
      return;
    }
    if (projectForm.estimated_total_cost && Number.isNaN(estimate)) {
      setProjectError("Estimated total cost must be a valid number.");
      return;
    }
    if ((original ?? 0) < 0 || (revised ?? 0) < 0 || (estimate ?? 0) < 0) {
      setProjectError("Money amounts cannot be negative.");
      return;
    }
    if (
      projectForm.start_date &&
      projectForm.end_date &&
      projectForm.end_date < projectForm.start_date
    ) {
      setProjectError("End date must be on or after start date.");
      return;
    }

    setSavingProject(true);
    try {
      const supabase = createClient();
      const originalValue = original ?? 0;
      const revisedValue = revised ?? originalValue;
      const { error: insertError } = await supabase.from(P.table).insert({
        [P.userId]: user.id,
        [P.name]: projectForm.project_name.trim(),
        [P.clientName]: projectForm.client_name.trim() || null,
        [P.originalValue]: originalValue,
        [P.contractValue]: revisedValue,
        [P.estimatedCost]: estimate ?? 0,
        start_date: projectForm.start_date || null,
        end_date: projectForm.end_date || null,
        [P.status]: projectForm.status || "active",
      });
      if (insertError) throw insertError;
      setProjectForm(EMPTY_PROJECT);
      setSuccess("Project created.");
      setSelectRefreshKey((k) => k + 1);
      await load();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setSavingProject(false);
    }
  };

  const onAddCost = async (e: FormEvent) => {
    e.preventDefault();
    setCostError(null);
    setSuccess(null);

    if (!user) {
      setCostError("You must be signed in.");
      return;
    }
    if (!costForm.project_id) {
      setCostError("Select a project.");
      return;
    }
    if (!costForm.cost_date) {
      setCostError("Cost date is required.");
      return;
    }
    const amount = parseMoney(costForm.amount);
    if (amount == null || Number.isNaN(amount)) {
      setCostError("Amount is required and must be a valid number.");
      return;
    }
    if (amount <= 0) {
      setCostError("Amount must be greater than zero.");
      return;
    }

    setSavingCost(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from(C.table).insert({
        [C.userId]: user.id,
        [C.fk]: costForm.project_id,
        [C.costDate]: costForm.cost_date,
        [C.category]: costForm.cost_category,
        [C.description]: costForm.description.trim() || null,
        [C.amount]: amount,
      });
      if (insertError) throw insertError;
      setCostForm((prev) => ({ ...EMPTY_COST, project_id: prev.project_id }));
      setSuccess("Cost entry added.");
    } catch (err) {
      setCostError(err instanceof Error ? err.message : "Failed to add cost.");
    } finally {
      setSavingCost(false);
    }
  };

  const onAddBilling = async (e: FormEvent) => {
    e.preventDefault();
    setBillingError(null);
    setSuccess(null);

    if (!user) {
      setBillingError("You must be signed in.");
      return;
    }
    if (!billingForm.project_id) {
      setBillingError("Select a project.");
      return;
    }
    if (!billingForm.billing_date) {
      setBillingError("Billing date is required.");
      return;
    }
    const amountBilled = parseMoney(billingForm.amount_billed);
    const retainage = parseMoney(billingForm.retainage_held);
    if (amountBilled == null || Number.isNaN(amountBilled)) {
      setBillingError("Amount billed is required and must be a valid number.");
      return;
    }
    if (amountBilled <= 0) {
      setBillingError("Amount billed must be greater than zero.");
      return;
    }
    if (billingForm.retainage_held && Number.isNaN(retainage)) {
      setBillingError("Retainage held must be a valid number.");
      return;
    }
    const retainageHeld = retainage ?? 0;
    if (retainageHeld < 0) {
      setBillingError("Retainage cannot be negative.");
      return;
    }
    if (retainageHeld > amountBilled) {
      setBillingError("Retainage cannot exceed amount billed.");
      return;
    }

    setSavingBilling(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from(B.table).insert({
        [B.userId]: user.id,
        [B.fk]: billingForm.project_id,
        [B.billingNumber]: billingForm.billing_number.trim() || null,
        [B.billingDate]: billingForm.billing_date,
        [B.amountBilled]: amountBilled,
        [B.retainageHeld]: retainageHeld,
        [B.netAmount]: amountBilled - retainageHeld,
        [B.status]: billingForm.status || "submitted",
      });
      if (insertError) throw insertError;
      setBillingForm((prev) => ({ ...EMPTY_BILLING, project_id: prev.project_id }));
      setSuccess("Billing added.");
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Failed to add billing.");
    } finally {
      setSavingBilling(false);
    }
  };

  const onAddChangeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setChangeOrderError(null);
    setSuccess(null);

    if (!user) {
      setChangeOrderError("You must be signed in.");
      return;
    }
    if (!changeOrderForm.project_id) {
      setChangeOrderError("Select a project.");
      return;
    }
    const amount = parseMoney(changeOrderForm.amount);
    if (amount == null || Number.isNaN(amount)) {
      setChangeOrderError("Amount is required and must be a valid number.");
      return;
    }
    if (amount === 0) {
      setChangeOrderError("Amount cannot be zero.");
      return;
    }

    setSavingChangeOrder(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from(CO.table).insert({
        [CO.userId]: user.id,
        [CO.fk]: changeOrderForm.project_id,
        [CO.number]: changeOrderForm.change_order_number.trim() || null,
        [CO.description]: changeOrderForm.description.trim() || null,
        [CO.amount]: amount,
        [CO.status]: changeOrderForm.status || "pending",
        [CO.approvedDate]:
          changeOrderForm.status === "approved" && changeOrderForm.approved_date
            ? changeOrderForm.approved_date
            : changeOrderForm.status === "approved"
              ? new Date().toISOString().slice(0, 10)
              : null,
      });
      if (insertError) throw insertError;
      setChangeOrderForm((prev) => ({
        ...EMPTY_CHANGE_ORDER,
        project_id: prev.project_id,
      }));
      setSuccess("Change order added.");
    } catch (err) {
      setChangeOrderError(err instanceof Error ? err.message : "Failed to add change order.");
    } finally {
      setSavingChangeOrder(false);
    }
  };

  if (!canView) {
    return (
      <div>
        <PageHeader title="Projects" subtitle="Revenue recognition projects" />
        <AlertBanner type="error">Access denied.</AlertBanner>
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

  const hasProjects = projects.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Create projects and enter costs/billings for WIP revenue recognition"
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {success ? <AlertBanner type="success">{success}</AlertBanner> : null}

      <SectionCard title="Your projects">
        {!hasProjects ? (
          <p className="text-sm opacity-60 py-4 text-center">No projects yet. Create one below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="text-right">Revised Value</th>
                  <th className="text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const id = colStr(p, P.pk);
                  return (
                    <tr key={id}>
                      <td className="font-medium">{colStr(p, P.name)}</td>
                      <td>
                        <span
                          className={`badge badge-sm ${statusBadgeClass(colStr(p, P.status, "active"))}`}
                        >
                          {labelize(colStr(p, P.status, "active"))}
                        </span>
                      </td>
                      <td className="text-right">{moneyExact(colNum(p, P.contractValue))}</td>
                      <td className="text-right">{moneyExact(colNum(p, P.estimatedCost))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {canEdit ? (
        <>
          <SectionCard title="Create project">
            <form className="grid sm:grid-cols-2 gap-4" onSubmit={onCreateProject} noValidate>
              {projectError ? (
                <div className="sm:col-span-2">
                  <AlertBanner type="error">{projectError}</AlertBanner>
                </div>
              ) : null}
              <FormField label="Project name">
                <input
                  className="input input-bordered"
                  value={projectForm.project_name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, project_name: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Client name">
                <input
                  className="input input-bordered"
                  value={projectForm.client_name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, client_name: e.target.value }))}
                />
              </FormField>
              <FormField label="Original contract value">
                <input
                  className="input input-bordered"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={projectForm.original_contract_value}
                  onChange={(e) =>
                    setProjectForm((p) => ({ ...p, original_contract_value: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Revised contract value">
                <input
                  className="input input-bordered"
                  inputMode="decimal"
                  placeholder="Defaults to original"
                  value={projectForm.revised_contract_value}
                  onChange={(e) =>
                    setProjectForm((p) => ({ ...p, revised_contract_value: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Estimated total cost">
                <input
                  className="input input-bordered"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={projectForm.estimated_total_cost}
                  onChange={(e) =>
                    setProjectForm((p) => ({ ...p, estimated_total_cost: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Status">
                <select
                  className="select select-bordered"
                  value={projectForm.status}
                  onChange={(e) => setProjectForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </FormField>
              <FormField label="Start date">
                <input
                  type="date"
                  className="input input-bordered"
                  value={projectForm.start_date}
                  onChange={(e) => setProjectForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </FormField>
              <FormField label="End date">
                <input
                  type="date"
                  className="input input-bordered"
                  value={projectForm.end_date}
                  onChange={(e) => setProjectForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </FormField>
              <div className="sm:col-span-2">
                <button className="btn btn-primary" disabled={savingProject}>
                  {savingProject ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Create project"
                  )}
                </button>
              </div>
            </form>
          </SectionCard>

          <div className="grid lg:grid-cols-3 gap-6">
            <SectionCard title="Add project cost">
              <form className="space-y-3" onSubmit={onAddCost} noValidate>
                {costError ? <AlertBanner type="error">{costError}</AlertBanner> : null}
                <FormField label="Project">
                  <ProjectSelect
                    value={costForm.project_id}
                    onChange={(projectId) =>
                      setCostForm((p) => ({ ...p, project_id: projectId }))
                    }
                    required
                    refreshKey={selectRefreshKey}
                  />
                </FormField>
                <FormField label="Cost date">
                  <input
                    type="date"
                    className="input input-bordered"
                    value={costForm.cost_date}
                    onChange={(e) => setCostForm((p) => ({ ...p, cost_date: e.target.value }))}
                    required
                  />
                </FormField>
                <FormField label="Category">
                  <select
                    className="select select-bordered"
                    value={costForm.cost_category}
                    onChange={(e) => setCostForm((p) => ({ ...p, cost_category: e.target.value }))}
                  >
                    <option value="labor">Labor</option>
                    <option value="materials">Materials</option>
                    <option value="subcontractor">Subcontractor</option>
                    <option value="equipment">Equipment</option>
                    <option value="permits">Permits</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>
                <FormField label="Amount">
                  <input
                    className="input input-bordered"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={costForm.amount}
                    onChange={(e) => setCostForm((p) => ({ ...p, amount: e.target.value }))}
                    required
                  />
                </FormField>
                <FormField label="Description">
                  <input
                    className="input input-bordered"
                    value={costForm.description}
                    onChange={(e) => setCostForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </FormField>
                <button className="btn btn-primary btn-sm" disabled={savingCost || !hasProjects}>
                  {savingCost ? <span className="loading loading-spinner loading-xs" /> : "Add cost"}
                </button>
              </form>
            </SectionCard>

            <SectionCard title="Add billing">
              <form className="space-y-3" onSubmit={onAddBilling} noValidate>
                {billingError ? <AlertBanner type="error">{billingError}</AlertBanner> : null}
                <FormField label="Project">
                  <ProjectSelect
                    value={billingForm.project_id}
                    onChange={(projectId) =>
                      setBillingForm((p) => ({ ...p, project_id: projectId }))
                    }
                    required
                    refreshKey={selectRefreshKey}
                  />
                </FormField>
                <FormField label="Billing number">
                  <input
                    className="input input-bordered"
                    value={billingForm.billing_number}
                    onChange={(e) =>
                      setBillingForm((p) => ({ ...p, billing_number: e.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Billing date">
                  <input
                    type="date"
                    className="input input-bordered"
                    value={billingForm.billing_date}
                    onChange={(e) => setBillingForm((p) => ({ ...p, billing_date: e.target.value }))}
                    required
                  />
                </FormField>
                <FormField label="Amount billed">
                  <input
                    className="input input-bordered"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={billingForm.amount_billed}
                    onChange={(e) =>
                      setBillingForm((p) => ({ ...p, amount_billed: e.target.value }))
                    }
                    required
                  />
                </FormField>
                <FormField label="Retainage held">
                  <input
                    className="input input-bordered"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={billingForm.retainage_held}
                    onChange={(e) =>
                      setBillingForm((p) => ({ ...p, retainage_held: e.target.value }))
                    }
                  />
                </FormField>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={savingBilling || !hasProjects}
                >
                  {savingBilling ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Add billing"
                  )}
                </button>
              </form>
            </SectionCard>

            <SectionCard title="Add change order">
              <form className="space-y-3" onSubmit={onAddChangeOrder} noValidate>
                {changeOrderError ? (
                  <AlertBanner type="error">{changeOrderError}</AlertBanner>
                ) : null}
                <FormField label="Project">
                  <ProjectSelect
                    value={changeOrderForm.project_id}
                    onChange={(projectId) =>
                      setChangeOrderForm((p) => ({ ...p, project_id: projectId }))
                    }
                    required
                    refreshKey={selectRefreshKey}
                  />
                </FormField>
                <FormField label="CO number">
                  <input
                    className="input input-bordered"
                    value={changeOrderForm.change_order_number}
                    onChange={(e) =>
                      setChangeOrderForm((p) => ({
                        ...p,
                        change_order_number: e.target.value,
                      }))
                    }
                    placeholder="e.g. CO-001"
                  />
                </FormField>
                <FormField label="Description">
                  <input
                    className="input input-bordered"
                    value={changeOrderForm.description}
                    onChange={(e) =>
                      setChangeOrderForm((p) => ({ ...p, description: e.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Amount">
                  <input
                    className="input input-bordered"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={changeOrderForm.amount}
                    onChange={(e) =>
                      setChangeOrderForm((p) => ({ ...p, amount: e.target.value }))
                    }
                    required
                  />
                </FormField>
                <FormField label="Status">
                  <select
                    className="select select-bordered"
                    value={changeOrderForm.status}
                    onChange={(e) =>
                      setChangeOrderForm((p) => ({ ...p, status: e.target.value }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </FormField>
                {changeOrderForm.status === "approved" ? (
                  <FormField label="Approved date">
                    <input
                      type="date"
                      className="input input-bordered"
                      value={changeOrderForm.approved_date}
                      onChange={(e) =>
                        setChangeOrderForm((p) => ({
                          ...p,
                          approved_date: e.target.value,
                        }))
                      }
                    />
                  </FormField>
                ) : null}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={savingChangeOrder || !hasProjects}
                >
                  {savingChangeOrder ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Add change order"
                  )}
                </button>
              </form>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
