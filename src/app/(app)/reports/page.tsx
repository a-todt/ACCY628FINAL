"use client";

import { useMemo, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useReportsLayout } from "@/hooks/useReportsLayout";
import { ProjectPeriodReportsSection } from "@/components/ProjectPeriodReportsSection";
import { ContractProfitabilitySection } from "@/components/ContractProfitabilitySection";
import { CostByCategorySection } from "@/components/CostByCategorySection";
import {
  AR_AGING_BUCKETS,
  ArAgingSection,
  type ArAgingBucket,
} from "@/components/ArAgingSection";
import { RetainageSummarySection } from "@/components/RetainageSummarySection";
import { ChangeOrderSummarySection } from "@/components/ChangeOrderSummarySection";
import {
  buildCashCollectionRows,
  CashCollectionsSection,
} from "@/components/CashCollectionsSection";
import { CollectionRatesSection } from "@/components/CollectionRatesSection";
import { DashboardCustomizeModal } from "@/components/DashboardCustomizeModal";
import { DashboardPaneGrid } from "@/components/DashboardPaneGrid";
import { AlertBanner, PageHeader } from "@/components/ui";
import { computeContractMetrics, daysPastDue, invoiceRetainageReceivable, labelize } from "@/lib/metrics";
import { isApprovedCost, isApprovedInvoice, isPostedPayment } from "@/lib/payments";
import { canViewReports } from "@/lib/roles";
import { defaultReportsLayout, paneShowsGraphs, paneShowsNumbers, REPORTS_PANES } from "@/lib/reportsLayout";
import {
  dateInReportsRange,
  REPORTS_MONTH_OPTIONS,
  REPORTS_QUARTER_OPTIONS,
  reportsDateRange,
  type ReportsTimeGrain,
} from "@/lib/reportsTimeFilter";

function agingBucket(days: number): ArAgingBucket {
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return "90+ Days";
}

function collectYears(...dateLists: Array<Array<string | null | undefined>>): number[] {
  const years = new Set<number>();
  years.add(new Date().getFullYear());
  for (const list of dateLists) {
    for (const raw of list) {
      if (!raw) continue;
      const y = Number(String(raw).slice(0, 4));
      if (Number.isFinite(y) && y >= 2000 && y <= 2100) years.add(y);
    }
  }
  return Array.from(years).sort((a, b) => b - a);
}

