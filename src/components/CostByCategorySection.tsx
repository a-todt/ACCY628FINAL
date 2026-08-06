"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ReportDetailsModal, ReportPane, StatCard } from "@/components/ui";
import { downloadCsv, downloadPdfTables } from "@/lib/export";
import { money, percent } from "@/lib/metrics";

type CategoryRow = {
  name: string;
  total: number;
};

type Props = {
  rows: CategoryRow[];
};

const COST_CATEGORY_COLORS = [
  "#ea580c",
  "#0d9488",
  "#0369a1",
  "#ca8a04",
  "#64748b",
  "#b45309",
  "#134e4a",
  "#78716c",
];

const SMALL_SHARE = 0.04;

function groupSmallCategories(rows: CategoryRow[], grandTotal: number): CategoryRow[] {
  if (rows.length <= 4 || grandTotal <= 0) return rows;

  const major: CategoryRow[] = [];
  let otherTotal = 0;
  let otherCount = 0;

  for (const row of rows) {
    const share = row.total / grandTotal;
    if (share < SMALL_SHARE) {
      otherTotal += row.total;
      otherCount += 1;
    } else {
      major.push(row);
    }
  }

  if (otherCount <= 1) return rows;
  if (otherTotal > 0) major.push({ name: "Other", total: otherTotal });
  return major;
}

function CostTooltip({
  active,
  payload,
  grandTotal,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  grandTotal: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item.value ?? 0);
  const share = grandTotal > 0 ? value / grandTotal : 0;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm shadow-sm">
      {item.name} · {money(value)} · {percent(share)}
    </div>
  );
}

export function CostByCategorySection({ rows }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [activeName, setActiveName] = useState<string | null>(null);

  const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows]);

  const topCategories = useMemo(() => rows.slice(0, 3), [rows]);

  const chartRows = useMemo(
    () => groupSmallCategories(rows, grandTotal),
    [rows, grandTotal]
  );

  const colorFor = (index: number) => COST_CATEGORY_COLORS[index % COST_CATEGORY_COLORS.length];

  function exportCsv() {
    downloadCsv(
      "costs-by-category.csv",
      rows.map((row) => ({
        Category: row.name,
        Total: row.total,
      }))
    );
  }

  function exportPdf() {
    downloadPdfTables("costs-by-category.pdf", "GC Contract Manager — Cost by Category", [
      {
        title: "Cost by Category",
        columns: ["Category", "Total"],
        rows: rows.map((row) => [row.name, money(row.total)]),
      },
    ]);
  }

  const title = "Cost by Category";
  const subtitle =
    "Where spend concentrates across cost categories, with share of total portfolio costs.";

  return (
    <>
      <ReportPane
        title={title}
        subtitle={subtitle}
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        footerStart={
          rows.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => setShowDetails(true)}
            >
              Show details
            </button>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm opacity-60 py-4 text-center">No cost entries yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mb-1">
            <StatCard compact title="Total costs" value={money(grandTotal)} />
            {topCategories.map((row) => (
              <StatCard
                compact
                key={row.name}
                title={row.name}
                value={money(row.total)}
                hint={percent(grandTotal > 0 ? row.total / grandTotal : 0)}
              />
            ))}
          </div>
        )}
      </ReportPane>

      <ReportDetailsModal
        open={showDetails}
        title={title}
        subtitle={subtitle}
        onClose={() => {
          setShowDetails(false);
          setActiveName(null);
        }}
      >
        <div className="grid grid-cols-1 gap-6 items-center">
          <div className="relative mx-auto h-64 w-full max-w-sm sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartRows}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="46%"
                  outerRadius={(dataPoint: CategoryRow) =>
                    activeName === dataPoint.name ? "78%" : "70%"
                  }
                  paddingAngle={2}
                  stroke="var(--color-base-100, #fff)"
                  strokeWidth={2}
                  onMouseEnter={(_, index) => setActiveName(chartRows[index]?.name ?? null)}
                  onMouseLeave={() => setActiveName(null)}
                >
                  {chartRows.map((row, index) => {
                    const dimmed = Boolean(activeName) && activeName !== row.name;
                    return (
                      <Cell
                        key={row.name}
                        fill={colorFor(index)}
                        fillOpacity={dimmed ? 0.35 : 1}
                        style={{ cursor: "pointer", outline: "none" }}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CostTooltip grandTotal={grandTotal} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[11px] uppercase tracking-wide opacity-60">Total costs</p>
              <p className="text-lg sm:text-xl font-semibold tracking-tight">
                {money(grandTotal)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {chartRows.map((row, index) => {
                  const share = grandTotal > 0 ? row.total / grandTotal : 0;
                  const active = activeName === row.name;
                  const dimmed = Boolean(activeName) && !active;
                  return (
                    <tr
                      key={row.name}
                      className={`cursor-pointer transition-opacity ${active ? "bg-base-200/70" : ""} ${dimmed ? "opacity-40" : ""}`}
                      onMouseEnter={() => setActiveName(row.name)}
                      onMouseLeave={() => setActiveName(null)}
                      onClick={() =>
                        setActiveName((prev) => (prev === row.name ? null : row.name))
                      }
                    >
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: colorFor(index) }}
                          />
                          {row.name}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">{money(row.total)}</td>
                      <td className="text-right whitespace-nowrap">{percent(share)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-base-200">
                  <td>TOTALS</td>
                  <td className="text-right whitespace-nowrap">{money(grandTotal)}</td>
                  <td className="text-right whitespace-nowrap">100%</td>
                </tr>
              </tfoot>
            </table>
            {chartRows.some((r) => r.name === "Other") ? (
              <p className="text-xs opacity-60 mt-2">
                Categories under 4% of total spend are grouped into Other.
              </p>
            ) : null}
          </div>
        </div>
      </ReportDetailsModal>
    </>
  );
}
