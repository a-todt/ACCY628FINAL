"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleDollarSign, Download, FileDown, Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { AlertBanner, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { daysPastDue, labelize, money } from "@/lib/metrics";
import { canViewCosts, canViewInvoices, statusBadgeClass } from "@/lib/roles";

type Section = "costs" | "invoices";
type SortKey = "name" | "project" | "status" | "amount" | "date";

export default function FinanceOverviewPage() {
  const { effectiveRole } = useAuth();
  const { costEntries, invoices, payments, loading, error } = useContractData();

  const showCosts = canViewCosts(effectiveRole);
  const showInvoices = canViewInvoices(effectiveRole);

  const [search, setSearch] = useState("");
  const [section, setSection] = useState<Section | "all">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const costRows = useMemo(() => {
    if (!showCosts) return [];
    return costEntries.map((cost) => ({
      id: cost.id,
      section: "costs" as const,
      name: cost.description || labelize(cost.category),
      project: cost.contracts?.contract_name ?? "—",
      status: cost.category ?? "other",
      amount: Number(cost.amount ?? 0),
      date: cost.date_incurred ?? cost.created_at,
      href: "/costs",
      detail: labelize(cost.category),
    }));
  }, [costEntries, showCosts]);

  const invoiceRows = useMemo(() => {
    if (!showInvoices) return [];
    return invoices.map((invoice) => {
      const overdue =
        (invoice.status === "unpaid" || invoice.status === "partially_paid") &&
        daysPastDue(invoice.due_date) > 0;
      return {
        id: invoice.id,
        section: "invoices" as const,
        name: invoice.invoice_number || invoice.description || "Invoice",
        project: invoice.contracts?.contract_name ?? "—",
        status: overdue ? "overdue" : invoice.status,
        amount: Number(invoice.invoice_amount ?? 0),
        date: invoice.invoice_date ?? invoice.created_at,
        href: `/invoices/${invoice.id}`,
        detail: `Paid ${money(invoice.amount_paid)} · Due ${invoice.due_date ?? "—"}`,
      };
    });
  }, [invoices, showInvoices]);

  const allRows = useMemo(() => {
    const rows = [
      ...(section === "all" || section === "costs" ? costRows : []),
      ...(section === "all" || section === "invoices" ? invoiceRows : []),
    ];

    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter !== "all") {
        if (row.section !== "invoices" || row.status !== statusFilter) return false;
      }
      if (categoryFilter !== "all") {
        if (row.section !== "costs" || row.status !== categoryFilter) return false;
      }
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.project.toLowerCase().includes(q) ||
        row.detail.toLowerCase().includes(q) ||
        labelize(row.status).toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return compareValues(a.name, b.name, sortDir);
      if (sortKey === "project") return compareValues(a.project, b.project, sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      if (sortKey === "amount") return compareValues(a.amount, b.amount, sortDir);
      return compareValues(a.date, b.date, sortDir);
    });
  }, [costRows, invoiceRows, section, search, statusFilter, categoryFilter, sortKey, sortDir]);

  const totalCosts = costRows.reduce((sum, r) => sum + r.amount, 0);
  const totalBilled = invoiceRows.reduce((sum, r) => sum + r.amount, 0);
  const totalCollected = invoices.reduce((sum, i) => sum + Number(i.amount_paid ?? 0), 0);
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.payment_amount ?? 0), 0);
  const overdueCount = invoiceRows.filter((r) => r.status === "overdue").length;

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
    <div>
      <PageHeader
        title="Costing and Invoicing"
        subtitle="Summary of cost tracking and invoices — filter and sort across the category."
        actions={
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                downloadCsv(
                  "finance-overview.csv",
                  allRows.map((row) => ({
                    Section: row.section,
                    Name: row.name,
                    Project: row.project,
                    Status: labelize(row.status),
                    Detail: row.detail,
                    Amount: row.amount,
                    Date: row.date,
                  }))
                )
              }
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() =>
                downloadPdfTables("finance-overview.pdf", "General Contract Management — Finance Overview", [
                  {
                    title: "Summary",
                    columns: ["Metric", "Value"],
                    rows: [
                      ...(showCosts ? [["Total Costs", money(totalCosts)]] : []),
                      ...(showInvoices
                        ? [
                            ["Total Billed", money(totalBilled)],
                            ["Collected", money(Math.max(totalCollected, totalPayments))],
                            ["Overdue Invoices", String(overdueCount)],
                          ]
                        : []),
                    ],
                  },
                  {
                    title: "Filtered rows",
                    columns: ["Section", "Name", "Project", "Status", "Amount", "Date"],
                    rows: allRows.map((row) => [
                      row.section,
                      row.name,
                      row.project,
                      labelize(row.status),
                      money(row.amount),
                      row.date ?? "",
                    ]),
                  },
                ])
              }
            >
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {showCosts ? (
          <StatCard title="Total Costs" value={money(totalCosts)} hint={`${costEntries.length} entries`} icon={CircleDollarSign} />
        ) : null}
        {showInvoices ? (
          <StatCard title="Total Billed" value={money(totalBilled)} hint={`${invoices.length} invoices`} icon={Receipt} />
        ) : null}
        {showInvoices ? (
          <StatCard title="Collected" value={money(Math.max(totalCollected, totalPayments))} />
        ) : null}
        {showInvoices ? (
          <StatCard
            title="Overdue"
            value={String(overdueCount)}
            hint="Invoices past due"
            tone={overdueCount > 0 ? "warning" : "default"}
          />
        ) : (
          <StatCard title="Cost Entries" value={String(costEntries.length)} />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <SectionCard title="Quick links">
          <div className="flex flex-wrap gap-2">
            {showCosts ? (
              <Link href="/costs" className="btn btn-sm btn-outline">
                Cost Tracker
              </Link>
            ) : null}
            {showInvoices ? (
              <Link href="/invoices" className="btn btn-sm btn-outline">
                Invoices
              </Link>
            ) : null}
          </div>
        </SectionCard>
        {showCosts ? (
          <SectionCard title="Costs by category">
            <div className="flex flex-wrap gap-2">
              {["labor", "materials", "subcontractor", "equipment", "permits", "other"].map((cat) => {
                const total = costEntries
                  .filter((c) => (c.category ?? "other") === cat)
                  .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
                if (!total) return null;
                return (
                  <span key={cat} className="badge badge-ghost">
                    {labelize(cat)}: {money(total)}
                  </span>
                );
              })}
              {costEntries.length === 0 ? <p className="text-sm opacity-60">No costs yet.</p> : null}
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Billing note">
            <p className="text-sm opacity-70">Cost details are hidden for your role.</p>
          </SectionCard>
        )}
        {showInvoices ? (
          <SectionCard title="Invoice status mix">
            <div className="flex flex-wrap gap-2">
              {["unpaid", "partially_paid", "paid", "overdue"].map((status) => {
                const count = invoiceRows.filter((i) => i.status === status).length;
                if (!count) return null;
                return (
                  <span key={status} className={`badge ${statusBadgeClass(status)}`}>
                    {labelize(status)}: {count}
                  </span>
                );
              })}
              {invoiceRows.length === 0 ? <p className="text-sm opacity-60">No invoices yet.</p> : null}
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Invoicing">
            <p className="text-sm opacity-70">Invoice details are hidden for your role.</p>
          </SectionCard>
        )}
      </div>

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search costs and invoices…"
        sortOptions={[
          { value: "date", label: "Date" },
          { value: "name", label: "Name" },
          { value: "project", label: "Project" },
          { value: "status", label: "Status / Category" },
          { value: "amount", label: "Amount" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={allRows.length}
        filters={
          <>
            <label className="form-control w-full lg:w-44">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Section</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={section}
                onChange={(e) => setSection(e.target.value as Section | "all")}
              >
                <option value="all">All sections</option>
                {showCosts ? <option value="costs">Costs</option> : null}
                {showInvoices ? <option value="invoices">Invoices</option> : null}
              </select>
            </label>
            {showInvoices ? (
              <label className="form-control w-full lg:w-44">
                <span className="label py-1">
                  <span className="label-text text-xs opacity-70">Invoice status</span>
                </span>
                <select
                  className="select select-bordered select-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </label>
            ) : null}
            {showCosts ? (
              <label className="form-control w-full lg:w-44">
                <span className="label py-1">
                  <span className="label-text text-xs opacity-70">Cost category</span>
                </span>
                <select
                  className="select select-bordered select-sm"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  <option value="labor">Labor</option>
                  <option value="materials">Materials</option>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="equipment">Equipment</option>
                  <option value="permits">Permits</option>
                  <option value="other">Other</option>
                </select>
              </label>
            ) : null}
          </>
        }
      />

      {allRows.length === 0 ? (
        <EmptyState
          title="No matching records"
          message="Try adjusting your search or filters across Costing and Invoicing."
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table">
            <thead>
              <tr>
                <th className="hidden xl:table-cell">Section</th>
                <th>Name</th>
                <th>Project</th>
                <th>Status / Category</th>
                <th className="hidden xl:table-cell">Detail</th>
                <th className="text-right">Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row) => (
                <tr key={`${row.section}-${row.id}`} className="hover:bg-base-200/60">
                  <td className="hidden xl:table-cell">
                    <span className="badge badge-ghost badge-sm">
                      {row.section === "costs" ? "Cost" : "Invoice"}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={row.href}
                      className="link link-primary font-medium"
                      title={`${row.section === "costs" ? "Cost" : "Invoice"} · ${row.detail}`}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td>{row.project}</td>
                  <td>
                    {row.section === "invoices" ? (
                      <span className={`badge badge-sm ${statusBadgeClass(row.status)}`}>
                        {labelize(row.status)}
                      </span>
                    ) : (
                      <span className="badge badge-ghost badge-sm">{labelize(row.status)}</span>
                    )}
                  </td>
                  <td className="max-w-[260px] truncate hidden xl:table-cell">{row.detail}</td>
                  <td className="text-right">{money(row.amount)}</td>
                  <td className="whitespace-nowrap">{row.date ? String(row.date).slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
