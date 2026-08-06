"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  FilePlus2,
  Users,
} from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { computeContractMetrics, labelize, money } from "@/lib/metrics";
import { canManageContracts, statusBadgeClass } from "@/lib/roles";

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

  const canManage = canManageContracts(effectiveRole);
  const visibleChangeOrders =
    effectiveRole === "client"
      ? changeOrders.filter((co) => co.status === "approved")
      : changeOrders;
  const showSubs =
    effectiveRole === "admin" ||
    effectiveRole === "project_manager" ||
    effectiveRole === "subcontractor";

  const totalContractValue = useMemo(() => {
    return contracts.reduce((sum, contract) => {
      const metrics = computeContractMetrics(
        contract,
        changeOrders,
        invoices,
        costEntries,
        milestones,
        payments
      );
      return sum + metrics.revisedValue;
    }, 0);
  }, [contracts, changeOrders, invoices, costEntries, milestones, payments]);

  const totalSubValue = useMemo(
    () => subcontractors.reduce((sum, sub) => sum + Number(sub.subcontract_value ?? 0), 0),
    [subcontractors]
  );

  const pendingCOs = changeOrders.filter((c) => c.status === "pending").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;

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
    <div className="space-y-2.5">
      <PageHeader
        compact
        title="Contracts Overview"
        subtitle="Portfolio snapshot for contracts, change orders, and subcontractors."
        actions={
          canManage ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              <FilePlus2 className="h-4 w-4" /> Add Contract
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          compact
          title="Contracts"
          value={String(contracts.length)}
          hint={`${activeContracts} active`}
          icon={Building2}
        />
        <StatCard compact title="Revised Value" value={money(totalContractValue)} icon={ClipboardList} />
        <StatCard
          compact
          title="Change Orders"
          value={String(visibleChangeOrders.length)}
          hint={effectiveRole === "client" ? "Approved only" : `${pendingCOs} pending`}
          tone={pendingCOs > 0 ? "warning" : "default"}
        />
        {showSubs ? (
          <StatCard
            compact
            title="Subcontracts"
            value={String(subcontractors.length)}
            hint={money(totalSubValue)}
            icon={Users}
          />
        ) : (
          <StatCard
            compact
            title="Clients"
            value={String(new Set(contracts.map((c) => c.client_name).filter(Boolean)).size)}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <SectionCard compact title="Contract status mix">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
              { value: "on_hold", label: "On Hold" },
              { value: "canceled", label: "Cancelled" },
            ].map(({ value, label }) => {
              const count = contracts.filter((c) => c.status === value).length;
              return (
                <span key={value} className={`badge badge-sm ${statusBadgeClass(value)}`}>
                  {label}: {count}
                </span>
              );
            })}
          </div>
        </SectionCard>
        <SectionCard compact title="Change order status">
          <div className="flex flex-wrap gap-1.5">
            {["pending", "approved", "rejected"].map((status) => {
              const count = visibleChangeOrders.filter((c) => c.status === status).length;
              return (
                <span key={status} className={`badge badge-sm ${statusBadgeClass(status)}`}>
                  {labelize(status)}: {count}
                </span>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <ActivityLogPanel
        compact
        title="Recent Activity"
        entityTypes={["contract"]}
        emptyTitle="No recent contract activity"
        emptyMessage="Contract creates, updates, status changes, cancels, and deletes will show up here."
        limit={6}
      />
    </div>
  );
}
