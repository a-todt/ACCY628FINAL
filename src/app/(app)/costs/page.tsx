"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
import {
  ColumnAutocompleteHeader,
  ColumnSortHeader,
  matchesColumnFilter,
  uniqueSorted,
  type ColumnSortDir,
} from "@/components/ColumnAutocompleteHeader";
import { compareValues } from "@/components/FilterSortBar";
import { ScrollableBarChart, toNamedBarRows, CHART_ROW_HEIGHT } from "@/components/ScrollableBarChart";
import { ExpandableChart } from "@/components/ExpandableChart";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import { useOpenCreateFromQuery } from "@/hooks/useOpenCreateFromQuery";
import {
  AlertBanner,
  EmptyState,
  FormField,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/ui";
import { CHART_COLORS, CHART_SERIES } from "@/lib/chartColors";
import { labelize, money } from "@/lib/metrics";
import { canEnterCosts, canViewCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { CostCategory, CostEntry } from "@/lib/types";

const CATEGORIES: CostCategory[] = [
  "labor",
  "materials",
  "subcontractor",
  "equipment",
  "permits",
  "other",
];

const EMPTY_FORM = {
  contract_id: "",
  category: "labor" as CostCategory,
  description: "",
  amount: "",
  date_incurred: "",
  notes: "",
};

type ViewMode = "by_job" | "by_category" | "matrix" | "entries";
type SortKey = "date" | "category" | "contract" | "amount" | "description" | "submittedBy";

function submitterLabel(
  cost: CostEntry,
  profiles: Array<{ id: string; full_name: string | null; email: string | null }>
): string {
  const profile = profiles.find((p) => p.id === cost.user_id);
  return profile?.full_name || profile?.email || "—";
}

export default function CostsPage() {
  const { effectiveRole, user } = useAuth();
  const { contracts, costEntries, userProfiles, loading, error, refresh } = useContractData();

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [jobColumnFilter, setJobColumnFilter] = useState("");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<ColumnSortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("by_job");
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAllRows, setShowAllRows] = useState(false);

  const canEnter = canEnterCosts(effectiveRole);

  useEffect(() => {
    setShowAllRows(false);
  }, [viewMode]);

  const openCreateForm = useCallback(() => {
    setShowForm(true);
    window.setTimeout(() => {
      document.getElementById("cost-create-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, []);
  useOpenCreateFromQuery(canEnter && !loading, openCreateForm);

  const scopedEntries = useMemo(() => {
    return costEntries.filter((cost) => {
      if (categoryFilter !== "all" && cost.category !== categoryFilter) return false;
      if (jobFilter !== "all" && cost.contract_id !== jobFilter) return false;
      return true;
    });
  }, [costEntries, categoryFilter, jobFilter]);

  const filtered = useMemo(() => {
    const rows = scopedEntries.filter((cost) => {
      if (!matchesColumnFilter(cost.contracts?.contract_name, jobColumnFilter)) return false;
      if (!matchesColumnFilter(cost.description, descriptionFilter)) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sortKey === "date") return compareValues(a.date_incurred, b.date_incurred, sortDir);
      if (sortKey === "category") return compareValues(a.category, b.category, sortDir);
      if (sortKey === "contract") {
        return compareValues(a.contracts?.contract_name, b.contracts?.contract_name, sortDir);
      }
      if (sortKey === "description") return compareValues(a.description, b.description, sortDir);
      if (sortKey === "submittedBy") {
        return compareValues(
          submitterLabel(a, userProfiles),
          submitterLabel(b, userProfiles),
          sortDir
        );
      }
      return compareValues(Number(a.amount ?? 0), Number(b.amount ?? 0), sortDir);
    });
  }, [scopedEntries, jobColumnFilter, descriptionFilter, sortKey, sortDir, userProfiles]);

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

  const jobColumnOptions = useMemo(
    () => uniqueSorted(scopedEntries.map((c) => c.contracts?.contract_name)),
    [scopedEntries]
  );
  const descriptionOptions = useMemo(
    () => uniqueSorted(scopedEntries.map((c) => c.description)),
    [scopedEntries]
  );

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" || key === "amount" ? "desc" : "asc");
    }
  };

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
        <AlertBanner type="error">
          Access denied. Cost data is not available for the client role.
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

  const denseTable = "table table-xs table-fixed w-full text-[11px]";
  /** Viewport ≈ sticky header + 10 body rows; remaining rows scroll inside. */
  const scroll10Rows = showAllRows
    ? "overflow-visible table-sticky-head"
    : "overflow-auto max-h-[calc(2.5rem+10*1.85rem)] table-sticky-head";
  const scroll10RowsTallHeader = showAllRows
    ? "overflow-visible table-sticky-head table-freeze-first"
    : "overflow-auto max-h-[calc(4.5rem+10*1.85rem)] table-sticky-head table-freeze-first";

  const showAllToggle = (rowCount: number) =>
    rowCount > 10 ? (
      <div className="flex justify-center pt-2 pb-1">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setShowAllRows((v) => !v)}
        >
          {showAllRows ? "Show less" : `Show all (${rowCount})`}
        </button>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cost Tracker"
        actions={
          canEnter ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="h-4 w-4" /> {showForm ? "Close Form" : "Log Cost"}
            </button>
          ) : undefined
        }
      />

      {canEnter && showForm ? (
        <SectionCard title="New Cost Entry">
          <div id="cost-create-form">
            {formError ? <AlertBanner type="error">{formError}</AlertBanner> : null}
            {success ? <AlertBanner type="success">{success}</AlertBanner> : null}
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField stacked label="Contract">
                  <select
                    className="select select-bordered w-full"
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
                <FormField stacked label="Category">
                  <select
                    className="select select-bordered w-full"
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
                <FormField stacked label="Amount">
                  <label className="input input-bordered flex items-center gap-2 w-full">
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
                <FormField stacked label="Date Incurred">
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={form.date_incurred}
                    onChange={(e) => updateField("date_incurred", e.target.value)}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField stacked label="Description">
                    <input
                      className="input input-bordered w-full"
                      value={form.description}
                      onChange={(e) => updateField("description", e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="sm:col-span-2">
                  <FormField stacked label="Notes">
                    <textarea
                      className="textarea textarea-bordered w-full"
                      rows={2}
                      value={form.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                    />
                  </FormField>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-sm" /> : null}
                  Save Cost Entry
                </button>
              </div>
            </form>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          compact
          title="Total Costs"
          value={money(grandTotal)}
          hint={`${scopedEntries.length} entries`}
        />
        <StatCard compact title="Jobs with Costs" value={String(byJob.length)} />
        <StatCard compact title="Categories Used" value={String(byCategory.length)} />
        <StatCard
          compact
          title="Avg Cost / Job"
          value={byJob.length > 0 ? money(grandTotal / byJob.length) : money(0)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          className="tabs tabs-boxed tabs-sm bg-base-100 border border-base-300 w-fit flex-wrap"
        >
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

        <select
          className="select select-bordered select-sm w-full sm:w-48"
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          aria-label="Filter by job"
        >
          <option value="all">All jobs</option>
          {contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.contract_name}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm w-full sm:w-40"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {labelize(category)}
            </option>
          ))}
        </select>
      </div>

      {scopedEntries.length === 0 ? (
        <EmptyState
          title={costEntries.length === 0 ? "No cost entries" : "No matching costs"}
          message={
            costEntries.length === 0
              ? "Log your first cost entry to start tracking job costs by project and category."
              : "Try adjusting your job or category filters."
          }
        />
      ) : null}

      {scopedEntries.length > 0 && viewMode === "by_job" ? (
        <div className="relative">
          <div className="rounded-box border border-base-300 bg-base-100 flex flex-col min-h-0 lg:w-[calc(50%-0.5rem)]">
            <div className="px-3 py-2 border-b border-base-300 text-sm font-semibold">
              Costs by Job ({byJob.length})
            </div>
            <div className={scroll10Rows}>
            <table className={denseTable}>
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[40%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="bg-base-200/80">
                  <th />
                  <th className="text-center">Job</th>
                  <th className="text-center">Entries</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {byJob.map((job) => {
                  const open = expandedJobs.has(job.contractId);
                  const categoryRows = Array.from(job.byCategory.entries()).sort(
                    (a, b) => b[1] - a[1]
                  );
                  return (
                    <Fragment key={job.contractId}>
                      <tr
                        className="hover:bg-base-200/60 cursor-pointer"
                        onClick={() => toggleJob(job.contractId)}
                      >
                        <td className="text-center">
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 opacity-60 inline" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 opacity-60 inline" />
                          )}
                        </td>
                        <td className="truncate px-1">
                          <Link
                            href={`/contracts/${job.contractId}`}
                            className="link link-primary font-medium"
                            title={job.name}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {job.name}
                          </Link>
                        </td>
                        <td className="text-center tabular-nums">{job.entryCount}</td>
                        <td className="text-center tabular-nums font-medium" title={money(job.total)}>
                          {money(job.total)}
                        </td>
                        <td className="text-center tabular-nums">
                          {grandTotal > 0
                            ? `${((job.total / grandTotal) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                      {open
                        ? categoryRows.map(([category, total]) => (
                            <tr
                              key={`${job.contractId}-${category}`}
                              className="bg-base-200/40"
                            >
                              <td />
                              <td className="pl-4 truncate">
                                <span className="badge badge-ghost badge-sm">
                                  {labelize(category)}
                                </span>
                              </td>
                              <td />
                              <td className="text-center tabular-nums">{money(total)}</td>
                              <td className="text-center tabular-nums">
                                {job.total > 0
                                  ? `${((total / job.total) * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-base-200/50">
                  <td />
                  <td className="text-center">Total</td>
                  <td className="text-center tabular-nums">{scopedEntries.length}</td>
                  <td className="text-center tabular-nums">{money(grandTotal)}</td>
                  <td className="text-center">100%</td>
                </tr>
              </tfoot>
            </table>
            </div>
            {showAllToggle(byJob.length)}
          </div>

          <div className="mt-4 flex min-h-0 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:w-[calc(50%-0.5rem)]">
            <div className="shrink-0 border-b border-base-300 px-3 py-2 text-sm font-semibold">
              Job Cost Chart
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3 max-lg:min-h-[16rem]">
              <ExpandableChart
                title="Job Cost Chart"
                actionLabel="Show all"
                fill
                previewHeight={220}
                moreCount={Math.max(0, jobChartData.length - 10)}
                hasData={jobChartData.length > 0}
                empty={
                  <p className="text-sm opacity-60 py-8 text-center">No job costs to chart yet.</p>
                }
              >
                {(height, mode) => {
                  const rows =
                    mode === "full" || jobChartData.length <= 10
                      ? jobChartData
                      : jobChartData.slice(0, 10);
                  return (
                    <ScrollableBarChart data={rows} panelHeight={height} rowHeight={CHART_ROW_HEIGHT}>
                      <Bar
                        dataKey="total"
                        fill={CHART_SERIES.primary}
                        radius={[0, 5, 5, 0]}
                        name="Total"
                      />
                    </ScrollableBarChart>
                  );
                }}
              </ExpandableChart>
            </div>
          </div>
        </div>
      ) : null}

      {scopedEntries.length > 0 && viewMode === "by_category" ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-box border border-base-300 bg-base-100">
            <div className="px-3 py-2 border-b border-base-300 text-sm font-semibold">
              Costs by Category ({byCategory.length})
            </div>
            <div className={scroll10Rows}>
            <table className={denseTable}>
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[40%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="bg-base-200/80">
                  <th />
                  <th className="text-center">Category</th>
                  <th className="text-center">Entries</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((row) => {
                  const open = expandedCategories.has(row.category);
                  const jobRows = Array.from(row.byJob.values()).sort(
                    (a, b) => b.total - a.total
                  );
                  return (
                    <Fragment key={row.category}>
                      <tr
                        className="hover:bg-base-200/60 cursor-pointer"
                        onClick={() => toggleCategory(row.category)}
                      >
                        <td className="text-center">
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 opacity-60 inline" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 opacity-60 inline" />
                          )}
                        </td>
                        <td className="text-center">
                          <span className="badge badge-ghost badge-sm">
                            {labelize(row.category)}
                          </span>
                        </td>
                        <td className="text-center tabular-nums">{row.entryCount}</td>
                        <td className="text-center tabular-nums font-medium">
                          {money(row.total)}
                        </td>
                        <td className="text-center tabular-nums">
                          {grandTotal > 0
                            ? `${((row.total / grandTotal) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                      {open
                        ? jobRows.map((job) => (
                            <tr
                              key={`${row.category}-${job.contractId}`}
                              className="bg-base-200/40"
                            >
                              <td />
                              <td className="pl-4 truncate">
                                <Link
                                  href={`/contracts/${job.contractId}`}
                                  className="link link-primary"
                                  title={job.name}
                                >
                                  {job.name}
                                </Link>
                              </td>
                              <td />
                              <td className="text-center tabular-nums">{money(job.total)}</td>
                              <td className="text-center tabular-nums">
                                {row.total > 0
                                  ? `${((job.total / row.total) * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-base-200/50">
                  <td />
                  <td className="text-center">Total</td>
                  <td className="text-center tabular-nums">{scopedEntries.length}</td>
                  <td className="text-center tabular-nums">{money(grandTotal)}</td>
                  <td className="text-center">100%</td>
                </tr>
              </tfoot>
            </table>
            </div>
            {showAllToggle(byCategory.length)}
          </div>

          <SectionCard compact title="Category Mix">
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
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
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
        <div className="rounded-box border border-base-300 bg-base-100">
          <div className="px-3 py-2 border-b border-base-300 text-sm font-semibold">
            Job × Category Matrix
          </div>
          <div className={scroll10Rows}>
          <table className={denseTable}>
            <thead>
              <tr className="bg-base-200/80">
                <th className="text-center px-1">Job</th>
                {CATEGORIES.map((category) => (
                  <th key={category} className="text-center px-1 whitespace-nowrap">
                    {labelize(category)}
                  </th>
                ))}
                <th className="text-center px-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((job) => (
                <tr key={job.contractId} className="hover:bg-base-200/60">
                  <td className="truncate px-1">
                    <Link
                      href={`/contracts/${job.contractId}`}
                      className="link link-primary font-medium"
                      title={job.name}
                    >
                      {job.name}
                    </Link>
                  </td>
                  {CATEGORIES.map((category) => (
                    <td
                      key={category}
                      className="text-center tabular-nums whitespace-nowrap px-1"
                      title={
                        job.cells[category] > 0 ? money(job.cells[category]) : undefined
                      }
                    >
                      {job.cells[category] > 0 ? money(job.cells[category]) : "—"}
                    </td>
                  ))}
                  <td className="text-center tabular-nums font-medium px-1">
                    {money(job.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-base-200/50">
                <td className="text-center">Total</td>
                {CATEGORIES.map((category) => {
                  const total = byCategory.find((c) => c.category === category)?.total ?? 0;
                  return (
                    <td key={category} className="text-center tabular-nums whitespace-nowrap">
                      {total > 0 ? money(total) : "—"}
                    </td>
                  );
                })}
                <td className="text-center tabular-nums">{money(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
          {showAllToggle(matrixRows.length)}
        </div>
      ) : null}

      {scopedEntries.length > 0 && viewMode === "entries" ? (
        <>
          <div className={`rounded-box border border-base-300 bg-base-100 ${scroll10RowsTallHeader}`}>
            <table className={denseTable}>
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[24%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="bg-base-200/80">
                  <ColumnSortHeader
                    label="Date"
                    sortActive={sortKey === "date"}
                    sortDir={sortDir}
                    onSort={() => onSort("date")}
                  />
                  <ColumnAutocompleteHeader
                    label="Job"
                    listId="costs-filter-job"
                    value={jobColumnFilter}
                    onChange={setJobColumnFilter}
                    options={jobColumnOptions}
                    sortActive={sortKey === "contract"}
                    sortDir={sortDir}
                    onSort={() => onSort("contract")}
                  />
                  <ColumnSortHeader
                    label="Category"
                    sortActive={sortKey === "category"}
                    sortDir={sortDir}
                    onSort={() => onSort("category")}
                  />
                  <ColumnAutocompleteHeader
                    label="Description"
                    listId="costs-filter-description"
                    value={descriptionFilter}
                    onChange={setDescriptionFilter}
                    options={descriptionOptions}
                    sortActive={sortKey === "description"}
                    sortDir={sortDir}
                    onSort={() => onSort("description")}
                  />
                  <ColumnSortHeader
                    label="Submitted By"
                    sortActive={sortKey === "submittedBy"}
                    sortDir={sortDir}
                    onSort={() => onSort("submittedBy")}
                  />
                  <ColumnSortHeader
                    label="Amount"
                    sortActive={sortKey === "amount"}
                    sortDir={sortDir}
                    onSort={() => onSort("amount")}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60 py-6">
                      No entries match the column filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((cost) => {
                    const jobName = cost.contracts?.contract_name ?? "—";
                    const description = cost.description ?? "—";
                    const submitter = submitterLabel(cost, userProfiles);
                    return (
                      <tr key={cost.id} className="hover:bg-base-200/60">
                        <td className="whitespace-nowrap text-center px-1">
                          {cost.date_incurred ?? "—"}
                        </td>
                        <td className="truncate px-1">
                          <Link
                            href={`/contracts/${cost.contract_id}`}
                            className="link link-primary"
                            title={jobName}
                          >
                            {jobName}
                          </Link>
                        </td>
                        <td className="text-center px-1">
                          <span className="badge badge-ghost badge-sm">
                            {labelize(cost.category)}
                          </span>
                        </td>
                        <td className="truncate px-1" title={description}>
                          {description}
                        </td>
                        <td className="truncate px-1" title={submitter}>
                          {submitter}
                        </td>
                        <td
                          className="text-center tabular-nums px-1"
                          title={money(cost.amount)}
                        >
                          {money(cost.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {showAllToggle(filtered.length)}
          <p className="text-xs opacity-60 px-1 text-center">
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
            {scopedEntries.length !== costEntries.length
              ? ` (scoped from ${costEntries.length} total)`
              : ""}
            {jobColumnFilter || descriptionFilter ? " · column filters active" : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
