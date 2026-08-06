"use client";

import Link from "next/link";
import { Building2, Star } from "lucide-react";
import { FavoriteProjectButton } from "@/components/FavoriteProjectButton";
import { useContractData } from "@/hooks/useContractData";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { labelize, money, percent, computeContractMetrics } from "@/lib/metrics";
import { statusBadgeClass } from "@/lib/roles";

export default function FavoritesPage() {
  const { favorites, ready } = useProjectFavorites();
  const {
    contracts,
    changeOrders,
    invoices,
    costEntries,
    milestones,
    payments,
    loading,
    error,
  } = useContractData();

  if (!ready || loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const rows = favorites.map((fav) => {
    const contract = contractById.get(fav.id);
    const metrics = contract
      ? computeContractMetrics(
          contract,
          changeOrders,
          invoices,
          costEntries,
          milestones,
          payments
        )
      : null;
    return {
      id: fav.id,
      name: contract?.contract_name ?? fav.name,
      status: contract?.status ?? null,
      clientName: contract?.client_name ?? null,
      metrics,
      missing: !contract,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Favorites"
        subtitle="Your starred projects. Star a project from All Contracts or a project detail page."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No favorite projects yet"
          message="Go to Contracts → All Contracts and click the star next to a project to pin it here."
          action={
            <Link href="/contracts" className="btn btn-primary btn-sm mt-2">
              Browse projects
            </Link>
          }
        />
      ) : (
        <SectionCard title="Favorite projects">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-base-300 bg-base-100 px-3 py-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <Link
                    href={`/contracts/${row.id}`}
                    className="flex-1 min-w-0 link link-hover font-medium"
                  >
                    <span className="inline-flex items-center gap-1.5 max-w-full">
                      <Building2 className="h-4 w-4 shrink-0 opacity-50" />
                      <span className="truncate">{row.name}</span>
                    </span>
                  </Link>
                  <FavoriteProjectButton projectId={row.id} projectName={row.name} />
                </div>
                {row.status ? (
                  <span className={`badge badge-sm ${statusBadgeClass(row.status)}`}>
                    {labelize(row.status)}
                  </span>
                ) : null}
                {row.clientName ? (
                  <p className="text-xs opacity-60 truncate">{row.clientName}</p>
                ) : null}
                {row.metrics ? (
                  <p className="text-sm tabular-nums">
                    {money(row.metrics.revisedValue)}
                    <span className="opacity-50"> · </span>
                    {percent(row.metrics.completionPercent)} complete
                  </p>
                ) : null}
                {row.missing ? (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Project no longer available to your account
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
