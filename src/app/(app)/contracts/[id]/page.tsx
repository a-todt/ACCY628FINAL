"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { WeatherBadge } from "@/components/WeatherBadge";
import { computeContractMetrics, labelize, money, percent } from "@/lib/metrics";
import { canViewContractFinancials, canViewCosts, statusBadgeClass } from "@/lib/roles";
import { isBadWeather } from "@/lib/weather";

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
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
  } = useContractData();

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.contract_name}
        subtitle={contract.client_name ?? undefined}
        actions={
          <Link href="/contracts" className="btn btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" /> Back to Contracts
          </Link>
        }
      />

      <SectionCard
        title="Overview"
        actions={<span className={`badge ${statusBadgeClass(contract.status)}`}>{labelize(contract.status)}</span>}
      >
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
      </SectionCard>

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
                    <tr
                      key={log.id}
                      className={isBadWeather(log.weather_conditions) ? "bg-error/10" : undefined}
                    >
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
