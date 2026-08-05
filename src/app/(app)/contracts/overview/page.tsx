"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  FilePlus2,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { computeContractMetrics, labelize, money, percent } from "@/lib/metrics";
import { canManageContracts, statusBadgeClass } from "@/lib/roles";

type Section = "contracts" | "change_orders" | "subcontractors";
type SortKey = "name" | "status" | "amount" | "date" | "project";

export default function ContractsOverviewPage() {
  const router = useRouter();
  const { effectiveRole } = useAuth();
  const {
    contracts,
    changeOrders,
    subcontractors,
    invoices,
    costEntries,
    milestones,
    payments,
    loading,
    error,
  } = useContractData();

  useEffect(() => {
    if (effectiveRole === "field_supervisor") {
      router.replace("/contracts");
    }
  }, [effectiveRole, router]);

  const [search, setSearch] = useState("");
  const [section, setSection] = useState<Section | "all">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const canManage = canManageContracts(effectiveRole);
  const visibleChangeOrders =
    effectiveRole === "client"
      ? changeOrders.filter((co) => co.status === "approved")
      : changeOrders;
  const showSubs =
    effectiveRole === "admin" ||
    effectiveRole === "project_manager" ||
    effectiveRole === "subcontractor";

  const contractRows = useMemo(() => {
    return contracts.map((contract) => {
      const metrics = computeContractMetrics(
        contract,
        changeOrders,
        invoices,
        costEntries,
        milestones,
        payments
      );
      return {
        id: contract.id,
        section: "contracts" as const,
        name: contract.contract_name,
        project: contract.client_name ?? "—",
        status: contract.status,
        amount: metrics.revisedValue,
        date: contract.start_date ?? contract.created_at,
        href: `/contracts/${contract.id}`,
        detail: `${labelize(contract.contract_type)} · ${percent(metrics.completionPercent)} complete`,
      };
    });
  }, [contracts, changeOrders, invoices, costEntries, milestones, payments]);

  const changeOrderRows = useMemo(() => {
    return visibleChangeOrders.map((co) => ({
      id: co.id,
      section: "change_orders" as const,
      name: co.change_order_number || co.description || "Change order",
      project: co.contracts?.contract_name ?? "—",
      status: co.status,
      amount: Number(co.amount ?? 0),
      date: co.date_submitted ?? co.created_at,
      href: "/change-orders",
      detail: co.description ?? co.reason ?? "—",
    }));
  }, [visibleChangeOrders]);

  const subRows = useMemo(() => {
    if (!showSubs) return [];
    return subcontractors.map((sub) => ({
      id: sub.id,
      section: "subcontractors" as const,
      name: sub.company_name,
      project: sub.contracts?.contract_name ?? "—",
      status: sub.status,
      amount: Number(sub.subcontract_value ?? 0),
      date: sub.start_date ?? sub.created_at,
      href: "/subcontractors",
      detail: `${sub.trade ?? "Trade n/a"} · Paid ${money(sub.amount_paid)}`,
    }));
  }, [subcontractors, showSubs]);

  const allRows = useMemo(() => {
    const rows = [
      ...(section === "all" || section === "contracts" ? contractRows : []),
      ...(section === "all" || section === "change_orders" ? changeOrderRows : []),
      ...(section === "all" || section === "subcontractors" ? subRows : []),
    ];

    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.project.toLowerCase().includes(q) ||
        row.detail.toLowerCase().includes(q) ||
        labelize(row.status).toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return compareValues(a.name, b.name, sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      if (sortKey === "amount") return compareValues(a.amount, b.amount, sortDir);
      if (sortKey === "date") return compareValues(a.date, b.date, sortDir);
      return compareValues(a.project, b.project, sortDir);
    });
  }, [
    contractRows,
    changeOrderRows,
    subRows,
    section,
    search,
    statusFilter,
    sortKey,
    sortDir,
  ]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const row of [...contractRows, ...changeOrderRows, ...subRows]) set.add(row.status);
    return Array.from(set).sort();
  }, [contractRows, changeOrderRows, subRows]);

  const pendingCOs = changeOrders.filter((c) => c.status === "pending").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const totalContractValue = contractRows.reduce((sum, r) => sum + r.amount, 0);
  const totalSubValue = subRows.reduce((sum, r) => sum + r.amount, 0);

  if (effectiveRole === "field_supervisor") {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
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
    <div>
      <PageHeader
        title="Contracts Overview"
        subtitle="Summary of contracts, change orders, and subcontractors — filter and sort across the category."
        actions={
          canManage ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              <FilePlus2 className="h-4 w-4" /> Add Contract
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard title="Contracts" value={String(contracts.length)} hint={`${activeContracts} active`} icon={Building2} />
        <StatCard title="Revised Value" value={money(totalContractValue)} icon={ClipboardList} />
        <StatCard
          title="Change Orders"
          value={String(visibleChangeOrders.length)}
          hint={effectiveRole === "client" ? "Approved only" : `${pendingCOs} pending`}
          tone={pendingCOs > 0 ? "warning" : "default"}
        />
        {showSubs ? (
          <StatCard title="Subcontracts" value={String(subcontractors.length)} hint={money(totalSubValue)} icon={Users} />
        ) : (
          <StatCard title="Clients" value={String(new Set(contracts.map((c) => c.client_name).filter(Boolean)).size)} />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <SectionCard title="Quick links">
          <div className="flex flex-wrap gap-2">
            <Link href="/contracts" className="btn btn-sm btn-outline">
              All Contracts
            </Link>
            {canManage ? (
              <Link href="/contracts/new" className="btn btn-sm btn-outline">
                Add Contract
              </Link>
            ) : null}
            {effectiveRole !== "client" ? (
              <Link href="/change-orders" className="btn btn-sm btn-outline">
                Change Orders
              </Link>
            ) : null}
            {showSubs ? (
              <Link href="/subcontractors" className="btn btn-sm btn-outline">
                Subcontractors
              </Link>
            ) : null}
          </div>
        </SectionCard>
        <SectionCard title="Contract status mix">
          <div className="flex flex-wrap gap-2">
            {["active", "on_hold", "completed", "canceled"].map((status) => {
              const count = contracts.filter((c) => c.status === status).length;
              if (!count) return null;
              return (
                <span key={status} className={`badge ${statusBadgeClass(status)}`}>
                  {labelize(status)}: {count}
                </span>
              );
            })}
            {contracts.length === 0 ? <p className="text-sm opacity-60">No contracts yet.</p> : null}
          </div>
        </SectionCard>
        <SectionCard title="Change order status">
          <div className="flex flex-wrap gap-2">
            {["pending", "approved", "rejected"].map((status) => {
              const count = visibleChangeOrders.filter((c) => c.status === status).length;
              if (!count) return null;
              return (
                <span key={status} className={`badge ${statusBadgeClass(status)}`}>
                  {labelize(status)}: {count}
                </span>
              );
            })}
            {visibleChangeOrders.length === 0 ? (
              <p className="text-sm opacity-60">No change orders yet.</p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search contracts, change orders, subcontractors…"
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "project", label: "Project / Client" },
          { value: "status", label: "Status" },
          { value: "amount", label: "Amount" },
          { value: "date", label: "Date" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={allRows.length}
        filters={
          <>
            <label className="form-control w-full lg:w-44">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Section</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={section}
                onChange={(e) => setSection(e.target.value as Section | "all")}
              >
                <option value="all">All sections</option>
                <option value="contracts">Contracts</option>
                <option value="change_orders">Change Orders</option>
                {showSubs ? <option value="subcontractors">Subcontractors</option> : null}
              </select>
            </label>
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
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {labelize(status)}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      {allRows.length === 0 ? (
        <EmptyState
          title="No matching records"
          message="Try adjusting your search or filters across the Contracts category."
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Name</th>
                <th>Project / Client</th>
                <th>Status</th>
                <th>Detail</th>
                <th className="text-right">Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row) => (
                <tr key={`${row.section}-${row.id}`} className="hover:bg-base-200/60">
                  <td>
                    <span className="badge badge-ghost badge-sm">
                      {row.section === "contracts"
                        ? "Contract"
                        : row.section === "change_orders"
                          ? "Change Order"
                          : "Subcontractor"}
                    </span>
                  </td>
                  <td>
                    <Link href={row.href} className="link link-primary font-medium">
                      {row.name}
                    </Link>
                  </td>
                  <td>{row.project}</td>
                  <td>
                    <span className={`badge badge-sm ${statusBadgeClass(row.status)}`}>
                      {labelize(row.status)}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate">{row.detail}</td>
                  <td className="text-right">{money(row.amount)}</td>
                  <td className="whitespace-nowrap">{row.date ? String(row.date).slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
