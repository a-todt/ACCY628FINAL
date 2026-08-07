"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Gavel, HardHat, CircleDollarSign, Banknote } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { labelize, money } from "@/lib/metrics";
import {
  canViewBidding,
  canViewSubcontractors,
  statusBadgeClass,
} from "@/lib/roles";
import { resolveSubcontractorScopeUserId } from "@/lib/subScope";
import { createClient } from "@/lib/supabase/client";
import type { Bid, BidPackage, BidPackageStatus, SubStatus } from "@/lib/types";

const SUB_STATUSES: SubStatus[] = ["active", "complete", "terminated", "prospect"];
const PACKAGE_STATUSES: BidPackageStatus[] = ["draft", "open", "closed", "awarded"];

export default function SubcontractingOverviewPage() {
  const { effectiveRole, user, profile } = useAuth();
  const { subcontractors, userProfiles, loading: subsLoading, error: subsError } =
    useContractData();

  const showSubs = canViewSubcontractors(effectiveRole);
  const showBidding = canViewBidding(effectiveRole);
  const isSubcontractor = effectiveRole === "subcontractor";

  const scopeUserId = useMemo(
    () =>
      resolveSubcontractorScopeUserId(
        effectiveRole,
        profile?.role,
        user?.id,
        userProfiles
      ),
    [effectiveRole, profile?.role, user?.id, userProfiles]
  );

  const visibleSubs = useMemo(
    () =>
      isSubcontractor
        ? subcontractors.filter((s) => !scopeUserId || s.user_id === scopeUserId)
        : subcontractors,
    [subcontractors, isSubcontractor, scopeUserId]
  );

  const [packages, setPackages] = useState<BidPackage[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidLoading, setBidLoading] = useState(showBidding);
  const [bidError, setBidError] = useState<string | null>(null);

  const loadBidding = useCallback(async () => {
    if (!showBidding) {
      setPackages([]);
      setBids([]);
      setBidLoading(false);
      return;
    }
    setBidLoading(true);
    setBidError(null);
    const supabase = createClient();
    const [pkgRes, bidRes] = await Promise.all([
      supabase.from("bid_packages").select("*").order("bids_due_at", { ascending: true }),
      supabase.from("bids").select("id, status, amount, bid_package_id").order("created_at", {
        ascending: false,
      }),
    ]);
    if (pkgRes.error) setBidError(pkgRes.error.message);
    else setPackages((pkgRes.data as BidPackage[]) ?? []);
    if (bidRes.error) {
      setBidError((prev) => prev ?? bidRes.error!.message);
      setBids([]);
    } else {
      setBids((bidRes.data as Bid[]) ?? []);
    }
    setBidLoading(false);
  }, [showBidding]);

  useEffect(() => {
    void loadBidding();
  }, [loadBidding]);

  const totalSubValue = useMemo(
    () => visibleSubs.reduce((sum, s) => sum + Number(s.subcontract_value ?? 0), 0),
    [visibleSubs]
  );
  const totalPaid = useMemo(
    () => visibleSubs.reduce((sum, s) => sum + Number(s.amount_paid ?? 0), 0),
    [visibleSubs]
  );
  const activeSubs = visibleSubs.filter((s) => s.status === "active").length;
  const openPackages = packages.filter((p) => p.status === "open").length;
  const awardedPackages = packages.filter((p) => p.status === "awarded").length;
  const submittedBids = bids.filter((b) => b.status === "submitted").length;

  const activityTypes = useMemo(() => {
    const types: string[] = [];
    if (showSubs) types.push("subcontractor");
    if (showBidding) types.push("bid_packages", "bids");
    return types;
  }, [showSubs, showBidding]);

  const loading = (showSubs && subsLoading) || (showBidding && bidLoading);
  const error = subsError || bidError;

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
        title="Subcontracting Overview"
        subtitle={
          effectiveRole === "field_supervisor"
            ? "High-level subcontracting snapshot for your assigned work."
            : "Portfolio snapshot for subcontractors and bidding."
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {showSubs ? (
          <>
            <StatCard
              compact
              title="Subcontractors"
              value={String(visibleSubs.length)}
              hint={`${activeSubs} active`}
              icon={HardHat}
              href="/subcontractors"
            />
            <StatCard
              compact
              title="Subcontract Value"
              value={money(totalSubValue)}
              icon={CircleDollarSign}
              href="/subcontractors"
            />
            <StatCard
              compact
              title="Amount Paid"
              value={money(totalPaid)}
              icon={Banknote}
              tone="success"
              href="/subcontractors"
            />
          </>
        ) : null}
        {showBidding ? (
          <StatCard
            compact
            title="Bid Packages"
            value={String(packages.length)}
            hint={`${openPackages} open · ${awardedPackages} awarded`}
            icon={Gavel}
            href="/bidding"
          />
        ) : (
          <StatCard
            compact
            title="Active"
            value={String(activeSubs)}
            hint="Engagements"
            href="/subcontractors"
          />
        )}
      </div>

      {showBidding ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <StatCard
            compact
            title="Open Packages"
            value={String(openPackages)}
            href="/bidding"
          />
          <StatCard
            compact
            title="Awarded Packages"
            value={String(awardedPackages)}
            href="/bidding"
          />
          <StatCard
            compact
            title="Bids Received"
            value={String(bids.length)}
            hint={`${submittedBids} submitted`}
            href="/bidding"
          />
          <StatCard
            compact
            title="Accepted Bids"
            value={String(bids.filter((b) => b.status === "accepted").length)}
            href="/bidding"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {showSubs ? (
          <SectionCard compact title="Subcontractor status">
            <div className="flex flex-wrap gap-1.5">
              {SUB_STATUSES.map((status) => {
                const count = visibleSubs.filter((s) => s.status === status).length;
                if (!count) return null;
                return (
                  <Link
                    key={status}
                    href={`/subcontractors?status=${encodeURIComponent(status)}#subcontractors-table`}
                    className={`badge badge-sm ${statusBadgeClass(status)} hover:opacity-80 transition-opacity`}
                  >
                    {labelize(status)}: {count}
                  </Link>
                );
              })}
              {visibleSubs.length === 0 ? (
                <p className="text-sm opacity-60">No subcontractors yet.</p>
              ) : null}
            </div>
            <div className="mt-2">
              <Link href="/subcontractors" className="btn btn-primary btn-xs">
                View subcontractors
              </Link>
            </div>
          </SectionCard>
        ) : (
          <SectionCard compact title="Subcontractors">
            <p className="text-sm opacity-70">Subcontractor details are hidden for your role.</p>
          </SectionCard>
        )}

        {showBidding ? (
          <SectionCard compact title="Bid package status">
            <div className="flex flex-wrap gap-1.5">
              {PACKAGE_STATUSES.map((status) => {
                const count = packages.filter((p) => p.status === status).length;
                if (!count) return null;
                return (
                  <Link
                    key={status}
                    href="/bidding"
                    className={`badge badge-sm ${statusBadgeClass(status)} hover:opacity-80 transition-opacity`}
                  >
                    {labelize(status)}: {count}
                  </Link>
                );
              })}
              {packages.length === 0 ? (
                <p className="text-sm opacity-60">No bid packages yet.</p>
              ) : null}
            </div>
            <div className="mt-2">
              <Link href="/bidding" className="btn btn-primary btn-xs">
                View bidding
              </Link>
            </div>
          </SectionCard>
        ) : (
          <SectionCard compact title="Bidding">
            <p className="text-sm opacity-70">Bidding details are hidden for your role.</p>
          </SectionCard>
        )}
      </div>

      {activityTypes.length > 0 ? (
        <ActivityLogPanel
          compact
          title="Recent Activity"
          entityTypes={activityTypes}
          emptyTitle="No recent subcontracting activity"
          emptyMessage="Subcontractor updates and bid package activity will show up here."
          limit={6}
        />
      ) : null}
    </div>
  );
}