export default function ReportsPage() {
  const { effectiveRole } = useAuth();
  const {
    layout,
    setLayout,
    setShowSummaryNumbers,
    setShowGraphs,
    setPaneNumbers,
    setPaneGraphs,
    setTimeFilter,
  } = useReportsLayout();
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const {
    contracts,
    changeOrders,
    subcontractors,
    costEntries,
    invoices,
    payments,
    milestones,
    loading,
    error,
  } = useContractData();

  const timeFilter = layout.timeFilter;
  const dateRange = useMemo(() => reportsDateRange(timeFilter), [timeFilter]);

  const yearOptions = useMemo(() => {
    const years = collectYears(
      invoices.map((i) => i.invoice_date),
      costEntries.map((c) => c.date_incurred),
      payments.map((p) => p.payment_date),
      changeOrders.map((c) => c.date_submitted ?? c.date_resolved)
    );
    if (!years.includes(timeFilter.year)) years.push(timeFilter.year);
    return years.sort((a, b) => b - a);
  }, [invoices, costEntries, payments, changeOrders, timeFilter.year]);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter(
        (i) => isApprovedInvoice(i) && dateInReportsRange(i.invoice_date, dateRange)
      ),
    [invoices, dateRange]
  );
  const filteredCosts = useMemo(
    () =>
      costEntries.filter(
        (c) => isApprovedCost(c) && dateInReportsRange(c.date_incurred, dateRange)
      ),
    [costEntries, dateRange]
  );
  const filteredPayments = useMemo(
    () => {
      const approvedInvoiceIds = new Set(
        invoices.filter(isApprovedInvoice).map((i) => i.id)
      );
      return payments.filter(
        (p) =>
          isPostedPayment(p) &&
          approvedInvoiceIds.has(p.invoice_id) &&
          dateInReportsRange(p.payment_date, dateRange)
      );
    },
    [payments, invoices, dateRange]
  );
  const filteredChangeOrders = useMemo(
    () =>
      changeOrders.filter((co) =>
        dateInReportsRange(co.date_submitted ?? co.date_resolved ?? co.created_at, dateRange)
      ),
    [changeOrders, dateRange]
  );

  const profitability = useMemo(
    () =>
      contracts.map((contract) => ({
        contract,
        metrics: computeContractMetrics(
          contract,
          filteredChangeOrders,
          filteredInvoices,
          filteredCosts,
          milestones,
          filteredPayments
        ),
      })),
    [contracts, filteredChangeOrders, filteredInvoices, filteredCosts, milestones, filteredPayments]
  );

  const arAging = useMemo(() => {
    const rows = filteredInvoices
      .map((invoice) => {
        const outstanding =
          Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0) -
          Number(invoice.amount_paid ?? 0);
        const days = daysPastDue(invoice.due_date);
        return { invoice, outstanding, days, bucket: agingBucket(days) };
      })
      .filter((row) => row.outstanding > 0.01);

    const totals = AR_AGING_BUCKETS.reduce<Record<string, number>>((acc, bucket) => {
      acc[bucket] = 0;
      return acc;
    }, {});
    for (const row of rows) totals[row.bucket] += row.outstanding;

    return { rows, totals };
  }, [filteredInvoices]);

  const costsByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cost of filteredCosts) {
      const key = cost.category ?? "other";
      totals.set(key, (totals.get(key) ?? 0) + Number(cost.amount ?? 0));
    }
    return Array.from(totals.entries())
      .map(([category, total]) => ({ name: labelize(category), total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredCosts]);

  const retainageSummary = useMemo(
    () =>
      contracts.map((contract) => {
        const contractInvoices = filteredInvoices.filter((i) => i.contract_id === contract.id);
        const invoiceRetainage = contractInvoices.reduce(
          (sum, i) => sum + invoiceRetainageReceivable(i),
          0
        );
        const contractSubs = subcontractors.filter((s) => s.contract_id === contract.id);
        const hasPeriodActivity = contractInvoices.length > 0;
        const subRetainage =
          !dateRange || hasPeriodActivity
            ? contractSubs.reduce(
                (sum, s) =>
                  sum +
                  Number(s.subcontract_value ?? 0) * (Number(s.retainage_percent ?? 0) / 100),
                0
              )
            : 0;
        return { contract, invoiceRetainage, subRetainage };
      }),
    [contracts, filteredInvoices, subcontractors, dateRange]
  );

  const changeOrderSummary = useMemo(() => {
    const statuses: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];
    const overall = statuses.map((status) => {
      const rows = filteredChangeOrders.filter((co) => co.status === status);
      return {
        status,
        count: rows.length,
        total: rows.reduce((sum, co) => sum + Number(co.amount ?? 0), 0),
      };
    });
    const byContract = contracts.map((contract) => {
      const rows = filteredChangeOrders.filter((co) => co.contract_id === contract.id);
      return {
        contract,
        pending: rows.filter((co) => co.status === "pending").length,
        approved: rows
          .filter((co) => co.status === "approved")
          .reduce((sum, co) => sum + Number(co.amount ?? 0), 0),
        rejected: rows.filter((co) => co.status === "rejected").length,
      };
    });
    return { overall, byContract };
  }, [filteredChangeOrders, contracts]);

  const cashCollections = useMemo(() => {
    const invoiceLookup = new Map(
      invoices.map((invoice) => [
        invoice.id,
        { invoice_number: invoice.invoice_number, contract_id: invoice.contract_id },
      ])
    );
    return buildCashCollectionRows(filteredPayments, contracts, invoiceLookup);
  }, [filteredPayments, contracts, invoices]);

  const collectionRates = useMemo(
    () =>
      profitability.map(({ contract, metrics }) => ({
        contract,
        metrics,
        collectionRate:
          metrics.totalBilled > 0 ? metrics.totalCollected / metrics.totalBilled : 0,
      })),
    [profitability]
  );

  if (!canViewReports(effectiveRole)) {
    return (
      <div>
        <PageHeader title="Reports" />
        <AlertBanner type="error">
          Access denied. Reports are only available to admins and project managers.
        </AlertBanner>
      </div>
    );
  }

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

  const showNumbers = layout.showSummaryNumbers;
  const showGraphs = layout.showGraphs;
  const selectClass = "select select-bordered select-sm min-h-8 h-8";

  function paneDisplay(paneId: string) {
    return {
      showNumbers: paneShowsNumbers(layout, paneId),
      showGraphs: paneShowsGraphs(layout, paneId),
      onShowNumbersChange: (next: boolean) => setPaneNumbers(paneId, next),
      onShowGraphsChange: (next: boolean) => setPaneGraphs(paneId, next),
    };
  }

  return (
    <div className="-my-2 md:-my-4 space-y-1.5">
      <PageHeader compact title="Reports" />

      <div className="flex flex-wrap items-end gap-2 rounded-box border border-base-300 bg-base-100 px-2.5 py-2">
        <label className="flex min-w-[7.5rem] flex-col gap-0.5">
          <span className="text-xs font-medium opacity-70">Period</span>
          <select
            className={selectClass}
            value={timeFilter.grain}
            onChange={(e) =>
              setTimeFilter((prev) => ({
                ...prev,
                grain: e.target.value as ReportsTimeGrain,
              }))
            }
          >
            <option value="all">All time</option>
            <option value="year">Year</option>
            <option value="quarter">Quarter</option>
            <option value="month">Month</option>
          </select>
        </label>

        {timeFilter.grain !== "all" ? (
          <label className="flex min-w-[6rem] flex-col gap-0.5">
            <span className="text-xs font-medium opacity-70">Year</span>
            <select
              className={selectClass}
              value={timeFilter.year}
              onChange={(e) =>
                setTimeFilter((prev) => ({ ...prev, year: Number(e.target.value) }))
              }
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {timeFilter.grain === "quarter" ? (
          <label className="flex min-w-[9rem] flex-col gap-0.5">
            <span className="text-xs font-medium opacity-70">Quarter</span>
            <select
              className={selectClass}
              value={timeFilter.quarter}
              onChange={(e) =>
                setTimeFilter((prev) => ({
                  ...prev,
                  quarter: Number(e.target.value) as 1 | 2 | 3 | 4,
                }))
              }
            >
              {REPORTS_QUARTER_OPTIONS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {timeFilter.grain === "month" ? (
          <label className="flex min-w-[8rem] flex-col gap-0.5">
            <span className="text-xs font-medium opacity-70">Month</span>
            <select
              className={selectClass}
              value={timeFilter.month}
              onChange={(e) =>
                setTimeFilter((prev) => ({ ...prev, month: Number(e.target.value) }))
              }
            >
              {REPORTS_MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 ml-auto pb-0.5">
          <label className="btn btn-ghost btn-sm gap-1.5">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={showNumbers}
              onChange={(e) => setShowSummaryNumbers(e.target.checked)}
            />
            Show numbers
          </label>
          <label className="btn btn-ghost btn-sm gap-1.5">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={showGraphs}
              onChange={(e) => setShowGraphs(e.target.checked)}
            />
            Show graphs
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={() => setCustomizeOpen(true)}
          >
            <LayoutDashboard className="h-4 w-4" />
            Customize
          </button>
        </div>
      </div>

      <DashboardPaneGrid
        layout={layout}
        catalog={REPORTS_PANES}
        stackPanes={false}
        columns={2}
        onCustomize={() => setCustomizeOpen(true)}
        emptyTitle="No report panes"
        emptyMessage="Turn on one or more panes in Customize to build your reports view."
        customizeLabel="Customize reports"
        panes={{
          period_reports: (
            <ProjectPeriodReportsSection
              contracts={contracts}
              costEntries={filteredCosts}
              invoices={filteredInvoices}
              payments={filteredPayments}
              changeOrders={filteredChangeOrders}
              showSummaryNumbers={paneShowsNumbers(layout, "period_reports")}
              showGraphs={paneShowsGraphs(layout, "period_reports")}
              displayControls={paneDisplay("period_reports")}
              timeFilter={timeFilter}
            />
          ),
          profitability: (
            <ContractProfitabilitySection
              rows={profitability}
              showSummaryNumbers={paneShowsNumbers(layout, "profitability")}
              showGraphs={paneShowsGraphs(layout, "profitability")}
              displayControls={paneDisplay("profitability")}
            />
          ),
          ar_aging: (
            <ArAgingSection
              rows={arAging.rows}
              totals={arAging.totals}
              showSummaryNumbers={paneShowsNumbers(layout, "ar_aging")}
              showGraphs={paneShowsGraphs(layout, "ar_aging")}
              displayControls={paneDisplay("ar_aging")}
            />
          ),
          cash_collections: (
            <CashCollectionsSection
              rows={cashCollections}
              showSummaryNumbers={paneShowsNumbers(layout, "cash_collections")}
              showGraphs={paneShowsGraphs(layout, "cash_collections")}
              displayControls={paneDisplay("cash_collections")}
            />
          ),
          collection_rates: (
            <CollectionRatesSection
              rows={collectionRates}
              showSummaryNumbers={paneShowsNumbers(layout, "collection_rates")}
              showGraphs={paneShowsGraphs(layout, "collection_rates")}
              displayControls={paneDisplay("collection_rates")}
            />
          ),
          costs_by_category: (
            <CostByCategorySection
              rows={costsByCategory}
              showSummaryNumbers={paneShowsNumbers(layout, "costs_by_category")}
              showGraphs={paneShowsGraphs(layout, "costs_by_category")}
              displayControls={paneDisplay("costs_by_category")}
            />
          ),
          retainage: (
            <RetainageSummarySection
              rows={retainageSummary}
              showSummaryNumbers={paneShowsNumbers(layout, "retainage")}
              showGraphs={paneShowsGraphs(layout, "retainage")}
              displayControls={paneDisplay("retainage")}
            />
          ),
          change_orders: (
            <ChangeOrderSummarySection
              overall={changeOrderSummary.overall}
              byContract={changeOrderSummary.byContract}
              showSummaryNumbers={paneShowsNumbers(layout, "change_orders")}
              showGraphs={paneShowsGraphs(layout, "change_orders")}
              displayControls={paneDisplay("change_orders")}
            />
          ),
        }}
      />

      <DashboardCustomizeModal
        open={customizeOpen}
        layout={layout}
        catalog={REPORTS_PANES}
        defaultLayout={defaultReportsLayout}
        title="Customize reports"
        previewLabel="Reports preview"
        unusedEmptyLabel="All panes are on the reports page."
        columns={2}
        onClose={() => setCustomizeOpen(false)}
        onSave={setLayout}
      />
    </div>
  );
}
