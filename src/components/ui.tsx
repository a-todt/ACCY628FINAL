import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Download, FileDown } from "lucide-react";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
  compact = false,
  href,
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "error";
  compact?: boolean;
  href?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/50 bg-success/5"
      : tone === "warning"
        ? "border-warning/50 bg-warning/5"
        : tone === "error"
          ? "border-error/50 bg-error/5"
          : "border-base-300";

  const body = (
    <div className={`card-body gap-0.5 ${compact ? "p-1.5" : "p-3.5 sm:p-4 gap-1.5"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider opacity-55 leading-tight font-medium">{title}</p>
        {Icon ? <Icon className="h-3.5 w-3.5 opacity-45 shrink-0" /> : null}
      </div>
      <p className={`font-semibold tracking-tight leading-tight tabular-nums ${compact ? "text-sm" : "text-xl sm:text-2xl"}`}>
        {value}
      </p>
      {hint ? <p className="text-[10px] opacity-55 leading-tight">{hint}</p> : null}
    </div>
  );

  const cardClass = `card bg-base-100 border ${toneClass} shadow-sm ${
    href ? "hover:border-primary/60 transition-colors h-full" : ""
  }`;

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    );
  }

  return <div className={cardClass}>{body}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${compact ? "mb-2" : "mb-5 gap-3"}`}
    >
      <div className="min-w-0">
        <h1 className={`font-semibold tracking-tight text-base-content ${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}`}>
          {title}
        </h1>
        {subtitle ? (
          <p className={`opacity-65 ${compact ? "mt-0.5 text-xs line-clamp-1" : "mt-1 text-sm"}`}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon: Icon,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="card bg-base-100 border border-dashed border-base-300">
      <div className="card-body items-center text-center py-10 sm:py-12 gap-2">
        {Icon ? (
          <div className="mb-1 rounded-full bg-base-200 p-3 text-primary">
            <Icon className="h-7 w-7" />
          </div>
        ) : null}
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="opacity-65 max-w-md text-sm leading-relaxed">{message}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  actions,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className={`card-body gap-2 ${compact ? "p-3 sm:p-3.5" : "p-4 sm:p-5 gap-3"}`}>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2
            className={`card-title font-semibold tracking-tight min-w-0 truncate ${
              compact ? "text-sm sm:text-base" : "text-base sm:text-lg"
            }`}
          >
            {title}
          </h2>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Consistent bordered scroll wrapper for data tables. */
export function TableShell({
  children,
  className = "",
  stickyHeader = true,
  freezeFirst = false,
}: {
  children: ReactNode;
  className?: string;
  stickyHeader?: boolean;
  freezeFirst?: boolean;
}) {
  return (
    <div
      className={`overflow-auto rounded-box border border-base-300 bg-base-100 max-h-[min(70vh,52rem)] ${className}`.trim()}
    >
      <div className={freezeFirst ? "table-freeze-first" : stickyHeader ? "table-sticky-head" : ""}>
        {children}
      </div>
    </div>
  );
}

export function ReportPane({
  title,
  subtitle,
  children,
  footerStart,
  onExportCsv,
  onExportPdf,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footerStart?: ReactNode;
  onExportCsv: () => void;
  onExportPdf: () => void;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm flex flex-col">
      <div className="card-body flex flex-col p-2 sm:p-2.5 gap-1.5">
        <div>
          <h2 className="card-title text-sm sm:text-base leading-tight font-semibold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] sm:text-xs opacity-65 line-clamp-2 leading-snug">{subtitle}</p>
          ) : null}
        </div>
        <div>{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-base-300">
          <div className="flex items-center gap-2">{footerStart}</div>
          <div className="flex items-center gap-1.5 ml-auto">
            <button type="button" className="btn btn-outline btn-xs" onClick={onExportCsv}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button type="button" className="btn btn-primary btn-xs" onClick={onExportPdf}>
              <FileDown className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportDetailsModal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box w-11/12 max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden border border-base-300 shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-base-300 shrink-0 bg-base-100">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg leading-tight tracking-tight">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-sm opacity-65 line-clamp-2">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle shrink-0"
            aria-label="Close details"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        <div className="modal-action px-5 py-3 mt-0 border-t border-base-300 shrink-0 bg-base-100">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
    </div>
  );
}

export function FormField({
  label,
  children,
  hint,
  stacked = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  stacked?: boolean;
}) {
  return (
    <div
      className={
        stacked
          ? "grid grid-cols-1 gap-1.5 items-start"
          : "grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:gap-4 items-start"
      }
    >
      <label className={`text-sm font-medium opacity-90 ${stacked ? "" : "pt-2.5"}`}>{label}</label>
      <div className="w-full">
        {children}
        {hint ? <p className="mt-1 text-xs opacity-55 leading-relaxed">{hint}</p> : null}
      </div>
    </div>
  );
}

export function AlertBanner({
  type = "info",
  children,
}: {
  type?: "info" | "success" | "warning" | "error";
  children: ReactNode;
}) {
  const cls =
    type === "success"
      ? "alert-success"
      : type === "warning"
        ? "alert-warning"
        : type === "error"
          ? "alert-error"
          : "alert-info";
  return <div className={`alert ${cls} text-sm shadow-sm`}>{children}</div>;
}
