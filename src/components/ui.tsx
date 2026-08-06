import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Download, FileDown } from "lucide-react";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
  compact = false,
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "error";
  compact?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/40"
      : tone === "warning"
        ? "border-warning/40"
        : tone === "error"
          ? "border-error/40"
          : "border-base-300";

  return (
    <div className={`card bg-base-100 border ${toneClass} shadow-sm`}>
      <div className={`card-body gap-0.5 ${compact ? "p-1.5" : "p-4 gap-2"}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide opacity-60 leading-tight">{title}</p>
          {Icon ? <Icon className="h-3.5 w-3.5 opacity-50" /> : null}
        </div>
        <p className={`font-semibold tracking-tight leading-tight ${compact ? "text-sm" : "text-2xl"}`}>{value}</p>
        {hint ? <p className="text-[10px] opacity-60 leading-tight">{hint}</p> : null}
      </div>
    </div>
  );
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
      className={`flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${compact ? "mb-2" : "mb-6 gap-3"}`}
    >
      <div>
        <h1 className={`font-semibold tracking-tight ${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}`}>
          {title}
        </h1>
        {subtitle ? (
          <p className={`mt-0.5 opacity-70 ${compact ? "text-xs line-clamp-1" : "mt-1 text-sm"}`}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="card bg-base-100 border border-dashed border-base-300">
      <div className="card-body items-center text-center py-12">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="opacity-70 max-w-md">{message}</p>
        {action}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="card-title text-lg">{title}</h2>
          {actions}
        </div>
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
          <h2 className="card-title text-sm sm:text-base leading-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] sm:text-xs opacity-70 line-clamp-2 leading-snug">{subtitle}</p>
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
      <div className="modal-box w-11/12 max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-base-300 shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg leading-tight">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-sm opacity-70 line-clamp-2">{subtitle}</p>
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
        <div className="modal-action px-5 py-3 mt-0 border-t border-base-300 shrink-0">
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
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:gap-4 items-start">
      <label className="text-sm font-medium pt-2.5">{label}</label>
      <div className="w-full">
        {children}
        {hint ? <p className="mt-1 text-xs opacity-60">{hint}</p> : null}
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
  return <div className={`alert ${cls} text-sm`}>{children}</div>;
}
