"use client";

import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";

export function FilterSortBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  sortOptions,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  resultCount,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  sortOptions: Array<{ value: string; label: string }>;
  sortKey: string;
  sortDir: SortDir;
  onSortKeyChange: (value: string) => void;
  onSortDirChange: (value: SortDir) => void;
  resultCount?: number;
  children?: ReactNode;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm mb-4">
      <div className="card-body p-3 sm:p-4 gap-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <label className="form-control flex-1 min-w-0">
            <span className="label py-1">
              <span className="label-text text-xs opacity-60 font-medium">Search</span>
            </span>
            <input
              className="input input-bordered input-sm w-full"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
          {filters}
          <label className="form-control w-full lg:w-48">
            <span className="label py-1">
              <span className="label-text text-xs opacity-60 font-medium">Sort by</span>
            </span>
            <select
              className="select select-bordered select-sm"
              value={sortKey}
              onChange={(e) => onSortKeyChange(e.target.value)}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control w-full lg:w-36">
            <span className="label py-1">
              <span className="label-text text-xs opacity-60 font-medium">Order</span>
            </span>
            <select
              className="select select-bordered select-sm"
              value={sortDir}
              onChange={(e) => onSortDirChange(e.target.value as SortDir)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
        {children}
        {typeof resultCount === "number" ? (
          <p className="text-xs opacity-55 tabular-nums">
            Showing {resultCount} result{resultCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: SortDir) {
  const av = a ?? "";
  const bv = b ?? "";
  let cmp = 0;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}
