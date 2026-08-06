"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Eye,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  RotateCcw,
} from "lucide-react";
import {
  defaultLayoutForRole,
  paneGridColumns,
  panesForRole,
  type DashboardLayoutPrefs,
  type DashboardPaneDef,
} from "@/lib/dashboardLayout";
import type { UserRole } from "@/lib/types";

function PaneMockPreview({ pane }: { pane: DashboardPaneDef }) {
  if (pane.id.includes("kpi") || pane.id.includes("pulse") || pane.id.includes("controls") || pane.id === "operations") {
    return (
      <div className="mt-2 h-16 grid grid-cols-2 gap-1.5 content-start">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 rounded-md bg-base-200 border border-base-300" />
        ))}
      </div>
    );
  }

  if (pane.id === "alerts") {
    return (
      <div className="mt-2 h-16 rounded-md bg-base-200/80 border border-dashed border-base-300 flex flex-col justify-center gap-1.5 px-2">
        <div className="h-2 w-4/5 rounded bg-base-300/80" />
        <div className="h-2 w-3/5 rounded bg-base-300/80" />
        <div className="h-2 w-2/3 rounded bg-base-300/80" />
      </div>
    );
  }

  return (
    <div className="mt-2 h-16 rounded-md bg-base-200/80 border border-dashed border-base-300 flex items-center justify-center">
      <BarChart3 className="h-5 w-5 opacity-35" aria-hidden />
    </div>
  );
}

