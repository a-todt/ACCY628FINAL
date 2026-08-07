"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FilePlus2,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { compareValues } from "@/components/FilterSortBar";
import { useAuth } from "@/contexts/AuthContext";
import { MoneyInput } from "@/components/MoneyInput";
import { ProjectSelect } from "@/components/ProjectSelect";
import { AlertBanner, FormField, PageHeader, SectionCard, TableShell } from "@/components/ui";
import { moneyExact, labelize } from "@/lib/metrics";
import { parseMoneyInput } from "@/lib/moneyInput";
import {
  canApproveChangeOrderForAmount,
  changeOrderApprovalBlockedReason,
} from "@/lib/approvalThresholds";
import { canEnterCosts, canListCompanyProjects, canViewCosts, statusBadgeClass } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { WIP_DB, colNum, colStr, selectList, type DbRow } from "@/lib/wipSchema";

const P = WIP_DB.projects;
const C = WIP_DB.projectCosts;
const B = WIP_DB.billings;
const CO = WIP_DB.projectChangeOrders;

const PROJECT_STATUS_OPTIONS = ["active", "completed", "on_hold"] as const;
type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number];

type ActiveModal = "project" | "cost" | "billing" | "change_order" | null;
type SortKey = "name" | "status" | "value" | "cost";

function moneyField(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

function dateField(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value).slice(0, 10);
}

function projectToForm(row: DbRow) {
  return {
    contract_id: colStr(row, P.contractId),
    project_name: colStr(row, P.name),
    client_name: colStr(row, P.clientName),
    original_contract_value: moneyField(colNum(row, P.originalValue)),
    revised_contract_value: moneyField(colNum(row, P.contractValue)),
    estimated_total_cost: moneyField(colNum(row, P.estimatedCost)),
    start_date: dateField(row.start_date),
    end_date: dateField(row.end_date),
    status: colStr(row, P.status, "active") || "active",
  };
}

