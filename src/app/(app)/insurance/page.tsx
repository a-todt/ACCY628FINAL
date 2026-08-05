"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard, StatCard } from "@/components/ui";
import {
  POLICY_TYPES,
  buildInsuranceWarnings,
  canManageInsurance,
  canUploadSubInsurance,
  gcComplianceSummary,
  labelPolicy,
  policyHealth,
  policyHealthBadge,
} from "@/lib/insurance";
import { labelize, money } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/client";
import type { InsuranceAppliesTo, InsuranceHolderType, InsurancePolicyType } from "@/lib/types";

type Tab = "gc" | "subs" | "requirements";
type SortKey = "type" | "carrier" | "limit" | "expiration" | "status";

const EMPTY_POLICY = {
  holder_type: "gc" as InsuranceHolderType,
  subcontractor_id: "",
  policy_type: "general_liability" as InsurancePolicyType,
  carrier_name: "",
  policy_number: "",
  coverage_limit: "",
  effective_date: "",
  expiration_date: "",
  additional_insured: false,
  waiver_of_subrogation: false,
  notes: "",
};

const EMPTY_REQ = {
  contract_id: "",
  policy_type: "general_liability" as InsurancePolicyType,
  minimum_limit: "",
  requires_additional_insured: false,
  requires_waiver: false,
  applies_to: "both" as InsuranceAppliesTo,
  notes: "",
};

