"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Banknote,
  Bell,
  Building2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Gavel,
  Plus,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { ScrollableBarChart, toNamedBarRows } from "@/components/ScrollableBarChart";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { buildAlertsForRole, type AlertItem } from "@/lib/alerts";
import { computeContractMetrics, daysPastDue, labelize, money, percent } from "@/lib/metrics";
import { statusBadgeClass } from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import { resolveSubcontractorScopeUserId } from "@/lib/subScope";
import { createClient } from "@/lib/supabase/client";
import type {
  BidPackage,
  ChangeOrder,
  Contract,
  CostEntry,
  FieldLog,
  Invoice,
  Milestone,
  Payment,
  Subcontractor,
} from "@/lib/types";
import type { ContractInsuranceRequirement, InsurancePolicy } from "@/lib/types";

const CHART_COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

interface DashboardData {
  contracts: Contract[];
  changeOrders: ChangeOrder[];
  subcontractors: Subcontractor[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  fieldLogs: FieldLog[];
  milestones: Milestone[];
  insurancePolicies?: InsurancePolicy[];
  insuranceRequirements?: ContractInsuranceRequirement[];
}

export default function DashboardPage() {
  const { effectiveRole, profile, user } = useAuth();
  const data = useContractData();
  const insurance = useInsuranceData();

  const subScopeUserId = useMemo(
    () =>
      resolveSubcontractorScopeUserId(
        effectiveRole,
        profile?.role,
        user?.id,
        data.userProfiles
      ),
    [effectiveRole, profile?.role, user?.id, data.userProfiles]
  );

  if (data.loading || insurance.loading) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (data.error) {
    return <AlertBanner type="error">{data.error}</AlertBanner>;
  }

  const shared: DashboardData = {
    contracts: data.contracts,
    changeOrders: data.changeOrders,
    subcontractors: data.subcontractors,
    costEntries: data.costEntries,
    invoices: data.invoices,
    payments: data.payments,
    fieldLogs: data.fieldLogs,
    milestones: data.milestones,
    insurancePolicies: insurance.policies,
    insuranceRequirements: insurance.requirements,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}`}
      />

      <DashboardAlertsPreview
        role={effectiveRole}
        invoices={data.invoices}
        fieldLogs={data.fieldLogs}
        changeOrders={data.changeOrders}
        insurancePolicies={insurance.policies}
        insuranceRequirements={insurance.requirements}
        subcontractors={data.subcontractors}
      />

      {effectiveRole === "admin" ||
      effectiveRole === "owner" ||
      effectiveRole === "project_manager" ? (
        <AdminDashboard {...shared} />
      ) : effectiveRole === "field_supervisor" ? (
        <FieldSupervisorDashboard {...shared} userId={user?.id} />
      ) : effectiveRole === "subcontractor" ? (
        <SubcontractorDashboard {...shared} userId={subScopeUserId ?? user?.id} />
      ) : (
        <ClientDashboard {...shared} />
      )}
    </div>
  );
}

const DASHBOARD_ALERT_PREVIEW_LIMIT = 5;

function DashboardAlertsPreview({
  role,
  invoices,
  fieldLogs,
  changeOrders,
  insurancePolicies,
  insuranceRequirements,
  subcontractors,
}: {
  role: UserRole;
  invoices: Invoice[];
  fieldLogs: FieldLog[];
  changeOrders: ChangeOrder[];
  insurancePolicies: InsurancePolicy[];
  insuranceRequirements: ContractInsuranceRequirement[];
  subcontractors: Subcontractor[];
}) {
  const alerts = useMemo(
    () =>
      buildAlertsForRole(role, {
        invoices,
        fieldLogs,
        changeOrders,
        insurancePolicies,
        insuranceRequirements,
        subcontractors,
      }),
    [
      role,
      invoices,
      fieldLogs,
      changeOrders,
      insurancePolicies,
      insuranceRequirements,
      subcontractors,
    ]
  );

  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, DASHBOARD_ALERT_PREVIEW_LIMIT);
  const remaining = alerts.length - preview.length;

  return (
    <SectionCard
      title="Needs attention"
      actions={
        <Link href="/alerts" className="btn btn-ghost btn-xs gap-1">
          <Bell className="h-3.5 w-3.5" />
          View all ({alerts.length})
        </Link>
      }
    >
      <ul className="divide-y divide-base-300">
        {preview.map((alert) => (
          <AlertPreviewRow key={alert.id} alert={alert} />
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="text-xs opacity-60 mt-2">
          +{remaining} more in{" "}
          <Link href="/alerts" className="link link-primary">
            Alerts
          </Link>
        </p>
      ) : null}
    </SectionCard>
  );
}

function AlertPreviewRow({ alert }: { alert: AlertItem }) {
  const badgeLabel =
    alert.category === "invoice" && alert.severity === "critical"
      ? "Overdue"
      : labelize(alert.severity);

  return (
    <li>
      <Link
        href={alert.href}
        className="flex items-start gap-3 py-2.5 hover:bg-base-200/60 px-1 rounded-lg transition-colors"
      >
        <span
          className={`badge badge-sm mt-0.5 ${
            alert.severity === "critical"
              ? "badge-error"
              : alert.severity === "warning"
                ? "badge-warning"
                : "badge-info"
          }`}
        >
          {badgeLabel}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight text-sm">{alert.title}</p>
          <p className="text-xs opacity-70 mt-0.5 line-clamp-1">{alert.detail}</p>
        </div>
        <ChevronRight className="h-4 w-4 opacity-40 shrink-0 mt-0.5" />
      </Link>
    </li>
  );
}

function AdminDashboard({
  contracts,
  changeOrders,
  costEntries,
  invoices,
  payments,
  milestones,
}: DashboardData) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        title="No contracts yet"
        message="Add your first contract to start seeing dashboard metrics."
        action={
          <Link href="/contracts/new" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> Add Contract
          </Link>
        }
      />
    );
  }

  const perContract = contracts.map((contract) => ({
    contract,
    metrics: computeContractMetrics(contract, changeOrders, invoices, costEntries, milestones, payments),
  }));

  const totals = perContract.reduce(
    (acc, { metrics }) => {
      acc.revisedValue += metrics.revisedValue;
      acc.totalBilled += metrics.totalBilled;
      acc.totalCollected += metrics.totalCollected;
      acc.outstanding += metrics.outstanding;
      acc.totalCosts += metrics.totalCosts;
      acc.grossProfit += metrics.grossProfit;
      return acc;
    },
    { revisedValue: 0, totalBilled: 0, totalCollected: 0, outstanding: 0, totalCosts: 0, grossProfit: 0 }
  );

  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const pendingCOs = changeOrders.filter((c) => c.status === "pending").length;
  const overdueInvoices = invoices.filter(
    (i) => (i.status === "unpaid" || i.status === "partially_paid") && daysPastDue(i.due_date) > 0
  );

  const contractValueData = toNamedBarRows(
    perContract.map(({ contract, metrics }) => ({
      fullName: contract.contract_name,
      values: { Value: Math.round(metrics.revisedValue) },
    }))
  );

  const billedVsCollectedData = toNamedBarRows(
    perContract.map(({ contract, metrics }) => ({
      fullName: contract.contract_name,
      values: {
        Billed: Math.round(metrics.totalBilled),
        Collected: Math.round(metrics.totalCollected),
      },
    }))
  );

  const costsByCategory = costEntries.reduce<Record<string, number>>((acc, cost) => {
    const key = cost.category ?? "other";
    acc[key] = (acc[key] ?? 0) + Number(cost.amount ?? 0);
    return acc;
  }, {});
  const costsByCategoryData = Object.entries(costsByCategory).map(([category, value]) => ({
    name: labelize(category),
    value: Math.round(value),
  }));

  const changeOrderValueData = toNamedBarRows(
    perContract.map(({ contract, metrics }) => ({
      fullName: contract.contract_name,
      values: { Approved: Math.round(metrics.approvedChangeOrders) },
    }))
  );

  const grossProfitData = toNamedBarRows(
    perContract.map(({ contract, metrics }) => ({
      fullName: contract.contract_name,
      values: { "Gross Profit": Math.round(metrics.grossProfit) },
    }))
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Active Contracts" value={String(activeContracts)} hint={`${contracts.length} total`} icon={Building2} />
        <StatCard title="Revised Contract Value" value={money(totals.revisedValue)} icon={CircleDollarSign} />
        <StatCard title="Total Billed" value={money(totals.totalBilled)} icon={FileText} />
        <StatCard title="Total Collected" value={money(totals.totalCollected)} icon={Banknote} tone="success" />
        <StatCard title="Outstanding AR" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? "warning" : "default"} />
        <StatCard
          title="Overdue Invoices"
          value={String(overdueInvoices.length)}
          hint={overdueInvoices.length > 0 ? "Past due · see Needs attention" : undefined}
          icon={FileText}
          tone={overdueInvoices.length > 0 ? "error" : "default"}
        />
        <StatCard title="Total Job Costs" value={money(totals.totalCosts)} icon={Wrench} />
        <StatCard
          title="Gross Profit"
          value={money(totals.grossProfit)}
          hint={totals.totalBilled > 0 ? percent(totals.grossProfit / totals.totalBilled) : undefined}
          icon={TrendingUp}
          tone={totals.grossProfit >= 0 ? "success" : "error"}
        />
        <StatCard title="Pending Change Orders" value={String(pendingCOs)} icon={ClipboardList} tone={pendingCOs > 0 ? "warning" : "default"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Contract Value by Project">
          <ScrollableBarChart data={contractValueData}>
            <Bar dataKey="Value" fill={CHART_COLORS[0]} radius={[0, 5, 5, 0]} />
          </ScrollableBarChart>
        </SectionCard>

        <SectionCard title="Billed vs. Collected">
          <ScrollableBarChart data={billedVsCollectedData}>
            <Legend verticalAlign="top" height={32} />
            <Bar dataKey="Billed" fill={CHART_COLORS[1]} radius={[0, 5, 5, 0]} />
            <Bar dataKey="Collected" fill={CHART_COLORS[3]} radius={[0, 5, 5, 0]} />
          </ScrollableBarChart>
        </SectionCard>

        <SectionCard title="Costs by Category">
          {costsByCategoryData.length === 0 ? (
            <p className="text-sm opacity-60 py-10 text-center">No cost entries recorded yet.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costsByCategoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent: p }) => `${name} ${((p ?? 0) * 100).toFixed(0)}%`}
                  >
                    {costsByCategoryData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Approved Change Order Value by Project">
          <ScrollableBarChart data={changeOrderValueData}>
            <Bar dataKey="Approved" fill={CHART_COLORS[2]} radius={[0, 5, 5, 0]} />
          </ScrollableBarChart>
        </SectionCard>

        <SectionCard title="Gross Profit by Project">
          <ScrollableBarChart data={grossProfitData}>
            <Bar dataKey="Gross Profit" radius={[0, 5, 5, 0]}>
              {grossProfitData.map((entry) => (
                <Cell
                  key={entry.fullName}
                  fill={entry["Gross Profit"] >= 0 ? CHART_COLORS[3] : CHART_COLORS[4]}
                />
              ))}
            </Bar>
          </ScrollableBarChart>
        </SectionCard>
      </div>
    </div>
  );
}

function FieldSupervisorDashboard({ contracts, fieldLogs, costEntries, userId }: DashboardData & { userId?: string }) {
  const myFieldLogs = fieldLogs.filter((f) => f.user_id === userId).slice(0, 6);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const myCostsThisWeek = costEntries.filter(
    (c) => c.user_id === userId && c.date_incurred && new Date(c.date_incurred) >= weekAgo
  );
  const costsThisWeekTotal = myCostsThisWeek.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="Assigned Projects" value={String(contracts.length)} icon={Building2} />
        <StatCard title="Field Logs Submitted" value={String(fieldLogs.filter((f) => f.user_id === userId).length)} icon={ClipboardList} />
        <StatCard title="Costs Entered This Week" value={money(costsThisWeekTotal)} hint={`${myCostsThisWeek.length} entries`} icon={Wrench} />
      </div>

      <SectionCard
        title="Assigned Projects"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Field Log
          </Link>
        }
      >
        {contracts.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">No projects assigned yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {contracts.map((contract) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-4 gap-1">
                  <p className="font-medium truncate">{contract.contract_name}</p>
                  <p className="text-xs opacity-60 truncate">{contract.project_address ?? "No address on file"}</p>
                  <span className={`badge badge-sm mt-2 ${statusBadgeClass(contract.status)}`}>
                    {labelize(contract.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="My Recent Field Logs">
        {myFieldLogs.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">You haven&apos;t submitted any field logs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Work Performed</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {myFieldLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap">{log.log_date ?? "—"}</td>
                    <td>{log.contracts?.contract_name ?? "—"}</td>
                    <td className="max-w-xs truncate">{log.work_performed ?? "—"}</td>
                    <td>{log.hours_worked ?? "—"}</td>
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

function SubcontractorDashboard({
  subcontractors,
  fieldLogs,
  costEntries,
  userId,
}: DashboardData & { userId?: string }) {
  // Already scoped to this sub in useContractData; keep filter as a safety net
  const mySubs = subcontractors.filter((s) => !userId || s.user_id === userId);
  const myFieldLogs = fieldLogs
    .filter((f) => !userId || f.user_id === userId)
    .slice(0, 6);
  const myCosts = costEntries.filter((c) => !userId || c.user_id === userId);
  const totalValue = mySubs.reduce((sum, s) => sum + Number(s.subcontract_value ?? 0), 0);
  const totalPaid = mySubs.reduce((sum, s) => sum + Number(s.amount_paid ?? 0), 0);
  const totalCostsSubmitted = myCosts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  const [openPackages, setOpenPackages] = useState<BidPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadPackages = async () => {
      setPackagesLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("bid_packages")
        .select("*")
        .eq("status", "open")
        .order("bids_due_at", { ascending: true });
      if (!cancelled) {
        setOpenPackages((data as BidPackage[]) ?? []);
        setPackagesLoading(false);
      }
    };
    void loadPackages();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Active Engagements"
          value={String(mySubs.filter((s) => s.status === "active").length)}
          hint={`${mySubs.length} total`}
          icon={Wrench}
        />
        <StatCard title="Subcontract Value" value={money(totalValue)} icon={CircleDollarSign} />
        <StatCard title="Amount Paid" value={money(totalPaid)} icon={Banknote} tone="success" />
        <StatCard
          title="Costs Submitted"
          value={money(totalCostsSubmitted)}
          hint={`${myCosts.length} entries`}
        />
      </div>

      <SectionCard
        title="Open bid packages"
        actions={
          <Link href="/bidding" className="btn btn-primary btn-sm">
            <Gavel className="h-4 w-4" />
            Go to Bidding
          </Link>
        }
      >
        {packagesLoading ? (
          <div className="grid place-items-center py-8">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        ) : openPackages.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">
            No open bid packages right now. Check back later or open Bidding for past packages.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {openPackages.map((pkg) => (
              <Link
                key={pkg.id}
                href={`/bidding?package=${pkg.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-4 gap-1">
                  <p className="font-medium truncate">{pkg.title}</p>
                  <p className="text-xs opacity-60 truncate">{pkg.project_name}</p>
                  <p className="text-xs opacity-60">{pkg.trade}</p>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="opacity-70">Est. value</span>
                    <span className="font-medium">{money(pkg.estimated_package_value)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="opacity-70">Bids due</span>
                    <span className="font-medium">
                      {pkg.bids_due_at
                        ? new Date(pkg.bids_due_at).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                  <span className="btn btn-primary btn-xs mt-3 w-fit">
                    <Gavel className="h-3.5 w-3.5" />
                    Bid on this package
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="My Subcontract Engagements"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Field Log
          </Link>
        }
      >
        {mySubs.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">
            You are not assigned to any subcontract engagements yet.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mySubs.map((sub) => {
              const overpaid =
                Number(sub.amount_paid ?? 0) > Number(sub.subcontract_value ?? 0);
              return (
                <div key={sub.id} className="card bg-base-200/60 border border-base-300">
                  <div className="card-body p-4 gap-1">
                    <p className="font-medium truncate">
                      {sub.contracts?.contract_name ?? "Project"}
                    </p>
                    <p className="text-xs opacity-60">{sub.trade ?? "—"}</p>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span>Value</span>
                      <span className="font-medium">{money(sub.subcontract_value)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Paid</span>
                      <span className="font-medium">{money(sub.amount_paid)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`badge badge-sm ${statusBadgeClass(sub.status)}`}>
                        {labelize(sub.status)}
                      </span>
                      {overpaid ? (
                        <span className="badge badge-sm badge-error">Overpaid</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="My Recent Field Logs">
        {myFieldLogs.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">No field logs submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Work Performed</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {myFieldLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap">{log.log_date ?? "—"}</td>
                    <td>{log.contracts?.contract_name ?? "—"}</td>
                    <td className="max-w-xs truncate">{log.work_performed ?? "—"}</td>
                    <td>{log.hours_worked ?? "—"}</td>
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

function ClientDashboard({ contracts, changeOrders, invoices, costEntries, milestones, payments }: DashboardData) {
  const router = useRouter();
  const approvedChangeOrders = changeOrders.filter((co) => co.status === "approved");
  const perContract = contracts.map((contract) => ({
    contract,
    metrics: computeContractMetrics(contract, changeOrders, invoices, costEntries, milestones, payments),
  }));
  const totalValue = perContract.reduce((sum, { metrics }) => sum + metrics.revisedValue, 0);
  const totalInvoiced = perContract.reduce((sum, { metrics }) => sum + metrics.totalBilled, 0);
  const totalPaid = perContract.reduce((sum, { metrics }) => sum + metrics.totalCollected, 0);
  const totalOutstanding = perContract.reduce((sum, { metrics }) => sum + metrics.outstanding, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard title="Active Projects" value={String(contracts.filter((c) => c.status === "active").length)} hint={`${contracts.length} total`} icon={Building2} />
        <StatCard title="Total Contract Value" value={money(totalValue)} icon={CircleDollarSign} />
        <StatCard title="Total Invoiced" value={money(totalInvoiced)} icon={FileText} />
        <StatCard title="Total Paid" value={money(totalPaid)} icon={Banknote} tone="success" />
        <StatCard title="Outstanding Balance" value={money(totalOutstanding)} tone={totalOutstanding > 0 ? "warning" : "default"} />
      </div>

      <SectionCard title="My Projects">
        {contracts.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">No projects linked to your account yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {perContract.map(({ contract, metrics }) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-4 gap-2">
                  <p className="font-medium truncate">{contract.contract_name}</p>
                  <span className={`badge badge-sm w-fit ${statusBadgeClass(contract.status)}`}>{labelize(contract.status)}</span>
                  <div className="mt-1">
                    <div className="flex items-center justify-between text-xs opacity-70 mb-1">
                      <span>Completion</span>
                      <span>{percent(metrics.completionPercent)}</span>
                    </div>
                    <progress
                      className="progress progress-primary w-full"
                      value={Math.round(metrics.completionPercent * 100)}
                      max={100}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Approved Change Orders">
        {approvedChangeOrders.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">No approved change orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>CO #</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Date Resolved</th>
                </tr>
              </thead>
              <tbody>
                {approvedChangeOrders.map((co) => (
                  <tr key={co.id}>
                    <td>{co.contracts?.contract_name ?? "—"}</td>
                    <td>{co.change_order_number ?? "—"}</td>
                    <td className="max-w-xs truncate">{co.description ?? "—"}</td>
                    <td>{money(co.amount)}</td>
                    <td className="whitespace-nowrap">{co.date_resolved ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Invoices & Payment Status">
        {invoices.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">No invoices issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const overdue =
                    (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
                    daysPastDue(invoice.due_date) > 0;
                  return (
                    <tr
                      key={invoice.id}
                      className="hover cursor-pointer"
                      onClick={() => router.push(`/invoices/${invoice.id}`)}
                    >
                      <td>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="link link-primary font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {invoice.invoice_number ?? "View invoice"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{invoice.invoice_date ?? "—"}</td>
                      <td>{money(invoice.invoice_amount)}</td>
                      <td>{money(invoice.amount_paid)}</td>
                      <td>
                        <span className={`badge badge-sm ${statusBadgeClass(overdue ? "overdue" : invoice.status)}`}>
                          {overdue ? "Overdue" : labelize(invoice.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
