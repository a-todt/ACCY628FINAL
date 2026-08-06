"use client";

import { useState, type ReactNode } from "react";
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
  children,
}: {
  title: string;
  previewHeight: number;
  hasData: boolean;
  empty: ReactNode;
  heightBoost?: number;
  children: (height: number, mode: "preview" | "full") => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!hasData) return <>{empty}</>;

  const plotHeight = Math.max(CHART_PANEL_HEIGHT, previewHeight) + heightBoost;
  const fullHeight = FULL_GRAPH_HEIGHT + heightBoost;

  return (
    <>
      <div className="space-y-2">
        {children(plotHeight, "preview")}
        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            className="btn btn-primary btn-xs gap-1.5"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            View full graph
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
