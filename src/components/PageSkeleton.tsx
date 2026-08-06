export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      <div className="h-8 w-48 bg-base-300 rounded-lg" />
      <div className="h-4 w-72 bg-base-300/80 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-base-300 rounded-box" />
        ))}
      </div>
      <div className="rounded-box border border-base-300 overflow-hidden bg-base-100">
        <div className="h-10 bg-base-200" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-9 border-t border-base-300 bg-base-100 flex gap-3 px-3 items-center">
            <div className="h-3 w-1/4 bg-base-300 rounded" />
            <div className="h-3 w-1/5 bg-base-300/80 rounded" />
            <div className="h-3 w-1/6 bg-base-300/70 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-box border border-base-300 overflow-hidden bg-base-100 animate-pulse" aria-hidden>
      <div className="h-10 bg-base-200" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 border-t border-base-300 flex gap-3 px-3 items-center">
          <div className="h-3 w-1/3 bg-base-300 rounded" />
          <div className="h-3 w-1/4 bg-base-300/80 rounded" />
          <div className="h-3 w-16 bg-base-300/70 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}
