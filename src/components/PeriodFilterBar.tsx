"use client";

import {
  REPORTS_MONTH_OPTIONS,
  REPORTS_QUARTER_OPTIONS,
  type ReportsTimeFilter,
  type ReportsTimeGrain,
} from "@/lib/reportsTimeFilter";

type Props = {
  timeFilter: ReportsTimeFilter;
  yearOptions: number[];
  onChange: (next: ReportsTimeFilter | ((prev: ReportsTimeFilter) => ReportsTimeFilter)) => void;
  /** Extra controls rendered on the right side of the ribbon (e.g. Customize). */
  endActions?: React.ReactNode;
  className?: string;
};

export function PeriodFilterBar({
  timeFilter,
  yearOptions,
  onChange,
  endActions,
  className = "",
}: Props) {
  const selectClass = "select select-bordered select-sm min-h-8 h-8";

  return (
    <div
      className={`flex flex-wrap items-end gap-2 rounded-box border border-base-300 bg-base-100 px-2.5 py-2 ${className}`.trim()}
    >
      <label className="flex min-w-[7.5rem] flex-col gap-0.5">
        <span className="text-xs font-medium opacity-70">Period</span>
        <select
          className={selectClass}
          value={timeFilter.grain}
          onChange={(e) =>
            onChange((prev) => ({
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
            onChange={(e) => onChange((prev) => ({ ...prev, year: Number(e.target.value) }))}
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
              onChange((prev) => ({
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
            onChange={(e) => onChange((prev) => ({ ...prev, month: Number(e.target.value) }))}
          >
            {REPORTS_MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {endActions ? (
        <div className="flex flex-wrap items-center gap-1.5 ml-auto pb-0.5">{endActions}</div>
      ) : null}
    </div>
  );
}
