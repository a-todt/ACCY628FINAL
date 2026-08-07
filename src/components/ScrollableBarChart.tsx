"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/metrics";

export const CHART_LABEL_LEN = 20;
export const CHART_PANEL_HEIGHT = 220;
export const CHART_ROW_HEIGHT = 40;
const AXIS_STRIP_HEIGHT = 58;
const CHART_TOP_MARGIN = 20;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_FALLBACK_WIDTH = 220;
const TOOLTIP_FALLBACK_HEIGHT = 80;

const NICE_STEPS = [
  10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
] as const;

export type NamedBarRow = {
  fullName: string;
  shortName: string;
} & Record<string, string | number>;

/** Truncate a label with an ellipsis for axis ticks. */
export function truncateChartLabel(name: string | null | undefined, len = CHART_LABEL_LEN): string {
  const value = name?.trim() || "Untitled";
  return value.length > len ? `${value.slice(0, len - 1)}…` : value;
}

/** Build chart rows with fullName + unique shortName for the Y-axis. */
export function toNamedBarRows<T extends Record<string, number | string>>(
  items: Array<{ fullName: string | null | undefined; values: T }>,
  len = CHART_LABEL_LEN
): Array<NamedBarRow & T> {
  const used = new Map<string, number>();

  return items.map(({ fullName, values }) => {
    const full = fullName?.trim() || "Untitled";
    let short = truncateChartLabel(full, len);
    const count = used.get(short) ?? 0;
    used.set(short, count + 1);
    if (count > 0) {
      const suffix = ` (${count + 1})`;
      const maxBase = Math.max(1, len - suffix.length);
      short = `${truncateChartLabel(full, maxBase).replace(/…$/, "")}${suffix}`;
    }
    return { fullName: full, shortName: short, ...values };
  });
}

function dataExtent(data: NamedBarRow[], stackKeys?: string[]): { min: number; max: number } {
  let min = 0;
  let max = 0;

  if (stackKeys && stackKeys.length > 0) {
    for (const row of data) {
      let sum = 0;
      for (const key of stackKeys) {
        const value = row[key];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        sum += value;
      }
      min = Math.min(min, sum);
      max = Math.max(max, sum);
    }
    return { min, max };
  }

  for (const row of data) {
    for (const [key, value] of Object.entries(row)) {
      if (key === "fullName" || key === "shortName" || key === "tipExtra" || key === "href" || key === "contractId") {
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return { min, max };
}

/** Pick a round dollar step that yields ~3–6 readable ticks. */
function pickNiceStep(span: number): number {
  const safeSpan = Math.max(span, 1);
  const target = safeSpan / 4;
  let best: number = NICE_STEPS[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const step of NICE_STEPS) {
    const intervals = Math.ceil(safeSpan / step);
    if (intervals < 2 || intervals > 8) continue;
    const score = Math.abs(step - target) + Math.abs(intervals - 4) * step * 0.05;
    if (score < bestScore) {
      best = step;
      bestScore = score;
    }
  }

  if (bestScore === Number.POSITIVE_INFINITY) {
    for (const step of NICE_STEPS) {
      if (Math.ceil(safeSpan / step) <= 8) return step;
    }
    return NICE_STEPS[NICE_STEPS.length - 1];
  }

  return best;
}

function snapDomain(min: number, max: number): { domain: [number, number]; step: number } {
  if (min === 0 && max === 0) {
    return { domain: [0, 250_000], step: 50_000 };
  }

  const span = Math.max(max - Math.min(min, 0), Math.abs(Math.min(min, 0)), max, 1);
  const step = pickNiceStep(span);

  if (min >= 0) {
    const snappedMax = Math.max(step, Math.ceil(max / step) * step);
    return { domain: [0, snappedMax], step };
  }

  const snappedMin = Math.floor(min / step) * step;
  const snappedMax = Math.max(0, Math.ceil(max / step) * step);
  return { domain: [snappedMin, snappedMax || step], step };
}

function axisTicks(domain: [number, number], step: number): number[] {
  const [min, max] = domain;
  const ticks: number[] = [];
  const start = Math.round(min / step) * step;
  for (let value = start; value <= max + step * 0.001; value += step) {
    ticks.push(Math.round(value));
  }
  if (ticks.length === 0) return [min, max];
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

/** Axis labels in thousands (e.g. $1,000,000 → 1,000). Dollar cue lives in ($000s). */
function formatThousands(value: number): string {
  const thousands = Math.round(value / 1000);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(thousands);
}

type TooltipPayloadItem = {
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: {
    fullName?: string;
    /** Optional secondary line (e.g. margin % or collection rate). */
    tipExtra?: string;
  };
};

function FullNameTooltip({
  active,
  payload,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  valueFormatter: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const fullName = row?.fullName ?? "Untitled";
  const tipExtra = row?.tipExtra;

  return (
    <div className="rounded-box border border-base-300 bg-base-100 px-3 py-2 shadow-md text-sm max-w-xs">
      <p className="font-medium mb-1.5 leading-snug">{fullName}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 opacity-80">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums">
              {valueFormatter(Number(entry.value ?? 0))}
            </span>
          </li>
        ))}
        {tipExtra ? (
          <li className="pt-1 mt-0.5 border-t border-base-300 text-xs opacity-75">{tipExtra}</li>
        ) : null}
      </ul>
    </div>
  );
}

/** Recharts 3 chart onMouseMove no longer includes activePayload — sync from Tooltip content instead. */
function TooltipPayloadBridge({
  active,
  payload,
  onPayload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  onPayload: (payload: TooltipPayloadItem[] | null) => void;
}) {
  const signature =
    active && payload?.length
      ? payload.map((p) => `${p.name}:${p.value}:${p.payload?.fullName ?? ""}`).join("|")
      : "";
  const lastSignature = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    if (signature && payload?.length) {
      onPayload(payload);
    } else {
      onPayload(null);
    }
  }, [signature, payload, onPayload]);

  return null;
}

