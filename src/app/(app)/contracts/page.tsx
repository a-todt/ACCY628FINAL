"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Building2, Eye, LockKeyhole, MapPin, Plus, Trash2 } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useContractSummaries } from "@/hooks/useContractSummaries";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, PageHeader } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import { computeContractMetrics, labelize, money, percent } from "@/lib/metrics";
import {
  canCancelOrDeleteContracts,
  canManageContracts,
  canViewCosts,
  statusBadgeClass,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Contract, ContractSummary } from "@/lib/types";

type SortKey = "name" | "client" | "status" | "value" | "completion" | "collected";
type SummarySortKey = "name" | "client" | "status" | "end_date";

export default function ContractsPage() {
  const { effectiveRole } = useAuth();
  const {
    contracts,
    changeOrders,
    invoices,
    costEntries,
    milestones,
    payments,
    loading,
    error,
    refresh,
  } = useContractData();
  const isFieldSupervisor = effectiveRole === "field_supervisor";
  const summaryData = useContractSummaries(isFieldSupervisor);
  const canManage = canManageContracts(effectiveRole);
  const canMutate = canCancelOrDeleteContracts(effectiveRole);
  const showCosts = canViewCosts(effectiveRole);
  const showActivityLog = canMutate || effectiveRole === "admin" || effectiveRole === "owner";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const cancelContract = async (contract: Contract) => {
    if (contract.status === "canceled") return;
    if (
      !window.confirm(
        `Cancel contract "${contract.contract_name}"? It will remain in the list as canceled.`
      )
    ) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(contract.id);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("contracts")
        .update({ status: "canceled" })
        .eq("id", contract.id);
      if (updateError) throw updateError;
      await writeAuditLog("contract_canceled", "contract", contract.id, {
        contract_name: contract.contract_name,
        from_status: contract.status,
        to_status: "canceled",
      });
      setActionSuccess(`Canceled "${contract.contract_name}".`);
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to cancel contract.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteContract = async (contract: Contract) => {
    if (
      !window.confirm(
        `Permanently delete contract "${contract.contract_name}"? Related records will also be removed. This cannot be undone.`
      )
    ) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(contract.id);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("contracts").delete().eq("id", contract.id);
      if (deleteError) throw deleteError;
      await writeAuditLog("contract_deleted", "contract", contract.id, {
        contract_name: contract.contract_name,
        from_status: contract.status,
        client_name: contract.client_name,
        client_email: contract.client_email,
      });
      setActionSuccess(`Deleted "${contract.contract_name}".`);
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete contract.");
    } finally {
      setBusyId(null);
    }
  };

  const rows = useMemo(() => {
    return contracts.map((contract) => {
      const metrics = computeContractMetrics(
        contract,
        changeOrders,
        invoices,
        costEntries,
        milestones,
        payments
      );
      return { contract, metrics };
    });
  }, [contracts, changeOrders, invoices, costEntries, milestones, payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = rows.filter(({ contract }) => {
      if (statusFilter !== "all" && contract.status !== statusFilter) return false;
      if (typeFilter !== "all" && contract.contract_type !== typeFilter) return false;
      if (!q) return true;
      const haystack = [
        contract.contract_name,
        contract.client_name,
        contract.city,
        contract.state,
        contract.project_address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "name") return compareValues(a.contract.contract_name, b.contract.contract_name, sortDir);
      if (sortKey === "client") return compareValues(a.contract.client_name, b.contract.client_name, sortDir);
      if (sortKey === "status") return compareValues(a.contract.status, b.contract.status, sortDir);
      if (sortKey === "value") return compareValues(a.metrics.revisedValue, b.metrics.revisedValue, sortDir);
      if (sortKey === "collected") return compareValues(a.metrics.totalCollected, b.metrics.totalCollected, sortDir);
      return compareValues(a.metrics.completionPercent, b.metrics.completionPercent, sortDir);
    });
  }, [rows, search, statusFilter, typeFilter, sortKey, sortDir]);

  if (isFieldSupervisor) {
    return (
      <FieldSupervisorContracts
        summaries={summaryData.summaries}
        loading={summaryData.loading}
        error={summaryData.error}
      />
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
    <div>
      <PageHeader
        title="Contracts"
        subtitle={
          effectiveRole === "client"
            ? "Only your linked projects — status, approved change orders, and billing."
            : "All projects you have access to, with live financial and completion metrics."
        }
        actions={
          canManage ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              <Plus className="h-4 w-4" /> Add Contract
            </Link>
          ) : undefined
        }
      />

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search contracts, clients, locations…"
        sortOptions={[
          { value: "name", label: "Contract name" },
          { value: "client", label: "Client" },
          { value: "status", label: "Status" },
          { value: "value", label: "Revised value" },
          { value: "collected", label: "Collected" },
          { value: "completion", label: "Completion" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={filtered.length}
        filters={
          <>
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
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="form-control w-full lg:w-44">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Type</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                <option value="fixed_price">Fixed Price</option>
                <option value="cost_plus">Cost Plus</option>
                <option value="time_and_materials">Time & Materials</option>
              </select>
            </label>
          </>
        }
      />

      {actionError ? (
        <div className="mt-4">
          <AlertBanner type="error">{actionError}</AlertBanner>
        </div>
      ) : null}
      {actionSuccess ? (
        <div className="mt-4">
          <AlertBanner type="success">{actionSuccess}</AlertBanner>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No contracts found"
          message={
            contracts.length === 0
              ? "No contracts yet. Add your first contract to get started."
              : "Try adjusting your search or filters."
          }
          action={
            canManage && contracts.length === 0 ? (
              <Link href="/contracts/new" className="btn btn-primary btn-sm mt-2">
                <Plus className="h-4 w-4" /> Add Contract
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4 md:hidden">
            {filtered.map(({ contract, metrics }) => (
              <div
                key={contract.id}
                className="card bg-base-100 border border-base-300 shadow-sm"
              >
                <div className="card-body p-4 gap-2">
                  <Link href={`/contracts/${contract.id}`} className="hover:text-primary">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{contract.contract_name}</p>
                      <span className={`badge badge-sm shrink-0 ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </div>
                  </Link>
                  <p className="text-xs opacity-60 flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[contract.project_address, contract.city, contract.state].filter(Boolean).join(", ") ||
                      "No address on file"}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                    <div>
                      <p className="text-xs opacity-60">Revised Value</p>
                      <p className="font-medium">{money(metrics.revisedValue)}</p>
                    </div>
                    <div>
                      <p className="text-xs opacity-60">Completion</p>
                      <p className="font-medium">{percent(metrics.completionPercent)}</p>
                    </div>
                    <div>
                      <p className="text-xs opacity-60">Billed / Collected</p>
                      <p className="font-medium">
                        {money(metrics.totalBilled)} / {money(metrics.totalCollected)}
                      </p>
                    </div>
                    {showCosts ? (
                      <div>
                        <p className="text-xs opacity-60">Gross Profit</p>
                        <p className={`font-medium ${metrics.grossProfit < 0 ? "text-error" : ""}`}>
                          {money(metrics.grossProfit)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {canMutate ? (
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        disabled={busyId === contract.id || contract.status === "canceled"}
                        onClick={() => void cancelContract(contract)}
                      >
                        <Ban className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error"
                        disabled={busyId === contract.id}
                        onClick={() => void deleteContract(contract)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th className="text-right">Revised Value</th>
                  <th className="text-right">Billed</th>
                  <th className="text-right">Collected</th>
                  {showCosts ? <th className="text-right">Gross Profit</th> : null}
                  <th className="text-right">Completion</th>
                  {canMutate ? <th className="text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ contract, metrics }) => (
                  <tr key={contract.id} className="hover:bg-base-200/60">
                    <td>
                      <Link href={`/contracts/${contract.id}`} className="link link-primary font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 opacity-50" />
                          {contract.contract_name}
                        </span>
                      </Link>
                    </td>
                    <td>{contract.client_name ?? "—"}</td>
                    <td className="max-w-[180px] truncate">
                      {[contract.city, contract.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </td>
                    <td className="text-right">{money(metrics.revisedValue)}</td>
                    <td className="text-right">{money(metrics.totalBilled)}</td>
                    <td className="text-right">{money(metrics.totalCollected)}</td>
                    {showCosts ? (
                      <td className={`text-right ${metrics.grossProfit < 0 ? "text-error" : ""}`}>
                        {money(metrics.grossProfit)}
                      </td>
                    ) : null}
                    <td className="text-right">{percent(metrics.completionPercent)}</td>
                    {canMutate ? (
                      <td className="text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            title="Cancel contract"
                            disabled={busyId === contract.id || contract.status === "canceled"}
                            onClick={() => void cancelContract(contract)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error"
                            title="Delete contract"
                            disabled={busyId === contract.id}
                            onClick={() => void deleteContract(contract)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-6">
        <ActivityLogPanel
          title="Contract Change Log"
          entityTypes={["contract"]}
          enabled={showActivityLog}
          refreshKey={logRefreshKey}
        />
      </div>
    </div>
  );
}

function FieldSupervisorContracts({
  summaries,
  loading,
  error,
}: {
  summaries: ContractSummary[];
  loading: boolean;
  error: string | null;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SummarySortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = summaries.filter((contract) => {
      if (statusFilter !== "all" && contract.status !== statusFilter) return false;
      if (accessFilter === "supervising" && !contract.supervised_by_me) return false;
      if (accessFilter === "summary" && contract.supervised_by_me) return false;
      if (!q) return true;

      return [
        contract.contract_name,
        contract.client_name,
        contract.city,
        contract.state,
        contract.contract_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return [...next].sort((a, b) => {
      if (sortKey === "name") return compareValues(a.contract_name, b.contract_name, sortDir);
      if (sortKey === "client") return compareValues(a.client_name, b.client_name, sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      return compareValues(a.end_date, b.end_date, sortDir);
    });
  }, [summaries, search, statusFilter, accessFilter, sortKey, sortDir]);

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
    <div>
      <PageHeader
        title="Contracts"
        subtitle="Review every contract summary. Full details are available for contracts you supervise."
      />

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search contracts, clients, locations…"
        sortOptions={[
          { value: "name", label: "Contract name" },
          { value: "client", label: "Client" },
          { value: "status", label: "Status" },
          { value: "end_date", label: "End date" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(value) => setSortKey(value as SummarySortKey)}
        onSortDirChange={setSortDir}
        resultCount={filtered.length}
        filters={
          <>
            <label className="form-control w-full lg:w-40">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Status</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="form-control w-full lg:w-44">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Detail access</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={accessFilter}
                onChange={(event) => setAccessFilter(event.target.value)}
              >
                <option value="all">All contracts</option>
                <option value="supervising">I supervise</option>
                <option value="summary">Summary only</option>
              </select>
            </label>
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No contracts found"
          message={summaries.length === 0 ? "No contracts are available." : "Try adjusting your search or filters."}
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4 md:hidden">
            {filtered.map((contract) => (
              <article
                key={contract.id}
                className="card bg-base-100 border border-base-300 shadow-sm"
              >
                <div className="card-body p-4 gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{contract.contract_name}</p>
                    <span className={`badge badge-sm shrink-0 ${statusBadgeClass(contract.status)}`}>
                      {labelize(contract.status)}
                    </span>
                  </div>
                  <p className="text-sm opacity-70">{contract.client_name ?? "No client listed"}</p>
                  <p className="text-xs opacity-60 flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[contract.city, contract.state].filter(Boolean).join(", ") || "No location listed"}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs opacity-60">Type</p>
                      <p>{contract.contract_type ? labelize(contract.contract_type) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs opacity-60">Schedule</p>
                      <p>{formatContractDates(contract)}</p>
                    </div>
                  </div>
                  <ContractAccessAction contract={contract} />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contract) => (
                  <tr key={contract.id} className="hover:bg-base-200/60">
                    <td>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <Building2 className="h-4 w-4 opacity-50" />
                        {contract.contract_name}
                      </span>
                    </td>
                    <td>{contract.client_name ?? "—"}</td>
                    <td>{[contract.city, contract.state].filter(Boolean).join(", ") || "—"}</td>
                    <td>{contract.contract_type ? labelize(contract.contract_type) : "—"}</td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{formatContractDates(contract)}</td>
                    <td>
                      <ContractAccessAction contract={contract} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ContractAccessAction({
  contract,
  compact = false,
}: {
  contract: ContractSummary;
  compact?: boolean;
}) {
  if (!contract.supervised_by_me) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs opacity-60">
        <LockKeyhole className="h-3.5 w-3.5" />
        Summary only
      </span>
    );
  }

  return (
    <Link
      href={`/contracts/${contract.id}`}
      className={compact ? "link link-primary text-sm inline-flex items-center gap-1.5" : "btn btn-primary btn-sm"}
    >
      <Eye className="h-4 w-4" />
      View details
    </Link>
  );
}

function formatContractDates(contract: ContractSummary): string {
  const start = contract.start_date ? new Date(`${contract.start_date}T00:00:00`).toLocaleDateString() : "—";
  const end = contract.end_date ? new Date(`${contract.end_date}T00:00:00`).toLocaleDateString() : "—";
  return `${start} – ${end}`;
}
