"use client";

import Link from "next/link";
import { Building2, MapPin, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, PageHeader } from "@/components/ui";
import { computeContractMetrics, labelize, money, percent } from "@/lib/metrics";
import { canManageContracts, canViewCosts, statusBadgeClass } from "@/lib/roles";

export default function ContractsPage() {
  const { effectiveRole } = useAuth();
  const { contracts, changeOrders, invoices, costEntries, milestones, payments, loading, error } =
    useContractData();
  const canManage = canManageContracts(effectiveRole);
  const showCosts = canViewCosts(effectiveRole);

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
        subtitle="All projects you have access to, with live financial and completion metrics."
        actions={
          canManage ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              <Plus className="h-4 w-4" /> Add Contract
            </Link>
          ) : undefined
        }
      />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
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
          {/* Card layout: small screens */}
          <div className="grid sm:grid-cols-2 gap-4 md:hidden">
            {contracts.map((contract) => {
              const metrics = computeContractMetrics(
                contract,
                changeOrders,
                invoices,
                costEntries,
                milestones,
                payments
              );
              return (
                <Link
                  key={contract.id}
                  href={`/contracts/${contract.id}`}
                  className="card bg-base-100 border border-base-300 hover:border-primary shadow-sm transition-colors"
                >
                  <div className="card-body p-4 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{contract.contract_name}</p>
                      <span className={`badge badge-sm shrink-0 ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
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
                </Link>
              );
            })}
          </div>

          {/* Table layout: medium+ screens */}
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
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => {
                  const metrics = computeContractMetrics(
                    contract,
                    changeOrders,
                    invoices,
                    costEntries,
                    milestones,
                    payments
                  );
                  return (
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
