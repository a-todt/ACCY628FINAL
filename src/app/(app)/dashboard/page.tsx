"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Plus,
  TrendingUp,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { buildInsuranceWarnings } from "@/lib/insurance";
import { computeContractMetrics, daysPastDue, labelize, money, percent } from "@/lib/metrics";
import { statusBadgeClass } from "@/lib/roles";
import type {
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

function shortName(name: string | null | undefined, len = 16): string {
  const value = name ?? "Untitled";
  return value.length > len ? `${value.slice(0, len - 1)}…` : value;
}

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

      {effectiveRole === "admin" ||
      effectiveRole === "owner" ||
      effectiveRole === "project_manager" ? (
        <AdminDashboard {...shared} />
      ) : effectiveRole === "field_supervisor" ? (
        <FieldSupervisorDashboard {...shared} userId={user?.id} />
      ) : effectiveRole === "subcontractor" ? (
        <SubcontractorDashboard {...shared} userId={user?.id} />
      ) : (
        <ClientDashboard {...shared} />
      )}
    </div>
  );
}

function AdminDashboard({
  contracts,
  changeOrders,
  subcontractors,
  costEntries,
  invoices,
  payments,
  milestones,
  insurancePolicies = [],
  insuranceRequirements = [],
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
      acc.earnedRevenue += metrics.earnedRevenue;
      acc.recognizedGrossProfit += metrics.recognizedGrossProfit;
      acc.billingsInExcess += metrics.billingsInExcess;
      acc.unbilledRevenue += metrics.unbilledRevenue;
      return acc;
    },
    {
      revisedValue: 0,
      totalBilled: 0,
      totalCollected: 0,
      outstanding: 0,
      totalCosts: 0,
      grossProfit: 0,
      earnedRevenue: 0,
      recognizedGrossProfit: 0,
      billingsInExcess: 0,
      unbilledRevenue: 0,
    }
  );

  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const pendingCOs = changeOrders.filter((c) => c.status === "pending").length;
  const overdueInvoices = invoices.filter(
    (i) => (i.status === "unpaid" || i.status === "partially_paid") && daysPastDue(i.due_date) > 0
  );
  const overpaidSubs = subcontractors.filter(
    (s) => Number(s.amount_paid ?? 0) > Number(s.subcontract_value ?? 0)
  );
  const unprofitableContracts = perContract.filter(
    ({ metrics }) => metrics.recognizedGrossProfit < 0 && metrics.earnedRevenue > 0
  );

  const contractValueData = perContract.map(({ contract, metrics }) => ({
    name: shortName(contract.contract_name),
    Value: Math.round(metrics.revisedValue),
  }));

  const billedVsCollectedData = perContract.map(({ contract, metrics }) => ({
    name: shortName(contract.contract_name),
    Billed: Math.round(metrics.totalBilled),
    Collected: Math.round(metrics.totalCollected),
  }));

  const costsByCategory = costEntries.reduce<Record<string, number>>((acc, cost) => {
    const key = cost.category ?? "other";
    acc[key] = (acc[key] ?? 0) + Number(cost.amount ?? 0);
    return acc;
  }, {});
  const costsByCategoryData = Object.entries(costsByCategory).map(([category, value]) => ({
    name: labelize(category),
    value: Math.round(value),
  }));

  const changeOrderValueData = perContract.map(({ contract, metrics }) => ({
    name: shortName(contract.contract_name),
    Approved: Math.round(metrics.approvedChangeOrders),
  }));

  const grossProfitData = perContract.map(({ contract, metrics }) => ({
    name: shortName(contract.contract_name),
    "Recognized GP": Math.round(metrics.recognizedGrossProfit),
    "Billing Profit": Math.round(metrics.grossProfit),
  }));

  const warnings: string[] = [];
  if (overdueInvoices.length > 0) {
    warnings.push(
      `${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? "s" : ""} overdue for payment.`
    );
  }
  if (overpaidSubs.length > 0) {
    warnings.push(
      `${overpaidSubs.length} subcontractor${overpaidSubs.length > 1 ? "s" : ""} paid more than their contract value.`
    );
  }
  if (pendingCOs > 0) {
    warnings.push(`${pendingCOs} change order${pendingCOs > 1 ? "s" : ""} awaiting a decision.`);
  }
  if (unprofitableContracts.length > 0) {
    warnings.push(
      `${unprofitableContracts.length} contract${unprofitableContracts.length > 1 ? "s" : ""} running at a loss.`
    );
  }
  for (const warning of buildInsuranceWarnings(
    insurancePolicies,
    insuranceRequirements,
    subcontractors
  )) {
    warnings.push(warning);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Active Contracts" value={String(activeContracts)} hint={`${contracts.length} total`} icon={Building2} />
        <StatCard title="Revised Contract Value" value={money(totals.revisedValue)} icon={CircleDollarSign} />
        <StatCard title="Total Billed" value={money(totals.totalBilled)} icon={FileText} />
        <StatCard title="Total Collected" value={money(totals.totalCollected)} icon={Banknote} tone="success" />
        <StatCard title="Outstanding AR" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? "warning" : "default"} />
        <StatCard title="Earned Revenue" value={money(totals.earnedRevenue)} icon={TrendingUp} />
        <StatCard
          title="Billings in Excess"
          value={money(totals.billingsInExcess)}
          tone={totals.billingsInExcess > 0 ? "warning" : "default"}
        />
        <StatCard
          title="Unbilled Revenue"
          value={money(totals.unbilledRevenue)}
          tone={totals.unbilledRevenue > 0 ? "warning" : "default"}
        />
        <StatCard title="Total Job Costs" value={money(totals.totalCosts)} icon={Wrench} />
        <StatCard
          title="Recognized Gross Profit"
          value={money(totals.recognizedGrossProfit)}
          hint={totals.earnedRevenue > 0 ? percent(totals.recognizedGrossProfit / totals.earnedRevenue) : undefined}
          icon={TrendingUp}
          tone={totals.recognizedGrossProfit >= 0 ? "success" : "error"}
        />
        <StatCard
          title="Billing Profit"
          value={money(totals.grossProfit)}
          hint={totals.totalBilled > 0 ? percent(totals.grossProfit / totals.totalBilled) : undefined}
          tone={totals.grossProfit >= 0 ? "success" : "error"}
        />
        <StatCard title="Pending Change Orders" value={String(pendingCOs)} icon={ClipboardList} tone={pendingCOs > 0 ? "warning" : "default"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Contract Value by Project">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contractValueData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(Number(v))} width={80} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="Value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Billed vs. Collected">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={billedVsCollectedData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(Number(v))} width={80} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Legend />
                <Bar dataKey="Billed" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Collected" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={changeOrderValueData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(Number(v))} width={80} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="Approved" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Recognized vs Billing Profit by Project">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grossProfitData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(Number(v))} width={80} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Legend />
                <Bar dataKey="Recognized GP" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Billing Profit" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {warnings.length > 0 ? (
        <SectionCard
          title="Warnings"
          actions={
            <Link href="/contracts" className="btn btn-ghost btn-xs">
              Review contracts
            </Link>
          }
        >
          <ul className="space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2 text-sm">
                <TriangleAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
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
  const mySubs = subcontractors.filter((s) => s.user_id === userId);
  const myFieldLogs = fieldLogs.filter((f) => f.user_id === userId).slice(0, 6);
  const myCosts = costEntries.filter((c) => c.user_id === userId);
  const totalValue = mySubs.reduce((sum, s) => sum + Number(s.subcontract_value ?? 0), 0);
  const totalPaid = mySubs.reduce((sum, s) => sum + Number(s.amount_paid ?? 0), 0);
  const totalCostsSubmitted = myCosts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Active Engagements" value={String(mySubs.filter((s) => s.status === "active").length)} hint={`${mySubs.length} total`} icon={Wrench} />
        <StatCard title="Subcontract Value" value={money(totalValue)} icon={CircleDollarSign} />
        <StatCard title="Amount Paid" value={money(totalPaid)} icon={Banknote} tone="success" />
        <StatCard title="Costs Submitted" value={money(totalCostsSubmitted)} hint={`${myCosts.length} entries`} />
      </div>

      <SectionCard
        title="My Subcontract Engagements"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Field Log
          </Link>
        }
      >
        {mySubs.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">You are not assigned to any subcontract engagements yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mySubs.map((sub) => {
              const overpaid = Number(sub.amount_paid ?? 0) > Number(sub.subcontract_value ?? 0);
              return (
                <div key={sub.id} className="card bg-base-200/60 border border-base-300">
                  <div className="card-body p-4 gap-1">
                    <p className="font-medium truncate">{sub.contracts?.contract_name ?? "Project"}</p>
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
                      <span className={`badge badge-sm ${statusBadgeClass(sub.status)}`}>{labelize(sub.status)}</span>
                      {overpaid ? <span className="badge badge-sm badge-error">Overpaid</span> : null}
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
                  <div className="mt-1 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Invoiced</span>
                      <span className="font-medium">{money(metrics.totalBilled)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Paid</span>
                      <span className="font-medium">{money(metrics.totalCollected)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Outstanding</span>
                      <span className="font-medium">{money(metrics.outstanding)}</span>
                    </div>
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
