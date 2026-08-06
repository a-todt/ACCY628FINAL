"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  chartPanelHeight,
  paneGridColumns,
  panesForRole,
  type DashboardLayoutPrefs,
} from "@/lib/dashboardLayout";
import type { UserRole } from "@/lib/types";
import { EmptyState } from "@/components/ui";

export function DashboardPaneGrid({
  role,
  layout,
  panes,
  onCustomize,
}: {
  role: UserRole;
  layout: DashboardLayoutPrefs;
  panes: Record<string, ReactNode>;
  onCustomize?: () => void;
}) {
  const catalog = panesForRole(role);
  const byId = new Map(catalog.map((pane) => [pane.id, pane]));
  const visible = layout.panes
    .map((id) => byId.get(id))
    .filter((pane): pane is NonNullable<typeof pane> => !!pane && panes[pane.id] != null);

  if (visible.length === 0) {
    return (
      <EmptyState
        title="No dashboard panes"
        message="Turn on one or more panes in Customize to build your dashboard."
        action={
          onCustomize ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onCustomize}>
              Customize dashboard
            </button>
          ) : null
        }
      />
    );
  }

  const nonFullWidthCount = visible.filter((pane) => !pane.fullWidth).length;
  const columns = paneGridColumns(nonFullWidthCount);
  // Prefer chart-pane count so KPI strips don't shrink graphs.
  const chartLikeCount = Math.max(1, nonFullWidthCount);
  const chartHeight = chartPanelHeight(chartLikeCount);
  const colClass =
    columns <= 1
      ? "grid-cols-1"
      : columns === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  const style = {
    "--dashboard-chart-h": `${chartHeight}px`,
  } as CSSProperties;

  return (
    <div className={`grid gap-3 xl:gap-4 items-start ${colClass}`} style={style}>
      {visible.map((pane) => (
        <div
          key={pane.id}
          className={`min-w-0 ${pane.fullWidth ? "col-span-full" : ""}`}
          data-dashboard-pane={pane.id}
        >
          {panes[pane.id]}
        </div>
      ))}
    </div>
  );
}