export function DashboardCustomizeModal({
  open,
  role,
  layout,
  onClose,
  onSave,
}: {
  open: boolean;
  role: UserRole;
  layout: DashboardLayoutPrefs;
  onClose: () => void;
  onSave: (next: DashboardLayoutPrefs) => void;
}) {
  const [draft, setDraft] = useState<DashboardLayoutPrefs>(layout);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overTray, setOverTray] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(layout);
      setDraggingId(null);
      setOverId(null);
      setOverTray(false);
    }
  }, [open, layout]);

  const catalog = useMemo(() => panesForRole(role), [role]);
  const byId = useMemo(() => new Map(catalog.map((pane) => [pane.id, pane])), [catalog]);

  const enabledPanes = useMemo(
    () =>
      draft.panes
        .map((id) => byId.get(id))
        .filter((pane): pane is DashboardPaneDef => !!pane),
    [draft.panes, byId]
  );

  const unusedPanes = useMemo(
    () => catalog.filter((pane) => !draft.panes.includes(pane.id)),
    [catalog, draft.panes]
  );

  const nonFullWidthCount = enabledPanes.filter((pane) => !pane.fullWidth).length;
  const columns = paneGridColumns(nonFullWidthCount);
  const colClass =
    columns <= 1
      ? "grid-cols-1"
      : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  if (!open) return null;

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setDraft((prev) => {
      const panes = [...prev.panes];
      const from = panes.indexOf(fromId);
      const to = panes.indexOf(toId);
      if (from < 0 || to < 0) return prev;
      const [item] = panes.splice(from, 1);
      panes.splice(to, 0, item!);
      return { panes };
    });
  };

  const enableAt = (id: string, beforeId: string | null) => {
    setDraft((prev) => {
      if (prev.panes.includes(id)) return prev;
      const panes = [...prev.panes];
      if (!beforeId) {
        panes.push(id);
      } else {
        const index = panes.indexOf(beforeId);
        if (index < 0) panes.push(id);
        else panes.splice(index, 0, id);
      }
      return { panes };
    });
  };

  const disable = (id: string) => {
    setDraft((prev) => {
      if (prev.panes.length <= 1) return prev;
      return { panes: prev.panes.filter((paneId) => paneId !== id) };
    });
  };

  const toggle = (id: string) => {
    if (draft.panes.includes(id)) disable(id);
    else enableAt(id, null);
  };

  const clearDrag = () => {
    setDraggingId(null);
    setOverId(null);
    setOverTray(false);
  };

  const onDropOnPane = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      clearDrag();
      return;
    }
    if (draft.panes.includes(draggingId)) {
      reorder(draggingId, targetId);
    } else {
      enableAt(draggingId, targetId);
    }
    clearDrag();
  };

  const onDropOnTray = () => {
    if (!draggingId) {
      clearDrag();
      return;
    }
    if (draft.panes.includes(draggingId)) {
      disable(draggingId);
    }
    clearDrag();
  };

  const onDropOnCanvasEnd = () => {
    if (!draggingId) {
      clearDrag();
      return;
    }
    if (!draft.panes.includes(draggingId)) {
      enableAt(draggingId, null);
    }
    clearDrag();
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box w-[min(96vw,72rem)] max-w-6xl max-h-[92vh] flex flex-col p-0 overflow-hidden border border-base-300 shadow-xl">
        <div className="px-5 pt-5 pb-3 border-b border-base-300 shrink-0">
          <h3 className="font-semibold text-lg tracking-tight">Customize dashboard</h3>
          <p className="mt-1 text-sm opacity-65">
            Drag panes to rearrange this mock layout. Unused panes sit above the preview — drop
            them onto the board to show, or drop preview panes into Unused to hide. Saved only for
            your account.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-4 bg-base-200/40">
          <div
            className={`rounded-box border p-3 transition-colors ${
              overTray
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-dashed border-base-300 bg-base-100/80"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverId(null);
              setOverTray(true);
            }}
            onDragLeave={() => setOverTray(false)}
            onDrop={(e) => {
              e.preventDefault();
              onDropOnTray();
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60">
                Unused panes
              </p>
              <p className="text-[11px] opacity-50">Drop here to hide · drag onto preview to show</p>
            </div>
            {unusedPanes.length === 0 ? (
              <p className="text-sm opacity-50 py-3 text-center">All panes are on the dashboard.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unusedPanes.map((pane) => (
                  <button
                    key={pane.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(pane.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", pane.id);
                    }}
                    onDragEnd={clearDrag}
                    onClick={() => toggle(pane.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border border-base-300 bg-base-100 px-2.5 py-2 text-sm cursor-grab active:cursor-grabbing hover:border-primary/50 ${
                      draggingId === pane.id ? "opacity-40" : ""
                    }`}
                  >
                    <GripVertical className="h-3.5 w-3.5 opacity-40" aria-hidden />
                    <EyeOff className="h-3.5 w-3.5 opacity-45" aria-hidden />
                    <span className="font-medium">{pane.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-box border border-base-300 bg-base-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-base-300 bg-base-200/60">
              <LayoutDashboard className="h-4 w-4 opacity-50" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
                Dashboard preview
              </span>
            </div>

            <div className="p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5 opacity-60 pointer-events-none select-none">
                {["Quick link", "Quick link", "Quick link"].map((label, i) => (
                  <span
                    key={i}
                    className="btn btn-outline btn-xs pointer-events-none cursor-default opacity-80"
                  >
                    {label}
                  </span>
                ))}
                <span className="text-[10px] uppercase tracking-wide opacity-50 self-center ml-1">
                  Fixed quick links
                </span>
              </div>

              {enabledPanes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-base-300 py-10 text-center text-sm opacity-60">
                  No panes selected — enable panes from Unused above.
                </div>
              ) : (
                <div
                  className={`grid gap-2.5 items-stretch ${colClass}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (overId) return;
                    onDropOnCanvasEnd();
                  }}
                >
                  {enabledPanes.map((pane) => {
                    const onlyEnabled = draft.panes.length === 1;
                    const isOver = overId === pane.id && draggingId !== pane.id;
                    const isDragging = draggingId === pane.id;

                    return (
                      <div
                        key={pane.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingId(pane.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", pane.id);
                        }}
                        onDragEnd={clearDrag}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOverTray(false);
                          setOverId(pane.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDropOnPane(pane.id);
                        }}
                        className={`min-w-0 rounded-lg border bg-base-100 p-2.5 cursor-grab active:cursor-grabbing transition-shadow ${
                          pane.fullWidth ? "col-span-full" : ""
                        } ${
                          isDragging
                            ? "opacity-40 border-primary"
                            : isOver
                              ? "border-primary ring-2 ring-primary/30 shadow-md"
                              : "border-base-300 hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical
                            className="h-4 w-4 mt-0.5 opacity-40 shrink-0"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {pane.id === "alerts" ? (
                                <Bell className="h-3.5 w-3.5 opacity-45 shrink-0" aria-hidden />
                              ) : null}
                              <p className="text-sm font-medium truncate leading-tight">
                                {pane.label}
                              </p>
                            </div>
                            <PaneMockPreview pane={pane} />
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square shrink-0"
                            disabled={onlyEnabled}
                            title={onlyEnabled ? "Keep at least one pane" : "Hide pane"}
                            aria-label={`Hide ${pane.label}`}
                            onClick={() => disable(pane.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-base-300 shrink-0 bg-base-100">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={() => setDraft(defaultLayoutForRole(role))}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset defaults
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              Save layout
            </button>
          </div>
        </div>
      </div>
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
    </div>
  );
}
