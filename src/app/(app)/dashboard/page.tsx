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
  MessageCircle,
  Plus,
  Receipt,
  Settings2,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { useDismissedAlerts } from "@/hooks/useDismissedAlerts";
import { startOrGetThread } from "@/hooks/useMessages";
import { DashboardCustomizeModal } from "@/components/DashboardCustomizeModal";
import { DashboardPaneGrid } from "@/components/DashboardPaneGrid";
import { ExpandableChart } from "@/components/ExpandableChart";
import { ScrollableBarChart, toNamedBarRows } from "@/components/ScrollableBarChart";
import { PageSkeleton } from "@/components/PageSkeleton";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { buildAlertsForRole, type AlertItem } from "@/lib/alerts";
import { withoutDismissedAlerts } from "@/lib/dismissedAlerts";
import { CHART_COLORS } from "@/lib/chartColors";
import { chartPanelHeight, panesForRole, type DashboardLayoutPrefs } from "@/lib/dashboardLayout";
import {
  computeContractMetrics,
  computeScheduleStatus,
  daysPastDue,
  labelize,
  money,
  percent,
  scheduleBadgeClass,
} from "@/lib/metrics";
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

interface DashboardData {
  contracts: Contract[];
  changeOrders: ChangeOrder[];
  subcontractors: Subcontractor[];
  costEntries: CostEntry[];
  invoices: Invoice[];
  payments: Payment[];
  fieldLogs: FieldLog[];
  milestones: Milestone[];
}

type DashboardPaneProps = DashboardData & {
  role: UserRole;
  layout: DashboardLayoutPrefs;
  onCustomize: () => void;
};

function chartHasValues(
  rows: Array<Record<string, string | number>>,
  keys: string[]
): boolean {
  return rows.some((row) => keys.some((key) => Number(row[key] ?? 0) !== 0));
}

/** How many project rows fit in a dashboard preview tile without scrolling. */
const CHART_PREVIEW_ROWS = 6;

function takeChartPreview<T>(rows: T[], mode: "preview" | "full", limit = CHART_PREVIEW_ROWS): T[] {
  if (mode === "full" || rows.length <= limit) return rows;
  return rows.slice(0, limit);
}

function chartMoreCount(total: number, previewShown: number): number {
  return Math.max(0, total - previewShown);
}

