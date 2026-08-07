"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColorAt } from "@/lib/chartColors";
import { money, percent } from "@/lib/metrics";

export type ReportChartDatum = {
  name: string;
  value: number;
  /** Optional second series for grouped bars */
  value2?: number;
};

type MoneyTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: ReportChartDatum }>;
  label?: string;
  asPercent?: boolean;
};

function MoneyTooltip({ active, payload, label, asPercent }: MoneyTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow-sm">
      <p className="font-medium mb-1">{label ?? payload[0]?.payload?.name}</p>
      {payload.map((entry) => (
        <p key={String(entry.name)} className="opacity-80">
          {entry.name}:{" "}
          {asPercent ? percent(Number(entry.value ?? 0)) : money(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

export function ReportBarChart({
  data,
  height = 160,
  valueLabel = "Amount",
  value2Label,
  asPercent = false,
}: {
  data: ReportChartDatum[];
  height?: number;
  valueLabel?: string;
  value2Label?: string;
  asPercent?: boolean;
}) {
  if (data.length === 0) {
    return <p className="text-sm opacity-60 py-6 text-center">No chart data for this filter.</p>;
  }

  const truncated = data.slice(0, 8).map((row) => ({
    ...row,
    short:
      row.name.length > 12 ? `${row.name.slice(0, 11)}…` : row.name,
  }));

  return (
    <div style={{ width: "100%", height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={truncated} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
          <XAxis dataKey="short" tick={{ fontSize: 10 }} interval={0} />
          <YAxis
            tick={{ fontSize: 10 }}
            width={48}
            tickFormatter={(v) =>
              asPercent ? `${Math.round(Number(v) * 100)}%` : abbreviateMoney(Number(v))
            }
          />
          <Tooltip content={<MoneyTooltip asPercent={asPercent} />} />
          <Bar dataKey="value" name={valueLabel} fill={chartColorAt(0)} radius={[3, 3, 0, 0]} />
          {value2Label ? (
            <Bar dataKey="value2" name={value2Label} fill={chartColorAt(2)} radius={[3, 3, 0, 0]} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReportPieChart({
  data,
  height = 160,
}: {
  data: ReportChartDatum[];
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm opacity-60 py-6 text-center">No chart data for this filter.</p>;
  }

  const rows = data.filter((d) => d.value > 0).slice(0, 8);

  return (
    <div style={{ width: "100%", height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="42%"
            outerRadius="70%"
            paddingAngle={2}
          >
            {rows.map((row, index) => (
              <Cell key={row.name} fill={chartColorAt(index)} />
            ))}
          </Pie>
          <Tooltip content={<MoneyTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function abbreviateMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
