"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  Building2,
  ChevronDown,
  Eye,
  LockKeyhole,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { FavoriteProjectButton } from "@/components/FavoriteProjectButton";
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useContractSummaries } from "@/hooks/useContractSummaries";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { StatusFilterChips } from "@/components/StatusFilterChips";
import { StickyToolbar } from "@/components/StickyToolbar";
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
import type { Contract, ContractStatus, ContractSummary } from "@/lib/types";

type SortKey =
  | "name"
  | "client"
  | "location"
  | "status"
  | "value"
  | "billed"
  | "collected"
  | "profit"
  | "completion";
type SummarySortKey = "name" | "client" | "status" | "end_date";

const STATUS_OPTIONS: ContractStatus[] = ["active", "on_hold", "completed", "canceled"];
const STATUS_FILTER_VALUES = new Set<string>(["all", ...STATUS_OPTIONS]);

function statusFromSearchParams(params: { get: (key: string) => string | null }): string {
  const status = params.get("status");
  return status && STATUS_FILTER_VALUES.has(status) ? status : "all";
}

export default function ContractsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  const [filters, setFilters] = useState({
    name: "",
    client: "",
    location: "",
  });
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [showAllRows, setShowAllRows] = useState(false);
  const [statusChip, setStatusChip] = useState(() => statusFromSearchParams(searchParams));

  const statusParam = searchParams.get("status") ?? "";

  useEffect(() => {
    setShowAllRows(false);
  }, [filters.name, filters.client, filters.location, statusChip]);

  useEffect(() => {
    setStatusChip(statusFromSearchParams(searchParams));
  }, [searchParams, statusParam]);

  useEffect(() => {
    if (loading || isFieldSupervisor) return;
    if (!statusParam || !STATUS_FILTER_VALUES.has(statusParam)) return;
    window.requestAnimationFrame(() => {
      document.getElementById("contracts-table")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [loading, isFieldSupervisor, statusParam]);

  const setStatusFilterChip = (value: string) => {
    setStatusChip(value);
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete("status");
    else next.set("status", value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const cancelContract = async (contract: Contract, { silent = false } = {}) => {
    if (contract.status === "canceled") return;
    if (
      !silent &&
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
      if (!silent) {
        setActionSuccess(`Canceled "${contract.contract_name}".`);
        setLogRefreshKey((k) => k + 1);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to cancel contract.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteContract = async (contract: Contract, { silent = false } = {}) => {
    if (
      !silent &&
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
      if (!silent) {
        setActionSuccess(`Deleted "${contract.contract_name}".`);
        setLogRefreshKey((k) => k + 1);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete contract.");
    } finally {
      setBusyId(null);
    }
  };

  const setContractStatus = async (contract: Contract, status: ContractStatus, { silent = false } = {}) => {
    if (contract.status === status) return;
    setActionError(null);
    setActionSuccess(null);
    setBusyId(contract.id);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("contracts")
        .update({ status })
        .eq("id", contract.id);
      if (updateError) throw updateError;
      await writeAuditLog("contract_status_changed", "contract", contract.id, {
        contract_name: contract.contract_name,
        from_status: contract.status,
        to_status: status,
      });
      if (!silent) {
        setActionSuccess(`Updated "${contract.contract_name}" to ${labelize(status)}.`);
        setLogRefreshKey((k) => k + 1);
        await refresh();
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update status.");
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
      const location =
        [contract.city, contract.state].filter(Boolean).join(", ") ||
        contract.project_address ||
        "—";
      return {
        contract,
        metrics,
        location,
      };
    });
  }, [contracts, changeOrders, invoices, costEntries, milestones, payments]);

  const columnOptions = useMemo(
    () => ({
      name: uniqueSorted(rows.map((r) => r.contract.contract_name)),
      client: uniqueSorted(rows.map((r) => r.contract.client_name)),
      location: uniqueSorted(rows.map((r) => (r.location === "—" ? "" : r.location))),
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (statusChip !== "all" && row.contract.status !== statusChip) return false;
      if (!matchesColumnFilter(row.contract.contract_name, filters.name)) return false;
      if (!matchesColumnFilter(row.contract.client_name ?? "—", filters.client)) return false;
      if (!matchesColumnFilter(row.location, filters.location)) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortKey === "name") {
        return compareValues(a.contract.contract_name, b.contract.contract_name, sortDir);
      }
      if (sortKey === "client") {
        return compareValues(a.contract.client_name, b.contract.client_name, sortDir);
      }
      if (sortKey === "location") return compareValues(a.location, b.location, sortDir);
      if (sortKey === "status") {
        return compareValues(a.contract.status, b.contract.status, sortDir);
      }
      if (sortKey === "value") {
        return compareValues(a.metrics.revisedValue, b.metrics.revisedValue, sortDir);
      }
      if (sortKey === "billed") {
        return compareValues(a.metrics.totalBilled, b.metrics.totalBilled, sortDir);
      }
      if (sortKey === "collected") {
        return compareValues(a.metrics.totalCollected, b.metrics.totalCollected, sortDir);
      }
      if (sortKey === "profit") {
        return compareValues(a.metrics.grossProfit, b.metrics.grossProfit, sortDir);
      }
      return compareValues(a.metrics.completionPercent, b.metrics.completionPercent, sortDir);
    });
  }, [rows, filters, statusChip, sortKey, sortDir]);

  const selectedRows = useMemo(
    () => filtered.filter((row) => selectedIds.has(row.contract.id)),
    [filtered, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selectedIds.has(row.contract.id));

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
        for (const row of filtered) next.delete(row.contract.id);
        return next;
      }
      const next = new Set(prev);
      for (const row of filtered) next.add(row.contract.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runBulk = async (action: "cancel" | "delete" | ContractStatus) => {
    if (selectedRows.length === 0 || !canMutate) return;

    if (action === "delete") {
      if (
        !window.confirm(
          `Permanently delete ${selectedRows.length} contract${selectedRows.length === 1 ? "" : "s"}? This cannot be undone.`
        )
      ) {
        return;
      }
    } else if (action === "cancel") {
      if (
        !window.confirm(
          `Cancel ${selectedRows.length} contract${selectedRows.length === 1 ? "" : "s"}?`
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Set status to "${labelize(action)}" for ${selectedRows.length} contract${selectedRows.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      for (const row of selectedRows) {
        if (action === "delete") {
          await deleteContract(row.contract, { silent: true });
        } else if (action === "cancel") {
          await cancelContract(row.contract, { silent: true });
        } else {
          await setContractStatus(row.contract, action, { silent: true });
        }
      }
      const label =
        action === "delete"
          ? "Deleted"
          : action === "cancel"
            ? "Canceled"
            : `Updated status to ${labelize(action)} for`;
      setActionSuccess(
        `${label} ${selectedRows.length} contract${selectedRows.length === 1 ? "" : "s"}.`
      );
      clearSelection();
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (isFieldSupervisor) {
    return (
      <FieldSupervisorContracts
        summaries={summaryData.summaries}
        loading={summaryData.loading}
        error={summaryData.error}
        initialStatus={statusFromSearchParams(searchParams)}
        statusParam={statusParam}
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

  /** Viewport ≈ tall filter header + 10 body rows; remaining rows scroll inside. */
  const tableScrollClass = showAllRows
    ? "overflow-visible table-sticky-head table-freeze-first"
    : "overflow-auto max-h-[calc(4.5rem+10*1.85rem)] table-sticky-head table-freeze-first";

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
                  {STATUS_OPTIONS.filter((status) => status !== "canceled").map((status) => (
                    <li key={status}>
                      <button type="button" disabled={busy} onClick={() => void runBulk(status)}>
                        Set {labelize(status)}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" disabled={busy} onClick={() => void runBulk("cancel")}>
                      <Ban className="h-4 w-4" /> Cancel selected
                    </button>
                  </li>
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
            {canManage ? (
              <Link href="/contracts/new" className="btn btn-primary btn-sm">
                <Plus className="h-4 w-4" /> Add Contract
              </Link>
            ) : null}
          </div>
        }
      />

      {actionError ? (
        <div className="mb-4">
          <AlertBanner type="error">{actionError}</AlertBanner>
        </div>
      ) : null}
      {actionSuccess ? (
        <div className="mb-4">
          <AlertBanner type="success">{actionSuccess}</AlertBanner>
        </div>
      ) : null}

      <StickyToolbar>
        <StatusFilterChips
          options={STATUS_OPTIONS}
          value={statusChip}
          onChange={setStatusFilterChip}
          allLabel="All statuses"
        />
        <p className="text-xs opacity-55 tabular-nums">
          {filtered.length} shown
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </p>
      </StickyToolbar>

      {filtered.length === 0 && contracts.length === 0 ? (
        <EmptyState
          title="No contracts found"
          message="No contracts yet. Add your first contract to get started."
          action={
            canManage ? (
              <Link href="/contracts/new" className="btn btn-primary btn-sm mt-2">
                <Plus className="h-4 w-4" /> Add Contract
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4 md:hidden mb-4">
            {filtered.map(({ contract, metrics }) => (
              <div key={contract.id} className="card bg-base-100 border border-base-300 shadow-sm">
                <div className="card-body p-4 gap-2">
                  {canMutate ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selectedIds.has(contract.id)}
                        onChange={() => toggleSelect(contract.id)}
                      />
                      Select
                    </label>
                  ) : null}
                  <Link href={`/contracts/${contract.id}`} className="hover:text-primary">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{contract.contract_name}</p>
                      <span className={`badge badge-sm shrink-0 ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </div>
                  </Link>
                  <div className="flex justify-end -mt-1">
                    <FavoriteProjectButton
                      projectId={contract.id}
                      projectName={contract.contract_name}
                    />
                  </div>
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
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <p className="text-sm opacity-60 col-span-full text-center py-6">
                No contracts match the column filters.
              </p>
            ) : null}
          </div>

          <div id="contracts-table" className="hidden md:block rounded-box border border-base-300 bg-base-100 scroll-mt-24">
            <div className={tableScrollClass}>
            <table className="table table-xs table-fixed w-full text-[11px]">
              <colgroup>
                {canMutate ? <col className="w-[3%]" /> : null}
                <col className="w-[14%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[8%] hidden xl:table-column" />
                <col className="w-[8%] hidden xl:table-column" />
                {showCosts ? <col className="w-[9%] hidden xl:table-column" /> : null}
                <col className="w-[8%]" />
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
                        aria-label="Select all filtered contracts"
                      />
                    </th>
                  ) : null}
                  <ColumnAutocompleteHeader
                    label="Contract"
                    listId="contracts-filter-name"
                    value={filters.name}
                    onChange={(v) => setFilter("name", v)}
                    options={columnOptions.name}
                    sortActive={sortKey === "name"}
                    sortDir={sortDir}
                    onSort={() => onSort("name")}
                  />
                  <ColumnAutocompleteHeader
                    label="Client"
                    listId="contracts-filter-client"
                    value={filters.client}
                    onChange={(v) => setFilter("client", v)}
                    options={columnOptions.client}
                    sortActive={sortKey === "client"}
                    sortDir={sortDir}
                    onSort={() => onSort("client")}
                  />
                  <ColumnAutocompleteHeader
                    label="Location"
                    listId="contracts-filter-location"
                    value={filters.location}
                    onChange={(v) => setFilter("location", v)}
                    options={columnOptions.location}
                    sortActive={sortKey === "location"}
                    sortDir={sortDir}
                    onSort={() => onSort("location")}
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
                    label="Billed"
                    sortActive={sortKey === "billed"}
                    sortDir={sortDir}
                    onSort={() => onSort("billed")}
                    align="right"
                    className="hidden xl:table-cell"
                  />
                  <ColumnSortHeader
                    label="Collected"
                    sortActive={sortKey === "collected"}
                    sortDir={sortDir}
                    onSort={() => onSort("collected")}
                    align="right"
                    className="hidden xl:table-cell"
                  />
                  {showCosts ? (
                    <ColumnSortHeader
                      label="Gross Profit"
                      sortActive={sortKey === "profit"}
                      sortDir={sortDir}
                      onSort={() => onSort("profit")}
                      align="right"
                      className="hidden xl:table-cell"
                    />
                  ) : null}
                  <ColumnSortHeader
                    label="Completion"
                    sortActive={sortKey === "completion"}
                    sortDir={sortDir}
                    onSort={() => onSort("completion")}
                    align="right"
                  />
                  {canMutate ? <th className="text-center align-middle">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={canMutate ? (showCosts ? 11 : 10) : showCosts ? 9 : 8} className="py-10 text-center opacity-60">
                      No contracts match the column filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ contract, metrics, location }) => (
                    <tr key={contract.id} className="hover:bg-base-200/60">
                      {canMutate ? (
                        <td className="px-1 text-center">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={selectedIds.has(contract.id)}
                            onChange={() => toggleSelect(contract.id)}
                            aria-label={`Select ${contract.contract_name}`}
                          />
                        </td>
                      ) : null}
                      <td className="min-w-0 px-1 text-left">
                        <div className="flex items-center gap-0.5 min-w-0">
                          <FavoriteProjectButton
                            projectId={contract.id}
                            projectName={contract.contract_name}
                          />
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="link link-primary block truncate font-medium min-w-0"
                            title={contract.contract_name}
                          >
                            <span className="inline-flex max-w-full items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{contract.contract_name}</span>
                            </span>
                          </Link>
                        </div>
                      </td>
                      <td className="truncate px-1 text-left" title={contract.client_name ?? "—"}>
                        {contract.client_name ?? "—"}
                      </td>
                      <td className="truncate px-1 text-center" title={location}>{location}</td>
                      <td className="px-1 text-center">
                        <span className={`badge badge-sm ${statusBadgeClass(contract.status)}`}>
                          {labelize(contract.status)}
                        </span>
                      </td>
                      <td
                        className="truncate px-1 text-center"
                        title={[
                          `Billed: ${money(metrics.totalBilled)}`,
                          `Collected: ${money(metrics.totalCollected)}`,
                          showCosts ? `Gross profit: ${money(metrics.grossProfit)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        {money(metrics.revisedValue)}
                      </td>
                      <td className="truncate px-1 text-center hidden xl:table-cell" title={money(metrics.totalBilled)}>
                        {money(metrics.totalBilled)}
                      </td>
                      <td className="truncate px-1 text-center hidden xl:table-cell" title={money(metrics.totalCollected)}>
                        {money(metrics.totalCollected)}
                      </td>
                      {showCosts ? (
                        <td
                          className={`truncate px-1 text-center hidden xl:table-cell ${metrics.grossProfit < 0 ? "text-error" : ""}`}
                          title={money(metrics.grossProfit)}
                        >
                          {money(metrics.grossProfit)}
                        </td>
                      ) : null}
                      <td className="px-1 text-center">{percent(metrics.completionPercent)}</td>
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
                                      disabled={
                                        busyId === contract.id ||
                                        busy ||
                                        contract.status === status
                                      }
                                      onClick={() =>
                                        void setContractStatus(contract, status).catch((err) => {
                                          setActionError(
                                            err instanceof Error ? err.message : "Failed to update status."
                                          );
                                        })
                                      }
                                    >
                                      {labelize(status)}
                                      {contract.status === status ? " ✓" : ""}
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
                                  <Link href={`/contracts/${contract.id}?edit=1`}>
                                    <Pencil className="h-4 w-4" /> Edit Contract
                                  </Link>
                                </li>
                                <li>
                                  <button
                                    type="button"
                                    className="text-error"
                                    disabled={busyId === contract.id || busy}
                                    onClick={() =>
                                      void deleteContract(contract).catch((err) => {
                                        setActionError(
                                          err instanceof Error ? err.message : "Failed to delete."
                                        );
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete Contract
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
            {filtered.length > 10 ? (
              <div className="flex justify-center border-t border-base-300 pt-2 pb-1">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowAllRows((v) => !v)}
                >
                  {showAllRows ? "Show less" : `Show all (${filtered.length})`}
                </button>
              </div>
            ) : null}
            <div className="px-4 py-2 text-xs opacity-60 border-t border-base-300">
              Showing {filtered.length} of {contracts.length} contracts
              {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
            </div>
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
  initialStatus,
  statusParam,
}: {
  summaries: ContractSummary[];
  loading: boolean;
  error: string | null;
  initialStatus: string;
  statusParam: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [accessFilter, setAccessFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SummarySortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setStatusFilter(statusFromSearchParams(searchParams));
  }, [searchParams, statusParam]);

  useEffect(() => {
    if (loading) return;
    if (!statusParam || !STATUS_FILTER_VALUES.has(statusParam)) return;
    window.requestAnimationFrame(() => {
      document.getElementById("contracts-table")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [loading, statusParam]);

  const setStatusFilterChip = (value: string) => {
    setStatusFilter(value);
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete("status");
    else next.set("status", value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

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
            <div className="form-control w-full lg:w-auto">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Status</span>
              </span>
              <StatusFilterChips
                options={["active", "on_hold", "completed", "canceled"]}
                value={statusFilter}
                onChange={setStatusFilterChip}
              />
            </div>
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
          icon={Building2}
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
                    <div className="flex items-center gap-1 shrink-0">
                      <FavoriteProjectButton
                        projectId={contract.id}
                        projectName={contract.contract_name}
                      />
                      <span className={`badge badge-sm ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </div>
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

          <div id="contracts-table" className="hidden md:block overflow-x-auto rounded-box border border-base-300 bg-base-100 scroll-mt-24">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Client</th>
                  <th className="hidden xl:table-cell">Location</th>
                  <th className="hidden xl:table-cell">Type</th>
                  <th>Status</th>
                  <th className="hidden xl:table-cell">Schedule</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contract) => (
                  <tr key={contract.id} className="hover:bg-base-200/60">
                    <td>
                      <span
                        className="inline-flex items-center gap-1 font-medium min-w-0"
                        title={[
                          [contract.city, contract.state].filter(Boolean).join(", ") || null,
                          contract.contract_type ? labelize(contract.contract_type) : null,
                          formatContractDates(contract),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        <FavoriteProjectButton
                          projectId={contract.id}
                          projectName={contract.contract_name}
                        />
                        <Building2 className="h-4 w-4 opacity-50 shrink-0" />
                        <span className="truncate">{contract.contract_name}</span>
                      </span>
                    </td>
                    <td>{contract.client_name ?? "—"}</td>
                    <td className="hidden xl:table-cell">
                      {[contract.city, contract.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="hidden xl:table-cell">
                      {contract.contract_type ? labelize(contract.contract_type) : "—"}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap hidden xl:table-cell">
                      {formatContractDates(contract)}
                    </td>
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