function DashboardRankedList({
  height,
  moreHref,
  moreCount,
  moreLabel,
  children,
}: {
  height: number;
  moreHref: string;
  moreCount: number;
  moreLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="overflow-y-auto pr-1" style={{ height }}>
        <ul className="divide-y divide-base-300">{children}</ul>
      </div>
      {moreCount > 0 ? (
        <div className="flex justify-center pt-0.5">
          <Link href={moreHref} className="btn btn-primary btn-xs gap-1.5">
            +{moreCount} {moreLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const { effectiveRole, profile, user } = useAuth();
  const data = useContractData();
  const { layout, setLayout } = useDashboardLayout(effectiveRole);
  const [customizeOpen, setCustomizeOpen] = useState(false);

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

  if (data.loading) {
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
  };

  const paneProps = {
    ...shared,
    role: effectiveRole,
    layout,
    onCustomize: () => setCustomizeOpen(true),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        compact
        title="Dashboard"
        subtitle={`Welcome back${profile?.full_name ? `, ${profile.full_name}` : ""}`}
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => setCustomizeOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Customize
          </button>
        }
      />

      <DashboardQuickActions role={effectiveRole} />

      {effectiveRole === "admin" ||
      effectiveRole === "owner" ||
      effectiveRole === "project_manager" ? (
        <AdminDashboard {...paneProps} />
      ) : effectiveRole === "field_supervisor" ? (
        <FieldSupervisorDashboard {...paneProps} userId={fieldScopeUserId ?? user?.id} />
      ) : effectiveRole === "subcontractor" ? (
        <SubcontractorDashboard {...paneProps} userId={subScopeUserId ?? user?.id} />
      ) : (
        <ClientDashboard {...paneProps} />
      )}

      <DashboardCustomizeModal
        open={customizeOpen}
        role={effectiveRole}
        layout={layout}
        onClose={() => setCustomizeOpen(false)}
        onSave={setLayout}
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
      href: "/invoices/new",
      label: "Create Invoice",
      icon: Receipt,
      show: canCreateInvoices(role),
    },
    {
      href: "/change-orders?new=1",
      label: "Add Change Order",
      icon: ClipboardList,
      show: canCreateChangeOrders(role),
    },
    {
      href: "/costs/new",
      label: "Log Cost",
      icon: Wrench,
      show: canEnterCosts(role) && role !== "field_supervisor" && role !== "subcontractor",
    },
    {
      href: "/field-logs?new=1",
      label: "New Field Log",
      icon: Plus,
      show: canCreateFieldLogs(role),
    },
    {
      href: "/costs/new",
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
}: {
  role: UserRole;
  invoices: Invoice[];
  fieldLogs: FieldLog[];
  changeOrders: ChangeOrder[];
}) {
  const { dismissedSet, pruneAgainstLiveIds } = useDismissedAlerts();

  const rawAlerts = useMemo(
    () =>
      buildAlertsForRole(role, {
        invoices,
        fieldLogs,
        changeOrders,
      }),
    [role, invoices, fieldLogs, changeOrders]
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
        <Link href="/alerts" className="btn btn-primary btn-xs gap-1">
          <Bell className="h-3.5 w-3.5" />
          View all ({alerts.length})
        </Link>
      }
    >
      <div className="space-y-2">
        <div
          className="overflow-y-auto pr-1"
          style={{ height: "var(--dashboard-chart-h, 220px)" }}
        >
          <ul className="divide-y divide-base-300">
            {preview.map((alert) => (
              <AlertPreviewRow key={alert.id} alert={alert} />
            ))}
          </ul>
        </div>
        {remaining > 0 ? (
          <div className="flex justify-center pt-0.5">
            <Link
              href="/alerts"
              className="btn btn-primary btn-xs gap-1.5"
            >
              +{remaining} more in Alerts
            </Link>
          </div>
        ) : null}
      </div>
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
          <p className="text-xs text-primary mt-0.5 line-clamp-1">{alert.action}</p>
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
  fieldLogs,
  role,
  layout,
  onCustomize,
}: DashboardPaneProps) {
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

  // Ranked lists (not charts) — top contracts by value, gross profit losses-first
  const contractsByValue = [...perContract].sort(
    (a, b) => b.metrics.revisedValue - a.metrics.revisedValue
  );
  const contractsByGrossProfit = [...perContract].sort(
    (a, b) => a.metrics.grossProfit - b.metrics.grossProfit
  );

  const billedVsCollectedData = toNamedBarRows(
    [...perContract]
      .filter(({ metrics }) => metrics.totalBilled > 0)
      .sort((a, b) => {
        const rateA =
          a.metrics.totalBilled > 0 ? a.metrics.totalCollected / a.metrics.totalBilled : 1;
        const rateB =
          b.metrics.totalBilled > 0 ? b.metrics.totalCollected / b.metrics.totalBilled : 1;
        return rateA - rateB;
      })
      .map(({ contract, metrics }) => {
        const collected = Math.round(metrics.totalCollected);
        const outstanding = Math.max(0, Math.round(metrics.outstanding));
        const rate =
          metrics.totalBilled > 0 ? metrics.totalCollected / metrics.totalBilled : 0;
        return {
          fullName: contract.contract_name,
          values: {
            Collected: collected,
            Outstanding: outstanding,
            tipExtra: `Collection rate ${percent(rate)}`,
          } as Record<string, number | string>,
        };
      })
  );

  const costsByCategory = costEntries.reduce<Record<string, number>>((acc, cost) => {
    const key = cost.category ?? "other";
    acc[key] = (acc[key] ?? 0) + Number(cost.amount ?? 0);
    return acc;
  }, {});
  const costsByCategoryData = Object.entries(costsByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, value]) => ({
      name: labelize(category),
      value: Math.round(value),
    }));

  const changeOrderValueData = toNamedBarRows(
    [...perContract]
      .filter(({ metrics }) => metrics.approvedChangeOrders > 0)
      .sort((a, b) => {
        const origA = Number(a.contract.original_value ?? 0);
        const origB = Number(b.contract.original_value ?? 0);
        const pctA = origA > 0 ? a.metrics.approvedChangeOrders / origA : 0;
        const pctB = origB > 0 ? b.metrics.approvedChangeOrders / origB : 0;
        return pctB - pctA;
      })
      .map(({ contract, metrics }) => {
        const original = Math.round(Number(contract.original_value ?? 0));
        const approved = Math.round(metrics.approvedChangeOrders);
        const tipExtra =
          original > 0
            ? `COs ${percent(approved / original)} of original`
            : undefined;
        return {
          fullName: contract.contract_name,
          values: {
            Original: original,
            "Approved COs": approved,
            ...(tipExtra ? { tipExtra } : {}),
          } as Record<string, number | string>,
        };
      })
  );

  const catalog = panesForRole(role);
  const chartHeight = chartPanelHeight(
    Math.max(
      1,
      layout.panes.filter((id) => {
        const def = catalog.find((pane) => pane.id === id);
        return def && !def.fullWidth;
      }).length
    )
  );

  const panes: Record<string, ReactNode> = {
    money_pulse: (
      <SectionCard compact title="Money pulse">
        <div
          className="grid grid-cols-2 gap-2 content-start overflow-y-auto pr-0.5"
          style={{ height: "var(--dashboard-chart-h, 220px)" }}
        >
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
      </SectionCard>
    ),
    operations: (
      <SectionCard compact title="Operations">
        <div
          className="grid grid-cols-2 gap-2 content-start overflow-y-auto pr-0.5"
          style={{ height: "var(--dashboard-chart-h, 220px)" }}
        >
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
      </SectionCard>
    ),
    chart_contract_value: (
      <SectionCard
        compact
        title="Top contracts by value"
        actions={
          <Link href="/contracts" className="btn btn-primary btn-xs">
            View contracts
          </Link>
        }
      >
        {contractsByValue.length === 0 ? (
          <p className="text-sm opacity-60 py-8 text-center">No contracts to list yet.</p>
        ) : (
          <DashboardRankedList
            height={chartHeight}
            moreHref="/contracts"
            moreCount={chartMoreCount(
              contractsByValue.length,
              Math.min(contractsByValue.length, CHART_PREVIEW_ROWS)
            )}
            moreLabel="more in Contracts"
          >
            {takeChartPreview(contractsByValue, "preview").map(({ contract, metrics }, index) => (
              <li key={contract.id}>
                <Link
                  href={`/contracts/${contract.id}`}
                  className="flex items-center gap-3 py-2.5 hover:bg-base-200/60 px-1 rounded-lg transition-colors"
                >
                  <span className="text-xs tabular-nums opacity-50 w-4 shrink-0 text-right">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight text-sm truncate">
                      {contract.contract_name}
                    </p>
                    <span className={`badge badge-sm mt-1 ${statusBadgeClass(contract.status)}`}>
                      {labelize(contract.status)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">
                    {money(metrics.revisedValue)}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />
                </Link>
              </li>
            ))}
          </DashboardRankedList>
        )}
      </SectionCard>
    ),
    chart_billed_vs_collected: (
      <SectionCard
        compact
        title="Lowest collection rates"
        actions={
          <Link href="/invoices" className="btn btn-primary btn-xs">
            View invoices
          </Link>
        }
      >
        <ExpandableChart
          title="Collections by Project"
          previewHeight={chartHeight}
          heightBoost={28}
          moreCount={chartMoreCount(
            billedVsCollectedData.length,
            Math.min(billedVsCollectedData.length, CHART_PREVIEW_ROWS)
          )}
          hasData={chartHasValues(billedVsCollectedData, ["Collected", "Outstanding"])}
          empty={
            <p className="text-sm opacity-60 py-8 text-center">No billing activity to chart yet.</p>
          }
        >
          {(height, mode) => {
            const rows = takeChartPreview(billedVsCollectedData, mode);
            return (
              <ScrollableBarChart
                data={rows}
                panelHeight={height}
                stackKeys={["Collected", "Outstanding"]}
              >
                <Legend verticalAlign="top" height={28} />
                <Bar
                  dataKey="Collected"
                  stackId="billing"
                  fill={CHART_COLORS[3]}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Outstanding"
                  stackId="billing"
                  fill={CHART_COLORS[1]}
                  radius={[0, 5, 5, 0]}
                />
              </ScrollableBarChart>
            );
          }}
        </ExpandableChart>
      </SectionCard>
    ),
    chart_costs_by_category: (
      <SectionCard
        compact
        title="Costs by category"
        actions={
          <Link href="/costs" className="btn btn-primary btn-xs">
            View costs
          </Link>
        }
      >
        <ExpandableChart
          title="Costs by Category"
          previewHeight={chartHeight}
          hasData={costsByCategoryData.length > 0}
          empty={
            <p className="text-sm opacity-60 py-8 text-center">No cost entries recorded yet.</p>
          }
        >
          {(height, mode) => {
            const radius =
              mode === "full"
                ? Math.min(180, Math.round(height * 0.34))
                : Math.min(96, Math.round(height * 0.38));
            return (
              <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costsByCategoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={radius}
                      label={({ name, percent: p }) =>
                        `${name} ${((p ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {costsByCategoryData.map((entry, index) => (
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => money(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            );
          }}
        </ExpandableChart>
      </SectionCard>
    ),
    chart_change_order_value: (
      <SectionCard
        compact
        title="Jobs with approved COs"
        actions={
          <Link href="/change-orders" className="btn btn-primary btn-xs">
            View change orders
          </Link>
        }
      >
        <ExpandableChart
          title="Original vs Approved Change Orders"
          previewHeight={chartHeight}
          heightBoost={28}
          moreCount={chartMoreCount(
            changeOrderValueData.length,
            Math.min(changeOrderValueData.length, CHART_PREVIEW_ROWS)
          )}
          hasData={chartHasValues(changeOrderValueData, ["Original", "Approved COs"])}
          empty={
            <p className="text-sm opacity-60 py-8 text-center">
              No approved change order value yet.
            </p>
          }
        >
          {(height, mode) => {
            const rows = takeChartPreview(changeOrderValueData, mode);
            return (
              <ScrollableBarChart
                data={rows}
                panelHeight={height}
                stackKeys={["Original", "Approved COs"]}
              >
                <Legend verticalAlign="top" height={28} />
                <Bar
                  dataKey="Original"
                  stackId="contract"
                  fill={CHART_COLORS[0]}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Approved COs"
                  stackId="contract"
                  fill={CHART_COLORS[2]}
                  radius={[0, 5, 5, 0]}
                />
              </ScrollableBarChart>
            );
          }}
        </ExpandableChart>
      </SectionCard>
    ),
    chart_gross_profit: (
      <SectionCard
        compact
        title="Lowest gross profit"
        actions={
          <Link href="/finance" className="btn btn-primary btn-xs">
            View finance
          </Link>
        }
      >
        {contractsByGrossProfit.length === 0 ? (
          <p className="text-sm opacity-60 py-8 text-center">No gross profit data yet.</p>
        ) : (
          <DashboardRankedList
            height={chartHeight}
            moreHref="/finance"
            moreCount={chartMoreCount(
              contractsByGrossProfit.length,
              Math.min(contractsByGrossProfit.length, CHART_PREVIEW_ROWS)
            )}
            moreLabel="more in Finance"
          >
            {takeChartPreview(contractsByGrossProfit, "preview").map(
              ({ contract, metrics }, index) => {
                const loss = metrics.grossProfit < 0;
                return (
                  <li key={contract.id}>
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="flex items-center gap-3 py-2.5 hover:bg-base-200/60 px-1 rounded-lg transition-colors"
                    >
                      <span className="text-xs tabular-nums opacity-50 w-4 shrink-0 text-right">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-tight text-sm truncate">
                          {contract.contract_name}
                        </p>
                        <p className="text-xs opacity-60 mt-0.5">
                          Margin {percent(metrics.grossMargin)}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums shrink-0 ${
                          loss ? "text-error" : "text-success"
                        }`}
                      >
                        {money(metrics.grossProfit)}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />
                    </Link>
                  </li>
                );
              }
            )}
          </DashboardRankedList>
        )}
      </SectionCard>
    ),
    alerts: (
      <DashboardAlertsPreview
        role={role}
        invoices={invoices}
        fieldLogs={fieldLogs}
        changeOrders={changeOrders}
      />
    ),
  };

  return (
    <DashboardPaneGrid role={role} layout={layout} panes={panes} onCustomize={onCustomize} />
  );
}

