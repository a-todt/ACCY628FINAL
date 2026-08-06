"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";

export type ColumnSortDir = "asc" | "desc";

export type CheckboxFilterOption = {
  value: string;
  label: string;
};

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
  className,
}: {
  label: string;
  sortActive?: boolean;
  sortDir?: ColumnSortDir;
  onSort?: () => void;
  /** @deprecated Headers are always centered. */
  align?: "left" | "right" | "center";
  /** Extra classes on the `<th>` (e.g. `hidden xl:table-cell`). */
  className?: string;
}) {
  return (
    <th className={["align-middle px-1 text-center", className].filter(Boolean).join(" ")}>
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
  className,
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
  /** Extra classes on the `<th>` (e.g. `hidden xl:table-cell`). */
  className?: string;
}) {
  const safeOptions = options ?? [];
  return (
    <th className={["align-top px-1 text-center", className].filter(Boolean).join(" ")}>
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

/** Multi-select checkbox filter in the column header. Empty selection = show all. */
export function ColumnCheckboxFilterHeader({
  label,
  options,
  selected,
  onChange,
  sortActive = false,
  sortDir = "asc",
  onSort,
  className,
}: {
  label: string;
  options: CheckboxFilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  sortActive?: boolean;
  sortDir?: ColumnSortDir;
  onSort?: () => void;
  className?: string;
}) {
  const selectedSet = new Set(selected);
  const activeCount = selected.length;
  const allSelected = options.length > 0 && options.every((opt) => selectedSet.has(opt.value));

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };

  const selectAll = () => onChange(options.map((opt) => opt.value));
  const clearAll = () => onChange([]);

  return (
    <th className={["align-top px-1 text-center", className].filter(Boolean).join(" ")}>
      <div className="flex min-w-0 flex-col items-center gap-1">
        <SortLabel label={label} sortActive={sortActive} sortDir={sortDir} onSort={onSort} />
        <div className="dropdown dropdown-bottom">
          <div
            tabIndex={0}
            role="button"
            className={`btn btn-ghost h-6 min-h-6 gap-0.5 px-1.5 text-[10px] font-normal ${
              activeCount > 0 ? "text-primary" : "opacity-80"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {activeCount > 0 ? `${activeCount} selected` : "All"}
            <ChevronDown className="h-3 w-3" />
          </div>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 rounded-box z-50 w-48 p-2 shadow border border-base-300 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <li>
              <button type="button" className="text-[11px]" onClick={selectAll} disabled={allSelected}>
                Select all
              </button>
            </li>
            <li>
              <button type="button" className="text-[11px]" onClick={clearAll} disabled={activeCount === 0}>
                Clear
              </button>
            </li>
            <li className="menu-title pt-2">
              <span className="text-[10px] opacity-60">Filter</span>
            </li>
            {options.map((option) => (
              <li key={option.value}>
                <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={selectedSet.has(option.value)}
                    onChange={() => toggle(option.value)}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
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

/** Empty selection means no filter (show all). */
export function matchesCheckboxFilter(value: string, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return selected.includes(value);
}
