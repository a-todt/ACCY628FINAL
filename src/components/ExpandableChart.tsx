"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { CHART_PANEL_HEIGHT } from "@/components/ScrollableBarChart";
import { ReportDetailsModal } from "@/components/ui";

export const FULL_GRAPH_HEIGHT = 560;

export function ExpandableChart({
  title,
  previewHeight,
  hasData,
  empty,
  /** Extra vertical room for in-chart legends, etc. */
  heightBoost = 0,
  /** Rows hidden in preview (shown only in the full-graph modal). */
  moreCount = 0,
  /** Bottom action label (dashboard default: View full graph). */
  actionLabel = "View full graph",
  /** Fill parent height; plot area sizes to remaining space above the action button. */
  fill = false,
  children,
}: {
  title: string;
  previewHeight: number;
  hasData: boolean;
  empty: ReactNode;
  heightBoost?: number;
  moreCount?: number;
  actionLabel?: string;
  fill?: boolean;
  children: (height: number, mode: "preview" | "full") => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  useEffect(() => {
    if (!fill || !hasData) return;
    const el = plotRef.current;
    if (!el) return;
    const update = () => setMeasuredHeight(Math.floor(el.clientHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, hasData, moreCount]);

  if (!hasData) return <>{empty}</>;

  const plotHeight = fill
    ? Math.max(120, measuredHeight || previewHeight) + heightBoost
    : Math.max(CHART_PANEL_HEIGHT, previewHeight) + heightBoost;
  const fullHeight = FULL_GRAPH_HEIGHT + heightBoost;

  return (
    <>
      <div className={fill ? "flex h-full min-h-0 flex-col gap-2" : "space-y-2"}>
        <div ref={plotRef} className={fill ? "h-0 min-h-0 flex-1 overflow-hidden" : undefined}>
          {children(plotHeight, "preview")}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
          {moreCount > 0 ? (
            <p className="text-[11px] opacity-60">+{moreCount} more in full view</p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-xs gap-1.5"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {actionLabel}
          </button>
        </div>
      </div>
      <ReportDetailsModal
        open={open}
        title={title}
        subtitle="Expanded view"
        onClose={() => setOpen(false)}
      >
        <div className="w-full" style={{ minHeight: fullHeight }}>
          {children(fullHeight, "full")}
        </div>
      </ReportDetailsModal>
    </>
  );
}