function FieldSupervisorDashboard({
  contracts,
  fieldLogs,
  costEntries,
  invoices,
  changeOrders,
  userId,
  role,
  layout,
  onCustomize,
}: DashboardPaneProps & { userId?: string }) {
  const myFieldLogs = fieldLogs.filter((f) => !userId || f.user_id === userId).slice(0, 6);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const myCostsThisWeek = costEntries.filter(
    (c) => (!userId || c.user_id === userId) && c.date_incurred && new Date(c.date_incurred) >= weekAgo
  );
  const costsThisWeekTotal = myCostsThisWeek.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  const myLogCount = fieldLogs.filter((f) => !userId || f.user_id === userId).length;

  const panes: Record<string, ReactNode> = {
    kpi_stats: (
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
    ),
    assigned_projects: (
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
    ),
    recent_field_logs: (
      <SectionCard
        compact
        title="My Recent Field Logs"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-xs">
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
    ),
    alerts: (
      <DashboardAlertsPreview
        role={role}
        invoices={invoices}
        fieldLogs={fieldLogs}
        changeOrders={changeOrders}
      />
    ),
  };

  return (
    <DashboardPaneGrid role={role} layout={layout} panes={panes} onCustomize={onCustomize} />
  );
}

function SubcontractorDashboard({
  subcontractors,
  fieldLogs,
  costEntries,
  invoices,
  changeOrders,
  userId,
  role,
  layout,
  onCustomize,
}: DashboardPaneProps & { userId?: string }) {
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

  const panes: Record<string, ReactNode> = {
    kpi_stats: (
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
    ),
    open_bid_packages: (
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
    ),
    engagements: (
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
    ),
    recent_field_logs: (
      <SectionCard
        compact
        title="My Recent Field Logs"
        actions={
          <Link href="/field-logs" className="btn btn-primary btn-xs">
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
    ),
    alerts: (
      <DashboardAlertsPreview
        role={role}
        invoices={invoices}
        fieldLogs={fieldLogs}
        changeOrders={changeOrders}
      />
    ),
  };

  return (
    <DashboardPaneGrid role={role} layout={layout} panes={panes} onCustomize={onCustomize} />
  );
}

function ClientDashboard({
  contracts,
  changeOrders,
  invoices,
  costEntries,
  milestones,
  payments,
  fieldLogs,
  role,
  layout,
  onCustomize,
}: DashboardPaneProps) {
  const router = useRouter();
  const [messagingContractId, setMessagingContractId] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const approvedChangeOrders = changeOrders.filter((co) => co.status === "approved");
  const perContract = contracts.map((contract) => {
    const metrics = computeContractMetrics(
      contract,
      changeOrders,
      invoices,
      costEntries,
      milestones,
      payments
    );
    return {
      contract,
      metrics,
      schedule: computeScheduleStatus(contract, milestones),
    };
  });
  const totalValue = perContract.reduce((sum, { metrics }) => sum + metrics.revisedValue, 0);
  const totalInvoiced = perContract.reduce((sum, { metrics }) => sum + metrics.totalBilled, 0);
  const totalPaid = perContract.reduce((sum, { metrics }) => sum + metrics.totalCollected, 0);
  const totalOutstanding = perContract.reduce((sum, { metrics }) => sum + metrics.outstanding, 0);
  const behindCount = perContract.filter((row) => row.schedule.health === "behind").length;
  const onTrackCount = perContract.filter(
    (row) =>
      row.schedule.health === "on_schedule" ||
      row.schedule.health === "ahead" ||
      row.schedule.health === "completed"
  ).length;

  const messagePmAboutSchedule = async (contractId: string) => {
    setMessageError(null);
    setMessagingContractId(contractId);
    try {
      const threadId = await startOrGetThread(contractId);
      router.push(`/messages?thread=${encodeURIComponent(threadId)}`);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Could not open messages with your PM.");
    } finally {
      setMessagingContractId(null);
    }
  };

  const panes: Record<string, ReactNode> = {
    kpi_stats: (
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
    ),
    schedule_status: (
      <SectionCard
        compact
        title="Project schedule"
        actions={
          <span className="text-xs opacity-60">
            {onTrackCount} on track · {behindCount} behind
          </span>
        }
      >
        {messageError ? (
          <p className="text-xs text-error mb-2">{messageError}</p>
        ) : null}
        {perContract.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No projects linked to your account yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Due so far</th>
                  <th>Completed</th>
                  <th>Schedule</th>
                  <th>Details</th>
                  <th className="w-12 text-center">
                    <span className="sr-only">Message PM</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {perContract.map(({ contract, metrics, schedule }) => (
                  <tr key={contract.id} className="hover">
                    <td>
                      <Link href={`/contracts/${contract.id}`} className="link link-hover font-medium">
                        {contract.contract_name}
                      </Link>
                      <div className="text-[10px] opacity-55">
                        {contract.start_date ?? "—"} → {contract.end_date ?? "—"}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-sm ${statusBadgeClass(contract.status)}`}>
                        {labelize(contract.status)}
                      </span>
                    </td>
                    <td>{percent(schedule.plannedPercent)}</td>
                    <td>{percent(schedule.actualPercent)}</td>
                    <td>
                      <span className={`badge badge-sm ${scheduleBadgeClass(schedule.health)}`}>
                        {schedule.label}
                      </span>
                    </td>
                    <td className="text-sm">
                      {schedule.daysBehind > 0 ? (
                        <span className="text-error font-medium">
                          {schedule.daysBehind} day{schedule.daysBehind === 1 ? "" : "s"} behind
                          <span className="block text-xs font-normal opacity-80 mt-0.5">
                            {schedule.detail}
                          </span>
                        </span>
                      ) : (
                        <span className="opacity-60">{schedule.detail}</span>
                      )}
                    </td>
                    <td className="text-center">
                      {schedule.health === "behind" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs btn-square text-primary"
                          title={`Message PM about ${contract.contract_name}`}
                          aria-label={`Message project manager about ${contract.contract_name}`}
                          disabled={messagingContractId === contract.id}
                          onClick={() => void messagePmAboutSchedule(contract.id)}
                        >
                          {messagingContractId === contract.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <MessageCircle className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    ),
    my_projects: (
      <SectionCard compact title="My Projects">
        {contracts.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No projects linked to your account yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {perContract.map(({ contract, metrics, schedule }) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="card bg-base-200/60 border border-base-300 hover:border-primary transition-colors"
              >
                <div className="card-body p-3 gap-1.5">
                  <p className="font-medium truncate text-sm">{contract.contract_name}</p>
                  <div className="flex flex-wrap gap-1">
                    <span className={`badge badge-sm w-fit ${statusBadgeClass(contract.status)}`}>
                      {labelize(contract.status)}
                    </span>
                    <span className={`badge badge-sm w-fit ${scheduleBadgeClass(schedule.health)}`}>
                      {schedule.label}
                    </span>
                  </div>
                  {schedule.daysBehind > 0 ? (
                    <p className="text-xs text-error font-medium">
                      {schedule.daysBehind} day{schedule.daysBehind === 1 ? "" : "s"} behind
                    </p>
                  ) : null}
                  <p className="text-xs opacity-60">{schedule.detail}</p>
                  <div className="mt-0.5">
                    <div className="flex items-center justify-between text-xs opacity-70 mb-1">
                      <span>Milestones complete</span>
                      <span>{percent(schedule.actualPercent)}</span>
                    </div>
                    <progress
                      className="progress progress-primary w-full h-2"
                      value={Math.round(schedule.actualPercent * 100)}
                      max={100}
                    />
                    <div className="flex items-center justify-between text-[10px] opacity-50 mt-1">
                      <span>Due so far {percent(schedule.plannedPercent)}</span>
                      <span>
                        {contract.start_date ?? "—"} → {contract.end_date ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    ),
    approved_change_orders: (
      <SectionCard
        compact
        title="Approved Change Orders"
        actions={
          <Link href="/change-orders" className="btn btn-primary btn-xs">
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
    ),
    invoices: (
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
    ),
    alerts: (
      <DashboardAlertsPreview
        role={role}
        invoices={invoices}
        fieldLogs={fieldLogs}
        changeOrders={changeOrders}
      />
    ),
  };

  return (
    <DashboardPaneGrid role={role} layout={layout} panes={panes} onCustomize={onCustomize} />
  );
}
