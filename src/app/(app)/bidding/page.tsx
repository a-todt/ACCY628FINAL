"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Gavel, Plus, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard } from "@/components/ui";
import { StarRating } from "@/components/StarRating";
import { writeAuditLog } from "@/lib/audit";
import { labelize, money } from "@/lib/metrics";
import { canManageBidPackages, canReviewBids, canStaffEnterBids, statusBadgeClass } from "@/lib/roles";
import { complianceBadgeClass, complianceFromExpiration, complianceLabel } from "@/lib/compliance";
import { resolveSubcontractorScopeUserId } from "@/lib/subScope";
import { createClient } from "@/lib/supabase/client";
import type { Bid, BidPackage, BidPackageStatus } from "@/lib/types";

const RATING_OPTIONS = ["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"] as const;

/** Fields shown after the expanded Scope of work block. */
const DETAIL_FIELDS: Array<{ key: keyof BidPackage; label: string }> = [
  { key: "technical_specifications", label: "Technical specifications" },
  { key: "materials_provided_by_gc", label: "Materials provided by GC" },
  { key: "materials_by_subcontractor", label: "Materials by subcontractor" },
  { key: "site_conditions", label: "Site conditions" },
  { key: "working_hours", label: "Working hours" },
  { key: "safety_requirements", label: "Safety requirements" },
  { key: "insurance_requirements", label: "Insurance requirements" },
  { key: "bonding_requirements", label: "Bonding requirements" },
  { key: "permit_notes", label: "Permits" },
  { key: "schedule_milestones", label: "Schedule milestones" },
  { key: "bid_instructions", label: "Bid instructions" },
  { key: "submission_requirements", label: "Submission requirements" },
];

const EMPTY_PACKAGE = {
  contract_id: "",
  title: "",
  trade: "",
  status: "open" as BidPackageStatus,
  estimated_package_value: "",
  scope_of_work: "",
  scope_inclusions: "",
  scope_exclusions: "",
  work_quantities: "",
  technical_specifications: "",
  materials_provided_by_gc: "",
  materials_by_subcontractor: "",
  site_conditions: "",
  working_hours: "",
  safety_requirements: "",
  insurance_requirements: "",
  bonding_requirements: "",
  permit_notes: "",
  schedule_milestones: "",
  bid_instructions: "",
  submission_requirements: "",
  prebid_meeting_at: "",
  questions_due_at: "",
  bids_due_at: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
};

const EMPTY_BID = {
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  amount: "",
  days_to_complete: "",
  proposal_notes: "",
  exclusions: "",
  license_number: "",
  license_state: "",
  license_expiration: "",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function BiddingRoute() {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-24">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      }
    >
      <BiddingPage />
    </Suspense>
  );
}

