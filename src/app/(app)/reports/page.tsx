"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
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
import { AlertBanner, PageHeader } from "@/components/ui";
import { computeContractMetrics, daysPastDue, invoiceRetainageReceivable, labelize } from "@/lib/metrics";
import { canViewReports } from "@/lib/roles";

function agingBucket(days: number): ArAgingBucket {
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return "90+ Days";
}

export default function ReportsPage() {
  const { effectiveRole } = useAuth();

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

  const profitability = useMemo(
    () =>
      contracts.map((contract) => ({
        contract,
        metrics: computeContractMetrics(
          contract,
          changeOrders,
          invoices,
          costEntries,
          milestones,
          payments
        ),
      })),
    [contracts, changeOrders, invoices, costEntries, milestones, payments]
  );

  const arAging = useMemo(() => {
    const rows = invoices
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
  }, [invoices]);

  const costsByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cost of costEntries) {
      const key = cost.category ?? "other";
      totals.set(key, (totals.get(key) ?? 0) + Number(cost.amount ?? 0));
    }
    return Array.from(totals.entries())
      .map(([category, total]) => ({ name: labelize(category), total }))
      .sort((a, b) => b.total - a.total);
  }, [costEntries]);

  const retainageSummary = useMemo(
    () =>
      contracts.map((contract) => {
        const contractInvoices = invoices.filter((i) => i.contract_id === contract.id);
        const invoiceRetainage = contractInvoices.reduce(
          (sum, i) => sum + invoiceRetainageReceivable(i),
          0
        );
        const contractSubs = subcontractors.filter((s) => s.contract_id === contract.id);
        const subRetainage = contractSubs.reduce(
          (sum, s) =>
            sum + Number(s.subcontract_value ?? 0) * (Number(s.retainage_percent ?? 0) / 100),
          0
        );
        return { contract, invoiceRetainage, subRetainage };
      }),
    [contracts, invoices, subcontractors]
  );

  const changeOrderSummary = useMemo(() => {
    const statuses: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];
    const overall = statuses.map((status) => {
      const rows = changeOrders.filter((co) => co.status === status);
      return {
        status,
        count: rows.length,
        total: rows.reduce((sum, co) => sum + Number(co.amount ?? 0), 0),
      };
    });
    const byContract = contracts.map((contract) => {
      const rows = changeOrders.filter((co) => co.contract_id === contract.id);
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
  }, [changeOrders, contracts]);

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

  return (
    <div className="-my-2 md:-my-4 grid grid-cols-1 md:grid-cols-2 gap-1.5 items-start content-start">
      <ProjectPeriodReportsSection
        contracts={contracts}
        costEntries={costEntries}
        invoices={invoices}
        payments={payments}
        changeOrders={changeOrders}
      />

      <ContractProfitabilitySection rows={profitability} />

      <ArAgingSection rows={arAging.rows} totals={arAging.totals} />

      <CostByCategorySection rows={costsByCategory} />

      <RetainageSummarySection rows={retainageSummary} />

      <ChangeOrderSummarySection
        overall={changeOrderSummary.overall}
        byContract={changeOrderSummary.byContract}
        changeOrders={changeOrders}
      />
    </div>
  );
}