export default function InsurancePage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, subcontractors, loading: contractsLoading } = useContractData();
  const { policies, requirements, loading, error, refresh } = useInsuranceData();

  const canManage = canManageInsurance(effectiveRole);
  const canUploadSub = canUploadSubInsurance(effectiveRole);
  const isClient = effectiveRole === "client";
  const isSub = effectiveRole === "subcontractor";

  const [tab, setTab] = useState<Tab>(isClient ? "gc" : "gc");
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [showReqForm, setShowReqForm] = useState(false);
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY);
  const [reqForm, setReqForm] = useState(EMPTY_REQ);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("expiration");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [healthFilter, setHealthFilter] = useState("all");

  const mySubIds = useMemo(
    () => new Set(subcontractors.filter((s) => s.user_id === user?.id).map((s) => s.id)),
    [subcontractors, user?.id]
  );

  const visiblePolicies = useMemo(() => {
    let list = policies;
    if (isClient) list = list.filter((p) => p.holder_type === "gc");
    if (isSub) {
      list = list.filter(
        (p) => p.holder_type === "subcontractor" && p.subcontractor_id && mySubIds.has(p.subcontractor_id)
      );
    }
    return list;
  }, [policies, isClient, isSub, mySubIds]);

  const gcPolicies = visiblePolicies.filter((p) => p.holder_type === "gc");
  const subPolicies = visiblePolicies.filter((p) => p.holder_type === "subcontractor");
  const summary = gcComplianceSummary(policies);
  const warnings = buildInsuranceWarnings(policies, requirements, subcontractors);

  const filteredGc = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...gcPolicies];
    if (healthFilter !== "all") rows = rows.filter((p) => policyHealth(p) === healthFilter);
    if (q) {
      rows = rows.filter((p) =>
        [p.carrier_name, p.policy_number, p.policy_type, p.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return rows.sort((a, b) => {
      if (sortKey === "type") return compareValues(a.policy_type, b.policy_type, sortDir);
      if (sortKey === "carrier") return compareValues(a.carrier_name, b.carrier_name, sortDir);
      if (sortKey === "limit") return compareValues(Number(a.coverage_limit ?? 0), Number(b.coverage_limit ?? 0), sortDir);
      if (sortKey === "status") return compareValues(policyHealth(a), policyHealth(b), sortDir);
      return compareValues(a.expiration_date, b.expiration_date, sortDir);
    });
  }, [gcPolicies, search, sortKey, sortDir, healthFilter]);

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...subPolicies];
    if (healthFilter !== "all") rows = rows.filter((p) => policyHealth(p) === healthFilter);
    if (q) {
      rows = rows.filter((p) =>
        [p.carrier_name, p.policy_number, p.policy_type, p.subcontractors?.company_name, p.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return rows.sort((a, b) => {
      if (sortKey === "type") return compareValues(a.policy_type, b.policy_type, sortDir);
      if (sortKey === "carrier") return compareValues(a.carrier_name, b.carrier_name, sortDir);
      if (sortKey === "limit") return compareValues(Number(a.coverage_limit ?? 0), Number(b.coverage_limit ?? 0), sortDir);
      if (sortKey === "status") return compareValues(policyHealth(a), policyHealth(b), sortDir);
      return compareValues(a.expiration_date, b.expiration_date, sortDir);
    });
  }, [subPolicies, search, sortKey, sortDir, healthFilter]);

  const onSavePolicy = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!canUploadSub && !canManage) {
      setFormError("You do not have permission to add insurance.");
      return;
    }
    if (policyForm.holder_type === "subcontractor" && !policyForm.subcontractor_id) {
      setFormError("Select a subcontractor for this COI.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("insurance_policies").insert({
        holder_type: policyForm.holder_type,
        subcontractor_id:
          policyForm.holder_type === "subcontractor" ? policyForm.subcontractor_id : null,
        policy_type: policyForm.policy_type,
        carrier_name: policyForm.carrier_name.trim() || null,
        policy_number: policyForm.policy_number.trim() || null,
        coverage_limit: policyForm.coverage_limit ? Number(policyForm.coverage_limit) : null,
        effective_date: policyForm.effective_date || null,
        expiration_date: policyForm.expiration_date || null,
        additional_insured: policyForm.additional_insured,
        waiver_of_subrogation: policyForm.waiver_of_subrogation,
        notes: policyForm.notes.trim() || null,
        created_by: user?.id ?? null,
      });
      if (insertError) throw insertError;
      setSuccess("Insurance policy saved.");
      setPolicyForm({
        ...EMPTY_POLICY,
        holder_type: isSub ? "subcontractor" : "gc",
      });
      setShowPolicyForm(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save policy.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveReq = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!canManage) {
      setFormError("Only admins and project managers can set requirements.");
      return;
    }
    if (!reqForm.contract_id) {
      setFormError("Select a contract.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("contract_insurance_requirements").insert({
        contract_id: reqForm.contract_id,
        policy_type: reqForm.policy_type,
        minimum_limit: reqForm.minimum_limit ? Number(reqForm.minimum_limit) : null,
        requires_additional_insured: reqForm.requires_additional_insured,
        requires_waiver: reqForm.requires_waiver,
        applies_to: reqForm.applies_to,
        notes: reqForm.notes.trim() || null,
      });
      if (insertError) throw insertError;
      setSuccess("Contract insurance requirement saved.");
      setReqForm(EMPTY_REQ);
      setShowReqForm(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save requirement.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || contractsLoading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) return <AlertBanner type="error">{error}</AlertBanner>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insurance"
        subtitle="Track GC policies, subcontractor COIs, expirations, and job requirements."
        actions={
          !isClient ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowPolicyForm((v) => !v);
                setPolicyForm({
                  ...EMPTY_POLICY,
                  holder_type: isSub ? "subcontractor" : tab === "subs" ? "subcontractor" : "gc",
                });
              }}
            >
              <Plus className="h-4 w-4" /> Add Policy / COI
            </button>
          ) : undefined
        }
      />

      {success ? <AlertBanner type="success">{success}</AlertBanner> : null}
      {formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="GC Active Policies" value={String(summary.active)} icon={Shield} tone="success" />
        <StatCard title="Expiring Soon" value={String(summary.expiring)} tone={summary.expiring ? "warning" : "default"} />
        <StatCard title="Expired" value={String(summary.expired)} tone={summary.expired ? "error" : "default"} />
        <StatCard title="Open Warnings" value={String(warnings.length)} tone={warnings.length ? "warning" : "default"} />
      </div>

      {warnings.length > 0 && !isClient ? (
        <SectionCard title="Insurance Alerts">
          <ul className="space-y-2">
            {warnings.slice(0, 8).map((w) => (
              <li key={w} className="text-sm flex gap-2">
                <span className="badge badge-warning badge-sm mt-0.5">Alert</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {isClient ? (
        <SectionCard title="GC Insurance Compliance">
          <p className="text-sm opacity-80 mb-3">
            High-level status of the general contractor’s coverage on your projects.
          </p>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Coverage</th>
                  <th>Status</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {gcPolicies.map((p) => {
                  const health = policyHealth(p);
                  return (
                    <tr key={p.id}>
                      <td>{labelPolicy(p.policy_type)}</td>
                      <td>
                        <span className={`badge badge-sm ${policyHealthBadge(health)}`}>
                          {labelize(health)}
                        </span>
                      </td>
                      <td>{p.expiration_date ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {gcPolicies.length === 0 ? (
            <p className="text-sm opacity-60 py-4 text-center">No GC insurance status available.</p>
          ) : null}
        </SectionCard>
      ) : (
        <>
          <div role="tablist" className="tabs tabs-boxed bg-base-100 border border-base-300 w-fit">
            <button role="tab" className={`tab ${tab === "gc" ? "tab-active" : ""}`} onClick={() => setTab("gc")}>
              GC Policies
            </button>
            <button
              role="tab"
              className={`tab ${tab === "subs" ? "tab-active" : ""}`}
              onClick={() => setTab("subs")}
            >
              Sub COIs
            </button>
            {canManage ? (
              <button
                role="tab"
                className={`tab ${tab === "requirements" ? "tab-active" : ""}`}
                onClick={() => setTab("requirements")}
              >
                Job Requirements
              </button>
            ) : null}
          </div>

          {showPolicyForm ? (
            <SectionCard title="Add Insurance Policy / COI">
              <form className="space-y-4" onSubmit={onSavePolicy}>
                {!isSub ? (
                  <FormField label="Holder">
                    <select
                      className="select select-bordered"
                      value={policyForm.holder_type}
                      onChange={(e) =>
                        setPolicyForm((f) => ({
                          ...f,
                          holder_type: e.target.value as InsuranceHolderType,
                        }))
                      }
                    >
                      <option value="gc">General Contractor</option>
                      <option value="subcontractor">Subcontractor</option>
                    </select>
                  </FormField>
                ) : null}
                {policyForm.holder_type === "subcontractor" ? (
                  <FormField label="Subcontractor">
                    <select
                      className="select select-bordered"
                      value={policyForm.subcontractor_id}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, subcontractor_id: e.target.value }))}
                      required
                    >
                      <option value="">Select…</option>
                      {(isSub
                        ? subcontractors.filter((s) => s.user_id === user?.id)
                        : subcontractors
                      ).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.company_name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : null}
                <FormField label="Policy type">
                  <select
                    className="select select-bordered"
                    value={policyForm.policy_type}
                    onChange={(e) =>
                      setPolicyForm((f) => ({
                        ...f,
                        policy_type: e.target.value as InsurancePolicyType,
                      }))
                    }
                  >
                    {POLICY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {labelPolicy(t)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Carrier">
                  <input
                    className="input input-bordered"
                    value={policyForm.carrier_name}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, carrier_name: e.target.value }))}
                  />
                </FormField>
                <FormField label="Policy number">
                  <input
                    className="input input-bordered"
                    value={policyForm.policy_number}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, policy_number: e.target.value }))}
                  />
                </FormField>
                <FormField label="Coverage limit">
                  <input
                    type="number"
                    className="input input-bordered"
                    value={policyForm.coverage_limit}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, coverage_limit: e.target.value }))}
                  />
                </FormField>
                <FormField label="Effective date">
                  <input
                    type="date"
                    className="input input-bordered"
                    value={policyForm.effective_date}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, effective_date: e.target.value }))}
                  />
                </FormField>
                <FormField label="Expiration date">
                  <input
                    type="date"
                    className="input input-bordered"
                    value={policyForm.expiration_date}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, expiration_date: e.target.value }))}
                  />
                </FormField>
                <FormField label="Endorsements">
                  <div className="flex flex-wrap gap-4 pt-2">
                    <label className="label cursor-pointer gap-2 justify-start">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={policyForm.additional_insured}
                        onChange={(e) =>
                          setPolicyForm((f) => ({ ...f, additional_insured: e.target.checked }))
                        }
                      />
                      <span className="label-text">Additional insured</span>
                    </label>
                    <label className="label cursor-pointer gap-2 justify-start">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={policyForm.waiver_of_subrogation}
                        onChange={(e) =>
                          setPolicyForm((f) => ({ ...f, waiver_of_subrogation: e.target.checked }))
                        }
                      />
                      <span className="label-text">Waiver of subrogation</span>
                    </label>
                  </div>
                </FormField>
                <FormField label="Notes">
                  <textarea
                    className="textarea textarea-bordered w-full"
                    rows={2}
                    value={policyForm.notes}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </FormField>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowPolicyForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                    Save
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          {tab !== "requirements" ? (
            <FilterSortBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search carrier, policy #, type…"
              sortOptions={[
                { value: "expiration", label: "Expiration" },
                { value: "type", label: "Policy type" },
                { value: "carrier", label: "Carrier" },
                { value: "limit", label: "Coverage limit" },
                { value: "status", label: "Status" },
              ]}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortKeyChange={(v) => setSortKey(v as SortKey)}
              onSortDirChange={setSortDir}
              resultCount={tab === "gc" ? filteredGc.length : filteredSubs.length}
              filters={
                <label className="form-control w-full lg:w-40">
                  <span className="label py-1">
                    <span className="label-text text-xs opacity-70">Status</span>
                  </span>
                  <select
                    className="select select-bordered select-sm"
                    value={healthFilter}
                    onChange={(e) => setHealthFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="expiring">Expiring</option>
                    <option value="expired">Expired</option>
                  </select>
                </label>
              }
            />
          ) : null}

          {tab === "gc" ? (
            filteredGc.length === 0 ? (
              <EmptyState
                title="No GC policies yet"
                message="Add your general liability, workers’ comp, auto, and umbrella policies."
              />
            ) : (
              <SectionCard title={`GC Policies (${filteredGc.length})`}>
                <PolicyTable rows={filteredGc} />
              </SectionCard>
            )
          ) : null}

          {tab === "subs" ? (
            filteredSubs.length === 0 ? (
              <EmptyState
                title="No subcontractor COIs yet"
                message="Collect certificates of insurance from active trades."
              />
            ) : (
              <SectionCard title={`Subcontractor COIs (${filteredSubs.length})`}>
                <PolicyTable rows={filteredSubs} showCompany />
              </SectionCard>
            )
          ) : null}

          {tab === "requirements" && canManage ? (
            <>
              <div className="flex justify-end">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowReqForm((v) => !v)}>
                  <Plus className="h-4 w-4" /> Add Requirement
                </button>
              </div>
              {showReqForm ? (
                <SectionCard title="Add Job Insurance Requirement">
                  <form className="space-y-4" onSubmit={onSaveReq}>
                    <FormField label="Contract">
                      <select
                        className="select select-bordered"
                        value={reqForm.contract_id}
                        onChange={(e) => setReqForm((f) => ({ ...f, contract_id: e.target.value }))}
                        required
                      >
                        <option value="">Select…</option>
                        {contracts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.contract_name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Policy type">
                      <select
                        className="select select-bordered"
                        value={reqForm.policy_type}
                        onChange={(e) =>
                          setReqForm((f) => ({
                            ...f,
                            policy_type: e.target.value as InsurancePolicyType,
                          }))
                        }
                      >
                        {POLICY_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {labelPolicy(t)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Minimum limit">
                      <input
                        type="number"
                        className="input input-bordered"
                        value={reqForm.minimum_limit}
                        onChange={(e) => setReqForm((f) => ({ ...f, minimum_limit: e.target.value }))}
                      />
                    </FormField>
                    <FormField label="Applies to">
                      <select
                        className="select select-bordered"
                        value={reqForm.applies_to}
                        onChange={(e) =>
                          setReqForm((f) => ({
                            ...f,
                            applies_to: e.target.value as InsuranceAppliesTo,
                          }))
                        }
                      >
                        <option value="both">GC and subcontractors</option>
                        <option value="gc">GC only</option>
                        <option value="subcontractor">Subcontractors only</option>
                      </select>
                    </FormField>
                    <FormField label="Flags">
                      <div className="flex flex-wrap gap-4 pt-2">
                        <label className="label cursor-pointer gap-2 justify-start">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={reqForm.requires_additional_insured}
                            onChange={(e) =>
                              setReqForm((f) => ({
                                ...f,
                                requires_additional_insured: e.target.checked,
                              }))
                            }
                          />
                          <span className="label-text">Requires additional insured</span>
                        </label>
                        <label className="label cursor-pointer gap-2 justify-start">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={reqForm.requires_waiver}
                            onChange={(e) =>
                              setReqForm((f) => ({ ...f, requires_waiver: e.target.checked }))
                            }
                          />
                          <span className="label-text">Requires waiver of subrogation</span>
                        </label>
                      </div>
                    </FormField>
                    <FormField label="Notes">
                      <textarea
                        className="textarea textarea-bordered w-full"
                        rows={2}
                        value={reqForm.notes}
                        onChange={(e) => setReqForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </FormField>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowReqForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        Save requirement
                      </button>
                    </div>
                  </form>
                </SectionCard>
              ) : null}

              {requirements.length === 0 ? (
                <EmptyState
                  title="No job requirements yet"
                  message="Define minimum coverages for each contract."
                />
              ) : (
                <SectionCard title={`Job Requirements (${requirements.length})`}>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Contract</th>
                          <th>Coverage</th>
                          <th>Applies to</th>
                          <th className="text-right">Min limit</th>
                          <th>Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirements.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <Link className="link link-hover" href={`/contracts/${r.contract_id}`}>
                                {r.contracts?.contract_name ?? "—"}
                              </Link>
                            </td>
                            <td>{labelPolicy(r.policy_type)}</td>
                            <td>{labelize(r.applies_to)}</td>
                            <td className="text-right">{money(r.minimum_limit)}</td>
                            <td className="space-x-1">
                              {r.requires_additional_insured ? (
                                <span className="badge badge-sm badge-info">Addl insured</span>
                              ) : null}
                              {r.requires_waiver ? (
                                <span className="badge badge-sm badge-secondary">Waiver</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function PolicyTable({
  rows,
  showCompany = false,
}: {
  rows: import("@/lib/types").InsurancePolicy[];
  showCompany?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            {showCompany ? <th>Company</th> : null}
            <th>Type</th>
            <th>Carrier</th>
            <th>Policy #</th>
            <th className="text-right">Limit</th>
            <th>Expires</th>
            <th>Status</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const health = policyHealth(p);
            return (
              <tr key={p.id}>
                {showCompany ? <td>{p.subcontractors?.company_name ?? "—"}</td> : null}
                <td>{labelPolicy(p.policy_type)}</td>
                <td>{p.carrier_name ?? "—"}</td>
                <td>{p.policy_number ?? "—"}</td>
                <td className="text-right">{money(p.coverage_limit)}</td>
                <td className="whitespace-nowrap">{p.expiration_date ?? "—"}</td>
                <td>
                  <span className={`badge badge-sm ${policyHealthBadge(health)}`}>
                    {labelize(health)}
                  </span>
                </td>
                <td className="space-x-1">
                  {p.additional_insured ? <span className="badge badge-ghost badge-sm">AI</span> : null}
                  {p.waiver_of_subrogation ? (
                    <span className="badge badge-ghost badge-sm">Waiver</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
