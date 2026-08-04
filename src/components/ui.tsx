import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "error";
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
      <div className="card-body p-4 gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide opacity-60">{title}</p>
          {Icon ? <Icon className="h-4 w-4 opacity-50" /> : null}
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="text-xs opacity-60">{hint}</p> : null}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm opacity-70">{subtitle}</p> : null}
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
