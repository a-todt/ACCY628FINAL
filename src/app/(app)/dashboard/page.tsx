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
  FilePlus2,
  FileText,
  Gavel,
  Plus,
  Receipt,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useDismissedAlerts } from "@/hooks/useDismissedAlerts";
import { useInsuranceData } from "@/hooks/useInsuranceData";
import { ScrollableBarChart, toNamedBarRows } from "@/components/ScrollableBarChart";
import { PageSkeleton } from "@/components/PageSkeleton";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { buildAlertsForRole, type AlertItem } from "@/lib/alerts";
import { withoutDismissedAlerts } from "@/lib/dismissedAlerts";
import { CHART_COLORS } from "@/lib/chartColors";
import { computeContractMetrics, daysPastDue, labelize, money, percent } from "@/lib/metrics";
import {
  canCreateChangeOrders,
  canCreateFieldLogs,
  canCreateInvoices,
  canEnterCosts,
  canManageContracts,
  statusBadgeClass,
} from "@/lib/roles";
import type { UserRole } from "@/lib/types";
import { resolveAssignedStaffUserId } from "@/lib/staffScope";
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

function chartHasValues(
  rows: Array<Record<string, string | number>>,
  keys: string[]
): boolean {
  return rows.some((row) => keys.some((key) => Number(row[key] ?? 0) !== 0));
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

  const fieldScopeUserId = useMemo(
    () =>
      resolveAssignedStaffUserId(
        effectiveRole,
        profile?.role,
        user?.id,
        data.userProfiles
      ),
    [effectiveRole, profile?.role, user?.id, data.userProfiles]
  );

  if (data.loading || insurance.loading) {
    return <PageSkeleton rows={6} />;
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
    <div className="space-y-4">
      <PageHeader
        compact
        title="Dashboard"
        subtitle={`Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}`}
      />

      <DashboardQuickActions role={effectiveRole} />

      {insurance.error ? (
        <AlertBanner type="warning">
          Insurance data could not be loaded ({insurance.error}). Alerts that depend on
          insurance may be incomplete.
        </AlertBanner>
      ) : null}

      {effectiveRole === "admin" ||
      effectiveRole === "owner" ||
      effectiveRole === "project_manager" ? (
        <AdminDashboard {...shared} />
      ) : effectiveRole === "field_supervisor" ? (
        <FieldSupervisorDashboard {...shared} userId={fieldScopeUserId ?? user?.id} />
      ) : effectiveRole === "subcontractor" ? (
        <SubcontractorDashboard {...shared} userId={subScopeUserId ?? user?.id} />
      ) : (
        <ClientDashboard {...shared} />
      )}

      <DashboardAlertsPreview
        role={effectiveRole}
        invoices={data.invoices}
        fieldLogs={data.fieldLogs}
        changeOrders={data.changeOrders}
        insurancePolicies={insurance.policies}
        insuranceRequirements={insurance.requirements}
        subcontractors={data.subcontractors}
      />
    </div>
  );
}