function StickyMoneyAxis({
  domain,
  step,
  categoryWidth,
}: {
  domain: [number, number];
  step: number;
  categoryWidth: number;
}) {
  const ticks = axisTicks(domain, step);
  const span = domain[1] - domain[0] || 1;

  return (
    <div
      className="shrink-0"
      style={{
        height: AXIS_STRIP_HEIGHT,
        paddingLeft: categoryWidth + 4,
        paddingRight: 16,
      }}
    >
      <div className="relative border-t border-base-content/30">
        <div className="relative h-7">
          {ticks.map((tick, index) => {
            const pct = ((tick - domain[0]) / span) * 100;
            const isFirst = index === 0;
            const isLast = index === ticks.length - 1;
            const labelTransform = isFirst
              ? "rotate(-20deg)"
              : isLast
                ? "translateX(-100%) rotate(-20deg)"
                : "translateX(-50%) rotate(-20deg)";

            return (
              <div
                key={`${tick}-${index}`}
                className="absolute top-0"
                style={{ left: `${pct}%` }}
              >
                <span
                  className="absolute left-0 -top-1.5 block h-3 w-0.5 -translate-x-1/2 rounded-sm bg-base-content/80"
                  aria-hidden
                />
                <span
                  className="absolute top-2.5 left-0 text-[11px] tabular-nums opacity-75 whitespace-nowrap"
                  style={{
                    transform: labelTransform,
                    transformOrigin: isFirst ? "top left" : isLast ? "top right" : "top center",
                  }}
                >
                  {formatThousands(tick)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-0.5 text-center text-[11px] font-medium tracking-wide opacity-70">
          ($000s)
        </p>
      </div>
    </div>
  );
}

type ScrollableBarChartProps = {
  data: NamedBarRow[];
  children: ReactNode;
  valueFormatter?: (value: number) => string;
  categoryWidth?: number;
  panelHeight?: number;
  rowHeight?: number;
  /** When set, domain uses the sum of these keys (stacked bars). */
  stackKeys?: string[];
  /** Navigate / act when a bar or Y-axis label is clicked. */
  onRowClick?: (row: NamedBarRow) => void;
};

function CategoryTick({
  x = 0,
  y = 0,
  payload,
  data,
  onRowClick,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  data: NamedBarRow[];
  onRowClick?: (row: NamedBarRow) => void;
}) {
  const row = data.find((d) => d.shortName === payload?.value);
  const clickable = Boolean(onRowClick && row);

  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={11}
      className={clickable ? "fill-current cursor-pointer hover:fill-primary" : "fill-current"}
      style={clickable ? { cursor: "pointer" } : undefined}
      onClick={
        clickable
          ? (event) => {
              event.stopPropagation();
              onRowClick?.(row!);
            }
          : undefined
      }
    >
      {payload?.value}
    </text>
  );
}

export function ScrollableBarChart({
  data,
  children,
  valueFormatter = (v) => money(v),
  categoryWidth = 128,
  panelHeight = CHART_PANEL_HEIGHT,
  rowHeight = CHART_ROW_HEIGHT,
  stackKeys,
  onRowClick,
}: ScrollableBarChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hoverPayload, setHoverPayload] = useState<TooltipPayloadItem[] | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);

  const plotHeight = Math.max(120, panelHeight - AXIS_STRIP_HEIGHT);
  const chartHeight = Math.max(plotHeight, data.length * rowHeight + CHART_TOP_MARGIN + 8);
  const canScroll = chartHeight > plotHeight;
  const { min, max } = dataExtent(data, stackKeys);
  const { domain, step } = snapDomain(min, max);

  const onPayload = useCallback((payload: TooltipPayloadItem[] | null) => {
    setHoverPayload((prev) => {
      if (prev === payload) return prev;
      if (!prev && !payload) return prev;
      return payload;
    });
    if (!payload) {
      setTipPos((prev) => (prev ? null : prev));
    }
  }, []);

  const onPlotMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const plot = plotRef.current;
    if (!plot) return;
    const rect = plot.getBoundingClientRect();
    setPointer({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, []);

  const onPlotMouseLeave = useCallback(() => {
    setHoverPayload(null);
    setPointer(null);
    setTipPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!hoverPayload || !pointer || !plotRef.current) {
      setTipPos(null);
      return;
    }

    const plotRect = plotRef.current.getBoundingClientRect();
    const tipRect = tipRef.current?.getBoundingClientRect();
    const tipW = tipRect?.width || TOOLTIP_FALLBACK_WIDTH;
    const tipH = tipRect?.height || TOOLTIP_FALLBACK_HEIGHT;
    const maxLeft = Math.max(8, plotRect.width - tipW - 8);
    const maxTop = Math.max(8, plotRect.height - tipH - 8);

    let left = pointer.x + TOOLTIP_OFFSET;
    let top = pointer.y + TOOLTIP_OFFSET;

    // Prefer below/right of cursor; flip up near the bottom of the plot card.
    if (top + tipH > plotRect.height - 8) {
      top = pointer.y - tipH - TOOLTIP_OFFSET;
    }
    if (left + tipW > plotRect.width - 8) {
      left = pointer.x - tipW - TOOLTIP_OFFSET;
    }

    left = Math.min(maxLeft, Math.max(8, left));
    top = Math.min(maxTop, Math.max(8, top));
    setTipPos({ left, top });
  }, [hoverPayload, pointer]);

  const showTip = Boolean(hoverPayload?.length && pointer);
  const left = tipPos?.left ?? (pointer ? pointer.x + TOOLTIP_OFFSET : 0);
  const top = tipPos?.top ?? (pointer ? pointer.y + TOOLTIP_OFFSET : 0);

  return (
    <div className="flex flex-col" style={{ height: panelHeight }}>
      <div
        ref={plotRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-base-200/40"
        onMouseMove={onPlotMouseMove}
        onMouseLeave={onPlotMouseLeave}
      >
        <div className="h-full overflow-y-auto overflow-x-hidden">
          <div style={{ height: chartHeight, minHeight: plotHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: CHART_TOP_MARGIN, right: 16, left: 4, bottom: 4 }}
                onMouseLeave={() => onPayload(null)}
                onClick={(state) => {
                  if (!onRowClick) return;
                  const row = state?.activePayload?.[0]?.payload as NamedBarRow | undefined;
                  if (row) onRowClick(row);
                }}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
                <XAxis type="number" domain={domain} hide />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  tick={<CategoryTick data={data} onRowClick={onRowClick} />}
                  width={categoryWidth}
                  interval={0}
                />
                <Tooltip
                  content={<TooltipPayloadBridge onPayload={onPayload} />}
                  cursor={{
                    fill: "color-mix(in oklab, var(--color-base-content) 5%, transparent)",
                  }}
                />
                {children}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overlay outside the scroll clip so the popup is never cut off */}
        {showTip ? (
          <div
            ref={tipRef}
            className="pointer-events-none absolute z-30"
            style={{ left, top }}
          >
            <FullNameTooltip active payload={hoverPayload!} valueFormatter={valueFormatter} />
          </div>
        ) : null}

        {canScroll ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-base-200/80 to-transparent"
            aria-hidden
          />
        ) : null}
      </div>

      <StickyMoneyAxis domain={domain} step={step} categoryWidth={categoryWidth} />
    </div>
  );
}
