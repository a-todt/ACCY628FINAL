"use client";

import { Fragment, Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, Paperclip, Pencil, Trash2 } from "lucide-react";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { AttachmentPanel } from "@/components/AttachmentPanel";
import { ContractEditForm } from "@/components/ContractEditForm";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageSkeleton } from "@/components/PageSkeleton";
import { WeatherBadge } from "@/components/WeatherBadge";
import { writeAuditLog } from "@/lib/audit";
import {
  labelPolicy,
  policyHealth,
  policyHealthBadge,
} from "@/lib/insurance";
import { computeContractMetrics, labelize, money, percent } from "@/lib/metrics";
import {
  canCancelOrDeleteContracts,
  canManageContracts,
  canViewContractFinancials,
  canViewCosts,
  statusBadgeClass,
} from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { ContractInsuranceRequirement, ContractStatus, InsurancePolicy } from "@/lib/types";

const STATUS_OPTIONS: ContractStatus[] = ["active", "on_hold", "completed", "canceled"];

export default function ContractDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ContractDetailContent />
    </Suspense>
  );
}

function ContractDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const contractId = params.id;
  const { effectiveRole } = useAuth();
  const {
    contracts,
    changeOrders,
    subcontractors,
    costEntries,
    invoices,
    payments,
    fieldLogs,
    milestones,
    userProfiles,
    loading,
    error,
    refresh,
  } = useContractData();
  const {
    policies: insurancePolicies,
    requirements: insuranceRequirements,
    loading: insuranceLoading,
  } = useInsuranceData();
  const canMutate = canCancelOrDeleteContracts(effectiveRole);
  const canEdit = canManageContracts(effectiveRole);
  const wantsEdit = searchParams.get("edit") === "1";
  const isEditing = canEdit && wantsEdit;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const enterEditMode = () => {
    if (!canEdit) return;
    router.replace(`/contracts/${contractId}?edit=1`);
  };

  const exitEditMode = () => {
    router.replace(`/contracts/${contractId}`);
  };

  if (loading || insuranceLoading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return <AlertBanner type="error">{error}</AlertBanner>;
  }

  const contract = contracts.find((c) => c.id === contractId);

  if (!contract) {
    const isFieldSupervisor = effectiveRole === "field_supervisor";
    return (
      <EmptyState
        title={isFieldSupervisor ? "Detail access restricted" : "Contract not found"}
        message={
          isFieldSupervisor
            ? "You can view full details only for contracts you supervise. Use All Contracts for summaries of every project."
            : "This contract doesn't exist or you don't have access to it."
        }
        action={
          <Link href="/contracts" className="btn btn-primary btn-sm mt-2">
            Back to Contracts
          </Link>
        }
      />
    );
  }

  const showCosts = canViewCosts(effectiveRole);
  const showFinancials = canViewContractFinancials(effectiveRole);
  const isClient = effectiveRole === "client";
  const metrics = computeContractMetrics(contract, changeOrders, invoices, costEntries, milestones, payments);

  const contractChangeOrders = changeOrders
    .filter((co) => co.contract_id === contract.id)
    .filter((co) => (isClient ? co.status === "approved" : true));
  const contractSubs = isClient ? [] : subcontractors.filter((s) => s.contract_id === contract.id);
  const contractCosts = costEntries.filter((c) => c.contract_id === contract.id);
  const contractInvoices = invoices.filter((i) => i.contract_id === contract.id);
  const contractFieldLogs = isClient ? [] : fieldLogs.filter((f) => f.contract_id === contract.id);
  const contractMilestones = milestones.filter((m) => m.contract_id === contract.id);

  const milestonesSection = (
    <SectionCard title={`Milestones (${contractMilestones.length})`}>
      {contractMilestones.length === 0 ? (
        <p className="text-sm opacity-60 py-4 text-center">No milestones defined yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Milestone</th>
                <th className="text-right">Value</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contractMilestones.map((milestone) => (
                <tr key={milestone.id}>
                  <td>{milestone.milestone_name ?? "—"}</td>
                  <td className="text-right">{money(milestone.milestone_value)}</td>
                  <td className="whitespace-nowrap">{milestone.due_date ?? "—"}</td>
                  <td>
                    <span className={`badge badge-sm ${statusBadgeClass(milestone.status)}`}>
                      {labelize(milestone.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  const contractRequirements = insuranceRequirements.filter((r) => r.contract_id === contract.id);
  const contractSubIds = new Set(contractSubs.map((s) => s.id));
  const contractPolicies = insurancePolicies.filter((p) => {
    if (p.holder_type === "gc") return true;
    return (
      p.holder_type === "subcontractor" &&
      p.subcontractor_id != null &&
      contractSubIds.has(p.subcontractor_id)
    );
  });

  const cancelContract = async () => {
    if (contract.status === "canceled") return;
    if (
      !window.confirm(
        `Cancel contract "${contract.contract_name}"? It will remain available as canceled.`
      )
    ) {
      return;
    }
    await setContractStatus("canceled");
  };

  const setContractStatus = async (status: ContractStatus) => {
    if (contract.status === status) return;
    setActionError(null);
    setActionSuccess(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("contracts")
        .update({ status })
        .eq("id", contract.id);
      if (updateError) throw updateError;
      await writeAuditLog(
        status === "canceled" ? "contract_canceled" : "contract_status_changed",
        "contract",
        contract.id,
        {
          contract_name: contract.contract_name,
          from_status: contract.status,
          to_status: status,
        }
      );
      setActionSuccess(
        status === "canceled" ? "Contract canceled." : `Status updated to ${labelize(status)}.`
      );
      setLogRefreshKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusy(false);
    }
  };

  const deleteContract = async () => {
    if (
      !window.confirm(
        `Permanently delete "${contract.contract_name}"? Related records will also be removed.`
      )
    ) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusy(true);
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
      router.replace("/contracts");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete contract.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Contracts", href: "/contracts" },
          { label: contract.contract_name },
        ]}
      />
      <PageHeader
        title={contract.contract_name}
        subtitle={contract.client_name ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {canMutate ? (
              <>
                <div className="dropdown dropdown-end">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
                    Change Status
                    <ChevronDown className="h-4 w-4" />
                  </div>
                  <ul
                    tabIndex={0}
                    className="dropdown-content menu bg-base-100 rounded-box z-40 w-48 p-2 shadow border border-base-300"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <li key={status}>
                        <button
                          type="button"
                          disabled={busy || contract.status === status}
                          onClick={() => {
                            if (status === "canceled") void cancelContract();
                            else void setContractStatus(status);
                          }}
                        >
                          {labelize(status)}
                          {contract.status === status ? " ✓" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="dropdown dropdown-end">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
                    Edit
                    <ChevronDown className="h-4 w-4" />
                  </div>
                  <ul
                    tabIndex={0}
                    className="dropdown-content menu bg-base-100 rounded-box z-40 w-52 p-2 shadow border border-base-300"
                  >
                    {canEdit ? (
                      <li>
                        {isEditing ? (
                          <button type="button" onClick={exitEditMode}>
                            <Pencil className="h-4 w-4" /> Exit Edit Mode
                          </button>
                        ) : (
                          <button type="button" onClick={enterEditMode}>
                            <Pencil className="h-4 w-4" /> Edit Contract
                          </button>
                        )}
                      </li>
                    ) : null}
                    <li>
                      <button
                        type="button"
                        className="text-error"
                        disabled={busy}
                        onClick={() => void deleteContract()}
                      >
                        <Trash2 className="h-4 w-4" /> Delete Contract
                      </button>
                    </li>
                  </ul>
                </div>
              </>
            ) : null}
            <Link href="/contracts" className="btn btn-ghost btn-sm">
              <ArrowLeft className="h-4 w-4" /> Back to Contracts
            </Link>
          </div>
        }
      />

      {actionError ? <AlertBanner type="error">{actionError}</AlertBanner> : null}
      {actionSuccess ? <AlertBanner type="success">{actionSuccess}</AlertBanner> : null}

      <SectionCard
        title="Overview"
        actions={<span className={`badge ${statusBadgeClass(contract.status)}`}>{labelize(contract.status)}</span>}
      >
        {isEditing ? (
          <ContractEditForm
            contract={contract}
            showFinancials={showFinancials}
            onSaved={async () => {
              setLogRefreshKey((k) => k + 1);
              await refresh();
            }}
            onError={(message) => {
              setActionError(message);
              setActionSuccess(null);
            }}
            onSuccess={(message) => {
              setActionSuccess(message);
              setActionError(null);
            }}
          />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <InfoField label="Client" value={contract.client_name} />
              <InfoField label="Client Email" value={contract.client_email} />
              <InfoField label="Client Phone" value={contract.client_phone} />
              <InfoField
                label="Project Location"
                value={[contract.project_address, contract.city, contract.state].filter(Boolean).join(", ")}
              />
              <InfoField label="Contract Type" value={labelize(contract.contract_type)} />
              {showFinancials ? (
                <InfoField label="Original Value" value={money(contract.original_value)} />
              ) : null}
              {showFinancials ? (
                <InfoField
                  label="Retainage %"
                  value={contract.retainage_percent != null ? `${contract.retainage_percent}%` : null}
                />
              ) : null}
              <InfoField label="Start Date" value={contract.start_date} />
              <InfoField label="End Date" value={contract.end_date} />
              <InfoField label="Created" value={new Date(contract.created_at).toLocaleDateString()} />
            </div>
            {contract.scope_description ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Scope Description</p>
                <p className="text-sm whitespace-pre-wrap">{contract.scope_description}</p>
              </div>
            ) : null}
            {!isClient && contract.special_terms ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide opacity-60 mb-1">Special Terms / Internal Notes</p>
                <p className="text-sm whitespace-pre-wrap">{contract.special_terms}</p>
              </div>
            ) : null}
          </>
        )}

        {!isClient ? (
          <div className="mt-6 border-t border-base-300 pt-4">
            <p className="text-xs uppercase tracking-wide opacity-60 mb-3">Insurance Policies</p>
            <ContractInsuranceOverview
              policies={contractPolicies}
              requirements={contractRequirements}
              showRequiredRate
            />
          </div>
        ) : null}
      </SectionCard>

      {isClient ? milestonesSection : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {showFinancials ? (
          <>
            <StatCard title="Revised Value" value={money(metrics.revisedValue)} hint={`${money(metrics.approvedChangeOrders)} approved COs`} />
            <StatCard title="Total Billed" value={money(metrics.totalBilled)} />
            <StatCard title="Total Collected" value={money(metrics.totalCollected)} tone="success" />
            <StatCard title="Outstanding" value={money(metrics.outstanding)} tone={metrics.outstanding > 0 ? "warning" : "default"} />
            <StatCard title="Retainage Held" value={money(metrics.retainageHeld)} />
          </>
        ) : null}
        <StatCard title="Completion" value={percent(metrics.completionPercent)} />
        {showCosts ? (
          <>
            <StatCard title="Total Costs" value={money(metrics.totalCosts)} />
            <StatCard
              title="Gross Profit"
              value={money(metrics.grossProfit)}
              hint={percent(metrics.grossMargin)}
              tone={metrics.grossProfit >= 0 ? "success" : "error"}
            />
          </>
        ) : null}
      </div>

      <SectionCard title={`Change Orders (${contractChangeOrders.length})`}>
        {contractChangeOrders.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No change orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>CO #</th>
                  <th>Description</th>
                  <th>Reason</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {contractChangeOrders.map((co) => (
                  <tr key={co.id}>
                    <td>{co.change_order_number ?? "—"}</td>
                    <td className="max-w-xs truncate">{co.description ?? "—"}</td>
                    <td className="max-w-xs truncate">{co.reason ?? "—"}</td>
                    <td className="text-right">{money(co.amount)}</td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(co.status)}`}>{labelize(co.status)}</span>
                    </td>
                    <td className="whitespace-nowrap">{co.date_submitted ?? "—"}</td>
                    <td className="whitespace-nowrap">{co.date_resolved ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {!isClient ? (
        <SectionCard title={`Subcontractors (${contractSubs.length})`}>
          {contractSubs.length === 0 ? (
            <p className="text-sm opacity-60 py-4 text-center">No subcontractors assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Trade</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contractSubs.map((sub) => {
                    const overpaid = Number(sub.amount_paid ?? 0) > Number(sub.subcontract_value ?? 0);
                    return (
                      <tr key={sub.id}>
                        <td>{sub.company_name}</td>
                        <td>{sub.trade ?? "—"}</td>
                        <td className="text-right">{money(sub.subcontract_value)}</td>
                        <td className="text-right">{money(sub.amount_paid)}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <span className={`badge badge-sm ${statusBadgeClass(sub.status)}`}>{labelize(sub.status)}</span>
                            {overpaid ? <span className="badge badge-sm badge-error">Overpaid</span> : null}
                          </div>
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

      {showCosts ? (
        <SectionCard title={`Cost Entries (${contractCosts.length})`}>
          {contractCosts.length === 0 ? (
            <p className="text-sm opacity-60 py-4 text-center">No costs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Submitted By</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {contractCosts.map((cost) => (
                    <tr key={cost.id}>
                      <td className="whitespace-nowrap">{cost.date_incurred ?? "—"}</td>
                      <td>{labelize(cost.category)}</td>
                      <td className="max-w-xs truncate">{cost.description ?? "—"}</td>
                      <td>
                        {userProfiles.find((p) => p.id === cost.user_id)?.full_name ??
                          userProfiles.find((p) => p.id === cost.user_id)?.email ??
                          "—"}
                      </td>
                      <td className="text-right">{money(cost.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title={`Invoices (${contractInvoices.length})`}>
        {contractInvoices.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No invoices issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contractInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover">
                    <td>
                      <Link href={`/invoices/${invoice.id}`} className="link link-primary font-medium">
                        {invoice.invoice_number ?? "View invoice"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{invoice.invoice_date ?? "—"}</td>
                    <td className="whitespace-nowrap">{invoice.due_date ?? "—"}</td>
                    <td className="text-right">{money(invoice.invoice_amount)}</td>
                    <td className="text-right">{money(invoice.amount_paid)}</td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(invoice.status)}`}>
                        {labelize(invoice.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {!isClient ? (
        <SectionCard title={`Field Logs (${contractFieldLogs.length})`}>
          {contractFieldLogs.length === 0 ? (
            <p className="text-sm opacity-60 py-4 text-center">No field logs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Submitted By</th>
                    <th>Work Performed</th>
                    <th>Weather</th>
                    <th className="text-right">Hours</th>
                    <th className="text-right">Workers</th>
                  </tr>
                </thead>
                <tbody>
                  {contractFieldLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap">{log.log_date ?? "—"}</td>
                      <td>
                        {userProfiles.find((p) => p.id === log.user_id)?.full_name ??
                          userProfiles.find((p) => p.id === log.user_id)?.email ??
                          "—"}
                      </td>
                      <td className="max-w-xs truncate">{log.work_performed ?? "—"}</td>
                      <td>
                        <WeatherBadge weather={log.weather_conditions} />
                      </td>
                      <td className="text-right">{log.hours_worked ?? "—"}</td>
                      <td className="text-right">{log.workers_on_site ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {!isClient ? milestonesSection : null}

      {canMutate ? (
        <ActivityLogPanel
          title="Contract Change Log"
          entityTypes={["contract"]}
          enabled
          refreshKey={logRefreshKey}
        />
      ) : null}
    </div>
  );
}

function ContractInsuranceOverview({
  policies,
  requirements,
  showRequiredRate,
}: {
  policies: InsurancePolicy[];
  requirements: ContractInsuranceRequirement[];
  showRequiredRate: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (policies.length === 0 && requirements.length === 0) {
    return <p className="text-sm opacity-60">No insurance policies on file for this contract.</p>;
  }

  const requiredRateByType = new Map<string, number | null>(
    requirements.map((req) => [`${req.policy_type}:${req.applies_to}`, req.minimum_limit])
  );
  const colSpan = showRequiredRate ? 8 : 7;

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Policy</th>
            <th>Holder</th>
            <th>Carrier</th>
            <th className="text-right">Rate</th>
            {showRequiredRate ? <th className="text-right">Required</th> : null}
            <th>Expires</th>
            <th>Status</th>
            <th className="text-right">Files</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((policy) => {
            const health = policyHealth(policy);
            const holderLabel =
              policy.holder_type === "gc"
                ? "GC"
                : policy.subcontractors?.company_name ?? "Subcontractor";
            const appliesKey =
              policy.holder_type === "gc"
                ? [`${policy.policy_type}:gc`, `${policy.policy_type}:both`]
                : [`${policy.policy_type}:subcontractor`, `${policy.policy_type}:both`];
            const required =
              appliesKey.map((key) => requiredRateByType.get(key)).find((value) => value != null) ?? null;
            const expanded = expandedId === policy.id;

            return (
              <Fragment key={policy.id}>
                <tr>
                  <td>
                    <div className="font-medium">{labelPolicy(policy.policy_type)}</div>
                    <div className="text-xs opacity-60">{policy.policy_number || "No policy #"}</div>
                  </td>
                  <td>{holderLabel}</td>
                  <td>{policy.carrier_name ?? "—"}</td>
                  <td className="text-right">{money(policy.coverage_limit)}</td>
                  {showRequiredRate ? (
                    <td className="text-right">{required != null ? money(required) : "—"}</td>
                  ) : null}
                  <td className="whitespace-nowrap">{policy.expiration_date ?? "—"}</td>
                  <td>
                    <span className={`badge badge-sm ${policyHealthBadge(health)}`}>{labelize(health)}</span>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className={`btn btn-ghost btn-xs ${expanded ? "btn-active" : ""}`}
                      title="Attachments"
                      onClick={() => setExpandedId(expanded ? null : policy.id)}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
                {expanded ? (
                  <tr>
                    <td colSpan={colSpan} className="bg-base-200/40">
                      <div className="p-3 max-w-2xl">
                        <AttachmentPanel entityType="insurance_policy" entityId={policy.id} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
          {requirements
            .filter((req) => {
              const hasMatchingPolicy = policies.some((policy) => {
                if (policy.policy_type !== req.policy_type) return false;
                if (req.applies_to === "both") return true;
                if (req.applies_to === "gc") return policy.holder_type === "gc";
                return policy.holder_type === "subcontractor";
              });
              return !hasMatchingPolicy;
            })
            .map((req) => (
              <tr key={req.id} className="opacity-80">
                <td>
                  <div className="font-medium">{labelPolicy(req.policy_type)}</div>
                  <div className="text-xs opacity-60">Required · no policy on file</div>
                </td>
                <td>{labelize(req.applies_to)}</td>
                <td>—</td>
                <td className="text-right">—</td>
                {showRequiredRate ? (
                  <td className="text-right">{req.minimum_limit != null ? money(req.minimum_limit) : "—"}</td>
                ) : null}
                <td>—</td>
                <td>
                  <span className="badge badge-sm badge-warning">Missing</span>
                </td>
                <td />
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
