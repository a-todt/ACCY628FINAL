"use client";

import { Fragment, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Bar,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { FilterSortBar, compareValues, type SortDir } from "@/components/FilterSortBar";
import { ScrollableBarChart, toNamedBarRows } from "@/components/ScrollableBarChart";
import { AlertBanner, EmptyState, FormField, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { CHART_COLORS, CHART_SERIES } from "@/lib/chartColors";
import { labelize, money } from "@/lib/metrics";
import { canEnterCosts, canViewCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { CostCategory, CostEntry } from "@/lib/types";

const CATEGORIES: CostCategory[] = ["labor", "materials", "subcontractor", "equipment", "permits", "other"];

const EMPTY_FORM = {
  contract_id: "",
  category: "labor" as CostCategory,
  description: "",
  amount: "",
  date_incurred: "",
  notes: "",
};

type ViewMode = "by_job" | "by_category" | "matrix" | "entries";
type SortKey = "date" | "category" | "contract" | "amount";

function costMatchesFilters(
  cost: CostEntry,
  search: string,
  categoryFilter: string,
  jobFilter: string
): boolean {
  if (categoryFilter !== "all" && cost.category !== categoryFilter) return false;
  if (jobFilter !== "all" && cost.contract_id !== jobFilter) return false;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [cost.description, cost.contracts?.contract_name, cost.category ? labelize(cost.category) : null, cost.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function CostsPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, costEntries, userProfiles, loading, error, refresh } = useContractData();

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("by_job");
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const canEnter = canEnterCosts(effectiveRole);

  const scopedEntries = useMemo(
    () => costEntries.filter((cost) => costMatchesFilters(cost, search, categoryFilter, jobFilter)),
    [costEntries, search, categoryFilter, jobFilter]
  );

  const filtered = useMemo(() => {
    return [...scopedEntries].sort((a, b) => {
      if (sortKey === "date") return compareValues(a.date_incurred, b.date_incurred, sortDir);
      if (sortKey === "category") return compareValues(a.category, b.category, sortDir);
      if (sortKey === "contract") return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      return compareValues(Number(a.amount ?? 0), Number(b.amount ?? 0), sortDir);
    });
  }, [scopedEntries, sortKey, sortDir]);

  const grandTotal = scopedEntries.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  const byJob = useMemo(() => {
    const map = new Map<
      string,
      {
        contractId: string;
        name: string;
        total: number;
        entryCount: number;
        byCategory: Map<CostCategory, number>;
        entries: CostEntry[];
      }
    >();

    for (const cost of scopedEntries) {
      const key = cost.contract_id;
      const name = cost.contracts?.contract_name ?? "Unknown job";
      const amount = Number(cost.amount ?? 0);
      const category = (cost.category ?? "other") as CostCategory;
      let row = map.get(key);
      if (!row) {
        row = {
          contractId: key,
          name,
          total: 0,
          entryCount: 0,
          byCategory: new Map(),
          entries: [],
        };
        map.set(key, row);
      }
      row.total += amount;
      row.entryCount += 1;
      row.byCategory.set(category, (row.byCategory.get(category) ?? 0) + amount);
      row.entries.push(cost);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [scopedEntries]);

  const byCategory = useMemo(() => {
    const map = new Map<
      string,
      {
        category: CostCategory;
        total: number;
        entryCount: number;
        byJob: Map<string, { contractId: string; name: string; total: number }>;
        entries: CostEntry[];
      }
    >();

    for (const cost of scopedEntries) {
      const category = (cost.category ?? "other") as CostCategory;
      const amount = Number(cost.amount ?? 0);
      let row = map.get(category);
      if (!row) {
        row = {
          category,
          total: 0,
          entryCount: 0,
          byJob: new Map(),
          entries: [],
        };
        map.set(category, row);
      }
      row.total += amount;
      row.entryCount += 1;
      row.entries.push(cost);

      const jobKey = cost.contract_id;
      const jobName = cost.contracts?.contract_name ?? "Unknown job";
      const jobRow = row.byJob.get(jobKey);
      if (jobRow) jobRow.total += amount;
      else row.byJob.set(jobKey, { contractId: jobKey, name: jobName, total: amount });
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [scopedEntries]);

  const matrixRows = useMemo(() => {
    return byJob.map((job) => {
      const cells = Object.fromEntries(
        CATEGORIES.map((category) => [category, job.byCategory.get(category) ?? 0])
      ) as Record<CostCategory, number>;
      return { ...job, cells };
    });
  }, [byJob]);

  const categoryChartData = byCategory.map((row) => ({
    name: labelize(row.category),
    total: row.total,
  }));

  const jobChartData = toNamedBarRows(
    byJob.map((row) => ({
      fullName: row.name,
      values: { total: row.total },
    }))
  );

  const toggleJob = (id: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const updateField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!form.contract_id || !form.amount) {
      setFormError("Contract and amount are required.");
      return;
    }
    if (!user) {
      setFormError("You must be signed in to log a cost.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("cost_entries").insert({
        contract_id: form.contract_id,
        user_id: user.id,
        category: form.category,
        description: form.description.trim() || null,
        amount: Number(form.amount),
        date_incurred: form.date_incurred || null,
        notes: form.notes.trim() || null,
      });
      if (insertError) throw insertError;

      setSuccess("Cost entry recorded successfully.");
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save cost entry.");
    } finally {
      setSaving(false);
    }
  };

  if (!canViewCosts(effectiveRole)) {
    return (
      <div>
        <PageHeader title="Cost Tracker" />
        <AlertBanner type="error">Access denied. Cost data is not available for the client role.</AlertBanner>
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
    <div className="space-y-6">
      <PageHeader
        title="Cost Tracker"
        subtitle="Track job costs by project and by category."
        actions={
          canEnter ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Log Cost"}
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Costs" value={money(grandTotal)} hint={`${scopedEntries.length} entries`} />
        <StatCard title="Jobs with Costs" value={String(byJob.length)} />
        <StatCard title="Categories Used" value={String(byCategory.length)} />
        <StatCard
          title="Avg Cost / Job"
          value={byJob.length > 0 ? money(grandTotal / byJob.length) : money(0)}
        />
      </div>

      <div role="tablist" className="tabs tabs-boxed bg-base-100 border border-base-300 w-fit flex-wrap">
        {(
          [
            ["by_job", "By Job"],
            ["by_category", "By Category"],
            ["matrix", "Job × Category"],
            ["entries", "All Entries"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="tab"
            className={`tab ${viewMode === mode ? "tab-active" : ""}`}
            onClick={() => setViewMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      <FilterSortBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search description, project, category…"
        sortOptions={[
          { value: "date", label: "Date" },
          { value: "category", label: "Category" },
          { value: "contract", label: "Project" },
          { value: "amount", label: "Amount" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKeyChange={(v) => setSortKey(v as SortKey)}
        onSortDirChange={setSortDir}
        resultCount={scopedEntries.length}
        filters={
          <>
            <label className="form-control w-full lg:w-52">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Job</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
              >
                <option value="all">All jobs</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contract_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control w-full lg:w-44">
              <span className="label py-1">
                <span className="label-text text-xs opacity-70">Category</span>
              </span>
              <select
                className="select select-bordered select-sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelize(category)}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      {canEnter && showForm ? (
        <SectionCard title="New Cost Entry">
          {formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}
          {success ? <AlertBanner type="success">{success}</AlertBanner> : null}
          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            <FormField label="Contract">
              <select
                className="select select-bordered"
                value={form.contract_id}
                onChange={(e) => updateField("contract_id", e.target.value)}
                required
              >
                <option value="">Select a contract…</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contract_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Category">
              <select
                className="select select-bordered"
                value={form.category}
                onChange={(e) => updateField("category", e.target.value as CostCategory)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelize(category)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Description">
              <input
                className="input input-bordered"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </FormField>
            <FormField label="Amount">
              <label className="input input-bordered flex items-center gap-2">
                $
                <input
                  type="number"
                  step="0.01"
                  className="grow"
                  value={form.amount}
                  onChange={(e) => updateField("amount", e.target.value)}
                  required
                />
              </label>
            </FormField>
            <FormField label="Date Incurred">
              <input
                type="date"
                className="input input-bordered"
                value={form.date_incurred}
                onChange={(e) => updateField("date_incurred", e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                Save Cost Entry
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {scopedEntries.length === 0 ? (
        <EmptyState
          title={costEntries.length === 0 ? "No cost entries" : "No matching costs"}
          message={
            costEntries.length === 0
              ? "Log your first cost entry to start tracking job costs by project and category."
              : "Try adjusting your search or filters."
          }
        />
      ) : null}

      {scopedEntries.length > 0 && viewMode === "by_job" ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title={`Costs by Job (${byJob.length})`}>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-8" />
                    <th>Job</th>
                    <th className="text-right">Entries</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byJob.map((job) => {
                    const open = expandedJobs.has(job.contractId);
                    const categoryRows = Array.from(job.byCategory.entries()).sort((a, b) => b[1] - a[1]);
                    return (
                      <Fragment key={job.contractId}>
                        <tr className="hover cursor-pointer" onClick={() => toggleJob(job.contractId)}>
                          <td>
                            {open ? (
                              <ChevronDown className="h-4 w-4 opacity-60" />
                            ) : (
                              <ChevronRight className="h-4 w-4 opacity-60" />
                            )}
                          </td>
                          <td>
                            <Link
                              href={`/contracts/${job.contractId}`}
                              className="link link-primary font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {job.name}
                            </Link>
                          </td>
                          <td className="text-right">{job.entryCount}</td>
                          <td className="text-right font-medium">{money(job.total)}</td>
                          <td className="text-right">
                            {grandTotal > 0 ? `${((job.total / grandTotal) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                        {open
                          ? categoryRows.map(([category, total]) => (
                              <tr key={`${job.contractId}-${category}`} className="bg-base-200/40">
                                <td />
                                <td className="pl-8 text-sm opacity-80">{labelize(category)}</td>
                                <td />
                                <td className="text-right text-sm">{money(total)}</td>
                                <td className="text-right text-sm">
                                  {job.total > 0 ? `${((total / job.total) * 100).toFixed(1)}%` : "—"}
                                </td>
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td />
                    <td>Total</td>
                    <td className="text-right">{scopedEntries.length}</td>
                    <td className="text-right">{money(grandTotal)}</td>
                    <td className="text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Job Cost Chart">
            <ScrollableBarChart data={jobChartData}>
              <Bar dataKey="total" fill={CHART_SERIES.primary} radius={[0, 5, 5, 0]} name="Total" />
            </ScrollableBarChart>
          </SectionCard>
        </div>
      ) : null}

      {scopedEntries.length > 0 && viewMode === "by_category" ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title={`Costs by Category (${byCategory.length})`}>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-8" />
                    <th>Category</th>
                    <th className="text-right">Entries</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((row) => {
                    const open = expandedCategories.has(row.category);
                    const jobRows = Array.from(row.byJob.values()).sort((a, b) => b.total - a.total);
                    return (
                      <Fragment key={row.category}>
                        <tr className="hover cursor-pointer" onClick={() => toggleCategory(row.category)}>
                          <td>
                            {open ? (
                              <ChevronDown className="h-4 w-4 opacity-60" />
                            ) : (
                              <ChevronRight className="h-4 w-4 opacity-60" />
                            )}
                          </td>
                          <td className="font-medium">{labelize(row.category)}</td>
                          <td className="text-right">{row.entryCount}</td>
                          <td className="text-right font-medium">{money(row.total)}</td>
                          <td className="text-right">
                            {grandTotal > 0 ? `${((row.total / grandTotal) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                        {open
                          ? jobRows.map((job) => (
                              <tr key={`${row.category}-${job.contractId}`} className="bg-base-200/40">
                                <td />
                                <td className="pl-8 text-sm">
                                  <Link href={`/contracts/${job.contractId}`} className="link link-primary">
                                    {job.name}
                                  </Link>
                                </td>
                                <td />
                                <td className="text-right text-sm">{money(job.total)}</td>
                                <td className="text-right text-sm">
                                  {row.total > 0 ? `${((job.total / row.total) * 100).toFixed(1)}%` : "—"}
                                </td>
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td />
                    <td>Total</td>
                    <td className="text-right">{scopedEntries.length}</td>
                    <td className="text-right">{money(grandTotal)}</td>
                    <td className="text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Category Mix">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {scopedEntries.length > 0 && viewMode === "matrix" ? (
        <SectionCard title="Job × Category Matrix">
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Job</th>
                  {CATEGORIES.map((category) => (
                    <th key={category} className="text-right whitespace-nowrap">
                      {labelize(category)}
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((job) => (
                  <tr key={job.contractId} className="hover">
                    <td>
                      <Link href={`/contracts/${job.contractId}`} className="link link-primary font-medium">
                        {job.name}
                      </Link>
                    </td>
                    {CATEGORIES.map((category) => (
                      <td key={category} className="text-right whitespace-nowrap">
                        {job.cells[category] > 0 ? money(job.cells[category]) : "—"}
                      </td>
                    ))}
                    <td className="text-right font-medium">{money(job.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td>Total</td>
                  {CATEGORIES.map((category) => {
                    const total = byCategory.find((c) => c.category === category)?.total ?? 0;
                    return (
                      <td key={category} className="text-right whitespace-nowrap">
                        {total > 0 ? money(total) : "—"}
                      </td>
                    );
                  })}
                  <td className="text-right">{money(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {scopedEntries.length > 0 && viewMode === "entries" ? (
        <SectionCard title={`All Cost Entries (${filtered.length})`}>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Job</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Submitted By</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cost) => (
                  <tr key={cost.id} className="hover">
                    <td className="whitespace-nowrap">{cost.date_incurred ?? "—"}</td>
                    <td>
                      <Link href={`/contracts/${cost.contract_id}`} className="link link-primary">
                        {cost.contracts?.contract_name ?? "—"}
                      </Link>
                    </td>
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
        </SectionCard>
      ) : null}
    </div>
  );
}
