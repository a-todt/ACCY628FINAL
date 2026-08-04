"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { AlertBanner, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { computeContractMetrics, daysPastDue, labelize, money, percent } from "@/lib/metrics";
import { canViewReports } from "@/lib/roles";

const AGING_BUCKETS = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days"] as const;

function agingBucket(days: number): (typeof AGING_BUCKETS)[number] {
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
        metrics: computeContractMetrics(contract, changeOrders, invoices, costEntries, milestones, payments),
      })),
    [contracts, changeOrders, invoices, costEntries, milestones, payments]
  );

  const arAging = useMemo(() => {
    const rows = invoices
      .map((invoice) => {
        const outstanding = Number(invoice.net_amount_due ?? invoice.invoice_amount ?? 0) - Number(invoice.amount_paid ?? 0);
        const days = daysPastDue(invoice.due_date);
        return { invoice, outstanding, days, bucket: agingBucket(days) };
      })
      .filter((row) => row.outstanding > 0.01);

    const totals = AGING_BUCKETS.reduce<Record<string, number>>((acc, bucket) => {
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
        const invoiceRetainage = contractInvoices.reduce((sum, i) => sum + Number(i.retainage_amount ?? 0), 0);
        const contractSubs = subcontractors.filter((s) => s.contract_id === contract.id);
        const subRetainage = contractSubs.reduce(
          (sum, s) => sum + Number(s.subcontract_value ?? 0) * (Number(s.retainage_percent ?? 0) / 100),
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
      return { status, count: rows.length, total: rows.reduce((sum, co) => sum + Number(co.amount ?? 0), 0) };
    });
    const byContract = contracts.map((contract) => {
      const rows = changeOrders.filter((co) => co.contract_id === contract.id);
      return {
        contract,
        pending: rows.filter((co) => co.status === "pending").length,
        approved: rows.filter((co) => co.status === "approved").reduce((sum, co) => sum + Number(co.amount ?? 0), 0),
        rejected: rows.filter((co) => co.status === "rejected").length,
      };
    });
    return { overall, byContract };
  }, [changeOrders, contracts]);

  if (!canViewReports(effectiveRole)) {
    return (
      <div>
        <PageHeader title="Reports" />
        <AlertBanner type="error">Access denied. Reports are only available to admins and project managers.</AlertBanner>
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

  const totalOutstanding = AGING_BUCKETS.reduce((sum, bucket) => sum + arAging.totals[bucket], 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Portfolio-wide financial and operational insights." />

      <SectionCard title="Contract Profitability">
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Contract</th>
                <th className="text-right">Revised Value</th>
                <th className="text-right">Billed</th>
                <th className="text-right">Collected</th>
                <th className="text-right">Costs</th>
                <th className="text-right">Gross Profit</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {profitability.map(({ contract, metrics }) => (
                <tr key={contract.id}>
                  <td>{contract.contract_name}</td>
                  <td className="text-right">{money(metrics.revisedValue)}</td>
                  <td className="text-right">{money(metrics.totalBilled)}</td>
                  <td className="text-right">{money(metrics.totalCollected)}</td>
                  <td className="text-right">{money(metrics.totalCosts)}</td>
                  <td className={`text-right ${metrics.grossProfit < 0 ? "text-error" : ""}`}>
                    {money(metrics.grossProfit)}
                  </td>
                  <td className="text-right">{percent(metrics.grossMargin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="AR Aging">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {AGING_BUCKETS.map((bucket) => (
            <StatCard
              key={bucket}
              title={bucket}
              value={money(arAging.totals[bucket])}
              tone={bucket !== "Current" && arAging.totals[bucket] > 0 ? "warning" : "default"}
            />
          ))}
        </div>
        {arAging.rows.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No outstanding invoice balances.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Project</th>
                  <th>Due Date</th>
                  <th>Bucket</th>
                  <th className="text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {arAging.rows.map(({ invoice, outstanding, bucket }) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoice_number ?? "—"}</td>
                    <td>{invoice.contracts?.contract_name ?? "—"}</td>
                    <td className="whitespace-nowrap">{invoice.due_date ?? "—"}</td>
                    <td>{bucket}</td>
                    <td className="text-right">{money(outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={4}>Total Outstanding</td>
                  <td className="text-right">{money(totalOutstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Cost by Category">
        {costsByCategory.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No cost entries recorded yet.</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {costsByCategory.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="text-right">{money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costsByCategory} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(Number(v))} width={80} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Retainage Summary">
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Contract</th>
                <th className="text-right">Invoice Retainage Held</th>
                <th className="text-right">Subcontractor Retainage Est.</th>
              </tr>
            </thead>
            <tbody>
              {retainageSummary.map((row) => (
                <tr key={row.contract.id}>
                  <td>{row.contract.contract_name}</td>
                  <td className="text-right">{money(row.invoiceRetainage)}</td>
                  <td className="text-right">{money(row.subRetainage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Change Order Summary">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {changeOrderSummary.overall.map((row) => (
            <StatCard
              key={row.status}
              title={labelize(row.status)}
              value={String(row.count)}
              hint={row.status === "approved" ? money(row.total) : undefined}
            />
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Contract</th>
                <th className="text-right">Pending</th>
                <th className="text-right">Approved Value</th>
                <th className="text-right">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {changeOrderSummary.byContract.map((row) => (
                <tr key={row.contract.id}>
                  <td>{row.contract.contract_name}</td>
                  <td className="text-right">{row.pending}</td>
                  <td className="text-right">{money(row.approved)}</td>
                  <td className="text-right">{row.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
