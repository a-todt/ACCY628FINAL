import type { UserRole } from "./types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  field_supervisor: "Field Supervisor",
  subcontractor: "Subcontractor",
  client: "Client",
};

export const ALL_ROLES: UserRole[] = [
  "admin",
  "project_manager",
  "field_supervisor",
  "subcontractor",
  "client",
];

export function canManageContracts(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canCreateInvoices(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canCreateChangeOrders(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canManageSubcontractors(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canEnterCosts(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

export function canCreateFieldLogs(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "project_manager" ||
    role === "field_supervisor" ||
    role === "subcontractor"
  );
}

export function canViewCosts(role: UserRole): boolean {
  return role !== "client";
}

export function canViewReports(role: UserRole): boolean {
  return role === "admin" || role === "project_manager";
}

export function canManageRoles(role: UserRole): boolean {
  return role === "admin";
}

export type NavCategoryId = "dashboard" | "reports" | "contracts" | "finance";

export interface NavItem {
  href: string;
  label: string;
}

export function canViewInvoices(role: UserRole): boolean {
  return role !== "subcontractor" && role !== "field_supervisor";
}

export function canViewFinance(role: UserRole): boolean {
  return canViewCosts(role) || canViewInvoices(role);
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
          // Field supervisors use All Contracts (summary + supervised details).
          show: role !== "field_supervisor",
        },
        { href: "/contracts", label: "All Contracts", show: true },
        { href: "/contracts/new", label: "Add Contract", show: canManageContracts(role) },
        { href: "/change-orders", label: "Change Orders", show: true },
        {
          href: "/subcontractors",
          label: "Subcontractors",
          show: role === "admin" || role === "project_manager" || role === "subcontractor",
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

  return [];
}

export function categoryFromPath(pathname: string): NavCategoryId | null {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/reports") || pathname.startsWith("/admin")) return "reports";
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