const EMPTY_PROJECT = {
  contract_id: "",
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

/** Hard ceiling for a single WIP cost/billing/CO line (blocks trillion-scale typos). */
const MAX_WIP_LINE_AMOUNT = 999_999_999.99;

function validateWipLineAmount(
  amount: number,
  label: string,
  options?: { projectCeiling?: number | null }
): string | null {
  if (!Number.isFinite(amount)) return `${label} must be a valid number.`;
  if (amount <= 0) return `${label} must be greater than zero.`;
  if (amount > MAX_WIP_LINE_AMOUNT) {
    return `${label} cannot exceed $999,999,999.99 (check for an extra zero).`;
  }
  const ceiling = options?.projectCeiling;
  if (ceiling != null && ceiling > 0 && amount > ceiling + 0.005) {
    return `${label} cannot exceed this project's revised contract value ($${ceiling.toLocaleString("en-US", { maximumFractionDigits: 2 })}).`;
  }
  return null;
}

export default function ProjectsPage() {
  const { user, effectiveRole } = useAuth();
  const canView = canViewCosts(effectiveRole);
  const canEdit = canEnterCosts(effectiveRole);
  const listCompanyProjects = canListCompanyProjects(effectiveRole);

  const [projects, setProjects] = useState<DbRow[]>([]);
  const [contracts, setContracts] = useState<
    Array<{ id: string; contract_name: string; client_name: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectRefreshKey, setSelectRefreshKey] = useState(0);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  const load = useCallback(async () => {
    if (!user || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      let query = supabase
        .from(P.table)
        .select(
          selectList(
            P.pk,
            P.contractId,
            P.name,
            P.clientName,
            P.originalValue,
            P.contractValue,
            P.estimatedCost,
            P.status,
            "start_date",
            "end_date"
          ),
        )
        .order(P.name, { ascending: true });
      if (!listCompanyProjects) {
        query = query.eq(P.userId, user.id);
      }
      const { data, error: loadError } = await query;
      if (loadError) throw loadError;
      setProjects((data ?? []) as unknown as DbRow[]);

      if (canEdit) {
        const { data: contractRows, error: contractError } = await supabase
          .from("contracts")
          .select("id, contract_name, client_name")
          .order("contract_name", { ascending: true });
        if (contractError) throw contractError;
        setContracts(
          (contractRows ?? []) as Array<{
            id: string;
            contract_name: string;
            client_name: string | null;
          }>
        );
      } else {
        setContracts([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user, canView, canEdit, listCompanyProjects]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setActiveModal(null);
    setEditingProjectId(null);
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
    if (modal === "project") {
      setEditingProjectId(null);
      setProjectForm(EMPTY_PROJECT);
    }
    setActiveModal(modal);
  };

  const openEditProject = (row: DbRow) => {
    setSuccess(null);
    setProjectError(null);
    setEditingProjectId(colStr(row, P.pk));
    setProjectForm(projectToForm(row));
    setActiveModal("project");
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

  const allFilteredSelected =
    filteredProjects.length > 0 &&
    filteredProjects.every((p) => selectedIds.has(colStr(p, P.pk)));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredProjects) next.delete(colStr(p, P.pk));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredProjects) next.add(colStr(p, P.pk));
        return next;
      });
    }
  };

  const setProjectStatus = async (projectId: string, status: ProjectStatus) => {
    if (!user) return;
    setBusyId(projectId);
    setError(null);
    setSuccess(null);
    try {
      const supabase = createClient();
      let updateQuery = supabase
        .from(P.table)
        .update({ [P.status]: status })
        .eq(P.pk, projectId);
      if (!listCompanyProjects) {
        updateQuery = updateQuery.eq(P.userId, user.id);
      }
      const { error: updateError } = await updateQuery;
      if (updateError) throw updateError;
      setSuccess(`Status set to ${labelize(status)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  };

  const runBulkStatus = async (status: ProjectStatus) => {
    if (!user || selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const supabase = createClient();
      const ids = Array.from(selectedIds);
      let updateQuery = supabase
        .from(P.table)
        .update({ [P.status]: status })
        .in(P.pk, ids);
      if (!listCompanyProjects) {
        updateQuery = updateQuery.eq(P.userId, user.id);
      }
      const { error: updateError } = await updateQuery;
      if (updateError) throw updateError;
      setSuccess(`Updated ${ids.length} project${ids.length === 1 ? "" : "s"} to ${labelize(status)}.`);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update selected projects.");
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteProject = async (projectId: string, projectName: string) => {
    if (!user) return;
    if (
      !window.confirm(
        `Permanently delete project "${projectName || projectId}"? Related costs, billings, and change orders will also be deleted.`
      )
    ) {
      return;
    }
    setDeletingProject(true);
    setError(null);
    setSuccess(null);
    try {
      const supabase = createClient();
      let deleteQuery = supabase.from(P.table).delete().eq(P.pk, projectId);
      if (!listCompanyProjects) {
        deleteQuery = deleteQuery.eq(P.userId, user.id);
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;
      setSuccess("Project deleted.");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      closeModal();
      setSelectRefreshKey((k) => k + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    } finally {
      setDeletingProject(false);
    }
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "value" || key === "cost" ? "desc" : "asc");
    }
  };

  const onSaveProject = async (e: FormEvent) => {
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

    const original = parseMoneyInput(projectForm.original_contract_value);
    const revised = parseMoneyInput(projectForm.revised_contract_value);
    const estimate = parseMoneyInput(projectForm.estimated_total_cost);

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
      const payload = {
        [P.name]: projectForm.project_name.trim(),
        [P.clientName]: projectForm.client_name.trim() || null,
        [P.originalValue]: originalValue,
        [P.contractValue]: revisedValue,
        [P.estimatedCost]: estimate ?? 0,
        start_date: projectForm.start_date || null,
        end_date: projectForm.end_date || null,
        [P.status]: projectForm.status || "active",
        [P.contractId]: projectForm.contract_id || null,
      };

      if (editingProjectId) {
        let updateQuery = supabase
          .from(P.table)
          .update(payload)
          .eq(P.pk, editingProjectId);
        if (!listCompanyProjects) {
          updateQuery = updateQuery.eq(P.userId, user.id);
        }
        const { error: updateError } = await updateQuery;
        if (updateError) throw updateError;
        setSuccess("Project updated.");
      } else {
        const { error: insertError } = await supabase.from(P.table).insert({
          [P.userId]: user.id,
          ...payload,
        });
        if (insertError) throw insertError;
        setSuccess("Project created.");
      }

      setProjectForm(EMPTY_PROJECT);
      setSelectRefreshKey((k) => k + 1);
      closeModal();
      await load();
    } catch (err) {
      setProjectError(
        err instanceof Error
          ? err.message
          : editingProjectId
            ? "Failed to update project."
            : "Failed to create project."
      );
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
    const amount = parseMoneyInput(costForm.amount);
    if (amount == null || Number.isNaN(amount)) {
      setCostError("Amount is required and must be a valid number.");
      return;
    }
    const project = projects.find((row) => String(row[P.pk]) === costForm.project_id);
    const projectCeiling = project
      ? Math.max(colNum(project, P.contractValue), colNum(project, P.originalValue), 0) * 5
      : null;
    const amountError = validateWipLineAmount(amount, "Amount", {
      // Costs can exceed contract somewhat, but not by absurd multiples / trillion typos.
      projectCeiling: projectCeiling && projectCeiling > 0 ? projectCeiling : MAX_WIP_LINE_AMOUNT,
    });
    if (amountError) {
      setCostError(amountError);
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
    const amountBilled = parseMoneyInput(billingForm.amount_billed);
    const retainage = parseMoneyInput(billingForm.retainage_held);
    if (amountBilled == null || Number.isNaN(amountBilled)) {
      setBillingError("Amount billed is required and must be a valid number.");
      return;
    }
    const project = projects.find((row) => String(row[P.pk]) === billingForm.project_id);
    const revised = project
      ? Math.max(colNum(project, P.contractValue), colNum(project, P.originalValue), 0)
      : 0;
    const amountError = validateWipLineAmount(amountBilled, "Amount billed", {
      projectCeiling: revised > 0 ? revised : MAX_WIP_LINE_AMOUNT,
    });
    if (amountError) {
      setBillingError(amountError);
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
    const amount = parseMoneyInput(changeOrderForm.amount);
    if (amount == null || Number.isNaN(amount)) {
      setChangeOrderError("Amount is required and must be a valid number.");
      return;
    }
    const amountError = validateWipLineAmount(Math.abs(amount), "Amount", {
      projectCeiling: MAX_WIP_LINE_AMOUNT,
    });
    // COs may be negative (deductives); only block zero and absurd magnitude.
    if (amount === 0) {
      setChangeOrderError("Amount cannot be zero.");
      return;
    }
    if (amountError) {
      setChangeOrderError(amountError);
      return;
    }
    if (changeOrderForm.status === "approved") {
      const blocked = changeOrderApprovalBlockedReason(effectiveRole, amount);
      if (blocked) {
        setChangeOrderError(blocked);
        return;
      }
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
        actions={
          canEdit && selectedIds.size > 0 ? (
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className={`btn btn-sm ${bulkBusy ? "btn-disabled" : "btn-secondary"}`}
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
                {PROJECT_STATUS_OPTIONS.map((status) => (
                  <li key={status}>
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={() => void runBulkStatus(status)}
                    >
                      Set {labelize(status)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined
        }
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {success ? <AlertBanner type="success">{success}</AlertBanner> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => openModal("project")}
          >
            <FilePlus2 className="h-4 w-4" />
            Add Project
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => openModal("cost")}
            disabled={!hasProjects}
          >
            <CircleDollarSign className="h-4 w-4" />
            Log Cost
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => openModal("billing")}
            disabled={!hasProjects}
          >
            <Receipt className="h-4 w-4" />
            Add Billing
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => openModal("change_order")}
            disabled={!hasProjects}
          >
            <ClipboardList className="h-4 w-4" />
            Add Change Order
          </button>
        </div>
      ) : null}

      <SectionCard title="Your projects">
        {!hasProjects ? (
          <p className="text-sm opacity-60 py-4 text-center">
            No projects yet.{canEdit ? " Use Add → Project above to create one." : ""}
          </p>
        ) : (
          <TableShell freezeFirst>
          <table className="table table-xs table-fixed w-full text-[11px]">
            <colgroup>
              {canEdit ? <col className="w-[5%]" /> : null}
              <col className={canEdit ? "w-[30%]" : "w-[40%]"} />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              {canEdit ? <col className="w-[17%]" /> : null}
            </colgroup>
            <thead>
              <tr className="bg-base-200/80">
                {canEdit ? (
                  <th className="w-10 align-middle text-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      aria-label="Select all filtered projects"
                    />
                  </th>
                ) : null}
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
                {canEdit ? <th className="text-center align-middle">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 4} className="text-center opacity-60 py-6">
                    No projects match the name filter.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p) => {
                  const id = colStr(p, P.pk);
                  const name = colStr(p, P.name);
                  const contractId = colStr(p, P.contractId);
                  const status = colStr(p, P.status, "active") || "active";
                  return (
                    <tr key={id} className="hover:bg-base-200/60">
                      {canEdit ? (
                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelect(id)}
                            aria-label={`Select ${name || "project"}`}
                          />
                        </td>
                      ) : null}
                      <td className="font-medium truncate">
                        {contractId ? (
                          <Link
                            href={`/contracts/${contractId}`}
                            className="link link-primary font-medium"
                            title="Open linked contract"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="text-center">
                        <span className={`badge badge-sm ${statusBadgeClass(status)}`}>
                          {labelize(status)}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {moneyExact(colNum(p, P.contractValue))}
                      </td>
                      <td className="text-right tabular-nums">
                        {moneyExact(colNum(p, P.estimatedCost))}
                      </td>
                      {canEdit ? (
                        <td className="text-center">
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
                                {PROJECT_STATUS_OPTIONS.map((option) => (
                                  <li key={option}>
                                    <button
                                      type="button"
                                      disabled={
                                        busyId === id || bulkBusy || status === option
                                      }
                                      onClick={() => void setProjectStatus(id, option)}
                                    >
                                      {labelize(option)}
                                      {status === option ? " ✓" : ""}
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
                                  <button type="button" onClick={() => openEditProject(p)}>
                                    <Pencil className="h-4 w-4" /> Edit Project
                                  </button>
                                </li>
                                <li>
                                  <button
                                    type="button"
                                    className="text-error"
                                    disabled={busyId === id || bulkBusy || deletingProject}
                                    onClick={() => void deleteProject(id, name)}
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete Project
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
          </TableShell>
        )}
      </SectionCard>

      {activeModal === "project" ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-semibold text-lg">
                {editingProjectId ? "Edit project" : "Create project"}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label="Close"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>
            <form className="grid sm:grid-cols-2 gap-4" onSubmit={onSaveProject} noValidate>
              {projectError ? (
                <div className="sm:col-span-2">
                  <AlertBanner type="error">{projectError}</AlertBanner>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <FormField
                  stacked
                  label="Linked contract"
                  hint="Optional. Links this WIP workbook to a GC contract."
                >
                  <select
                    className="select select-bordered w-full"
                    value={projectForm.contract_id}
                    onChange={(e) => {
                      const contractId = e.target.value;
                      const selected = contracts.find((c) => c.id === contractId);
                      setProjectForm((p) => ({
                        ...p,
                        contract_id: contractId,
                        project_name:
                          p.project_name.trim() || selected?.contract_name || p.project_name,
                        client_name:
                          p.client_name.trim() || selected?.client_name || p.client_name,
                      }));
                    }}
                  >
                    <option value="">None</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField stacked label="Project name">
                <input
                  className="input input-bordered w-full"
                  value={projectForm.project_name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, project_name: e.target.value }))}
                  required
                />
              </FormField>
              <FormField stacked label="Client name">
                <input
                  className="input input-bordered w-full"
                  value={projectForm.client_name}
                  onChange={(e) => setProjectForm((p) => ({ ...p, client_name: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="Original contract value">
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="0.00"
                  value={projectForm.original_contract_value}
                  onValueChange={(v) =>
                    setProjectForm((p) => ({ ...p, original_contract_value: v }))
                  }
                />
              </FormField>
              <FormField stacked label="Revised contract value">
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="Defaults to original"
                  value={projectForm.revised_contract_value}
                  onValueChange={(v) =>
                    setProjectForm((p) => ({ ...p, revised_contract_value: v }))
                  }
                />
              </FormField>
              <FormField stacked label="Estimated total cost">
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="0.00"
                  value={projectForm.estimated_total_cost}
                  onValueChange={(v) =>
                    setProjectForm((p) => ({ ...p, estimated_total_cost: v }))
                  }
                />
              </FormField>
              <FormField stacked label="Status">
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
              <FormField stacked label="Start date">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={projectForm.start_date}
                  onChange={(e) => setProjectForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="End date">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={projectForm.end_date}
                  onChange={(e) => setProjectForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </FormField>
              <div className="sm:col-span-2 modal-action mt-2 justify-between">
                {editingProjectId ? (
                  <button
                    type="button"
                    className="btn btn-error btn-outline"
                    disabled={savingProject || deletingProject}
                    onClick={() =>
                      void deleteProject(editingProjectId, projectForm.project_name)
                    }
                  >
                    {deletingProject ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </>
                    )}
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" disabled={savingProject || deletingProject}>
                    {savingProject ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : editingProjectId ? (
                      "Save changes"
                    ) : (
                      "Create project"
                    )}
                  </button>
                </div>
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
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="0.00"
                  value={costForm.amount}
                  onValueChange={(v) => setCostForm((p) => ({ ...p, amount: v }))}
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
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="0.00"
                  value={billingForm.amount_billed}
                  onValueChange={(v) => setBillingForm((p) => ({ ...p, amount_billed: v }))}
                  required
                />
              </FormField>
              <FormField
                label="Retainage receivable"
                hint="ASC 606 contract asset — billed but withheld until conditions are met."
              >
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="0.00"
                  value={billingForm.retainage_held}
                  onValueChange={(v) => setBillingForm((p) => ({ ...p, retainage_held: v }))}
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
                <MoneyInput
                  className="input input-bordered w-full"
                  placeholder="0.00"
                  value={changeOrderForm.amount}
                  onValueChange={(v) => setChangeOrderForm((p) => ({ ...p, amount: v }))}
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
                  <option
                    value="approved"
                    disabled={
                      !canApproveChangeOrderForAmount(
                        effectiveRole,
                        parseMoneyInput(changeOrderForm.amount) ?? 0
                      )
                    }
                  >
                    Approved
                    {!canApproveChangeOrderForAmount(
                      effectiveRole,
                      parseMoneyInput(changeOrderForm.amount) ?? 0
                    )
                      ? " (Accounting / Owner required)"
                      : ""}
                  </option>
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