function BiddingPage() {
  const { effectiveRole, user, profile } = useAuth();
  const searchParams = useSearchParams();
  const packageFromQuery = searchParams.get("package");
  const { contracts, subcontractors, userProfiles, loading: contractsLoading, refresh: refreshContractData } =
    useContractData();
  const canManage = canManageBidPackages(effectiveRole);
  const canStaffEnter = canStaffEnterBids(effectiveRole);
  const canReview = canReviewBids(effectiveRole);
  const isSub = effectiveRole === "subcontractor";

  const subScopeUserId = useMemo(
    () =>
      resolveSubcontractorScopeUserId(
        effectiveRole,
        profile?.role,
        user?.id,
        userProfiles
      ),
    [effectiveRole, profile?.role, user?.id, userProfiles]
  );

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Set(subcontractors.map((s) => s.company_name.trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [subcontractors]
  );

  const ratingByCompany = useMemo(() => {
    const map = new Map<string, { rating: number | null; notes: string | null }>();
    for (const sub of subcontractors) {
      const key = sub.company_name.trim().toLowerCase();
      const existing = map.get(key);
      // Prefer the highest rating if the same company appears on multiple jobs
      if (!existing || Number(sub.rating ?? 0) > Number(existing.rating ?? 0)) {
        map.set(key, {
          rating: sub.rating ?? null,
          notes: sub.business_notes ?? null,
        });
      }
    }
    return map;
  }, [subcontractors]);

  const ratingForBid = (bid: Bid) => {
    const fromVendor =
      ratingByCompany.get(bid.company_name.trim().toLowerCase()) ?? {
        rating: null,
        notes: null,
      };
    return {
      rating: bid.gc_rating ?? fromVendor.rating,
      notes: bid.gc_review ?? fromVendor.notes,
    };
  };

  const [packages, setPackages] = useState<BidPackage[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(packageFromQuery);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddBid, setShowAddBid] = useState(false);
  const [pkgForm, setPkgForm] = useState(EMPTY_PACKAGE);
  const [bidForm, setBidForm] = useState(EMPTY_BID);
  const [staffBidForm, setStaffBidForm] = useState(EMPTY_BID);
  const [reviewingBid, setReviewingBid] = useState<Bid | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: "", review: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [pkgRes, bidRes] = await Promise.all([
      supabase.from("bid_packages").select("*").order("bids_due_at", { ascending: true }),
      supabase
        .from("bids")
        .select("*, bid_packages(title, project_name, trade)")
        .order("created_at", { ascending: false }),
    ]);
    if (pkgRes.error) setError(pkgRes.error.message);
    else setPackages((pkgRes.data as BidPackage[]) ?? []);
    if (bidRes.error) {
      setError((prev) => prev ?? bidRes.error!.message);
      setBids([]);
    } else {
      setBids((bidRes.data as Bid[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (packageFromQuery) setSelectedId(packageFromQuery);
  }, [packageFromQuery]);

  const activePackages = useMemo(
    () =>
      [...packages].sort((a, b) => {
        const rank = (s: BidPackageStatus) =>
          s === "open" ? 0 : s === "draft" ? 1 : s === "closed" ? 2 : 3;
        return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title);
      }),
    [packages]
  );

  const selected = useMemo(() => {
    if (selectedId) {
      return packages.find((p) => p.id === selectedId) ?? null;
    }
    return activePackages.find((p) => p.status === "open") ?? activePackages[0] ?? null;
  }, [packages, selectedId, activePackages]);

  useEffect(() => {
    if (selected && selectedId !== selected.id) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const packageBids = useMemo(
    () => (selected ? bids.filter((b) => b.bid_package_id === selected.id) : []),
    [bids, selected]
  );

  /** Submitted bids across all packages — so owners/PMs see new proposals without hunting. */
  const pendingReviewBids = useMemo(() => {
    if (!canReview) return [];
    return bids
      .filter((b) => b.status === "submitted")
      .map((b) => ({
        bid: b,
        pkg: packages.find((p) => p.id === b.bid_package_id) ?? null,
      }))
      .sort(
        (a, b) =>
          new Date(b.bid.created_at).getTime() - new Date(a.bid.created_at).getTime()
      );
  }, [bids, packages, canReview]);

  const winningBids = useMemo(() => {
    return bids
      .filter((b) => b.status === "accepted")
      .map((b) => ({
        bid: b,
        pkg: packages.find((p) => p.id === b.bid_package_id) ?? null,
      }))
      .sort((a, b) => {
        const aDate = a.pkg?.updated_at ?? a.bid.updated_at;
        const bDate = b.pkg?.updated_at ?? b.bid.updated_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [bids, packages]);

  const myBid = useMemo(
    () =>
      selected && subScopeUserId
        ? packageBids.find((b) => b.user_id === subScopeUserId) ?? null
        : null,
    [packageBids, selected, subScopeUserId]
  );

  useEffect(() => {
    if (!isSub) return;
    const linked = subcontractors.find((s) => s.user_id === subScopeUserId);
    setBidForm((prev) => ({
      ...prev,
      company_name:
        prev.company_name ||
        linked?.company_name ||
        (profile?.role === "subcontractor" ? profile.full_name : "") ||
        "",
      contact_name:
        prev.contact_name || myBid?.contact_name || linked?.contact_name || "",
      contact_email:
        prev.contact_email ||
        myBid?.contact_email ||
        linked?.contact_email ||
        profile?.email ||
        "",
      contact_phone:
        prev.contact_phone || myBid?.contact_phone || linked?.contact_phone || "",
      amount: prev.amount || (myBid ? String(myBid.amount) : prev.amount),
      days_to_complete:
        prev.days_to_complete ||
        (myBid?.days_to_complete != null ? String(myBid.days_to_complete) : ""),
      proposal_notes: prev.proposal_notes || myBid?.proposal_notes || "",
      exclusions: prev.exclusions || myBid?.exclusions || "",
      license_number:
        prev.license_number ||
        myBid?.license_number ||
        linked?.license_number ||
        "",
      license_state:
        prev.license_state || myBid?.license_state || linked?.license_state || "",
      license_expiration:
        prev.license_expiration ||
        myBid?.license_expiration ||
        linked?.license_expiration ||
        "",
    }));
    // Seed from package/bid/sub context — intentionally omit bidForm deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSub, profile?.full_name, profile?.role, selected?.id, myBid?.id, subScopeUserId, subcontractors]);

  const openReview = (bid: Bid) => {
    const vendor = ratingForBid(bid);
    setReviewingBid(bid);
    setReviewForm({
      rating:
        bid.gc_rating != null
          ? String(Number(bid.gc_rating))
          : vendor.rating != null
            ? String(Number(vendor.rating))
            : "",
      review: bid.gc_review ?? vendor.notes ?? "",
    });
  };

  const onAddStaffBid = async (e: FormEvent) => {
    e.preventDefault();
    if (!canStaffEnter || !selected) return;
    if (selected.status !== "open" && selected.status !== "closed") {
      setError("Bids can only be added on open or closed packages.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const amount = Number(staffBidForm.amount);
      if (!staffBidForm.company_name.trim() || Number.isNaN(amount) || amount < 0) {
        throw new Error("Company name and a valid bid amount are required.");
      }
      const supabase = createClient();
      const matchedSub = subcontractors.find(
        (s) =>
          s.company_name.trim().toLowerCase() ===
          staffBidForm.company_name.trim().toLowerCase()
      );
      const licenseNumber =
        staffBidForm.license_number.trim() || matchedSub?.license_number || "";
      const licenseState =
        staffBidForm.license_state.trim() || matchedSub?.license_state || "";
      const licenseExpiration =
        staffBidForm.license_expiration || matchedSub?.license_expiration || "";
      if (!licenseNumber) {
        throw new Error("License number is required.");
      }
      if (!licenseState) {
        throw new Error("License state is required.");
      }
      if (!licenseExpiration) {
        throw new Error("License expiration date is required.");
      }
      const payload = {
        bid_package_id: selected.id,
        // Staff-entered quotes stay unlinked so they don't collide with a portal bid
        user_id: null as string | null,
        company_name: staffBidForm.company_name.trim(),
        amount,
        days_to_complete: staffBidForm.days_to_complete
          ? Number(staffBidForm.days_to_complete)
          : null,
        proposal_notes: staffBidForm.proposal_notes.trim() || null,
        exclusions: staffBidForm.exclusions.trim() || null,
        license_number: licenseNumber,
        license_state: licenseState,
        license_expiration: licenseExpiration,
        status: "submitted" as const,
      };
      const { error: insertError } = await supabase.from("bids").insert(payload);
      if (insertError) throw insertError;
      await writeAuditLog("bid_added_by_staff", "bids", selected.id, {
        amount,
        company_name: payload.company_name,
      });
      setMessage("Bid added.");
      setShowAddBid(false);
      setStaffBidForm(EMPTY_BID);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bid.");
    } finally {
      setBusy(false);
    }
  };

  const onSaveReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!canReview || !reviewingBid) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const rating = reviewForm.rating ? Number(reviewForm.rating) : null;
      if (rating != null && (Number.isNaN(rating) || rating < 1 || rating > 5)) {
        throw new Error("Star rating must be between 1 and 5.");
      }
      const review = reviewForm.review.trim() || null;
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("bids")
        .update({
          gc_rating: rating,
          gc_review: review,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reviewingBid.id);
      if (updateError) throw updateError;

      const matchIds = subcontractors
        .filter(
          (s) =>
            s.company_name.trim().toLowerCase() ===
            reviewingBid.company_name.trim().toLowerCase()
        )
        .map((s) => s.id);
      if (matchIds.length > 0) {
        const { error: subError } = await supabase
          .from("subcontractors")
          .update({
            rating,
            business_notes: review,
          })
          .in("id", matchIds);
        if (subError) throw subError;
      }

      await writeAuditLog("bid_review_saved", "bids", reviewingBid.id, {
        company_name: reviewingBid.company_name,
        rating,
      });
      setMessage(`Review saved for ${reviewingBid.company_name}.`);
      setReviewingBid(null);
      await Promise.all([load(), refreshContractData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review.");
    } finally {
      setBusy(false);
    }
  };

  const onCreatePackage = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const contract = contracts.find((c) => c.id === pkgForm.contract_id);
      if (!contract) throw new Error("Select a project.");
      if (!pkgForm.title.trim() || !pkgForm.trade.trim()) {
        throw new Error("Title and trade are required.");
      }
      const supabase = createClient();
      const payload = {
        contract_id: contract.id,
        title: pkgForm.title.trim(),
        trade: pkgForm.trade.trim(),
        status: pkgForm.status,
        project_name: contract.contract_name,
        project_address: contract.project_address,
        project_city: contract.city,
        project_state: contract.state,
        client_name: contract.client_name,
        contract_type: contract.contract_type,
        project_start_date: contract.start_date,
        project_end_date: contract.end_date,
        estimated_package_value: pkgForm.estimated_package_value
          ? Number(pkgForm.estimated_package_value)
          : null,
        scope_of_work: pkgForm.scope_of_work.trim() || null,
        scope_inclusions: pkgForm.scope_inclusions.trim() || null,
        scope_exclusions: pkgForm.scope_exclusions.trim() || null,
        work_quantities: pkgForm.work_quantities.trim() || null,
        technical_specifications: pkgForm.technical_specifications.trim() || null,
        materials_provided_by_gc: pkgForm.materials_provided_by_gc.trim() || null,
        materials_by_subcontractor: pkgForm.materials_by_subcontractor.trim() || null,
        site_conditions: pkgForm.site_conditions.trim() || null,
        working_hours: pkgForm.working_hours.trim() || null,
        safety_requirements: pkgForm.safety_requirements.trim() || null,
        insurance_requirements: pkgForm.insurance_requirements.trim() || null,
        bonding_requirements: pkgForm.bonding_requirements.trim() || null,
        permit_notes: pkgForm.permit_notes.trim() || null,
        schedule_milestones: pkgForm.schedule_milestones.trim() || null,
        bid_instructions: pkgForm.bid_instructions.trim() || null,
        submission_requirements: pkgForm.submission_requirements.trim() || null,
        prebid_meeting_at: pkgForm.prebid_meeting_at
          ? new Date(pkgForm.prebid_meeting_at).toISOString()
          : null,
        questions_due_at: pkgForm.questions_due_at || null,
        bids_due_at: pkgForm.bids_due_at || null,
        contact_name: pkgForm.contact_name.trim() || profile?.full_name || null,
        contact_email: pkgForm.contact_email.trim() || profile?.email || null,
        contact_phone: pkgForm.contact_phone.trim() || null,
        created_by: user?.id ?? null,
      };
      const { data, error: insertError } = await supabase
        .from("bid_packages")
        .insert(payload)
        .select("*")
        .single();
      if (insertError) throw insertError;
      await writeAuditLog("bid_package_created", "bid_packages", data.id, {
        title: data.title,
        trade: data.trade,
      });
      setMessage("Bid package published.");
      setShowCreate(false);
      setPkgForm(EMPTY_PACKAGE);
      setSelectedId(data.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bid package.");
    } finally {
      setBusy(false);
    }
  };

  const onUpdateStatus = async (status: BidPackageStatus) => {
    if (!selected || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("bid_packages")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      if (updateError) throw updateError;
      await writeAuditLog("bid_package_status", "bid_packages", selected.id, { status });
      setMessage(`Package marked ${labelize(status)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitBid = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSub || !selected || !subScopeUserId) return;
    if (selected.status !== "open") {
      setError("This package is not open for bidding.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const amount = Number(bidForm.amount);
      if (!bidForm.company_name.trim() || Number.isNaN(amount) || amount < 0) {
        throw new Error("Company name and a valid bid amount are required.");
      }
      if (!bidForm.contact_name.trim()) {
        throw new Error("Contact name is required.");
      }
      if (!bidForm.contact_email.trim()) {
        throw new Error("Contact email is required.");
      }
      if (!bidForm.contact_phone.trim()) {
        throw new Error("Contact phone is required.");
      }
      if (!bidForm.license_number.trim()) {
        throw new Error("License number is required to submit a bid.");
      }
      if (!bidForm.license_state.trim()) {
        throw new Error("License state is required to submit a bid.");
      }
      if (!bidForm.license_expiration) {
        throw new Error("License expiration date is required to submit a bid.");
      }
      const supabase = createClient();
      const payload = {
        bid_package_id: selected.id,
        user_id: subScopeUserId,
        company_name: bidForm.company_name.trim(),
        contact_name: bidForm.contact_name.trim(),
        contact_email: bidForm.contact_email.trim(),
        contact_phone: bidForm.contact_phone.trim(),
        amount,
        days_to_complete: bidForm.days_to_complete ? Number(bidForm.days_to_complete) : null,
        proposal_notes: bidForm.proposal_notes.trim() || null,
        exclusions: bidForm.exclusions.trim() || null,
        license_number: bidForm.license_number.trim(),
        license_state: bidForm.license_state.trim(),
        license_expiration: bidForm.license_expiration,
        status: "submitted" as const,
        updated_at: new Date().toISOString(),
      };
      const { error: upsertError } = await supabase.from("bids").upsert(payload, {
        onConflict: "bid_package_id,user_id",
      });
      if (upsertError) throw upsertError;

      // Keep linked / matching subcontractor company + contact + license current
      const matchIds = subcontractors
        .filter(
          (s) =>
            s.user_id === subScopeUserId ||
            s.company_name.trim().toLowerCase() === payload.company_name.toLowerCase()
        )
        .map((s) => s.id);
      if (matchIds.length > 0) {
        await supabase
          .from("subcontractors")
          .update({
            company_name: payload.company_name,
            contact_name: payload.contact_name,
            contact_email: payload.contact_email,
            contact_phone: payload.contact_phone,
            license_number: payload.license_number,
            license_state: payload.license_state,
            license_expiration: payload.license_expiration,
          })
          .in("id", matchIds);
      }

      await writeAuditLog("bid_submitted", "bids", selected.id, {
        amount,
        company_name: payload.company_name,
      });
      setMessage(myBid ? "Bid updated." : "Bid submitted.");
      await Promise.all([load(), refreshContractData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit bid.");
    } finally {
      setBusy(false);
    }
  };

  const onSetBidStatus = async (bidId: string, status: Bid["status"]) => {
    if (!canReview) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("bids")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", bidId);
      if (updateError) throw updateError;
      if (status === "accepted" && selected) {
        await supabase
          .from("bid_packages")
          .update({ status: "awarded", updated_at: new Date().toISOString() })
          .eq("id", selected.id);
      }
      await writeAuditLog("bid_status", "bids", bidId, { status });
      setMessage(`Bid ${labelize(status)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update bid.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || contractsLoading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subcontractor Bidding"
        subtitle={
          isSub
            ? "Review detailed bid packages and submit your price, schedule, and license info."
            : canReview
              ? "Review subcontractor proposals and accept or reject bids. Owners approve — they do not submit bids."
              : "Publish detailed bid packages for open work and review subcontractor proposals."
        }
        actions={
          canManage ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4" />
              {showCreate ? "Close form" : "New bid package"}
            </button>
          ) : null
        }
      />

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

      {canReview && pendingReviewBids.length > 0 ? (
        <SectionCard title={`Bids awaiting decision (${pendingReviewBids.length})`}>
          <p className="text-sm opacity-70 mb-3">
            All submitted proposals across packages. Open a row to review, accept, or reject.
          </p>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Package</th>
                  <th>Amount</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingReviewBids.map(({ bid, pkg }) => (
                  <tr key={bid.id}>
                    <td>
                      <div className="font-medium">{bid.company_name}</div>
                      <div className="text-xs opacity-60">
                        {[bid.contact_name, bid.contact_email].filter(Boolean).join(" · ") ||
                          "—"}
                      </div>
                    </td>
                    <td className="text-sm">
                      {pkg?.title ?? "Package"}
                      {pkg?.trade ? (
                        <div className="text-xs opacity-60">{pkg.trade}</div>
                      ) : null}
                    </td>
                    <td>{money(bid.amount)}</td>
                    <td className="text-xs opacity-70">
                      {bid.created_at
                        ? new Date(bid.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => {
                          if (pkg) setSelectedId(pkg.id);
                        }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {canManage && showCreate ? (
        <SectionCard title="Create bid package">
          <form onSubmit={onCreatePackage} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField stacked label="Project">
                <select
                  className="select select-bordered w-full"
                  value={pkgForm.contract_id}
                  onChange={(e) => setPkgForm((p) => ({ ...p, contract_id: e.target.value }))}
                  required
                >
                  <option value="">Select project…</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contract_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField stacked label="Trade">
                <input
                  className="input input-bordered w-full"
                  value={pkgForm.trade}
                  onChange={(e) => setPkgForm((p) => ({ ...p, trade: e.target.value }))}
                  placeholder="Electrical, HVAC, Glazing…"
                  required
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField stacked label="Package title">
                  <input
                    className="input input-bordered w-full"
                    value={pkgForm.title}
                    onChange={(e) => setPkgForm((p) => ({ ...p, title: e.target.value }))}
                    required
                  />
                </FormField>
              </div>
              <FormField stacked label="Estimated value">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input input-bordered w-full"
                  value={pkgForm.estimated_package_value}
                  onChange={(e) => setPkgForm((p) => ({ ...p, estimated_package_value: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="Status">
                <select
                  className="select select-bordered w-full"
                  value={pkgForm.status}
                  onChange={(e) =>
                    setPkgForm((p) => ({ ...p, status: e.target.value as BidPackageStatus }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                </select>
              </FormField>
              <FormField stacked label="Bids due">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={pkgForm.bids_due_at}
                  onChange={(e) => setPkgForm((p) => ({ ...p, bids_due_at: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="Questions due">
                <input
                  type="date"
                  className="input input-bordered w-full"
                  value={pkgForm.questions_due_at}
                  onChange={(e) => setPkgForm((p) => ({ ...p, questions_due_at: e.target.value }))}
                />
              </FormField>
              {(
                [
                  ["scope_of_work", "Scope of work (summary)"],
                  ["scope_inclusions", "Scope inclusions"],
                  ["scope_exclusions", "Scope exclusions"],
                  ["work_quantities", "Work quantities / takeoff"],
                  ["technical_specifications", "Technical specifications"],
                  ["materials_provided_by_gc", "Materials provided by GC"],
                  ["materials_by_subcontractor", "Materials by subcontractor"],
                  ["site_conditions", "Site conditions"],
                  ["working_hours", "Working hours"],
                  ["safety_requirements", "Safety requirements"],
                  ["insurance_requirements", "Insurance requirements"],
                  ["bonding_requirements", "Bonding requirements"],
                  ["permit_notes", "Permit notes"],
                  ["schedule_milestones", "Schedule milestones"],
                  ["bid_instructions", "Bid instructions"],
                  ["submission_requirements", "Submission requirements"],
                ] as const
              ).map(([key, label]) => (
                <FormField key={key} stacked label={label}>
                  <textarea
                    className="textarea textarea-bordered w-full min-h-24"
                    value={pkgForm[key]}
                    onChange={(e) => setPkgForm((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </FormField>
              ))}
              <FormField stacked label="Pre-bid meeting">
                <input
                  type="datetime-local"
                  className="input input-bordered w-full"
                  value={pkgForm.prebid_meeting_at}
                  onChange={(e) => setPkgForm((p) => ({ ...p, prebid_meeting_at: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="GC contact name">
                <input
                  className="input input-bordered w-full"
                  value={pkgForm.contact_name}
                  onChange={(e) => setPkgForm((p) => ({ ...p, contact_name: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="GC contact email">
                <input
                  type="email"
                  className="input input-bordered w-full"
                  value={pkgForm.contact_email}
                  onChange={(e) => setPkgForm((p) => ({ ...p, contact_email: e.target.value }))}
                />
              </FormField>
              <FormField stacked label="GC contact phone">
                <input
                  className="input input-bordered w-full"
                  value={pkgForm.contact_phone}
                  onChange={(e) => setPkgForm((p) => ({ ...p, contact_phone: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <span className="loading loading-spinner loading-sm" /> : null}
                Publish package
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {packages.length === 0 ? (
        <EmptyState
          title="No bid packages yet"
          message={
            canManage
              ? "Create a detailed bid package so subcontractors can price the work."
              : "When the GC posts open packages, they will appear here with full project detail."
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <SectionCard title="Packages">
            <ul className="menu bg-base-100 rounded-box p-0 gap-1">
              {activePackages.map((pkg) => (
                <li key={pkg.id}>
                  <button
                    type="button"
                    className={selected?.id === pkg.id ? "active" : ""}
                    onClick={() => setSelectedId(pkg.id)}
                  >
                    <div className="min-w-0 text-left">
                      <div className="font-medium truncate">{pkg.title}</div>
                      <div className="text-xs opacity-60 truncate">
                        {pkg.project_name} · {pkg.trade}
                      </div>
                    </div>
                    <span className={`badge badge-sm ${statusBadgeClass(pkg.status)}`}>
                      {labelize(pkg.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          {selected ? (
            <div className="space-y-4">
              <SectionCard
                title={selected.title}
                actions={
                  canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {selected.status === "open" ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => onUpdateStatus("closed")}
                        >
                          Close bidding
                        </button>
                      ) : null}
                      {selected.status !== "open" ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => onUpdateStatus("open")}
                        >
                          Reopen
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <span className={`badge ${statusBadgeClass(selected.status)}`}>
                      {labelize(selected.status)}
                    </span>
                  )
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  <div>
                    <div className="opacity-60">Project</div>
                    <div className="font-medium">{selected.project_name}</div>
                  </div>
                  <div>
                    <div className="opacity-60">Location</div>
                    <div className="font-medium">
                      {[selected.project_address, selected.project_city, selected.project_state]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">Client</div>
                    <div className="font-medium">{selected.client_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="opacity-60">Trade</div>
                    <div className="font-medium">{selected.trade}</div>
                  </div>
                  <div>
                    <div className="opacity-60">Est. package value</div>
                    <div className="font-medium">{money(selected.estimated_package_value)}</div>
                  </div>
                  <div>
                    <div className="opacity-60">Contract type</div>
                    <div className="font-medium">
                      {selected.contract_type ? labelize(selected.contract_type) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">Project dates</div>
                    <div className="font-medium">
                      {formatDate(selected.project_start_date)} → {formatDate(selected.project_end_date)}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">Bids due</div>
                    <div className="font-medium">{formatDate(selected.bids_due_at)}</div>
                  </div>
                  <div>
                    <div className="opacity-60">Questions due</div>
                    <div className="font-medium">{formatDate(selected.questions_due_at)}</div>
                  </div>
                  <div>
                    <div className="opacity-60">Pre-bid meeting</div>
                    <div className="font-medium">{formatDateTime(selected.prebid_meeting_at)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="opacity-60">GC contact</div>
                    <div className="font-medium">
                      {[selected.contact_name, selected.contact_email, selected.contact_phone]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Project detail for bidders">
                <div className="space-y-5">
                  <div className="rounded-lg border border-base-300 bg-base-200/30 p-4 space-y-4">
                    <h3 className="font-semibold">Scope of work</h3>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                        Summary
                      </h4>
                      <p className="text-sm whitespace-pre-wrap opacity-90">
                        {selected.scope_of_work?.trim() || "—"}
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                          Inclusions
                        </h4>
                        <p className="text-sm whitespace-pre-wrap opacity-90">
                          {selected.scope_inclusions?.trim() || "—"}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                          Exclusions
                        </h4>
                        <p className="text-sm whitespace-pre-wrap opacity-90">
                          {selected.scope_exclusions?.trim() || "—"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                        Work quantities / takeoff
                      </h4>
                      <p className="text-sm whitespace-pre-wrap opacity-90">
                        {selected.work_quantities?.trim() || "—"}
                      </p>
                    </div>
                  </div>

                  {DETAIL_FIELDS.map(({ key, label }) => {
                    const value = selected[key];
                    const text = typeof value === "string" ? value.trim() : "";
                    return (
                      <div key={key}>
                        <h4 className="font-semibold text-sm mb-1">{label}</h4>
                        <p className="text-sm whitespace-pre-wrap opacity-90">{text || "—"}</p>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {isSub && selected.status === "open" ? (
                <SectionCard title={myBid ? "Update your bid" : "Submit a bid"}>
                  <p className="text-sm opacity-70 mb-3 md:col-span-2">
                    Include your company and contact information, plus license number, state, and
                    expiration with every bid.
                  </p>
                  <form onSubmit={onSubmitBid} className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                        Company information
                      </p>
                    </div>
                    <FormField label="Company name">
                      <input
                        className="input input-bordered"
                        value={bidForm.company_name}
                        onChange={(e) => setBidForm((p) => ({ ...p, company_name: e.target.value }))}
                        required
                      />
                    </FormField>
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                        Contact information
                      </p>
                    </div>
                    <FormField label="Contact name">
                      <input
                        className="input input-bordered"
                        value={bidForm.contact_name}
                        onChange={(e) => setBidForm((p) => ({ ...p, contact_name: e.target.value }))}
                        required
                      />
                    </FormField>
                    <FormField label="Contact email">
                      <input
                        type="email"
                        className="input input-bordered"
                        value={bidForm.contact_email}
                        onChange={(e) => setBidForm((p) => ({ ...p, contact_email: e.target.value }))}
                        required
                      />
                    </FormField>
                    <FormField label="Contact phone">
                      <input
                        className="input input-bordered"
                        value={bidForm.contact_phone}
                        onChange={(e) => setBidForm((p) => ({ ...p, contact_phone: e.target.value }))}
                        required
                      />
                    </FormField>
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                        Bid details
                      </p>
                    </div>
                    <FormField label="Bid amount">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input input-bordered"
                        value={bidForm.amount || (myBid ? String(myBid.amount) : "")}
                        onChange={(e) => setBidForm((p) => ({ ...p, amount: e.target.value }))}
                        required
                      />
                    </FormField>
                    <FormField label="Days to complete">
                      <input
                        type="number"
                        min="1"
                        className="input input-bordered"
                        value={bidForm.days_to_complete}
                        onChange={(e) =>
                          setBidForm((p) => ({ ...p, days_to_complete: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label="License number">
                      <input
                        className="input input-bordered"
                        value={bidForm.license_number}
                        onChange={(e) => setBidForm((p) => ({ ...p, license_number: e.target.value }))}
                        required
                      />
                    </FormField>
                    <FormField label="License state">
                      <input
                        className="input input-bordered"
                        value={bidForm.license_state}
                        onChange={(e) => setBidForm((p) => ({ ...p, license_state: e.target.value }))}
                        placeholder="e.g. IL"
                        required
                      />
                    </FormField>
                    <FormField label="License expiration">
                      <input
                        type="date"
                        className="input input-bordered"
                        value={bidForm.license_expiration}
                        onChange={(e) =>
                          setBidForm((p) => ({ ...p, license_expiration: e.target.value }))
                        }
                        required
                      />
                    </FormField>
                    <div className="md:col-span-2">
                      <FormField label="Proposal notes">
                        <textarea
                          className="textarea textarea-bordered min-h-24"
                          value={bidForm.proposal_notes}
                          onChange={(e) => setBidForm((p) => ({ ...p, proposal_notes: e.target.value }))}
                        />
                      </FormField>
                    </div>
                    <div className="md:col-span-2">
                      <FormField label="Exclusions">
                        <textarea
                          className="textarea textarea-bordered"
                          value={bidForm.exclusions}
                          onChange={(e) => setBidForm((p) => ({ ...p, exclusions: e.target.value }))}
                        />
                      </FormField>
                    </div>
                    <div className="md:col-span-2">
                      <button type="submit" className="btn btn-primary" disabled={busy}>
                        <Gavel className="h-4 w-4" />
                        {myBid ? "Update bid" : "Submit bid"}
                      </button>
                    </div>
                  </form>
                </SectionCard>
              ) : null}

              {isSub && myBid ? (
                <SectionCard title="Your submitted bid">
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="opacity-60">Company: </span>
                      {myBid.company_name}
                    </div>
                    <div>
                      <span className="opacity-60">Contact: </span>
                      {[myBid.contact_name, myBid.contact_email, myBid.contact_phone]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                    <div>
                      <span className="opacity-60">Amount: </span>
                      {money(myBid.amount)}
                    </div>
                    <div>
                      <span className="opacity-60">Status: </span>
                      <span className={`badge badge-sm ${statusBadgeClass(myBid.status)}`}>
                        {labelize(myBid.status)}
                      </span>
                    </div>
                    {myBid.license_number ? (
                      <div>
                        <span className="opacity-60">License: </span>
                        {myBid.license_number} ({myBid.license_state ?? "—"}) exp{" "}
                        {formatDate(myBid.license_expiration)}
                      </div>
                    ) : null}
                  </div>
                </SectionCard>
              ) : null}

              {canReview ? (
                <SectionCard
                  title={`Received bids (${packageBids.length})`}
                  actions={
                    canStaffEnter && (selected.status === "open" || selected.status === "closed") ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => setShowAddBid((v) => !v)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {showAddBid ? "Close" : "Add bid"}
                      </button>
                    ) : null
                  }
                >
                  {showAddBid && canStaffEnter ? (
                    <form
                      onSubmit={onAddStaffBid}
                      className="mb-4 grid gap-3 rounded-lg border border-base-300 bg-base-200/40 p-3 md:grid-cols-2"
                    >
                      <FormField label="Company">
                        <input
                          className="input input-bordered input-sm"
                          list="staff-bid-companies"
                          value={staffBidForm.company_name}
                          onChange={(e) =>
                            setStaffBidForm((p) => ({ ...p, company_name: e.target.value }))
                          }
                          placeholder="Select or type company name"
                          required
                        />
                        <datalist id="staff-bid-companies">
                          {companyOptions.map((name) => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      </FormField>
                      <FormField label="Bid amount">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input input-bordered input-sm"
                          value={staffBidForm.amount}
                          onChange={(e) =>
                            setStaffBidForm((p) => ({ ...p, amount: e.target.value }))
                          }
                          required
                        />
                      </FormField>
                      <FormField label="Days to complete">
                        <input
                          type="number"
                          min="1"
                          className="input input-bordered input-sm"
                          value={staffBidForm.days_to_complete}
                          onChange={(e) =>
                            setStaffBidForm((p) => ({
                              ...p,
                              days_to_complete: e.target.value,
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="License number">
                        <input
                          className="input input-bordered input-sm"
                          value={staffBidForm.license_number}
                          onChange={(e) =>
                            setStaffBidForm((p) => ({ ...p, license_number: e.target.value }))
                          }
                          required
                        />
                      </FormField>
                      <FormField label="License state">
                        <input
                          className="input input-bordered input-sm"
                          value={staffBidForm.license_state}
                          onChange={(e) =>
                            setStaffBidForm((p) => ({ ...p, license_state: e.target.value }))
                          }
                          placeholder="e.g. IL"
                          required
                        />
                      </FormField>
                      <FormField label="License expiration">
                        <input
                          type="date"
                          className="input input-bordered input-sm"
                          value={staffBidForm.license_expiration}
                          onChange={(e) =>
                            setStaffBidForm((p) => ({
                              ...p,
                              license_expiration: e.target.value,
                            }))
                          }
                          required
                        />
                      </FormField>
                      <div className="md:col-span-2">
                        <FormField label="Proposal notes">
                          <textarea
                            className="textarea textarea-bordered textarea-sm"
                            rows={2}
                            value={staffBidForm.proposal_notes}
                            onChange={(e) =>
                              setStaffBidForm((p) => ({
                                ...p,
                                proposal_notes: e.target.value,
                              }))
                            }
                          />
                        </FormField>
                      </div>
                      <div className="md:col-span-2">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                          <Gavel className="h-4 w-4" />
                          Save bid
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {packageBids.length === 0 ? (
                    <p className="text-sm opacity-60">No bids submitted yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>Company</th>
                            <th className="hidden lg:table-cell">Contact</th>
                            <th className="hidden xl:table-cell">Rating</th>
                            <th>Amount</th>
                            <th className="hidden xl:table-cell">Days</th>
                            <th className="hidden xl:table-cell">License</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {packageBids.map((bid) => {
                            const vendor = ratingForBid(bid);
                            return (
                              <tr key={bid.id}>
                                <td>
                                  <div className="font-medium">{bid.company_name}</div>
                                  {vendor.notes ? (
                                    <div className="text-xs opacity-60 line-clamp-2 max-w-xs">
                                      {vendor.notes}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="text-xs hidden lg:table-cell">
                                  {[bid.contact_name, bid.contact_email, bid.contact_phone]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </td>
                                <td className="hidden xl:table-cell">
                                  <StarRating value={vendor.rating} size="xs" />
                                </td>
                                <td
                                  title={[
                                    vendor.rating != null ? `Rating: ${vendor.rating}` : null,
                                    bid.days_to_complete != null
                                      ? `Days: ${bid.days_to_complete}`
                                      : null,
                                    bid.license_number
                                      ? `License: ${bid.license_number} (${bid.license_state ?? "—"})`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                >
                                  {money(bid.amount)}
                                </td>
                                <td className="hidden xl:table-cell">{bid.days_to_complete ?? "—"}</td>
                                <td className="text-xs hidden xl:table-cell">
                                  {bid.license_number ? (
                                    <div>
                                      <div>
                                        {bid.license_number} ({bid.license_state ?? "—"})
                                      </div>
                                      <div className="opacity-70">
                                        Exp {formatDate(bid.license_expiration)}
                                      </div>
                                      {bid.license_expiration ? (
                                        <span
                                          className={`badge badge-xs mt-1 ${complianceBadgeClass(
                                            complianceFromExpiration(bid.license_expiration)
                                          )}`}
                                        >
                                          {complianceLabel(
                                            complianceFromExpiration(bid.license_expiration)
                                          )}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`badge badge-sm ${statusBadgeClass(bid.status)}`}
                                  >
                                    {labelize(bid.status)}
                                  </span>
                                </td>
                                <td className="text-right space-x-1 whitespace-nowrap">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs"
                                    disabled={busy}
                                    onClick={() => openReview(bid)}
                                    title="Add or edit stars and review"
                                  >
                                    <Star className="h-3.5 w-3.5" />
                                    Review
                                  </button>
                                  {bid.status === "submitted" ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-xs"
                                        disabled={busy}
                                        onClick={() => onSetBidStatus(bid.id, "accepted")}
                                      >
                                        Accept
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-xs"
                                        disabled={busy}
                                        onClick={() => onSetBidStatus(bid.id, "rejected")}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {winningBids.length > 0 ? (
        <SectionCard title={`Past winning bids (${winningBids.length})`}>
          <p className="text-sm opacity-70 mb-3">
            Awarded packages and the subcontractors who won them — useful for history and vendor performance.
          </p>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Awarded</th>
                  <th>Package</th>
                  <th>Project</th>
                  <th className="hidden xl:table-cell">Trade</th>
                  <th>Winner</th>
                  <th className="hidden xl:table-cell">Rating</th>
                  <th>Amount</th>
                  <th className="hidden xl:table-cell">Days</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {winningBids.map(({ bid, pkg }) => {
                  const vendor = ratingForBid(bid);
                  return (
                  <tr
                    key={bid.id}
                    className="cursor-pointer hover:bg-base-200/60"
                    onClick={() => pkg && setSelectedId(pkg.id)}
                  >
                    <td>{formatDate(pkg?.updated_at ?? bid.updated_at)}</td>
                    <td className="font-medium">{pkg?.title ?? "—"}</td>
                    <td>{pkg?.project_name ?? "—"}</td>
                    <td className="hidden xl:table-cell">{pkg?.trade ?? "—"}</td>
                    <td>
                      <div>{bid.company_name}</div>
                      {bid.license_number ? (
                        <div className="text-xs opacity-60">
                          {bid.license_number} ({bid.license_state ?? "—"})
                        </div>
                      ) : null}
                    </td>
                    <td className="hidden xl:table-cell">
                      <StarRating value={vendor.rating} size="xs" />
                    </td>
                    <td
                      title={[
                        pkg?.trade ? `Trade: ${pkg.trade}` : null,
                        vendor.rating != null ? `Rating: ${vendor.rating}` : null,
                        bid.days_to_complete != null ? `Days: ${bid.days_to_complete}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {money(bid.amount)}
                    </td>
                    <td className="hidden xl:table-cell">{bid.days_to_complete ?? "—"}</td>
                    <td>
                      {canReview ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openReview(bid);
                          }}
                        >
                          <Star className="h-3.5 w-3.5" />
                          Review
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {reviewingBid ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="text-lg font-semibold">Review · {reviewingBid.company_name}</h3>
            <p className="text-sm opacity-70 mt-1">
              Add stars and notes for this bid. Saves on the bid and updates matching
              subcontractor profiles.
            </p>
            <form onSubmit={onSaveReview} className="mt-4 space-y-3">
              <FormField label="Star rating">
                <select
                  className="select select-bordered w-full"
                  value={reviewForm.rating}
                  onChange={(e) => setReviewForm((p) => ({ ...p, rating: e.target.value }))}
                >
                  <option value="">Not rated</option>
                  {RATING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {Number(r).toFixed(1)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Review notes">
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={4}
                  placeholder="On-time? Easy to reach? Quality of work? Professional?"
                  value={reviewForm.review}
                  onChange={(e) => setReviewForm((p) => ({ ...p, review: e.target.value }))}
                />
              </FormField>
              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => setReviewingBid(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                  Save review
                </button>
              </div>
            </form>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Close"
            onClick={() => setReviewingBid(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
