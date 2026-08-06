import type { ReactNode } from "react";

/** Sticky page actions/filters strip under the app chrome. */
export function StickyToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-[3.5rem] z-20 -mx-1 mb-4 px-1 py-2 bg-base-200/90 backdrop-blur-sm border-b border-base-300">
      <div className="flex flex-wrap items-center gap-2 justify-between">{children}</div>
    </div>
  );
}

/** Floating bulk-selection bar. */
export function BulkActionBar({
  count,
  children,
  onClear,
}: {
  count: number;
  children: ReactNode;
  onClear: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-box border border-base-300 bg-base-100 shadow-xl px-4 py-2.5">
      <span className="text-sm font-medium tabular-nums whitespace-nowrap">{count} selected</span>
      <div className="flex items-center gap-2">{children}</div>
      <button type="button" className="btn btn-ghost btn-xs" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
