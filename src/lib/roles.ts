import type { UserRole } from "./types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin (Internal)",
  owner: "Owner / Executive",
  project_manager: "Project Manager",
  field_supervisor: "Field Supervisor",
  subcontractor: "Subcontractor",
  client: "Client",
};

/** Roles assignable to real company users (excludes internal admin). */
export const COMPANY_ROLES: UserRole[] = [
  "owner",
  "project_manager",
  "field_supervisor",
  "subcontractor",
  "client",
];

export const ALL_ROLES: UserRole[] = ["admin", ...COMPANY_ROLES];

export function canManageCompany(role: UserRole): boolean {
  return role === "owner";
}

/** Internal team tools (role switcher targets, /admin/roles). */
export function canManageRoles(role: UserRole): boolean {
  return role === "admin";
}

export function canManageContracts(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canCreateInvoices(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canCreateChangeOrders(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canManageSubcontractors(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

export function canEnterCosts(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

export function canCreateFieldLogs(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

/** Cancel/delete contracts — same as manage. */
export function canCancelOrDeleteContracts(role: UserRole): boolean {
  return canManageContracts(role);
}

/** Cancel/delete field logs — creators and managers. */
export function canManageFieldLogEntries(role: UserRole): boolean {
  return canCreateFieldLogs(role);
}

export function canViewCosts(role: UserRole): boolean {
  return role !== "client" && role !== "subcontractor";
}

export function canViewReports(role: UserRole): boolean {
  return role === "admin" || role === "owner" || role === "project_manager";
}

/** Full system audit log — internal admin only. */
export function canViewAuditLog(role: UserRole): boolean {
  return role === "admin";
}

export function canViewInvoices(role: UserRole): boolean {
  return role !== "subcontractor" && role !== "field_supervisor";
}

export function canViewFinance(role: UserRole): boolean {
  return canViewCosts(role) || canViewInvoices(role);
}

export function canViewContractFinancials(role: UserRole): boolean {
  return role !== "subcontractor" && role !== "client";
}

export type NavCategoryId =
  | "dashboard"
  | "alerts"
  | "reports"
  | "contracts"
  | "finance"
  | "audit"
  | "management";

export interface NavItem {
  href: string;
  label: string;
}

export function primaryNavForRole(role: UserRole): Array<NavItem & { id: NavCategoryId }> {
  return (
    [
      { id: "dashboard" as const, href: "/dashboard", label: "Dashboard", show: true },
      { id: "reports" as const, href: "/reports", label: "Reports", show: canViewReports(role) },
      {
        id: "contracts" as const,
        href: role === "field_supervisor" ? "/contracts" : "/contracts/overview",
        label: "Contracts",
        show: true,
      },
      {
        id: "finance" as const,
        href: "/finance",
        label: "Costing and Invoicing",
        show: canViewFinance(role),
      },
      {
        id: "audit" as const,
        href: "/audit-log",
        label: "Audit Log",
        show: canViewAuditLog(role),
      },
      {
        id: "management" as const,
        href: "/management",
        label: "Admin / Management",
        show: canManageCompany(role),
      },
    ] as Array<NavItem & { id: NavCategoryId; show: boolean }>
  )
    .filter((item) => item.show)
    .map(({ id, href, label }) => ({ id, href, label }));
}

export function secondaryNavForCategory(
  category: NavCategoryId | null,
  role: UserRole
): NavItem[] {
  if (category === "contracts") {
    return (
      [
        {
          href: "/contracts/overview",
          label: "Overview",
          show: role !== "field_supervisor",
        },
        { href: "/contracts", label: "All Contracts", show: true },
        { href: "/contracts/new", label: "Add Contract", show: canManageContracts(role) },
        { href: "/change-orders", label: "Change Orders", show: true },
        {
          href: "/subcontractors",
          label: "Subcontractors",
          show:
            role === "admin" ||
            role === "owner" ||
            role === "project_manager" ||
            role === "subcontractor",
        },
        {
          href: "/field-logs",
          label: "Field Logs",
          show: role !== "client",
        },
      ] as Array<NavItem & { show: boolean }>
    )
      .filter((item) => item.show)
      .map(({ href, label }) => ({ href, label }));
  }

  if (category === "finance") {
    return (
      [
        { href: "/finance", label: "Overview", show: true },
        { href: "/costs", label: "Cost Tracker", show: canViewCosts(role) },
        { href: "/invoices", label: "Invoices", show: canViewInvoices(role) },
      ] as Array<NavItem & { show: boolean }>
    )
      .filter((item) => item.show)
      .map(({ href, label }) => ({ href, label }));
  }

  if (category === "management") {
    return [
      { href: "/management", label: "Overview" },
      { href: "/management?tab=settings", label: "Company Settings" },
      { href: "/management?tab=team", label: "Team" },
      { href: "/management?tab=assignments", label: "Assignments" },
      { href: "/management?tab=parties", label: "External Parties" },
      { href: "/management?tab=compliance", label: "Compliance" },
      { href: "/management?tab=audit", label: "Audit Log" },
    ];
  }

  return [];
}

export function categoryFromPath(pathname: string): NavCategoryId | null {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/alerts")) return "alerts";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/admin")) return "reports";
  if (pathname.startsWith("/audit-log")) return "audit";
  if (pathname.startsWith("/management")) return "management";
  if (
    pathname.startsWith("/contracts") ||
    pathname.startsWith("/change-orders") ||
    pathname.startsWith("/subcontractors") ||
    pathname.startsWith("/field-logs")
  ) {
    return "contracts";
  }
  if (
    pathname.startsWith("/finance") ||
    pathname.startsWith("/costs") ||
    pathname.startsWith("/invoices")
  ) {
    return "finance";
  }
  return null;
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/management") return pathname.startsWith("/management");
  if (href.startsWith("/management?")) {
    return pathname.startsWith("/management");
  }
  if (href === "/contracts") {
    return (
      pathname === "/contracts" ||
      (pathname.startsWith("/contracts/") &&
        !pathname.startsWith("/contracts/overview") &&
        !pathname.startsWith("/contracts/new"))
    );
  }
  if (href === "/contracts/overview") return pathname.startsWith("/contracts/overview");
  if (href === "/contracts/new") return pathname.startsWith("/contracts/new");
  if (href === "/finance") return pathname === "/finance";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** @deprecated Prefer primaryNavForRole / secondaryNavForCategory */
export function navItemsForRole(role: UserRole) {
  return primaryNavForRole(role);
}

export function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case "admin":
      return "badge-primary";
    case "owner":
      return "badge-secondary";
    case "project_manager":
      return "badge-secondary";
    case "field_supervisor":
      return "badge-accent";
    case "subcontractor":
      return "badge-info";
    case "client":
      return "badge-neutral";
    default:
      return "badge-ghost";
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
    case "approved":
    case "paid":
    case "completed":
    case "complete":
      return "badge-success";
    case "pending":
    case "partially_paid":
    case "in_progress":
    case "on_hold":
      return "badge-warning";
    case "overdue":
    case "rejected":
    case "canceled":
    case "terminated":
      return "badge-error";
    case "unpaid":
      return "badge-ghost";
    default:
      return "badge-ghost";
  }
}
