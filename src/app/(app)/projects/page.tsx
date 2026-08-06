"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { compareValues } from "@/components/FilterSortBar";
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

type ActiveModal = "project" | "cost" | "billing" | "change_order" | null;
type SortKey = "name" | "status" | "value" | "cost";

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
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("asc");

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

  const closeModal = () => {
    setActiveModal(null);
    setProjectError(null);
    setCostError(null);
    setBillingError(null);
    setChangeOrderError(null);
  };

  const openModal = (modal: Exclude<ActiveModal, null>) => {
    setSuccess(null);
    setProjectError(null);
    setCostError(null);
    setBillingError(null);
    setChangeOrderError(null);
    setActiveModal(modal);
  };

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter((p) =>
      matchesColumnFilter(colStr(p, P.name), nameFilter)
    );
    return [...filtered].sort((a, b) => {
      if (sortKey === "status") {
        return compareValues(colStr(a, P.status, "active"), colStr(b, P.status, "active"), sortDir);
      }
      if (sortKey === "value") {
        return compareValues(colNum(a, P.contractValue), colNum(b, P.contractValue), sortDir);
      }
      if (sortKey === "cost") {
        return compareValues(colNum(a, P.estimatedCost), colNum(b, P.estimatedCost), sortDir);
      }
      return compareValues(colStr(a, P.name), colStr(b, P.name), sortDir);
    });
  }, [projects, nameFilter, sortKey, sortDir]);

  const nameOptions = useMemo(
    () => uniqueSorted(projects.map((p) => colStr(p, P.name))),
    [projects]
  );

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "value" || key === "cost" ? "desc" : "asc");
    }
  };

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
      closeModal();
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
      closeModal();
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
      setBillingError("Retainage receivable must be a valid number.");
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
      closeModal();
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
      closeModal();
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
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        subtitle="Create projects and enter costs/billings for WIP revenue recognition"
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {success ? <AlertBanner type="success">{success}</AlertBanner> : null}

      {canEdit ? (
        <div className="rounded-box border border-base-300 bg-base-100 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-60 mr-1">
              Add
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal("project")}>
              Project
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => openModal("cost")}
              disabled={!hasProjects}
            >
              Cost
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => openModal("billing")}
              disabled={!hasProjects}
            >
              Billing
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => openModal("change_order")}
              disabled={!hasProjects}
            >
              Change order
            </button>
          </div>
        </div>
      ) : null}

      <SectionCard title="Your projects">
        {!hasProjects ? (
          <p className="text-sm opacity-60 py-4 text-center">
            No projects yet.{canEdit ? " Use Add → Project above to create one." : ""}
          </p>
        ) : (
          <table className="table table-xs table-fixed w-full text-[11px]">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[16%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr className="bg-base-200/80">
                <ColumnAutocompleteHeader
                  label="Name"
                  listId="projects-filter-name"
                  value={nameFilter}
                  onChange={setNameFilter}
                  options={nameOptions}
                  sortActive={sortKey === "name"}
                  sortDir={sortDir}
                  onSort={() => onSort("name")}
                />
                <ColumnSortHeader
                  label="Status"
                  sortActive={sortKey === "status"}
                  sortDir={sortDir}
                  onSort={() => onSort("status")}
                />
                <ColumnSortHeader
                  label="Revised Value"
                  sortActive={sortKey === "value"}
                  sortDir={sortDir}
                  onSort={() => onSort("value")}
                  align="right"
                />
                <ColumnSortHeader
                  label="Est. Cost"
                  sortActive={sortKey === "cost"}
                  sortDir={sortDir}
                  onSort={() => onSort("cost")}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center opacity-60 py-6">
                    No projects match the name filter.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p) => {
                  const id = colStr(p, P.pk);
                  return (
                    <tr key={id} className="hover:bg-base-200/60">
                      <td className="font-medium truncate">{colStr(p, P.name)}</td>
                      <td className="text-center">
                        <span
                          className={`badge badge-sm ${statusBadgeClass(colStr(p, P.status, "active"))}`}
                        >
                          {labelize(colStr(p, P.status, "active"))}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {moneyExact(colNum(p, P.contractValue))}
                      </td>
                      <td className="text-right tabular-nums">
                        {moneyExact(colNum(p, P.estimatedCost))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </SectionCard>

      {activeModal === "project" ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-semibold text-lg">Create project</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label="Close"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>
            <form className="grid sm:grid-cols-2 gap-4" onSubmit={onCreateProject} noValidate>
              {projectError ? (
                <div className="sm:col-span-2">
                  <AlertBanner type="error">{projectError}</AlertBanner>
                </div>
              ) : null}
              <FormField label="Project name">
                <input
                  className="input input-bordered w-full"
                  value={projectForm.project_name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, project_name: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Client name">
                <input
                  className="input input-bordered w-full"
                  value={projectForm.client_name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, client_name: e.target.value }))}
                />
              </FormField>
              <FormField label="Original contract value">
                <input
                  className="input input-bordered w-full"
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
                  className="input input-bordered w-full"
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
                  className="input input-bordered w-full"
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
                  className="select select-bordered w-full"
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
                  className="input input-bordered w-full"
                  value={projectForm.start_date}
                  onChange={(e) => setProjectForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </FormField>
              <FormField label="End date">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={projectForm.end_date}
                  onChange={(e) => setProjectForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </FormField>
              <div className="sm:col-span-2 modal-action mt-2">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={savingProject}>
                  {savingProject ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Create project"
                  )}
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={closeModal} />
        </div>
      ) : null}

      {activeModal === "cost" ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-semibold text-lg">Add project cost</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label="Close"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>
            <form className="space-y-3" onSubmit={onAddCost} noValidate>
              {costError ? <AlertBanner type="error">{costError}</AlertBanner> : null}
              <FormField label="Project">
                <ProjectSelect
                  value={costForm.project_id}
                  onChange={(projectId) => setCostForm((p) => ({ ...p, project_id: projectId }))}
                  required
                  refreshKey={selectRefreshKey}
                />
              </FormField>
              <FormField label="Cost date">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={costForm.cost_date}
                  onChange={(e) => setCostForm((p) => ({ ...p, cost_date: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Category">
                <select
                  className="select select-bordered w-full"
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
                  className="input input-bordered w-full"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={costForm.amount}
                  onChange={(e) => setCostForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Description">
                <input
                  className="input input-bordered w-full"
                  value={costForm.description}
                  onChange={(e) => setCostForm((p) => ({ ...p, description: e.target.value }))}
                />
              </FormField>
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={savingCost || !hasProjects}>
                  {savingCost ? <span className="loading loading-spinner loading-xs" /> : "Add cost"}
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={closeModal} />
        </div>
      ) : null}

      {activeModal === "billing" ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-semibold text-lg">Add billing</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label="Close"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>
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
                  className="input input-bordered w-full"
                  value={billingForm.billing_number}
                  onChange={(e) =>
                    setBillingForm((p) => ({ ...p, billing_number: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Billing date">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={billingForm.billing_date}
                  onChange={(e) => setBillingForm((p) => ({ ...p, billing_date: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Amount billed">
                <input
                  className="input input-bordered w-full"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={billingForm.amount_billed}
                  onChange={(e) =>
                    setBillingForm((p) => ({ ...p, amount_billed: e.target.value }))
                  }
                  required
                />
              </FormField>
              <FormField
                label="Retainage receivable"
                hint="ASC 606 contract asset — billed but withheld until conditions are met."
              >
                <input
                  className="input input-bordered w-full"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={billingForm.retainage_held}
                  onChange={(e) =>
                    setBillingForm((p) => ({ ...p, retainage_held: e.target.value }))
                  }
                />
              </FormField>
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={savingBilling || !hasProjects}>
                  {savingBilling ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Add billing"
                  )}
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={closeModal} />
        </div>
      ) : null}

      {activeModal === "change_order" ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-semibold text-lg">Add change order</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label="Close"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>
            <form className="space-y-3" onSubmit={onAddChangeOrder} noValidate>
              {changeOrderError ? <AlertBanner type="error">{changeOrderError}</AlertBanner> : null}
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
                  className="input input-bordered w-full"
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
                  className="input input-bordered w-full"
                  value={changeOrderForm.description}
                  onChange={(e) =>
                    setChangeOrderForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Amount">
                <input
                  className="input input-bordered w-full"
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
                  className="select select-bordered w-full"
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
                    className="input input-bordered w-full"
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
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={savingChangeOrder || !hasProjects}>
                  {savingChangeOrder ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Add change order"
                  )}
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={closeModal} />
        </div>
      ) : null}
    </div>
  );
}
