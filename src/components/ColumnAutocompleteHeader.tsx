"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type ColumnSortDir = "asc" | "desc";

function SortLabel({
  label,
  sortActive,
  sortDir,
  onSort,
}: {
  label: string;
  sortActive?: boolean;
  sortDir?: ColumnSortDir;
  onSort?: () => void;
}) {
  if (!onSort) return <span className="font-semibold">{label}</span>;
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-0.5 text-[10px] leading-tight font-semibold hover:text-primary"
      onClick={onSort}
    >
      {label}
      {sortActive ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

/** Sortable column header without a search input. */
export function ColumnSortHeader({
  label,
  sortActive = false,
  sortDir = "asc",
  onSort,
}: {
  label: string;
  sortActive?: boolean;
  sortDir?: ColumnSortDir;
  onSort?: () => void;
  /** @deprecated Headers are always centered. */
  align?: "left" | "right" | "center";
}) {
  return (
    <th className="align-middle px-1 text-center">
      <div className="flex justify-center">
        <SortLabel label={label} sortActive={sortActive} sortDir={sortDir} onSort={onSort} />
      </div>
    </th>
  );
}

export function ColumnAutocompleteHeader({
  label,
  listId,
  value,
  onChange,
  options,
  placeholder = "Search…",
  sortActive = false,
  sortDir = "asc",
  onSort,
}: {
  label: string;
  listId: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  sortActive?: boolean;
  sortDir?: ColumnSortDir;
  onSort?: () => void;
  /** @deprecated Headers are always centered. */
  align?: "left" | "right" | "center";
}) {
  const safeOptions = options ?? [];
  return (
    <th className="align-top px-1 text-center">
      <div className="flex min-w-0 flex-col items-center gap-1">
        <SortLabel label={label} sortActive={sortActive} sortDir={sortDir} onSort={onSort} />
        <input
          className="input input-bordered h-6 min-h-6 w-full min-w-0 px-1 text-center text-[10px]"
          list={listId}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onClick={(e) => e.stopPropagation()}
        />
        <datalist id={listId}>
          {safeOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </th>
  );
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function matchesColumnFilter(cell: string | null | undefined, filter: string | null | undefined): boolean {
  const q = (filter ?? "").trim().toLowerCase();
  if (!q) return true;
  return (cell ?? "").toLowerCase().includes(q);
}
