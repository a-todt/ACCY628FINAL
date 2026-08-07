/** Shared time filter for the Reports page (all panes). */

export type ReportsTimeGrain = "all" | "year" | "quarter" | "month";

export type ReportsTimeFilter = {
  grain: ReportsTimeGrain;
  year: number;
  /** 1–4 when grain is quarter */
  quarter: 1 | 2 | 3 | 4;
  /** 1–12 when grain is month */
  month: number;
};

export type ReportsDateRange = {
  start: string;
  end: string;
};

export function defaultReportsTimeFilter(now = new Date()): ReportsTimeFilter {
  const month = now.getMonth() + 1;
  return {
    grain: "year",
    year: now.getFullYear(),
    quarter: (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4,
    month,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${year}-${pad2(month)}-${pad2(d.getUTCDate())}`;
}

/** Inclusive YYYY-MM-DD range, or null for all time. */
export function reportsDateRange(filter: ReportsTimeFilter): ReportsDateRange | null {
  const { grain, year, quarter, month } = filter;
  if (grain === "all") return null;
  if (grain === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  if (grain === "quarter") {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      start: `${year}-${pad2(startMonth)}-01`,
      end: lastDayOfMonth(year, endMonth),
    };
  }
  return {
    start: `${year}-${pad2(month)}-01`,
    end: lastDayOfMonth(year, month),
  };
}

/** Months (1–12) included by the filter within its year. Null = all months / all-time. */
export function reportsFilterMonths(filter: ReportsTimeFilter): number[] | null {
  if (filter.grain === "all" || filter.grain === "year") return null;
  if (filter.grain === "quarter") {
    const start = (filter.quarter - 1) * 3 + 1;
    return [start, start + 1, start + 2];
  }
  return [filter.month];
}

export function dateInReportsRange(
  date: string | null | undefined,
  range: ReportsDateRange | null
): boolean {
  if (!range) return true;
  if (!date) return false;
  const day = date.slice(0, 10);
  return day >= range.start && day <= range.end;
}

export function reportsTimeFilterLabel(filter: ReportsTimeFilter): string {
  if (filter.grain === "all") return "All time";
  if (filter.grain === "year") return String(filter.year);
  if (filter.grain === "quarter") return `Q${filter.quarter} ${filter.year}`;
  const name = new Date(Date.UTC(filter.year, filter.month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return name;
}

export const REPORTS_QUARTER_OPTIONS: Array<{ value: 1 | 2 | 3 | 4; label: string }> = [
  { value: 1, label: "Q1 (Jan–Mar)" },
  { value: 2, label: "Q2 (Apr–Jun)" },
  { value: 3, label: "Q3 (Jul–Sep)" },
  { value: 4, label: "Q4 (Oct–Dec)" },
];

export const REPORTS_MONTH_OPTIONS: Array<{ value: number; label: string }> = Array.from(
  { length: 12 },
  (_, i) => ({
    value: i + 1,
    label: new Date(Date.UTC(2000, i, 1)).toLocaleString("en-US", {
      month: "long",
      timeZone: "UTC",
    }),
  })
);