function DashboardQuickActions({ role }: { role: UserRole }) {
  const actions: Array<{ href: string; label: string; icon: typeof Plus; show: boolean }> = [
    {
      href: "/contracts/new",
      label: "Add Contract",
      icon: FilePlus2,
      show: canManageContracts(role),
    },
    {
      href: "/invoices",
      label: "Create Invoice",
      icon: Receipt,
      show: canCreateInvoices(role),
    },
    {
      href: "/change-orders",
      label: "Add Change Order",
      icon: ClipboardList,
      show: canCreateChangeOrders(role),
    },
    {
      href: "/costs",
      label: "Log Cost",
      icon: Wrench,
      show: canEnterCosts(role) && role !== "field_supervisor" && role !== "subcontractor",
    },
    {
      href: "/field-logs",
      label: "New Field Log",
      icon: Plus,
      show: canCreateFieldLogs(role),
    },
    {
      href: "/costs",
      label: "Log Cost",
      icon: Wrench,
      show: canEnterCosts(role) && (role === "field_supervisor" || role === "subcontractor"),
    },
    {
      href: "/bidding",
      label: "Bidding",
      icon: Gavel,
      show: role === "subcontractor",
    },
    {
      href: "/invoices",
      label: "View Invoices",
      icon: FileText,
      show: role === "client",
    },
  ];

  const visible = actions.filter((action) => action.show);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((action) => {
        const Icon = action.icon;
        return (
          <Link key={`${action.href}-${action.label}`} href={action.href} className="btn btn-outline btn-sm gap-1.5">
            <Icon className="h-4 w-4" />
            {action.label}
          </Link>
        );
      })}
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
  const { dismissedSet, pruneAgainstLiveIds } = useDismissedAlerts();

  const rawAlerts = useMemo(
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

  useEffect(() => {
    pruneAgainstLiveIds(rawAlerts.map((alert) => alert.id));
  }, [rawAlerts, pruneAgainstLiveIds]);

  const alerts = useMemo(
    () => withoutDismissedAlerts(rawAlerts, dismissedSet),
    [rawAlerts, dismissedSet]
  );

  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, DASHBOARD_ALERT_PREVIEW_LIMIT);
  const remaining = alerts.length - preview.length;

  return (
    <SectionCard
      compact
      title="Needs attention"
      actions={
        <Link href="/alerts" className="btn btn-ghost btn-xs gap-1">
          <Bell className="h-3.5 w-3.5" />
          View all ({alerts.length})
        </Link>
      }
    >
      <ul className="divide-y divide-base-300 max-h-[50vh] overflow-y-auto pr-1">
        {preview.map((alert) => (
          <AlertPreviewRow key={alert.id} alert={alert} />
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="text-xs opacity-60 mt-2 shrink-0">
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
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide opacity-50 px-0.5">Money pulse</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <StatCard
            compact
            title="Revised Contract Value"
            value={money(totals.revisedValue)}
            icon={CircleDollarSign}
            href="/contracts"
          />
          <StatCard
            compact
            title="Total Billed"
            value={money(totals.totalBilled)}
            icon={FileText}
            href="/invoices"
          />
          <StatCard
            compact
            title="Total Collected"
            value={money(totals.totalCollected)}
            icon={Banknote}
            tone="success"
            href="/invoices"
          />
          <StatCard
            compact
            title="Outstanding AR"
            value={money(totals.outstanding)}
            tone={totals.outstanding > 0 ? "warning" : "default"}
            href="/invoices"
          />
          <StatCard
            compact
            title="Overdue Invoices"
            value={String(overdueInvoices.length)}
            hint={overdueInvoices.length > 0 ? "Past due · see Needs attention" : undefined}
            icon={FileText}
            tone={overdueInvoices.length > 0 ? "error" : "default"}
            href="/alerts"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide opacity-50 px-0.5">Operations</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard
            compact
            title="Active Contracts"
            value={String(activeContracts)}
            hint={`${contracts.length} total`}
            icon={Building2}
            href="/contracts"
          />
          <StatCard
            compact
            title="Total Job Costs"
            value={money(totals.totalCosts)}
            icon={Wrench}
            href="/costs"
          />
          <StatCard
            compact
            title="Gross Profit"
            value={money(totals.grossProfit)}
            hint={totals.totalBilled > 0 ? percent(totals.grossProfit / totals.totalBilled) : undefined}
            icon={TrendingUp}
            tone={totals.grossProfit >= 0 ? "success" : "error"}
            href="/finance"
          />
          <StatCard
            compact
            title="Pending Change Orders"
            value={String(pendingCOs)}
            icon={ClipboardList}
            tone={pendingCOs > 0 ? "warning" : "default"}
            href="/change-orders"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 xl:gap-4">
        <SectionCard
          compact
          title="Contract Value by Project"
          actions={
            <Link href="/contracts" className="btn btn-ghost btn-xs">
              View contracts
            </Link>
          }
        >
          {chartHasValues(contractValueData, ["Value"]) ? (
            <ScrollableBarChart data={contractValueData} panelHeight={200}>
              <Bar dataKey="Value" fill={CHART_COLORS[0]} radius={[0, 5, 5, 0]} />
            </ScrollableBarChart>
          ) : (
            <p className="text-sm opacity-60 py-8 text-center">No contract values to chart yet.</p>
          )}
        </SectionCard>

        <SectionCard
          compact
          title="Billed vs. Collected"
          actions={
            <Link href="/invoices" className="btn btn-ghost btn-xs">
              View invoices
            </Link>
          }
        >
          {chartHasValues(billedVsCollectedData, ["Billed", "Collected"]) ? (
            <ScrollableBarChart data={billedVsCollectedData} panelHeight={200}>
              <Legend verticalAlign="top" height={28} />
              <Bar dataKey="Billed" fill={CHART_COLORS[1]} radius={[0, 5, 5, 0]} />
              <Bar dataKey="Collected" fill={CHART_COLORS[3]} radius={[0, 5, 5, 0]} />
            </ScrollableBarChart>
          ) : (
            <p className="text-sm opacity-60 py-8 text-center">No billing activity to chart yet.</p>
          )}
        </SectionCard>

        <SectionCard
          compact
          title="Costs by Category"
          actions={
            <Link href="/costs" className="btn btn-ghost btn-xs">
              View costs
            </Link>
          }
        >
          {costsByCategoryData.length === 0 ? (
            <p className="text-sm opacity-60 py-8 text-center">No cost entries recorded yet.</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costsByCategoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={72}
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

        <SectionCard
          compact
          title="Approved Change Order Value by Project"
          actions={
            <Link href="/change-orders" className="btn btn-ghost btn-xs">
              View change orders
            </Link>
          }
        >
          {chartHasValues(changeOrderValueData, ["Approved"]) ? (
            <ScrollableBarChart data={changeOrderValueData} panelHeight={200}>
              <Bar dataKey="Approved" fill={CHART_COLORS[2]} radius={[0, 5, 5, 0]} />
            </ScrollableBarChart>
          ) : (
            <p className="text-sm opacity-60 py-8 text-center">No approved change order value yet.</p>
          )}
        </SectionCard>

        <SectionCard
          compact
          title="Gross Profit by Project"
          actions={
            <Link href="/finance" className="btn btn-ghost btn-xs">
              View finance
            </Link>
          }
        >
          {chartHasValues(grossProfitData, ["Gross Profit"]) ? (
            <ScrollableBarChart data={grossProfitData} panelHeight={200}>
              <Bar dataKey="Gross Profit" radius={[0, 5, 5, 0]}>
                {grossProfitData.map((entry) => (
                  <Cell
                    key={entry.fullName}
                    fill={entry["Gross Profit"] >= 0 ? CHART_COLORS[3] : CHART_COLORS[4]}
                  />
                ))}
              </Bar>
            </ScrollableBarChart>
          ) : (
            <p className="text-sm opacity-60 py-8 text-center">No gross profit data to chart yet.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function FieldSupervisorDashboard({
  contracts,
  fieldLogs,
  costEntries,
  userId,
}: DashboardData & { userId?: string }) {
  const myFieldLogs = fieldLogs.filter((f) => !userId || f.user_id === userId).slice(0, 6);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const myCostsThisWeek = costEntries.filter(
    (c) => (!userId || c.user_id === userId) && c.date_incurred && new Date(c.date_incurred) >= weekAgo
  );
  const costsThisWeekTotal = myCostsThisWeek.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  const myLogCount = fieldLogs.filter((f) => !userId || f.user_id === userId).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <StatCard
          compact
          title="Assigned Projects"
          value={String(contracts.length)}
          icon={Building2}
          href="/contracts"
        />
        <StatCard
          compact
          title="Field Logs Submitted"
          value={String(myLogCount)}
          icon={ClipboardList}
          href="/field-logs"
        />
        <StatCard
          compact
          title="Costs Entered This Week"
          value={money(costsThisWeekTotal)}
          hint={`${myCostsThisWeek.length} entries`}
          icon={Wrench}
          href="/costs"
        />
      </div>

      <SectionCard
        compact
        title="Assigned Projects"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Field Log
          </Link>
        }
      >
        {contracts.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No projects assigned yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {contracts.map((contract) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-3 gap-1">
                  <p className="font-medium truncate text-sm">{contract.contract_name}</p>
                  <p className="text-xs opacity-60 truncate">
                    {contract.project_address ?? "No address on file"}
                  </p>
                  <span className={`badge badge-sm mt-1 ${statusBadgeClass(contract.status)}`}>
                    {labelize(contract.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        compact
        title="My Recent Field Logs"
        actions={
          <Link href="/field-logs" className="btn btn-ghost btn-xs">
            View all
          </Link>
        }
      >
        {myFieldLogs.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">
            You haven&apos;t submitted any field logs yet.
          </p>
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
                  <tr key={log.id} className="hover">
                    <td className="whitespace-nowrap">
                      <Link href="/field-logs" className="link link-hover">
                        {log.log_date ?? "—"}
                      </Link>
                    </td>
                    <td>
                      {log.contract_id ? (
                        <Link href={`/contracts/${log.contract_id}`} className="link link-hover">
                          {log.contracts?.contract_name ?? "—"}
                        </Link>
                      ) : (
                        (log.contracts?.contract_name ?? "—")
                      )}
                    </td>
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
  const [packagesError, setPackagesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPackages = async () => {
      setPackagesLoading(true);
      setPackagesError(null);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("bid_packages")
        .select("*")
        .eq("status", "open")
        .order("bids_due_at", { ascending: true });
      if (!cancelled) {
        if (error) {
          setPackagesError(error.message);
          setOpenPackages([]);
        } else {
          setOpenPackages((data as BidPackage[]) ?? []);
        }
        setPackagesLoading(false);
      }
    };
    void loadPackages();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard
          compact
          title="Active Engagements"
          value={String(mySubs.filter((s) => s.status === "active").length)}
          hint={`${mySubs.length} total`}
          icon={Wrench}
          href="/subcontractors"
        />
        <StatCard compact title="Subcontract Value" value={money(totalValue)} icon={CircleDollarSign} />
        <StatCard compact title="Amount Paid" value={money(totalPaid)} icon={Banknote} tone="success" />
        <StatCard
          compact
          title="Costs Submitted"
          value={money(totalCostsSubmitted)}
          hint={`${myCosts.length} entries`}
          href="/costs"
        />
      </div>

      <SectionCard
        compact
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
        ) : packagesError ? (
          <p className="text-sm text-error py-6 text-center">
            Could not load bid packages ({packagesError}).
          </p>
        ) : openPackages.length === 0 ? (
          <p className="text-sm opacity-60 py-6 text-center">
            No open bid packages right now. Check back later or open Bidding for past packages.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {openPackages.map((pkg) => (
              <Link
                key={pkg.id}
                href={`/bidding?package=${pkg.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-3 gap-1">
                  <p className="font-medium truncate text-sm">{pkg.title}</p>
                  <p className="text-xs opacity-60 truncate">{pkg.project_name}</p>
                  <p className="text-xs opacity-60">{pkg.trade}</p>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="opacity-70">Est. value</span>
                    <span className="font-medium">{money(pkg.estimated_package_value)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="opacity-70">Bids due</span>
                    <span className="font-medium">
                      {pkg.bids_due_at ? new Date(pkg.bids_due_at).toLocaleDateString() : "—"}
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
        compact
        title="My Subcontract Engagements"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Field Log
          </Link>
        }
      >
        {mySubs.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">
            You are not assigned to any subcontract engagements yet.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {mySubs.map((sub) => {
              const overpaid =
                Number(sub.amount_paid ?? 0) > Number(sub.subcontract_value ?? 0);
              const cardInner = (
                <div className="card-body p-3 gap-1">
                  <p className="font-medium truncate text-sm">{sub.contracts?.contract_name ?? "Project"}</p>
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
                    {overpaid ? <span className="badge badge-sm badge-error">Overpaid</span> : null}
                  </div>
                </div>
              );

              if (sub.contract_id) {
                return (
                  <Link
                    key={sub.id}
                    href={`/contracts/${sub.contract_id}`}
                    className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
                  >
                    {cardInner}
                  </Link>
                );
              }

              return (
                <div key={sub.id} className="card bg-base-200/60 border border-base-300">
                  {cardInner}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        compact
        title="My Recent Field Logs"
        actions={
          <Link href="/field-logs" className="btn btn-ghost btn-xs">
            View all
          </Link>
        }
      >
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
                  <tr key={log.id} className="hover">
                    <td className="whitespace-nowrap">
                      <Link href="/field-logs" className="link link-hover">
                        {log.log_date ?? "—"}
                      </Link>
                    </td>
                    <td>
                      {log.contract_id ? (
                        <Link href={`/contracts/${log.contract_id}`} className="link link-hover">
                          {log.contracts?.contract_name ?? "—"}
                        </Link>
                      ) : (
                        (log.contracts?.contract_name ?? "—")
                      )}
                    </td>
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

function ClientDashboard({
  contracts,
  changeOrders,
  invoices,
  costEntries,
  milestones,
  payments,
}: DashboardData) {
  const router = useRouter();
  const approvedChangeOrders = changeOrders.filter((co) => co.status === "approved");
  const perContract = contracts.map((contract) => ({
    contract,
    metrics: computeContractMetrics(
      contract,
      changeOrders,
      invoices,
      costEntries,
      milestones,
      payments
    ),
  }));
  const totalValue = perContract.reduce((sum, { metrics }) => sum + metrics.revisedValue, 0);
  const totalInvoiced = perContract.reduce((sum, { metrics }) => sum + metrics.totalBilled, 0);
  const totalPaid = perContract.reduce((sum, { metrics }) => sum + metrics.totalCollected, 0);
  const totalOutstanding = perContract.reduce((sum, { metrics }) => sum + metrics.outstanding, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <StatCard
          compact
          title="Active Projects"
          value={String(contracts.filter((c) => c.status === "active").length)}
          hint={`${contracts.length} total`}
          icon={Building2}
          href="/contracts"
        />
        <StatCard compact title="Total Contract Value" value={money(totalValue)} icon={CircleDollarSign} />
        <StatCard
          compact
          title="Total Invoiced"
          value={money(totalInvoiced)}
          icon={FileText}
          href="/invoices"
        />
        <StatCard
          compact
          title="Total Paid"
          value={money(totalPaid)}
          icon={Banknote}
          tone="success"
          href="/invoices"
        />
        <StatCard
          compact
          title="Outstanding Balance"
          value={money(totalOutstanding)}
          tone={totalOutstanding > 0 ? "warning" : "default"}
          href="/invoices"
        />
      </div>

      <SectionCard compact title="My Projects">
        {contracts.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No projects linked to your account yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {perContract.map(({ contract, metrics }) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-3 gap-1.5">
                  <p className="font-medium truncate text-sm">{contract.contract_name}</p>
                  <span className={`badge badge-sm w-fit ${statusBadgeClass(contract.status)}`}>
                    {labelize(contract.status)}
                  </span>
                  <div className="mt-0.5">
                    <div className="flex items-center justify-between text-xs opacity-70 mb-1">
                      <span>Completion</span>
                      <span>{percent(metrics.completionPercent)}</span>
                    </div>
                    <progress
                      className="progress progress-primary w-full h-2"
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

      <SectionCard
        compact
        title="Approved Change Orders"
        actions={
          <Link href="/change-orders" className="btn btn-ghost btn-xs">
            View all
          </Link>
        }
      >
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
                  <tr key={co.id} className="hover">
                    <td>
                      {co.contract_id ? (
                        <Link href={`/contracts/${co.contract_id}`} className="link link-hover">
                          {co.contracts?.contract_name ?? "—"}
                        </Link>
                      ) : (
                        (co.contracts?.contract_name ?? "—")
                      )}
                    </td>
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

      <SectionCard compact title="Invoices & Payment Status">
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
                        <span
                          className={`badge badge-sm ${statusBadgeClass(
                            overdue ? "overdue" : invoice.status
                          )}`}
                        >
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
