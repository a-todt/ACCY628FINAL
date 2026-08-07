"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Gavel, HardHat, CircleDollarSign, Banknote } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { MoneyInput } from "@/components/MoneyInput";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, FormField, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import { todayIsoDate } from "@/lib/invoices";
import { labelize, money } from "@/lib/metrics";
import {
  canRecordPayments,
  canViewBidding,
  canViewSubcontractors,
  statusBadgeClass,
} from "@/lib/roles";
import {
  subcontractorOpenPayable,
  validateSubcontractorPaymentAmount,
} from "@/lib/subcontractorPayments";
import { resolveSubcontractorScopeUserId } from "@/lib/subScope";
import { createClient } from "@/lib/supabase/client";
import type { Bid, BidPackage, BidPackageStatus, SubStatus } from "@/lib/types";

const SUB_STATUSES: SubStatus[] = ["active", "complete", "terminated", "prospect"];
const PACKAGE_STATUSES: BidPackageStatus[] = ["draft", "open", "closed", "awarded"];

const EMPTY_PAY_FORM = {
  subcontractor_id: "",
  payment_amount: "",
  payment_date: todayIsoDate(),
  payment_method: "ACH",
  reference_number: "",
  notes: "",
};

export default function SubcontractingOverviewPage() {
  const { effectiveRole, user, profile } = useAuth();
  const {
    subcontractors,
    subcontractorPayments,
    userProfiles,
    loading: subsLoading,
    error: subsError,
    refresh,
  } = useContractData();

  const showSubs = canViewSubcontractors(effectiveRole);
  const showBidding = canViewBidding(effectiveRole);
  const canPay = canRecordPayments(effectiveRole);
  const isSubcontractor = effectiveRole === "subcontractor";
  const isAccounting = effectiveRole === "owner";

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

  const payableSubs = useMemo(
    () =>
      visibleSubs.filter(
        (s) =>
          s.status !== "prospect" &&
          s.status !== "terminated" &&
          Number(s.subcontract_value ?? 0) > 0
      ),
    [visibleSubs]
  );

  const [packages, setPackages] = useState<BidPackage[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidLoading, setBidLoading] = useState(showBidding);
  const [bidError, setBidError] = useState<string | null>(null);

  const [payForm, setPayForm] = useState(EMPTY_PAY_FORM);
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);

  const selectedSub = useMemo(
    () => payableSubs.find((s) => s.id === payForm.subcontractor_id) ?? null,
    [payableSubs, payForm.subcontractor_id]
  );

  const remainingOnSelected = selectedSub ? subcontractorOpenPayable(selectedSub) : null;

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

  const recentPayments = useMemo(
    () => subcontractorPayments.slice(0, 8),
    [subcontractorPayments]
  );

  const activityTypes = useMemo(() => {
    const types: string[] = [];
    if (showSubs) types.push("subcontractor", "subcontractor_payment");
    if (showBidding) types.push("bid_packages", "bids");
    return types;
  }, [showSubs, showBidding]);

  const onSelectSub = (subId: string) => {
    const sub = payableSubs.find((s) => s.id === subId);
    setPayForm((prev) => ({
      ...prev,
      subcontractor_id: subId,
      payment_amount: sub ? String(subcontractorOpenPayable(sub) || "") : "",
      notes: sub
        ? `Payment to ${sub.company_name}${sub.trade ? ` · ${sub.trade}` : ""}`
        : "",
    }));
    setPayError(null);
    setPaySuccess(null);
  };

  const onSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();
    setPayError(null);
    setPaySuccess(null);
    if (!selectedSub) {
      setPayError("Select a subcontractor.");
      return;
    }
    const amount = Number(payForm.payment_amount);
    const validation = validateSubcontractorPaymentAmount(amount, selectedSub);
    if (validation) {
      setPayError(validation);
      return;
    }

    setPaySaving(true);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("subcontractor_payments")
        .insert({
          subcontractor_id: selectedSub.id,
          payment_amount: amount,
          payment_date: payForm.payment_date || todayIsoDate(),
          payment_method: payForm.payment_method.trim() || null,
          reference_number: payForm.reference_number.trim() || null,
          notes: payForm.notes.trim() || null,
          recorded_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await writeAuditLog("subcontractor_payment_recorded", "subcontractor_payment", data?.id, {
        subcontractor_id: selectedSub.id,
        company_name: selectedSub.company_name,
        payment_amount: amount,
        contract_id: selectedSub.contract_id,
      });

      setPaySuccess(
        `Paid ${money(amount)} to ${selectedSub.company_name}. Amount paid updated on their dashboard.`
      );
      setPayForm({
        ...EMPTY_PAY_FORM,
        payment_date: todayIsoDate(),
      });
      await refresh();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setPaySaving(false);
    }
  };

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
        title={isAccounting ? "Vendor Payables" : "Subcontracting Overview"}
        subtitle={
          isAccounting
            ? "Pay subcontractors and track vendor balances."
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

      {canPay && showSubs ? (
        <SectionCard
          compact
          title="Record vendor payment"
          actions={
            <span className="text-xs opacity-60">
              Auto-fills vendor details · blocks $0 and overpayments
            </span>
          }
        >
          {payError ? <AlertBanner type="error">{payError}</AlertBanner> : null}
          {paySuccess ? <AlertBanner type="success">{paySuccess}</AlertBanner> : null}
          <form onSubmit={onSubmitPayment} className="space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <FormField label="Subcontractor">
                <select
                  className="select select-bordered select-sm w-full"
                  value={payForm.subcontractor_id}
                  onChange={(e) => onSelectSub(e.target.value)}
                  required
                >
                  <option value="">Select vendor…</option>
                  {payableSubs.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.company_name}
                      {sub.trade ? ` · ${sub.trade}` : ""}
                      {sub.contracts?.contract_name
                        ? ` · ${sub.contracts.contract_name}`
                        : ""}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Payment amount">
                <MoneyInput
                  value={payForm.payment_amount}
                  onValueChange={(v) => setPayForm((p) => ({ ...p, payment_amount: v }))}
                  required
                />
              </FormField>
              <FormField label="Payment date">
                <input
                  type="date"
                  className="input input-bordered input-sm w-full"
                  value={payForm.payment_date}
                  onChange={(e) => setPayForm((p) => ({ ...p, payment_date: e.target.value }))}
                />
              </FormField>
              <FormField label="Method">
                <input
                  className="input input-bordered input-sm w-full"
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm((p) => ({ ...p, payment_method: e.target.value }))}
                  placeholder="ACH, Check, Wire…"
                />
              </FormField>
              <FormField label="Reference #">
                <input
                  className="input input-bordered input-sm w-full"
                  value={payForm.reference_number}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, reference_number: e.target.value }))
                  }
                  placeholder="Check / ACH ref"
                />
              </FormField>
              <FormField label="Notes">
                <input
                  className="input input-bordered input-sm w-full"
                  value={payForm.notes}
                  onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </FormField>
            </div>

            {selectedSub ? (
              <div className="rounded-box border border-base-300 bg-base-200/40 p-3 text-sm grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div>
                  <p className="text-xs opacity-60">Company</p>
                  <p className="font-medium">{selectedSub.company_name}</p>
                </div>
                <div>
                  <p className="text-xs opacity-60">Contact</p>
                  <p className="font-medium">
                    {selectedSub.contact_name ?? "—"}
                    {selectedSub.contact_email ? (
                      <span className="block text-xs opacity-70">{selectedSub.contact_email}</span>
                    ) : null}
                    {selectedSub.contact_phone ? (
                      <span className="block text-xs opacity-70">{selectedSub.contact_phone}</span>
                    ) : null}
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-60">Project / Trade</p>
                  <p className="font-medium">
                    {selectedSub.contracts?.contract_name ?? "Unassigned"}
                    <span className="block text-xs opacity-70">{selectedSub.trade ?? "—"}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-60">Balance</p>
                  <p className="font-medium">
                    Value {money(selectedSub.subcontract_value)} · Paid{" "}
                    {money(selectedSub.amount_paid)}
                  </p>
                  <p className="text-xs opacity-70">
                    Remaining {money(remainingOnSelected ?? 0)}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={paySaving}>
                {paySaving ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  "Record payment"
                )}
              </button>
              {remainingOnSelected != null && remainingOnSelected > 0 && selectedSub ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setPayForm((p) => ({
                      ...p,
                      payment_amount: String(remainingOnSelected),
                    }))
                  }
                >
                  Fill remaining {money(remainingOnSelected)}
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      ) : null}

      {showSubs && recentPayments.length > 0 ? (
        <SectionCard compact title="Recent vendor payments">
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Project</th>
                  <th className="text-right">Amount</th>
                  <th>Method</th>
                  <th>Ref</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{p.payment_date ?? "—"}</td>
                    <td>{p.subcontractors?.company_name ?? "—"}</td>
                    <td className="truncate max-w-[10rem]">
                      {p.subcontractors?.contracts?.contract_name ?? "—"}
                    </td>
                    <td className="text-right font-medium">{money(p.payment_amount)}</td>
                    <td>{p.payment_method ?? "—"}</td>
                    <td className="truncate max-w-[8rem]">{p.reference_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {showBidding ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <StatCard compact title="Open Packages" value={String(openPackages)} href="/bidding" />
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
          emptyMessage="Subcontractor updates, vendor payments, and bid activity will show up here."
          limit={6}
        />
      ) : null}
    </div>
  );
}
